// js/admin-blog.js
// অ্যাডমিন প্যানেলের "ব্লগ" বিভাগ — লেখা (CRUD, খসড়া/প্রকাশ/আনপাবলিশ, প্রিভিউ, কভার-আপলোড), ক্যাটাগরি (নিরাপদ মুছা + রিঅ্যাসাইন), মন্তব্য-মডারেশন।
// admin.js শুধু রাউট ধরে renderBlog(page, helpers) ডাকে (admin-community.js-এর মতো) — বিদ্যমান .admin-*/.cm-adm-*/.chip/.field/.modal ক্লাস পুনর্ব্যবহার।
// রাউট (hash): #blog, #blog/comments, #blog/categories, #blog/new, #blog/edit/{id}
// নিরাপত্তা: আসল প্রহরী firestore.rules। UI-র "অ্যাডমিন" চেক শুধু দেখানো/লুকানোর জন্য (admin.js গেটে হয়)।

import { escapeHtml, safeImageSrc, formatDay, formatDate } from "./utils.js";
import { icons } from "./icons.js";
import { showToast } from "./toast.js";
import { auth } from "./firebase-config.js";
import * as A from "./blog/admin-api.js";
import { renderArticle } from "./blog/markdown.js";
import { LIMITS, STATUS, COMMENT_STATUS, slugify, isValidSlug, validatePostInput, readingTimeMinutes, wordCount, normalizeTags } from "./blog/model.js";

const esc = escapeHtml;
const nf = new Intl.NumberFormat("bn-BD");
const fmtN = (n) => nf.format(Number(n) || 0);
const ID_RE = /^[A-Za-z0-9]{1,40}$/;

let teardown = null;
/** অন্য রাউটে যাওয়ার সময় admin.js এটা ডাকে — বিফোরআনলোড/ক্লিক-গার্ড ইত্যাদি সরায় (বারবার ডাকলেও নিরাপদ) */
export function leaveBlog() { if (teardown) { try { teardown(); } catch (_) { /* */ } teardown = null; } closeModal(); }

/* ============================================================ মডাল (ফোকাস-ট্র্যাপ, Esc, ফোকাস ফেরত) */
function closeModal() { const r = document.getElementById("modalRoot"); if (r && r.dataset.blModal) { r.dataset.blModal = ""; r.innerHTML = ""; } }
function openModal(inner, { wide = false, label = "" } = {}) {
  const root = document.getElementById("modalRoot");
  const opener = document.activeElement;
  root.dataset.blModal = "1";
  root.innerHTML = `<div class="modal-overlay open"><div class="modal${wide ? " modal-wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(label)}">${inner}</div></div>`;
  const ov = root.firstElementChild, box = ov.firstElementChild;
  const close = () => { document.removeEventListener("keydown", onKey, true); if (root.dataset.blModal) { root.dataset.blModal = ""; root.innerHTML = ""; } try { opener?.focus?.({ preventScroll: true }); } catch (_) { /* */ } };
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...box.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-x]")) close(); });
  document.addEventListener("keydown", onKey, true);
  setTimeout(() => (box.querySelector("[data-autofocus]") || box.querySelector("button, input, select, textarea, a[href]"))?.focus(), 30);
  return { box, close };
}

const errBox = (e) => `<div class="empty-state"><div class="empty-state-icon">${icons.warn}</div><p>${esc(A.explain(e).message)}</p><button class="btn btn-outline btn-sm" data-reload>আবার চেষ্টা করুন</button></div>`;
const emptyBox = (msg, ic = "book") => `<div class="empty-state"><div class="empty-state-icon">${icons[ic] || icons.book}</div><p>${esc(msg)}</p></div>`;
const statusBadge = (s) => s === STATUS.PUBLISHED ? `<span class="status-badge st-done">প্রকাশিত</span>` : `<span class="status-badge st-new">খসড়া</span>`;
const cStatusBadge = (s) => ({ pending: `<span class="status-badge st-progress">অপেক্ষমাণ</span>`, approved: `<span class="status-badge st-done">অনুমোদিত</span>`, hidden: `<span class="status-badge st-contacted">লুকানো</span>`, deleted: `<span class="status-badge st-cancelled">মুছে ফেলা</span>` }[s] || "");

/* ============================================================ প্রবেশদ্বার */
export function renderBlog(page, h) {
  leaveBlog();
  const [a, b] = h.sub || [];
  if (a === "new") return editor(page, h, null);
  if (a === "edit" && ID_RE.test(b || "")) return editor(page, h, b);
  const tab = a === "comments" ? "comments" : a === "categories" ? "categories" : "posts";
  const tabs = [["posts", "লেখা", "#blog"], ["comments", "মন্তব্য", "#blog/comments"], ["categories", "ক্যাটাগরি", "#blog/categories"]];
  page.innerHTML = h.pageHeadHtml("ব্লগ", "লেখা প্রকাশ, ক্যাটাগরি ও পাঠকের মন্তব্য এখান থেকে ম্যানেজ করুন।", `<a class="btn btn-primary btn-sm" href="#blog/new">${icons.plus} নতুন লেখা</a>`) +
    `<nav class="filter-row cm-adm-tabs" aria-label="ব্লগ বিভাগ">${tabs.map(([k, l, href]) => `<a class="chip${tab === k ? " active" : ""}" href="${href}"${tab === k ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav><div id="blArea"></div>`;
  const area = page.querySelector("#blArea");
  if (tab === "posts") postsTab(area, h);
  else if (tab === "comments") commentsTab(area, h);
  else categoriesTab(area, h);
}

/* ============================================================ লেখার তালিকা */
async function postsTab(area, h) {
  const st = { status: "", items: [], cursor: null, done: false, loading: false, error: null, q: "", cats: {}, loaded: false, seq: 0 };
  const user = () => auth.currentUser;
  area.innerHTML = `<div class="filter-row cm-adm-sub" id="pFilter"></div><div class="field bl-adm-search"><label class="sr-only" for="pSearch">লেখা খুঁজুন</label><input id="pSearch" type="search" placeholder="শিরোনাম বা স্লাগ দিয়ে ফিল্টার (লোড-হওয়া লেখার ভেতরে)…" maxlength="60"></div><div id="pList">${h.skeletonTableHtml()}</div><div class="cm-adm-more" id="pFoot"></div>`;
  const filter = area.querySelector("#pFilter"), list = area.querySelector("#pList"), foot = area.querySelector("#pFoot");
  const paintFilter = () => { filter.innerHTML = [["", "সব"], [STATUS.PUBLISHED, "প্রকাশিত"], [STATUS.DRAFT, "খসড়া"]].map(([v, l]) => `<button type="button" class="chip${st.status === v ? " active" : ""}" data-st="${v}" aria-pressed="${st.status === v}">${l}</button>`).join(""); };
  const visible = () => { const q = st.q.trim().toLowerCase(); return q ? st.items.filter((p) => `${p.title} ${p.slug}`.toLowerCase().includes(q)) : st.items; };
  const catName = (id) => st.cats[id]?.name || id;

  const row = (p) => `<tr data-id="${esc(p.id)}">
      <td><div class="cell-title">${esc(p.title)}</div><div class="cell-muted">/${esc(p.slug)}</div></td>
      <td><span class="cat-badge">${esc(catName(p.category))}</span></td>
      <td>${statusBadge(p.status)}${p.featured ? ` <span class="role-badge" title="ফিচার্ড (ক্রম ${fmtN(p.featuredOrder)})">${icons.sparkle} ${fmtN(p.featuredOrder)}</span>` : ""}</td>
      <td class="cell-muted">${esc(formatDay(p.updatedAt) || "")}</td>
      <td class="cell-actions">${actions(p, false)}</td></tr>`;
  const card = (p) => `<div class="admin-list-card" data-id="${esc(p.id)}"><div class="admin-list-card-top"><b>${esc(p.title)}</b>${statusBadge(p.status)}</div>
      <p>/${esc(p.slug)} · ${esc(catName(p.category))}${p.featured ? ` · ফিচার্ড ${fmtN(p.featuredOrder)}` : ""}</p><div class="cell-actions">${actions(p, true)}</div></div>`;
  const actions = (p, labeled) => {
    const t = (txt) => (labeled ? ` ${txt}` : "");
    const cls = labeled ? "btn btn-outline btn-sm" : "btn btn-outline btn-icon";
    return `<a class="${cls}" href="#blog/edit/${esc(p.id)}" aria-label="এডিট: ${esc(p.title)}">${icons.edit}${t("এডিট")}</a>
      <a class="${cls}" href="./index.html#blog/${esc(p.slug)}" target="_blank" rel="noopener noreferrer" aria-label="সাইটে দেখুন (নতুন ট্যাব): ${esc(p.title)}">${icons.eye}${t("দেখুন")}</a>
      <button type="button" class="${cls}" data-toggle="${esc(p.id)}" aria-label="${p.status === STATUS.PUBLISHED ? "আনপাবলিশ" : "প্রকাশ"}: ${esc(p.title)}">${p.status === STATUS.PUBLISHED ? icons.eyeOff || icons.close : icons.check}${t(p.status === STATUS.PUBLISHED ? "আনপাবলিশ" : "প্রকাশ")}</button>
      ${p.status === STATUS.DRAFT ? `<button type="button" class="${labeled ? "btn btn-danger-ghost btn-sm" : "btn btn-danger-ghost btn-icon"}" data-del="${esc(p.id)}" aria-label="মুছুন: ${esc(p.title)}">${icons.trash}${t("মুছুন")}</button>` : ""}`;
  };
  const paint = () => {
    const items = visible();
    if (st.error && !st.items.length) { list.innerHTML = errBox(st.error); foot.innerHTML = ""; return; }
    if (!items.length) list.innerHTML = st.loading || !st.loaded ? h.skeletonTableHtml() : emptyBox(st.q ? "এই ফিল্টারে কোনো লেখা মেলেনি।" : st.status ? "এই স্ট্যাটাসে কোনো লেখা নেই।" : "এখনো কোনো লেখা নেই — \"নতুন লেখা\" দিয়ে শুরু করুন।");
    else list.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>লেখা</th><th>ক্যাটাগরি</th><th>স্ট্যাটাস</th><th>হালনাগাদ</th><th></th></tr></thead><tbody>${items.map(row).join("")}</tbody></table></div><div class="admin-mobile-list">${items.map(card).join("")}</div>`;
    foot.innerHTML = st.error && st.items.length ? `<button class="btn btn-outline btn-sm" data-more>${icons.refresh} আবার চেষ্টা করুন</button>`
      : st.loading && st.items.length ? `<div class="cm-spin" role="status" aria-label="লোড হচ্ছে"></div>` : !st.done && st.items.length ? `<button class="btn btn-outline btn-sm" data-more>আরও দেখুন</button>` : "";
  };
  async function load(reset) {
    if (st.loading && !reset) return;
    if (reset) Object.assign(st, { items: [], cursor: null, done: false, error: null, loaded: false });
    st.loading = true; st.error = null; const tok = ++st.seq; paint();
    try {
      const pg = await A.fetchAdminPosts({ status: st.status, cursor: st.cursor });
      if (tok !== st.seq) return;
      const seen = new Set(st.items.map((x) => x.id));
      st.items.push(...pg.items.filter((x) => !seen.has(x.id))); st.cursor = pg.cursor; st.done = pg.done; st.loaded = true;
    } catch (e) { if (tok !== st.seq) return; st.error = e; st.loaded = true; }
    st.loading = false; paint();
  }
  try { (await A.fetchAllCategories()).forEach((c) => { st.cats[c.id] = c; }); } catch (_) { /* নাম ছাড়াই (স্লাগ দেখায়) */ }
  paintFilter(); load(true);

  area.addEventListener("click", (e) => {
    const f = e.target.closest("[data-st]");
    if (f) { st.status = f.dataset.st; paintFilter(); load(true); return; }
    if (e.target.closest("[data-more]")) { load(false); return; }
    if (e.target.closest("[data-reload]")) { load(true); return; }
    const tg = e.target.closest("[data-toggle]"), del = e.target.closest("[data-del]");
    const find = (id) => st.items.find((x) => x.id === id);
    if (tg) {
      const p = find(tg.dataset.toggle), publish = p.status !== STATUS.PUBLISHED;
      const run = async () => { try { await A.setPostStatus(user(), p, publish); showToast(publish ? "লেখা প্রকাশিত হয়েছে।" : "লেখা আনপাবলিশ হয়েছে (খসড়ায় গেছে)।"); load(true); } catch (err) { showToast(A.explain(err).message, "error"); } };
      if (publish) run(); else h.confirmAction(`"${esc(p.title)}" আনপাবলিশ করলে লেখাটি পাবলিক সাইটে আর দেখা যাবে না (খসড়া হিসেবে থাকবে)।`, run, "আনপাবলিশ করুন", false);
    } else if (del) {
      const p = find(del.dataset.del);
      h.confirmAction(`"${esc(p.title)}" স্থায়ীভাবে মুছে ফেলতে চান? লেখার সাথে এর সব মন্তব্যও যাবে — এটা আর ফেরানো যাবে না।`, async () => {
        try { const r = await A.deletePost(p); showToast(r.orphanCommentsLeft ? "লেখা মুছেছে, কিছু মন্তব্য মোছা যায়নি (Firebase Console থেকে মুছুন)।" : "লেখা মুছে ফেলা হয়েছে।", r.orphanCommentsLeft ? "error" : "success"); load(true); }
        catch (err) { showToast(A.explain(err).message, "error"); }
      });
    }
  });
  area.querySelector("#pSearch").addEventListener("input", (e) => { st.q = e.target.value; paint(); });
}

/* ============================================================ এডিটর */
const FIELD_ID = { title: "title", slug: "slug", excerpt: "excerpt", content: "content", category: "category", coverImage: "cover", coverAlt: "coverAlt", seoTitle: "seoTitle", seoDescription: "seoDesc", featuredOrder: "featuredOrder", language: "language" };
const TOOLBAR = [
  ["h2", "বড় হেডিং (##)", "H2"], ["h3", "ছোট হেডিং (###)", "H3"], ["b", "বোল্ড", "<b>B</b>"], ["i", "ইটালিক", "<i>I</i>"], ["link", "লিংক", icons.link],
  ["ul", "বুলেট তালিকা", "• তালিকা"], ["ol", "ক্রমিক তালিকা", "১. তালিকা"], ["quote", "উদ্ধৃতি", "❝"], ["code", "ইনলাইন কোড", "&lt;/&gt;"], ["codeblock", "কোড-ব্লক", "{ }"], ["img", "ছবি (https লিংক)", icons.image]
];

async function editor(page, h, id) {
  page.innerHTML = h.pageHeadHtml(id ? "লেখা এডিট" : "নতুন লেখা", "বিষয়বস্তু Markdown-এ লিখুন; প্রিভিউ দেখে প্রকাশ করুন।", `<a class="btn btn-ghost btn-sm" href="#blog" id="edBack">${icons.back} সব লেখা</a>`) + `<div id="edArea">${h.skeletonTableHtml()}</div>`;
  const area = page.querySelector("#edArea");
  let cats = [], post = null;
  try {
    cats = (await A.fetchAllCategories());
    if (id) { post = await A.fetchPostById(id); if (!post) { area.innerHTML = emptyBox("লেখাটি পাওয়া যায়নি — মুছে ফেলা হয়ে থাকতে পারে।", "doc"); return; } }
  } catch (e) { area.innerHTML = errBox(e); area.querySelector("[data-reload]")?.addEventListener("click", () => editor(page, h, id)); return; }
  const user = auth.currentUser;
  const activeCats = cats.filter((c) => c.active !== false || (post && c.id === post.category));
  const isNew = !post, published = post?.status === STATUS.PUBLISHED;
  const base = { title: "", slug: "", category: activeCats[0]?.id || "", language: "bn", excerpt: "", content: "", coverImage: "", coverAlt: "", tags: [], featured: false, featuredOrder: 0, commentsOpen: true, seoTitle: "", seoDescription: "" };
  const v = { ...base, ...(post || {}) };
  const authorName = post?.author || (await (async () => { try { const { loadAuthor } = await import("./community/api.js"); return (await loadAuthor(user)).name; } catch (_) { return user?.displayName || ""; } })());

  area.innerHTML = `
  ${activeCats.length ? "" : `<div class="seed-card"><div class="seed-card-body"><h3>আগে একটা ক্যাটাগরি বানান</h3><p>লেখা প্রকাশ করতে ক্যাটাগরি লাগে। <a href="#blog/categories">ক্যাটাগরি</a> ট্যাব থেকে যোগ করুন।</p></div></div>`}
  <form id="edForm" class="admin-card bl-ed" novalidate autocomplete="off">
    <div class="bl-ed-status">${isNew ? `<span class="status-badge st-new">নতুন (সংরক্ষণ হয়নি)</span>` : statusBadge(post.status)}
      <span class="cell-muted">লেখক: <b>${esc(authorName || "—")}</b> (প্রোফাইল থেকে — বদলানো যায় না)${post?.publishedAt ? ` · প্রথম প্রকাশ: ${esc(formatDate(post.publishedAt))}` : ""}${post?.updatedAt ? ` · সর্বশেষ হালনাগাদ: ${esc(formatDate(post.updatedAt))}` : ""}</span></div>
    <div class="form-grid">
      <div class="field field-full"><label for="bf-title">শিরোনাম *</label><input id="bf-title" maxlength="${LIMITS.title[1]}" value="${esc(v.title)}" required aria-describedby="bf-title-e"><div class="field-error" id="bf-title-e" role="alert"></div></div>
      <div class="field field-full"><label for="bf-slug">স্লাগ (URL) *</label><input id="bf-slug" maxlength="${LIMITS.slug}" value="${esc(v.slug)}" spellcheck="false" aria-describedby="bf-slug-h bf-slug-e">
        <div class="field-hint" id="bf-slug-h">${isNew ? "শিরোনাম থেকে স্বয়ংক্রিয় — চাইলে নিজে বদলান। শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও হাইফেন।" : published ? "⚠️ প্রকাশিত লেখার স্লাগ বদলালে পুরোনো লিংক নতুন লিংকে স্বয়ংক্রিয় রিডাইরেক্ট হবে (পুরোনো স্লাগ সংরক্ষিত থাকে)।" : "শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও হাইফেন।"}</div>
        <div class="field-error" id="bf-slug-e" role="alert"></div></div>
      <div class="field"><label for="bf-category">ক্যাটাগরি *</label><select id="bf-category">${activeCats.map((c) => `<option value="${esc(c.id)}"${c.id === v.category ? " selected" : ""}>${esc(c.name)}${c.active === false ? " (নিষ্ক্রিয়)" : ""}</option>`).join("")}</select><div class="field-error" id="bf-category-e" role="alert"></div></div>
      <div class="field"><label for="bf-language">লেখার ভাষা</label><select id="bf-language"><option value="bn"${v.language === "bn" ? " selected" : ""}>বাংলা</option><option value="en"${v.language === "en" ? " selected" : ""}>English</option></select></div>
      <div class="field field-full"><label for="bf-excerpt">সারসংক্ষেপ <span class="cell-muted">(কার্ডে ও লেখার শুরুতে দেখায়)</span></label><textarea id="bf-excerpt" rows="3" maxlength="${LIMITS.excerpt}">${esc(v.excerpt)}</textarea><div class="field-hint"><span id="bf-excerpt-c">0</span>/${LIMITS.excerpt}</div><div class="field-error" id="bf-excerpt-e" role="alert"></div></div>
      <div class="field field-full"><label for="bf-content">বিষয়বস্তু (Markdown) *</label>
        <div class="bl-toolbar" role="toolbar" aria-label="ফরম্যাটিং-টুলবার" aria-controls="bf-content">${TOOLBAR.map(([k, t, l]) => `<button type="button" class="btn btn-outline btn-sm" data-md="${k}" title="${esc(t)}" aria-label="${esc(t)}">${l}</button>`).join("")}</div>
        <textarea id="bf-content" class="bl-md" rows="18" spellcheck="true" aria-describedby="bf-content-h bf-content-e">${esc(v.content)}</textarea>
        <div class="field-hint" id="bf-content-h"><span id="bf-words">০</span> শব্দ · আনুমানিক <span id="bf-rt">১</span> মিনিট পড়া · <code>##</code> বড় হেডিং, <code>###</code> ছোট হেডিং (শিরোনাম আলাদা ঘরে, তাই <code>#</code> লাগে না) · কাঁচা HTML/স্ক্রিপ্ট/iframe সমর্থিত নয় (টেক্সট হিসেবে দেখায়)।</div>
        <div class="field-error" id="bf-content-e" role="alert"></div></div>
      <div class="field field-full"><label for="bf-cover">কভার ছবি (https লিংক)</label>
        <div class="bl-cover-row"><input id="bf-cover" type="url" inputmode="url" placeholder="https://…" value="${esc(v.coverImage)}" maxlength="2048" aria-describedby="bf-cover-h bf-cover-e">
          <label class="btn btn-outline btn-sm bl-upload" for="bf-file">${icons.image} ছবি আপলোড</label><input id="bf-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></div>
        <div class="field-hint" id="bf-cover-h">লিংক পেস্ট করলেই চলে। আপলোড (JPG/PNG/WebP, বড় ছবি নিজে ছোট হয়) শুধু Firebase Storage চালু ও storage.rules ডিপ্লয় করা থাকলে কাজ করে — কখনো Base64 আকারে Firestore-এ রাখা হয় না।</div>
        <div class="field-error" id="bf-cover-e" role="alert"></div>
        <div class="img-preview-row" id="bf-cover-p" style="${safeImageSrc(v.coverImage) ? "" : "display:none;"}"><img class="img-preview" id="bf-cover-i" alt="" src="${esc(safeImageSrc(v.coverImage))}"><span class="field-hint" id="bf-cover-s">প্রিভিউ</span></div></div>
      <div class="field field-full"><label for="bf-coverAlt">কভার ছবির বর্ণনা (alt টেক্সট — স্ক্রিন-রিডার ও SEO-র জন্য)</label><input id="bf-coverAlt" maxlength="${LIMITS.coverAlt}" value="${esc(v.coverAlt)}"><div class="field-error" id="bf-coverAlt-e" role="alert"></div></div>
      <div class="field field-full"><label for="bf-tags">ট্যাগ <span class="cell-muted">(কমা দিয়ে আলাদা; সর্বোচ্চ ${LIMITS.tags}টা)</span></label><input id="bf-tags" value="${esc((v.tags || []).join(", "))}" placeholder="pwa, firebase, performance"><div class="field-hint" id="bf-tags-p"></div></div>
      <div class="field-checkbox"><input type="checkbox" id="bf-featured"${v.featured ? " checked" : ""}><label for="bf-featured">ফিচার্ড লেখা (ব্লগের ওপরে দেখায়)</label></div>
      <div class="field"><label for="bf-featuredOrder">ফিচার্ড ক্রম <span class="cell-muted">(ছোট সংখ্যা আগে)</span></label><input id="bf-featuredOrder" type="number" min="0" max="9999" step="1" value="${Number(v.featuredOrder) || 0}"><div class="field-error" id="bf-featuredOrder-e" role="alert"></div></div>
      <div class="field-checkbox field-full"><input type="checkbox" id="bf-comments"${v.commentsOpen !== false ? " checked" : ""}><label for="bf-comments">এই লেখায় মন্তব্য খোলা থাকবে</label></div>
      <div class="field field-full"><label for="bf-seoTitle">SEO টাইটেল <span class="cell-muted">(ফাঁকা থাকলে শিরোনাম)</span></label><input id="bf-seoTitle" maxlength="${LIMITS.seoTitle}" value="${esc(v.seoTitle)}"><div class="field-hint">সার্চ-ফলাফলে প্রথম ~৬০ অক্ষর দেখায়। <span id="bf-seoTitle-c">0</span>/${LIMITS.seoTitle}</div><div class="field-error" id="bf-seoTitle-e" role="alert"></div></div>
      <div class="field field-full"><label for="bf-seoDesc">SEO বিবরণ <span class="cell-muted">(ফাঁকা থাকলে সারসংক্ষেপ)</span></label><textarea id="bf-seoDesc" rows="2" maxlength="${LIMITS.seoDescription}">${esc(v.seoDescription)}</textarea><div class="field-hint">প্রথম ~১৬০ অক্ষর দেখায়। <span id="bf-seoDesc-c">0</span>/${LIMITS.seoDescription}</div><div class="field-error" id="bf-seoDescription-e" role="alert"></div></div>
      <div class="bl-serp field-full" aria-label="সার্চ-ফলাফলের নমুনা"><div class="bl-serp-t" id="bf-serp-t"></div><div class="bl-serp-u" id="bf-serp-u"></div><div class="bl-serp-d" id="bf-serp-d"></div></div>
    </div>
    <div class="form-actions bl-ed-actions">
      <div class="bl-ed-left">${!isNew && !published ? `<button type="button" class="btn btn-danger-ghost btn-sm" id="edDelete">${icons.trash} মুছুন</button>` : ""}</div>
      <div class="bl-ed-right">
        <button type="button" class="btn btn-outline" id="edPreview">${icons.eye} প্রিভিউ</button>
        ${published ? `<button type="button" class="btn btn-outline" id="edUnpublish">আনপাবলিশ</button><button type="submit" class="btn btn-primary" id="edSave" data-mode="update">আপডেট করুন</button>`
          : `<button type="button" class="btn btn-outline" id="edDraft" data-mode="draft">খসড়া সংরক্ষণ</button><button type="submit" class="btn btn-primary" id="edSave" data-mode="publish">প্রকাশ করুন</button>`}
      </div>
    </div>
  </form>`;

  const $ = (sel) => area.querySelector(sel);
  const el = (k) => $(`#bf-${k}`);
  const collect = () => ({
    title: el("title").value.trim(), slug: el("slug").value.trim(), category: el("category").value, language: el("language").value, excerpt: el("excerpt").value, content: el("content").value,
    coverImage: el("cover").value.trim(), coverAlt: el("coverAlt").value, tags: el("tags").value, featured: el("featured").checked, featuredOrder: el("featuredOrder").value,
    commentsOpen: el("comments").checked, seoTitle: el("seoTitle").value, seoDescription: el("seoDesc").value
  });
  let initial = JSON.stringify(collect());
  const dirty = () => JSON.stringify(collect()) !== initial;
  let slugTouched = !isNew, busy = false, slugSeq = 0;

  /* ---- সজীব তথ্য: গণনা, SERP, ট্যাগ, স্লাগ ---- */
  const refresh = () => {
    $("#bf-excerpt-c").textContent = fmtN(el("excerpt").value.length);
    $("#bf-seoTitle-c").textContent = fmtN(el("seoTitle").value.length);
    $("#bf-seoDesc-c").textContent = fmtN(el("seoDesc").value.length);
    const c = el("content").value;
    $("#bf-words").textContent = fmtN(wordCount(c)); $("#bf-rt").textContent = fmtN(readingTimeMinutes(c));
    const tags = normalizeTags(el("tags").value);
    $("#bf-tags-p").textContent = tags.length ? tags.map((t) => "#" + t).join("  ") : "";
    const t = el("seoTitle").value.trim() || el("title").value.trim() || "শিরোনাম";
    $("#bf-serp-t").textContent = t.length > 62 ? t.slice(0, 60) + "…" : t;
    $("#bf-serp-u").textContent = `tvsites.vercel.app › blog › ${el("slug").value.trim() || "slug"}`;
    const d = el("seoDesc").value.trim() || el("excerpt").value.trim() || "বিবরণ…";
    $("#bf-serp-d").textContent = d.length > 162 ? d.slice(0, 160) + "…" : d;
  };
  const fieldErr = (key, msg) => { const f = $(`#bf-${FIELD_ID[key] || key}-e`); if (f) { f.textContent = msg || ""; f.closest(".field")?.classList.toggle("has-error", !!msg); } };
  const clearErrs = () => Object.keys(FIELD_ID).forEach((k) => fieldErr(k, ""));

  async function checkSlug() {
    const slug = el("slug").value.trim(), hint = $("#bf-slug-h"), tok = ++slugSeq;
    fieldErr("slug", "");
    if (!slug) return;
    if (!isValidSlug(slug)) { fieldErr("slug", "স্লাগে শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও হাইফেন (-) চলবে।"); return; }
    if (post && slug === post.slug) return;
    try {
      const owner = await A.slugOwner(slug);
      if (tok !== slugSeq) return;
      if (owner && owner !== id) fieldErr("slug", "এই স্লাগ অন্য একটা লেখার (বা তার পুরোনো লিংকের) দখলে।");
      else hint.dataset.ok = "1";
    } catch (_) { /* নেটওয়ার্ক-সমস্যায় সংরক্ষণের সময় আবার যাচাই হবে */ }
  }
  const autoSlug = () => { if (slugTouched) return; const s = slugify(el("title").value); el("slug").value = s || (el("title").value.trim() ? `post-${Date.now().toString(36)}` : ""); };
  let slugTimer;
  el("title").addEventListener("input", () => { autoSlug(); refresh(); clearTimeout(slugTimer); slugTimer = setTimeout(checkSlug, 450); });
  el("slug").addEventListener("input", () => { slugTouched = true; refresh(); clearTimeout(slugTimer); slugTimer = setTimeout(checkSlug, 450); });
  ["excerpt", "content", "tags", "seoTitle", "seoDesc"].forEach((k) => el(k).addEventListener("input", refresh));
  refresh();

  /* ---- কভার প্রিভিউ ও আপলোড ---- */
  const paintCover = () => {
    const src = safeImageSrc(el("cover").value.trim()), row = $("#bf-cover-p"), img = $("#bf-cover-i");
    if (src && /^https:/i.test(src)) { img.src = src; row.style.display = "flex"; $("#bf-cover-s").textContent = "প্রিভিউ"; } else row.style.display = "none";
  };
  let coverTimer; el("cover").addEventListener("input", () => { clearTimeout(coverTimer); coverTimer = setTimeout(paintCover, 350); });
  $("#bf-cover-i").addEventListener("error", () => { $("#bf-cover-s").textContent = "⚠️ ছবি লোড হয়নি — লিংকটা ঠিক আছে কিনা দেখুন"; });
  el("file").addEventListener("change", async () => {
    const file = el("file").files[0]; if (!file) return;
    const hint = $("#bf-cover-s"), row = $("#bf-cover-p"); row.style.display = "flex"; hint.textContent = "আপলোড হচ্ছে… ০%";
    fieldErr("coverImage", "");
    try {
      const url = await A.uploadCover(file, (p) => { hint.textContent = `আপলোড হচ্ছে… ${fmtN(Math.round(p * 100))}%`; });
      el("cover").value = url; paintCover(); showToast("ছবি আপলোড হয়েছে।");
    } catch (e) { const m = A.explain(e).message; fieldErr("coverImage", m); showToast(m, "error"); paintCover(); }
    el("file").value = "";
  });

  /* ---- টুলবার ---- */
  const ta = el("content");
  const edit = (fn) => { const s = ta.selectionStart, e = ta.selectionEnd; const r = fn(ta.value, s, e); ta.value = r.value; ta.focus(); ta.setSelectionRange(r.s, r.e); ta.dispatchEvent(new Event("input", { bubbles: true })); };
  const wrap = (b, a2 = b, ph = "লেখা") => edit((val, s, e) => { const sel = val.slice(s, e) || ph; return { value: val.slice(0, s) + b + sel + a2 + val.slice(e), s: s + b.length, e: s + b.length + sel.length }; });
  const lines = (prefixFn) => edit((val, s, e) => {
    const a2 = val.lastIndexOf("\n", s - 1) + 1, bi = val.indexOf("\n", e), b2 = bi === -1 ? val.length : bi;
    const block = val.slice(a2, b2).split("\n").map((l, i) => prefixFn(l, i)).join("\n");
    return { value: val.slice(0, a2) + block + val.slice(b2), s: a2, e: a2 + block.length };
  });
  const MD = {
    h2: () => lines((l) => (l.startsWith("## ") ? l : "## " + l.replace(/^#+\s*/, ""))), h3: () => lines((l) => (l.startsWith("### ") ? l : "### " + l.replace(/^#+\s*/, ""))),
    b: () => wrap("**"), i: () => wrap("*"), code: () => wrap("`", "`", "কোড"), ul: () => lines((l) => (l.startsWith("- ") ? l : "- " + l)), ol: () => lines((l, i) => `${i + 1}. ${l.replace(/^\d+\.\s*/, "")}`),
    quote: () => lines((l) => (l.startsWith("> ") ? l : "> " + l)),
    link: () => edit((val, s, e) => { const sel = val.slice(s, e) || "লিংকের লেখা"; const ins = `[${sel}](https://)`; return { value: val.slice(0, s) + ins + val.slice(e), s: s + sel.length + 3, e: s + ins.length - 1 }; }),
    img: () => edit((val, s, e) => { const ins = `![ছবির বর্ণনা](https://)`; return { value: val.slice(0, s) + ins + val.slice(e), s: s + 11, e: s + ins.length - 1 }; }),
    codeblock: () => edit((val, s, e) => { const sel = val.slice(s, e) || "কোড"; const ins = "```\n" + sel + "\n```"; return { value: val.slice(0, s) + ins + val.slice(e), s: s + 4, e: s + 4 + sel.length }; })
  };
  area.querySelector(".bl-toolbar").addEventListener("click", (e) => { const b = e.target.closest("[data-md]"); if (b) MD[b.dataset.md]?.(); });

  /* ---- প্রিভিউ (পাবলিক পাতার একই রেন্ডারার ও CSS) ---- */
  $("#edPreview").addEventListener("click", () => {
    const d = collect();
    const { box } = openModal(`<div class="modal-head"><h3>প্রিভিউ — প্রকাশের আগে দেখে নিন</h3><button class="modal-close" data-x aria-label="বন্ধ করুন">${icons.close}</button></div>
      <div class="bl-preview"><article class="bl-article" lang="${d.language === "en" ? "en" : "bn"}"><header class="bl-article-head"><div class="bl-tags"><span class="pf-tag" id="bpCat"></span></div><h1 id="bpTitle"></h1><p class="bl-lead" id="bpLead"></p>
      <div class="bl-byline"><span class="cm-av" aria-hidden="true">${esc((authorName || "?").trim().charAt(0).toUpperCase())}</span><div class="bl-byline-txt"><b id="bpAuthor"></b><span class="bl-sub" id="bpMeta"></span></div></div></header>
      <figure class="bl-cover" id="bpCover" hidden><img alt="" id="bpImg"></figure><div class="bl-content" id="bpContent"></div></article></div>`, { wide: true, label: "লেখার প্রিভিউ" });
    box.querySelector("#bpTitle").textContent = d.title || "(শিরোনাম নেই)";
    box.querySelector("#bpLead").textContent = d.excerpt; box.querySelector("#bpLead").hidden = !d.excerpt;
    box.querySelector("#bpCat").textContent = cats.find((c) => c.id === d.category)?.name || d.category;
    box.querySelector("#bpAuthor").textContent = authorName || "";
    box.querySelector("#bpMeta").textContent = `${formatDay(new Date())} · ${fmtN(readingTimeMinutes(d.content))} মিনিট পড়া`;
    const cv = safeImageSrc(d.coverImage);
    if (/^https:/i.test(cv)) { box.querySelector("#bpCover").hidden = false; const im = box.querySelector("#bpImg"); im.src = cv; im.alt = d.coverAlt || d.title; }
    box.querySelector("#bpContent").replaceChildren(renderArticle(d.content).fragment);
  });

  /* ---- সংরক্ষণ ---- */
  async function save(mode) {
    if (busy) return;
    clearErrs();
    const d = collect();
    const errs = validatePostInput({ ...d, featuredOrder: d.featuredOrder === "" ? 0 : d.featuredOrder });
    if (!activeCats.length) { showToast("আগে একটা ক্যাটাগরি বানান।", "error"); return; }
    const keys = Object.keys(errs);
    if (keys.length) {
      keys.forEach((k) => fieldErr(k, errs[k]));
      area.querySelector(`#bf-${FIELD_ID[keys[0]] || keys[0]}`)?.focus();
      showToast("কিছু তথ্য ঠিক নেই — লাল চিহ্নিত ঘরগুলো দেখুন।", "error");
      return;
    }
    busy = true;
    const btns = [...area.querySelectorAll("#edSave, #edDraft, #edUnpublish, #edPreview, #edDelete")];
    btns.forEach((b) => { b.disabled = true; });
    $("#edSave").setAttribute("aria-busy", "true");
    try {
      if (isNew) {
        const newId = await A.createPost(user, { ...d, status: mode === "publish" ? STATUS.PUBLISHED : STATUS.DRAFT });
        initial = JSON.stringify(collect());
        showToast(mode === "publish" ? "লেখা প্রকাশিত হয়েছে।" : "খসড়া সংরক্ষিত হয়েছে।");
        location.hash = `#blog/edit/${newId}`;
        return;
      }
      const next = mode === "unpublish" ? STATUS.DRAFT : mode === "publish" ? STATUS.PUBLISHED : post.status;
      const changed = await A.updatePost(user, post, d, { status: next });
      initial = JSON.stringify(collect());
      showToast(!changed ? "কোনো পরিবর্তন নেই।" : mode === "publish" ? "লেখা প্রকাশিত হয়েছে।" : mode === "unpublish" ? "লেখা আনপাবলিশ হয়েছে (খসড়ায় গেছে)।" : "সংরক্ষিত হয়েছে।");
      busy = false;
      leaveBlog();
      editor(page, h, id);                                                  // নতুন তথ্য (স্ট্যাটাস/তারিখ/স্লাগ) নিয়ে আবার সাজানো
      return;
    } catch (e) {
      const ex = A.explain(e);
      if (ex.code === "slug-taken") fieldErr("slug", ex.message);
      else if (ex.code === "validation") showToast(ex.message, "error");
      showToast(ex.message, "error");
    }
    busy = false;
    btns.forEach((b) => { b.disabled = false; }); $("#edSave")?.removeAttribute("aria-busy");
  }
  area.querySelector("#edForm").addEventListener("submit", (e) => { e.preventDefault(); save($("#edSave").dataset.mode === "update" ? "update" : "publish"); });
  $("#edDraft")?.addEventListener("click", () => save("draft"));
  $("#edUnpublish")?.addEventListener("click", () => h.confirmAction("আনপাবলিশ করলে লেখাটি পাবলিক সাইটে আর দেখা যাবে না (খসড়া হিসেবে থাকবে)। বর্তমান পরিবর্তনগুলোও সংরক্ষিত হবে।", () => save("unpublish"), "আনপাবলিশ করুন", false));
  $("#edDelete")?.addEventListener("click", () => h.confirmAction(`"${esc(post.title)}" স্থায়ীভাবে মুছে ফেলতে চান? এর মন্তব্যসহ সব যাবে — আর ফেরানো যাবে না।`, async () => {
    try { const r = await A.deletePost(post); initial = JSON.stringify(collect()); showToast(r.orphanCommentsLeft ? "লেখা মুছেছে, কিছু মন্তব্য মোছা যায়নি (Firebase Console থেকে মুছুন)।" : "লেখা মুছে ফেলা হয়েছে।"); location.hash = "#blog"; }
    catch (err) { showToast(A.explain(err).message, "error"); }
  }));

  /* ---- Ctrl/Cmd+S, অসংরক্ষিত-পরিবর্তন সুরক্ষা ---- */
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(published ? "update" : "draft"); } };
  const onBeforeUnload = (e) => { if (dirty() && !busy) { e.preventDefault(); e.returnValue = ""; } };
  const onNav = (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a || !dirty() || a.target === "_blank") return;
    if (!window.confirm("সংরক্ষণ না করা পরিবর্তন হারিয়ে যাবে। তবুও ছেড়ে যেতে চান?")) { e.preventDefault(); e.stopPropagation(); }
  };
  document.addEventListener("keydown", onKey); window.addEventListener("beforeunload", onBeforeUnload); document.addEventListener("click", onNav, true);
  teardown = () => { document.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onBeforeUnload); document.removeEventListener("click", onNav, true); clearTimeout(slugTimer); clearTimeout(coverTimer); };
  if (isNew) el("title").focus();
}

/* ============================================================ ক্যাটাগরি */
const DEFAULT_CATS = [["web-development", "Web Development", 1], ["design", "Design", 2], ["tutorials", "Tutorials", 3], ["tips", "Tips & Guides", 4]];

async function categoriesTab(area, h) {
  area.innerHTML = h.skeletonTableHtml();
  let cats = [];
  const reload = async () => { try { cats = await A.fetchAllCategories(); } catch (e) { area.innerHTML = errBox(e); area.querySelector("[data-reload]")?.addEventListener("click", reload); return false; } return true; };
  if (!(await reload())) return;
  const paint = () => {
    area.innerHTML = `
      ${cats.length ? "" : `<div class="seed-card"><div class="seed-card-body"><h3>ব্লগ-ক্যাটাগরি এখনো বসানো হয়নি</h3><p>লেখা প্রকাশ করতে ক্যাটাগরি লাগে। এক ক্লিকে ৪টা ডিফল্ট (Web Development, Design, Tutorials, Tips & Guides) বসাতে পারেন — পরে নাম/ক্রম বদলানো যাবে।</p>
        <button class="btn btn-primary btn-sm" id="catSeed">ডিফল্ট ক্যাটাগরি বসান</button></div></div>`}
      <div class="admin-card"><h3>নতুন ক্যাটাগরি</h3><p>নাম লিখুন; স্লাগ (URL-আইডি) ইংরেজিতে — ফাঁকা রাখলে নাম থেকে বানানো হবে। স্লাগ পরে বদলানো যায় না।</p>
        <div class="cm-adm-addrow bl-adm-addrow"><div class="field"><label for="catName">নাম</label><input id="catName" maxlength="40" placeholder="যেমন: Design"></div>
        <div class="field"><label for="catSlug">স্লাগ</label><input id="catSlug" maxlength="40" placeholder="design" spellcheck="false"></div>
        <div class="field"><label for="catOrder">ক্রম</label><input id="catOrder" type="number" min="0" max="9999" value="${cats.reduce((m, c) => Math.max(m, c.order || 0), 0) + 1}"></div>
        <button class="btn btn-primary btn-sm" id="catAdd">যোগ করুন</button></div></div>
      ${cats.length ? `<div class="admin-card"><h3>ক্যাটাগরির তালিকা</h3><p>নিষ্ক্রিয় ক্যাটাগরি পাবলিক ফিল্টারে ও নতুন লেখায় দেখায় না। মুছতে চাইলে নির্ভরশীল লেখা অন্য ক্যাটাগরিতে সরানোর সুযোগ পাবেন।</p>
        ${cats.map((c) => `<div class="cm-adm-cat" data-id="${esc(c.id)}"><input class="cm-cat-name" value="${esc(c.name)}" maxlength="40" aria-label="নাম: ${esc(c.id)}"><input class="cm-cat-order" type="number" min="0" max="9999" value="${Number(c.order) || 0}" aria-label="ক্রম: ${esc(c.id)}">
          <span class="cat-badge">${esc(c.id)}</span><button class="btn ${c.active === false ? "btn-soft" : "btn-outline"} btn-sm" data-tg>${c.active === false ? "সক্রিয় করুন" : "নিষ্ক্রিয় করুন"}</button><button class="btn btn-danger-ghost btn-sm" data-del>মুছুন</button></div>`).join("")}</div>` : ""}`;
  };
  paint();
  const guard = async (fn, okMsg) => { try { await fn(); if (okMsg) showToast(okMsg); await reload(); paint(); } catch (e) { showToast(A.explain(e).message, "error"); } };

  area.addEventListener("click", async (e) => {
    if (e.target.closest("#catSeed")) return guard(async () => { for (const [slug, name, order] of DEFAULT_CATS) { if (!cats.some((c) => c.id === slug)) await A.addCategory({ name, slug, order }); } }, "ডিফল্ট ক্যাটাগরি বসানো হয়েছে।");
    if (e.target.closest("#catAdd")) {
      const name = area.querySelector("#catName").value.trim(), slug = area.querySelector("#catSlug").value.trim(), order = parseInt(area.querySelector("#catOrder").value, 10);
      if (!name) return showToast("ক্যাটাগরির নাম লিখুন।", "error");
      return guard(() => A.addCategory({ name, slug, order: Number.isFinite(order) ? order : 0 }), "ক্যাটাগরি যোগ হয়েছে।");
    }
    const row = e.target.closest("[data-id]"); if (!row) return;
    const c = cats.find((x) => x.id === row.dataset.id);
    if (e.target.closest("[data-tg]")) return guard(() => A.updateCategory(c.id, { active: c.active === false }), "আপডেট হয়েছে।");
    if (e.target.closest("[data-del]")) return deleteFlow(c);
  });
  area.addEventListener("change", (e) => {
    const row = e.target.closest("[data-id]"); if (!row) return;
    const c = cats.find((x) => x.id === row.dataset.id);
    if (e.target.classList.contains("cm-cat-name")) {
      const name = e.target.value.trim();
      if (!name) { e.target.value = c.name; return showToast("নাম ফাঁকা রাখা যাবে না।", "error"); }
      guard(() => A.updateCategory(c.id, { name }), "নাম আপডেট হয়েছে।");
    } else if (e.target.classList.contains("cm-cat-order")) {
      const order = parseInt(e.target.value, 10);
      if (!Number.isFinite(order) || order < 0 || order > 9999) { e.target.value = c.order; return showToast("ক্রম ০–৯৯৯৯ এর মধ্যে দিন।", "error"); }
      guard(() => A.updateCategory(c.id, { order }), "ক্রম আপডেট হয়েছে।");
    }
  });

  /** নিরাপদ মুছা: নির্ভরশীল লেখা থাকলে রিঅ্যাসাইন-ডায়ালগ; না থাকলে সাধারণ কনফার্ম */
  async function deleteFlow(c) {
    let n;
    try { n = await A.countPostsIn(c.id); } catch (e) { return showToast(A.explain(e).message, "error"); }
    if (n === 0) return h.confirmAction(`"${esc(c.name)}" ক্যাটাগরি মুছে ফেলতে চান? এতে কোনো লেখা নেই।`, () => guard(() => A.deleteCategory(c.id), "ক্যাটাগরি মুছে ফেলা হয়েছে।"));
    const others = cats.filter((x) => x.id !== c.id && x.active !== false);
    const { box, close } = openModal(`<div class="modal-head"><h3>লেখাগুলো আগে সরান</h3><button class="modal-close" data-x aria-label="বন্ধ করুন">${icons.close}</button></div>
      <p>"${esc(c.name)}" ক্যাটাগরিতে <b>${fmtN(n)}টা লেখা</b> আছে (খসড়াসহ)। মুছতে হলে সেগুলো অন্য একটা ক্যাটাগরিতে সরাতে হবে — এতে লেখার অন্য কিছু বদলায় না।</p>
      ${others.length ? `<div class="field"><label for="reTo">কোন ক্যাটাগরিতে সরাবেন?</label><select id="reTo" data-autofocus>${others.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("")}</select></div>
        <div class="field-hint" id="reProg" role="status"></div>
        <div class="form-actions"><button type="button" class="btn btn-ghost" data-x>বাতিল</button><button type="button" class="btn btn-primary" id="reGo">সরিয়ে ক্যাটাগরি মুছুন</button></div>`
        : `<p class="field-hint">সরানোর মতো অন্য কোনো সক্রিয় ক্যাটাগরি নেই — আগে আরেকটা ক্যাটাগরি বানান।</p><div class="form-actions"><button type="button" class="btn btn-ghost" data-x data-autofocus>বন্ধ করুন</button></div>`}`, { label: "ক্যাটাগরি মুছুন" });
    box.querySelector("#reGo")?.addEventListener("click", async (ev) => {
      const btn = ev.currentTarget, to = box.querySelector("#reTo").value, prog = box.querySelector("#reProg");
      btn.disabled = true; btn.setAttribute("aria-busy", "true");
      try {
        await A.reassignCategory(auth.currentUser, c.id, to, (d, t) => { prog.textContent = `${fmtN(d)}/${fmtN(t)}টা লেখা সরানো হয়েছে…`; });
        await A.deleteCategory(c.id);
        close(); showToast("লেখা সরিয়ে ক্যাটাগরি মুছে ফেলা হয়েছে।"); await reload(); paint();
      } catch (err) { prog.textContent = ""; btn.disabled = false; btn.removeAttribute("aria-busy"); showToast(A.explain(err).message, "error"); }
    });
  }
}

/* ============================================================ মন্তব্য-মডারেশন */
async function commentsTab(area, h) {
  const user = () => auth.currentUser;
  area.innerHTML = h.skeletonTableHtml();
  let posts;
  const load = async () => { try { posts = await A.postsWithPending(); } catch (e) { area.innerHTML = errBox(e); area.querySelector("[data-reload]")?.addEventListener("click", load); return; } paint(); };
  const st = { pid: null, status: COMMENT_STATUS.PENDING, items: [], cursor: null, done: false, loading: false, error: null, seq: 0 };

  function paint() {
    if (st.pid) return paintPost();
    const total = posts.reduce((s, p) => s + (p.pending || 0), 0);
    area.innerHTML = `<div class="admin-card"><h3>অপেক্ষমাণ মন্তব্য: ${fmtN(total)}টা</h3><p>যে লেখায় মন্তব্য আছে সেটি বেছে নিন। নতুন মন্তব্য অনুমোদনের আগে পাবলিক সাইটে দেখা যায় না।</p></div>
      ${posts.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>লেখা</th><th>স্ট্যাটাস</th><th>অপেক্ষমাণ</th><th></th></tr></thead><tbody>${posts.map((p) => `<tr data-pid="${esc(p.id)}"><td><div class="cell-title">${esc(p.title)}</div><div class="cell-muted">/${esc(p.slug)}</div></td><td>${statusBadge(p.status)}</td><td>${p.pending === null ? "?" : p.pending ? `<span class="status-badge st-progress">${fmtN(p.pending)}</span>` : "০"}</td><td class="cell-actions"><button class="btn btn-outline btn-sm" data-open="${esc(p.id)}">${icons.chat} মন্তব্য</button></td></tr>`).join("")}</tbody></table></div>
        <div class="admin-mobile-list">${posts.map((p) => `<div class="admin-list-card" data-pid="${esc(p.id)}"><div class="admin-list-card-top"><b>${esc(p.title)}</b>${p.pending ? `<span class="status-badge st-progress">${fmtN(p.pending)}</span>` : ""}</div><p>/${esc(p.slug)}</p><div class="cell-actions"><button class="btn btn-outline btn-sm" data-open="${esc(p.id)}">${icons.chat} মন্তব্য</button></div></div>`).join("")}</div>`
        : emptyBox("এখনো কোনো লেখা নেই।", "chat")}`;
  }
  const loadComments = async (reset) => {
    if (st.loading && !reset) return;
    if (reset) Object.assign(st, { items: [], cursor: null, done: false, error: null });
    st.loading = true; const tok = ++st.seq; paintPost();
    try {
      const pg = await A.fetchPostComments(st.pid, { status: st.status, cursor: st.cursor });
      if (tok !== st.seq) return;
      const seen = new Set(st.items.map((x) => x.id)); st.items.push(...pg.items.filter((x) => !seen.has(x.id))); st.cursor = pg.cursor; st.done = pg.done;
    } catch (e) { if (tok !== st.seq) return; st.error = e; }
    st.loading = false; paintPost();
  };
  function paintPost() {
    const p = posts.find((x) => x.id === st.pid);
    const filters = [[COMMENT_STATUS.PENDING, "অপেক্ষমাণ"], [COMMENT_STATUS.APPROVED, "অনুমোদিত"], [COMMENT_STATUS.HIDDEN, "লুকানো"], [COMMENT_STATUS.DELETED, "মুছে ফেলা"], ["", "সব"]];
    const cmt = (c) => `<div class="admin-list-card bl-adm-cmt" data-cid="${esc(c.id)}"><div class="admin-list-card-top"><b>${esc(c.authorName || "সদস্য")}</b>${cStatusBadge(c.status)}</div>
      <div class="cm-adm-t-by">${esc(formatDate(c.createdAt) || "")}</div><div class="cm-adm-t-body">${esc(c.body)}</div>
      <div class="cm-adm-actions">${c.status !== COMMENT_STATUS.APPROVED ? `<button class="btn btn-primary btn-sm" data-set="approved">${icons.check} অনুমোদন</button>` : ""}
        ${c.status !== COMMENT_STATUS.HIDDEN ? `<button class="btn btn-outline btn-sm" data-set="hidden">লুকান</button>` : ""}
        ${c.status !== COMMENT_STATUS.DELETED ? `<button class="btn btn-danger-ghost btn-sm" data-set="deleted">${icons.trash} মুছুন</button>` : ""}</div></div>`;
    area.innerHTML = `<div class="admin-card"><button class="btn btn-ghost btn-sm" data-back>${icons.back} সব লেখা</button><h3 class="bl-adm-h">${esc(p?.title || "")}</h3></div>
      <div class="filter-row cm-adm-sub">${filters.map(([v, l]) => `<button type="button" class="chip${st.status === v ? " active" : ""}" data-fs="${v}" aria-pressed="${st.status === v}">${l}</button>`).join("")}</div>
      <div>${st.error && !st.items.length ? errBox(st.error) : st.items.length ? st.items.map(cmt).join("") : st.loading ? h.skeletonTableHtml() : emptyBox("এই ফিল্টারে কোনো মন্তব্য নেই।", "chat")}</div>
      <div class="cm-adm-more">${st.loading && st.items.length ? `<div class="cm-spin" role="status" aria-label="লোড হচ্ছে"></div>` : !st.done && st.items.length ? `<button class="btn btn-outline btn-sm" data-more>আরও দেখুন</button>` : ""}</div>`;
  }
  area.addEventListener("click", async (e) => {
    const open = e.target.closest("[data-open]");
    if (open) { st.pid = open.dataset.open; st.status = COMMENT_STATUS.PENDING; loadComments(true); return; }
    if (e.target.closest("[data-back]")) { st.pid = null; st.seq++; await load(); return; }
    if (e.target.closest("[data-reload]")) { st.pid ? loadComments(true) : load(); return; }
    const fs = e.target.closest("[data-fs]"); if (fs) { st.status = fs.dataset.fs; loadComments(true); return; }
    if (e.target.closest("[data-more]")) { loadComments(false); return; }
    const set = e.target.closest("[data-set]");
    if (set) {
      const card = set.closest("[data-cid]"), cid = card.dataset.cid, status = set.dataset.set;
      const run = async () => {
        set.disabled = true;
        try { await A.moderateComment(user(), st.pid, cid, status); showToast(status === "approved" ? "মন্তব্য অনুমোদিত — এখন পাবলিক সাইটে দেখা যাবে।" : status === "hidden" ? "মন্তব্য লুকানো হয়েছে।" : "মন্তব্য মুছে ফেলা হয়েছে।"); const p = posts.find((x) => x.id === st.pid); if (p && typeof p.pending === "number" && st.status === COMMENT_STATUS.PENDING) p.pending = Math.max(0, p.pending - 1); loadComments(true); }
        catch (err) { set.disabled = false; showToast(A.explain(err).message, "error"); }
      };
      if (status === "deleted") h.confirmAction("মন্তব্যটি মুছে ফেললে পাঠক আর দেখবেন না (রেকর্ড থাকবে)।", run, "মুছে ফেলুন"); else run();
    }
  });
  load();
}
