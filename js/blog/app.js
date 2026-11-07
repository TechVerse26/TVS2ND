// js/blog/app.js
// পাবলিক ব্লগ UI — তালিকা (সার্চ + ক্যাটাগরি + Load More), লেখার পাতা (সূচিপত্র, শেয়ার, মন্তব্য, সম্পর্কিত লেখা), অ্যাডমিন-খসড়া প্রিভিউ।
// শুধু Pure JS; বিদ্যমান ক্লাস/টোকেন (.btn, .chip, .filter-row, .pf-card…, .field, .skel…, .cm-*) আবার ব্যবহার করে — নতুন ডিজাইন-সিস্টেম নেই।
// js/blog-entry.js ডায়নামিক import করে — Firebase না এলে (অফলাইন) বাকি সাইট অক্ষত থাকে।
// নিরাপত্তা: লেখার বিষয়বস্তু শুধু markdown.js-এর (দুই-স্তরের) নিরাপদ ফ্র্যাগমেন্ট দিয়ে বসে; বাকি সব Firestore-টেক্সট escape করে বা textContent দিয়ে।

import { escapeHtml, safeImageSrc, formatDay, formatDate } from "../utils.js";
import { avatarOrLetter, emptyState } from "../templates.js";
import { icons } from "../icons.js";
import { showToast } from "../toast.js";
import { lockScroll, unlockScroll } from "../scrolllock.js";
import { watchAuthState, getUserProfile, isAdminProfile } from "../auth.js";
import * as api from "./api.js";
import { renderArticle } from "./markdown.js";
import { createSeo, siteBase, articleUrl, blogUrl, postJsonLd, listJsonLd } from "./seo.js";
import { toneFor, LIMITS, COMMENT_START_STATUS, COMMENT_STATUS } from "./model.js";

const esc = escapeHtml;
const nf = new Intl.NumberFormat("bn-BD");
const fmtN = (n) => nf.format(Number(n) || 0);
const SITE = "Tech Verse";
const X_PATH = "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z";

let rtf = null;
try { rtf = new Intl.RelativeTimeFormat("bn", { numeric: "auto" }); } catch (_) { /* পুরোনো ব্রাউজার */ }
/** "৫ মিনিট আগে" — সার্ভার টাইমস্ট্যাম্প পেন্ডিং (null) হলে "এইমাত্র" */
function timeAgo(v) {
  const d = api.toDate(v) || new Date();
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 45) return "এইমাত্র";
  const m = Math.floor(sec / 60);
  if (m < 60) return rtf ? rtf.format(-m, "minute") : `${fmtN(m)} মিনিট আগে`;
  const h = Math.floor(m / 60);
  if (h < 24) return rtf ? rtf.format(-h, "hour") : `${fmtN(h)} ঘণ্টা আগে`;
  const dd = Math.floor(h / 24);
  if (dd < 30) return rtf ? rtf.format(-dd, "day") : `${fmtN(dd)} দিন আগে`;
  return d.toLocaleDateString("bn-BD", { year: "numeric", month: "short", day: "numeric" });
}
/** তাৎক্ষণিক স্ক্রল — সাইটের html{scroll-behavior:smooth} এড়িয়ে (নতুন পাতা খোলা/ফেরা কোনো অ্যানিমেশন ছাড়াই) */
function jump(y = 0) {
  const el = document.documentElement, prev = el.style.scrollBehavior;
  el.style.scrollBehavior = "auto";
  void el.offsetHeight;                                   // স্টাইল রিক্যালকুলেশন বাধ্য করা — নইলে html{scroll-behavior:smooth} তখনও কার্যকর থাকে (পরীক্ষায় প্রমাণিত)
  window.scrollTo(0, y);
  el.style.scrollBehavior = prev;
}
/** কভার-ছবির URL: শুধু https (rules-এ http/https; ছবিতে http mixed-content ব্লক হয়) */
const coverSrc = (u) => { const s = safeImageSrc(u); return /^https:\/\//i.test(s) ? s : ""; };
const readLabel = (m) => `${fmtN(m || 1)} মিনিট পড়া`;

const cardSkeleton = (n = 3) => Array.from({ length: n }, () =>
  `<div class="skel-card bl-skel" aria-hidden="true"><div class="skel bl-skel-img"></div><div class="skel skel-row cm-w40"></div><div class="skel skel-row bl-skel-title cm-w95"></div><div class="skel skel-row cm-w75"></div><div class="skel skel-row cm-w60"></div></div>`).join("");

/* ============================================================ মূল কন্ট্রোলার */
export function createBlog(root) {
  const S = {
    user: null, isAdmin: false, authReady: false, blocked: false, author: null,
    cats: [], catsLoaded: false,
    list: { cat: "", q: "", items: [], cursor: null, done: false, loading: false, error: null, loaded: false, token: 0, featured: [], featuredLoaded: false },
    post: null, postToken: 0,
    route: { name: "list" }, scrollY: 0, busy: new Set()
  };
  const seo = createSeo();
  const $ = (sel) => root.querySelector(sel);
  let io = null, unwatch = null, visible = false, searchTimer = null, tocSpy = null;

  const catMap = () => Object.fromEntries(S.cats.map((c) => [c.id, c]));
  const catName = (id) => catMap()[id]?.name || (id ? id.replace(/-/g, " ") : "General");
  const openAuth = () => document.dispatchEvent(new CustomEvent("tv:open-auth", { detail: { view: "login" } }));
  const base = () => siteBase();

  /* ---------------------------------------------------------- টেমপ্লেট */
  function errorHtml(err, act) {
    const off = err.code === "offline";
    return `<div class="cm-state" role="alert"><div class="empty-state-icon">${off ? icons.wifiOff : icons.warn}</div>
      <p>${esc(err.message)}</p>${err.retryable !== false ? `<button type="button" class="btn btn-outline btn-sm" data-bl="${act}">${icons.refresh} আবার চেষ্টা করুন</button>` : ""}</div>`;
  }
  function coverHtml(p, { eager = false } = {}) {
    const src = coverSrc(p.coverImage);
    const tone = toneFor(p.category);
    return src
      ? `<div class="pf-media bl-media"><img src="${esc(src)}" alt="${esc(p.coverAlt || "")}" width="1200" height="675" loading="${eager ? "eager" : "lazy"}" decoding="async" data-bl-img></div>`
      : `<div class="pf-cover bl-cover-fallback tone-${tone}"><span class="pf-cover-icon">${icons.book}</span></div>`;
  }
  function cardHtml(p, { featured = false } = {}) {
    const href = `#blog/${esc(p.slug)}`;
    const tone = toneFor(p.category);
    const name = p.author || SITE;
    return `<article class="pf-card bl-card tone-${tone}" data-id="${esc(p.id)}">
      ${coverHtml(p)}
      <div class="pf-body bl-body">
        <div class="bl-tags"><span class="pf-tag">${esc(catName(p.category))}</span>${featured ? `<span class="bl-feat-badge">${icons.sparkle} ফিচার্ড</span>` : ""}</div>
        <h3><a class="bl-link" href="${href}">${esc(p.title)}</a></h3>
        ${p.excerpt ? `<p class="bl-excerpt">${esc(p.excerpt)}</p>` : ""}
      </div>
      <footer class="bl-meta">
        <span class="cm-av cm-av-sm" aria-hidden="true">${avatarOrLetter(safeImageSrc(p.authorAvatar), name)}</span>
        <span class="bl-meta-txt"><b>${esc(name)}</b>
          <span class="bl-sub"><time datetime="${esc(isoDate(p.publishedAt))}">${esc(formatDay(p.publishedAt))}</time> · ${esc(readLabel(p.readingTime))}</span></span>
      </footer></article>`;
  }
  const isoDate = (v) => { const d = api.toDate(v); return d ? d.toISOString() : ""; };

  /* ---------------------------------------------------------- তালিকা */
  function renderListShell() {
    root.innerHTML = `<div class="wrap bl-wrap">
      <div class="section-head bl-head"><h2 id="blHeading" tabindex="-1">ব্লগ ও রিসোর্স</h2>
        <p>ওয়েব, ডিজাইন ও প্রযুক্তি নিয়ে আমাদের লেখা, গাইড ও অভিজ্ঞতা।</p></div>
      ${S.isAdmin ? `<p class="cm-admin-note"><a href="./admin.html#blog">ব্লগ ম্যানেজ করুন →</a></p>` : ""}
      <div class="bl-tools">
        <form class="bl-search" role="search" data-bl-form novalidate>
          <label class="sr-only" for="blSearch">লেখা খুঁজুন</label>
          <span class="bl-search-ico" aria-hidden="true">${icons.search}</span>
          <input id="blSearch" class="bl-search-input" type="search" name="q" placeholder="লেখা খুঁজুন (শিরোনাম বা ট্যাগ)…" autocomplete="off" enterkeyhint="search" maxlength="60" value="${esc(S.list.q)}">
          <button type="button" class="bl-search-clear" data-bl="clear-search" aria-label="সার্চ মুছুন"${S.list.q ? "" : " hidden"}>${icons.close}</button>
        </form>
        <div class="filter-row bl-cats" id="blCats" role="group" aria-label="ক্যাটাগরি"></div>
      </div>
      <section class="bl-featured" id="blFeatured" aria-labelledby="blFeatH" hidden>
        <h3 id="blFeatH" class="bl-subhead">ফিচার্ড লেখা</h3><div class="bl-grid" id="blFeatGrid"></div></section>
      <h3 class="bl-subhead" id="blAllH" hidden>সব লেখা</h3>
      <div class="bl-grid" id="blGrid" aria-live="polite"></div>
      <div class="cm-foot" id="blFoot"></div></div>`;
    renderCats(); renderFeatured(); renderList();
  }

  function renderCats() {
    const el = $("#blCats");
    if (!el) return;
    const cats = S.cats.filter((c) => c.active !== false);
    const btn = (id, label) => `<button type="button" class="chip${S.list.cat === id ? " active" : ""}" data-bl="cat" data-cat="${esc(id)}" aria-pressed="${S.list.cat === id}">${esc(label)}</button>`;
    el.innerHTML = btn("", "সব") + cats.map((c) => btn(c.id, c.name)).join("");
    el.hidden = !cats.length;
  }

  const filtersOff = () => !S.list.cat && !S.list.q.trim();

  function renderFeatured() {
    const box = $("#blFeatured"), grid = $("#blFeatGrid"), h = $("#blAllH");
    if (!box) return;
    const show = filtersOff() && S.list.featured.length > 0;
    box.hidden = !show;
    if (h) h.hidden = !show;
    if (show) grid.innerHTML = S.list.featured.map((p) => cardHtml(p, { featured: true })).join("");
  }

  function renderList() {
    const grid = $("#blGrid"), foot = $("#blFoot");
    if (!grid) return;
    const L = S.list;
    if (io) { io.disconnect(); io = null; }
    foot.innerHTML = "";
    const featIds = filtersOff() ? new Set(L.featured.map((p) => p.id)) : new Set();     // ফিল্টার ছাড়া হলে ফিচার্ডগুলো ওপরে দেখানো হয় — নিচে দ্বিতীয়বার নয়
    const items = L.items.filter((p) => !featIds.has(p.id));
    if (L.error && !L.items.length) { grid.innerHTML = errorHtml(L.error, "retry"); return; }
    if (!items.length) {
      if (L.loading || !L.loaded) { grid.innerHTML = cardSkeleton(3); return; }
      const filtered = !filtersOff();
      if (!filtered && featIds.size) { grid.innerHTML = ""; }
      else grid.innerHTML = emptyState(filtered ? "এই ফিল্টারে কোনো লেখা পাওয়া যায়নি — অন্য শব্দ বা ক্যাটাগরি চেষ্টা করুন।" : "এখনো কোনো লেখা প্রকাশিত হয়নি — শীঘ্রই আসছে!", "book");
      if (filtered) foot.innerHTML = `<button type="button" class="btn btn-outline btn-sm" data-bl="reset">ফিল্টার মুছুন</button>`;
      return;
    }
    grid.innerHTML = items.map((p) => cardHtml(p)).join("");
    if (L.error) foot.innerHTML = errorHtml(L.error, "more");
    else if (L.loading) foot.innerHTML = `<div class="cm-spin" role="status" aria-label="লোড হচ্ছে"></div>`;
    else if (L.done) foot.innerHTML = `<p class="cm-end">সব লেখা দেখা হয়েছে।</p>`;
    else foot.innerHTML = `<button type="button" class="btn btn-outline" data-bl="more">আরও লেখা দেখুন</button>`;
  }

  async function loadCategories() {
    try { S.cats = await api.fetchBlogCategories(); } catch (_) { /* ক্যাটাগরি ছাড়াই চলবে — কার্ডে স্লাগ থেকে নাম */ }
    S.catsLoaded = true;
    renderCats();
    if (S.post?.data) renderCategoryLabel();
  }

  async function loadFeatured() {
    const L = S.list;
    try { L.featured = await api.fetchFeatured(3); } catch (_) { L.featured = []; }
    L.featuredLoaded = true;
    renderFeatured(); renderList();
  }

  async function loadList(reset = false) {
    const L = S.list;
    if (L.loading && !reset) return;
    if (reset) Object.assign(L, { items: [], cursor: null, done: false, error: null, loaded: false });
    L.loading = true; L.error = null;
    const tok = ++L.token;
    renderList();
    try {
      const pg = await api.fetchPosts({ category: L.cat, search: L.q, cursor: L.cursor });
      if (tok !== L.token) return;                       // এর মাঝে ফিল্টার/সার্চ বদলে গেছে — পুরোনো ফলাফল ফেলে দিই
      const seen = new Set(L.items.map((x) => x.id));
      L.items.push(...pg.items.filter((x) => !seen.has(x.id))); L.cursor = pg.cursor; L.done = pg.done; L.loaded = true;
    } catch (e) {
      if (tok !== L.token) return;
      L.error = api.explain(e);
    }
    L.loading = false;
    renderList();
  }

  function applyFilters({ cat = S.list.cat, q = S.list.q } = {}) {
    S.list.cat = cat; S.list.q = q;
    S.list.token++; S.list.loading = false;
    renderCats(); renderFeatured();
    const clear = $("[data-bl='clear-search']"); if (clear) clear.hidden = !q;
    loadList(true);
  }

  async function showList() {
    renderListShell();
    seo.apply({
      title: `ব্লগ ও রিসোর্স — ${SITE}`, description: "ওয়েব, ডিজাইন ও প্রযুক্তি নিয়ে Tech Verse-এর লেখা, গাইড ও অভিজ্ঞতা।", url: blogUrl(base()), type: "website",
      jsonLd: listJsonLd({ base: base(), name: "Tech Verse ব্লগ", description: "ওয়েব, ডিজাইন ও প্রযুক্তি নিয়ে Tech Verse-এর লেখা, গাইড ও অভিজ্ঞতা।" })
    });
    if (!S.catsLoaded) loadCategories();
    if (!S.list.featuredLoaded) loadFeatured();
    focusHeading();
    if (!S.list.loaded && !S.list.loading) await loadList(true);
    requestAnimationFrame(() => jump(S.scrollY || 0));
  }

  /* ---------------------------------------------------------- লেখার পাতা */
  function shareLinks(p) {
    const url = articleUrl(base(), p.slug), t = p.title;
    return {
      url,
      wa: `https://wa.me/?text=${encodeURIComponent(`${t} ${url}`)}`,
      fb: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(t)}`
    };
  }

  function shareHtml(p) {
    const s = shareLinks(p);
    const ext = (href, cls, label, svg) => `<a class="btn btn-outline btn-sm bl-share-btn ${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${label} এ শেয়ার করুন (নতুন ট্যাবে খোলে)">${svg}<span>${label}</span></a>`;
    return `<div class="bl-share" role="group" aria-label="লেখাটি শেয়ার করুন"><span class="bl-share-t">${icons.share} শেয়ার করুন</span>
      <button type="button" class="btn btn-outline btn-sm bl-share-btn" data-bl="copy-link" aria-label="লেখার লিংক কপি করুন">${icons.copy}<span>লিংক কপি</span></button>
      ${ext(s.wa, "bl-wa", "WhatsApp", icons.whatsapp)}
      ${ext(s.fb, "bl-fb", "Facebook", icons.facebook)}
      ${ext(s.x, "bl-x", "X (Twitter)", `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="${X_PATH}"/></svg>`)}</div>`;
  }

  function postShellHtml() {
    return `<div class="wrap bl-wrap bl-post-wrap">
      <nav class="bl-crumb" aria-label="পথ"><a class="btn btn-ghost btn-sm" href="#blog">${icons.back} সব লেখা</a></nav>
      <div id="blPost" aria-live="polite"><div class="bl-article-skel">${cardSkeleton(1)}</div></div></div>`;
  }

  function renderPost() {
    const P = S.post, host = $("#blPost");
    if (!P || !host) return;
    if (P.error) { host.innerHTML = errorHtml(P.error, "retry-post"); return; }
    if (!P.data) { host.innerHTML = P.loaded ? notFoundHtml() : `<div class="bl-article-skel">${cardSkeleton(1)}</div>`; return; }
    const p = P.data;
    const name = p.author || SITE;
    const cover = coverSrc(p.coverImage);
    const edited = isoDate(p.updatedAt) && isoDate(p.publishedAt) && Math.abs(api.toDate(p.updatedAt) - api.toDate(p.publishedAt)) > 86400000;
    host.innerHTML = `${P.draft ? `<div class="cm-banner bl-draft" role="status">${icons.eye}<span>খসড়া প্রিভিউ — লেখাটি এখনো প্রকাশিত নয়; শুধু আপনি (অ্যাডমিন) দেখতে পাচ্ছেন।</span></div>` : ""}
      <article class="bl-article" lang="${p.language === "en" ? "en" : "bn"}">
        <header class="bl-article-head">
          <div class="bl-tags"><a class="pf-tag tone-${toneFor(p.category)}" id="blCatLabel" href="#blog" data-bl="cat-link" data-cat="${esc(p.category)}">${esc(catName(p.category))}</a></div>
          <h1 id="blHeading" tabindex="-1">${esc(p.title)}</h1>
          ${p.excerpt ? `<p class="bl-lead">${esc(p.excerpt)}</p>` : ""}
          <div class="bl-byline">
            <span class="cm-av" aria-hidden="true">${avatarOrLetter(safeImageSrc(p.authorAvatar), name)}</span>
            <div class="bl-byline-txt"><b>${esc(name)}</b>
              <span class="bl-sub">${p.publishedAt ? `<time datetime="${esc(isoDate(p.publishedAt))}">${esc(formatDay(p.publishedAt))}</time>` : "অপ্রকাশিত"} · ${esc(readLabel(p.readingTime))}${edited ? ` · <span class="cm-edited">হালনাগাদ: <time datetime="${esc(isoDate(p.updatedAt))}">${esc(formatDay(p.updatedAt))}</time></span>` : ""}</span></div>
          </div>
        </header>
        ${cover ? `<figure class="bl-cover"><img src="${esc(cover)}" alt="${esc(p.coverAlt || p.title)}" width="1200" height="675" decoding="async" fetchpriority="high" data-bl-img></figure>` : ""}
        <div class="bl-layout">
          <aside class="bl-toc-wrap" id="blTocWrap" hidden></aside>
          <div class="bl-content" id="blContent"></div>
        </div>
        <footer class="bl-article-foot">
          ${(p.tags || []).length ? `<ul class="bl-taglist" aria-label="ট্যাগ">${p.tags.map((t) => `<li><span class="bl-tag">#${esc(t)}</span></li>`).join("")}</ul>` : ""}
          ${P.draft ? "" : shareHtml(p)}
        </footer>
      </article>
      ${P.draft ? "" : `<section class="bl-comments" id="blComments" aria-labelledby="blComH"><h2 id="blComH">মন্তব্য</h2><div id="blComBody"></div></section>
      <section class="bl-related" id="blRelated" aria-labelledby="blRelH" hidden><h2 id="blRelH">সম্পর্কিত লেখা</h2><div class="bl-grid" id="blRelGrid"></div></section>`}`;
    mountContent(p);
    if (!P.draft) { renderComments(); renderRelated(); }
  }

  const notFoundHtml = () => `<div class="cm-state" role="alert"><div class="empty-state-icon">${icons.doc}</div>
    <h2 id="blHeading" tabindex="-1" class="bl-nf">লেখাটি পাওয়া যায়নি</h2>
    <p>লিংকটি ভুল হতে পারে, অথবা লেখাটি সরিয়ে নেওয়া হয়েছে।</p>
    <a class="btn btn-primary btn-sm" href="#blog">সব লেখা দেখুন</a></div>`;

  function renderCategoryLabel() { const el = $("#blCatLabel"); if (el && S.post?.data) el.textContent = catName(S.post.data.category); }

  /** লেখার বিষয়বস্তু বসানো — নিরাপদ ফ্র্যাগমেন্ট (দুই-স্তরের ছাঁকা) + সূচিপত্র (লম্বা লেখায়) + কোড-কপি বাটন */
  function mountContent(p) {
    const box = $("#blContent");
    if (!box) return;
    const { fragment, headings } = renderArticle(p.content);
    box.replaceChildren(fragment);
    box.querySelectorAll("pre").forEach((pre) => {                       // কোড-ব্লকে "কপি" বাটন (শুধু DOM-API; কনটেন্ট স্পর্শ হয় না)
      const b = document.createElement("button");
      b.type = "button"; b.className = "bl-copycode"; b.dataset.bl = "copy-code"; b.setAttribute("aria-label", "কোড কপি করুন"); b.textContent = "কপি";
      pre.appendChild(b);
      pre.tabIndex = 0;                                                  // কীবোর্ডে স্ক্রল করার জন্য
    });
    const words = (box.textContent || "").trim().split(/\s+/).length;
    const toc = headings.filter((h) => h.level <= 3);
    const wrap = $("#blTocWrap");
    if (wrap && toc.length >= 3 && words >= 500) {                       // "লম্বা লেখা": ≥৩টা হেডিং ও ≥৫০০ শব্দ
      wrap.hidden = false;
      wrap.innerHTML = `<nav class="bl-toc" aria-labelledby="blTocH"><h2 id="blTocH">সূচিপত্র</h2><ol>${toc.map((h) => `<li class="l${h.level}"><a href="#${esc(h.id)}" data-bl="toc" data-target="${esc(h.id)}">${esc(h.text)}</a></li>`).join("")}</ol></nav>`;
      spyToc(toc);
    }
  }

  /** সূচিপত্রে বর্তমান অংশ হাইলাইট (IntersectionObserver — স্ক্রল-লিসেনার নয়) */
  function spyToc(toc) {
    tocSpy?.disconnect(); tocSpy = null;
    if (!("IntersectionObserver" in window)) return;
    const links = new Map(toc.map((h) => [h.id, root.querySelector(`.bl-toc a[data-target="${CSS.escape(h.id)}"]`)]));
    tocSpy = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) {
        links.forEach((a) => a?.removeAttribute("aria-current"));
        links.get(e.target.id)?.setAttribute("aria-current", "true");
      }
    }, { rootMargin: "-80px 0px -70% 0px" });
    toc.forEach((h) => { const el = document.getElementById(h.id); if (el) tocSpy.observe(el); });
  }

  async function renderRelated() {
    const P = S.post;
    if (!P?.data || P.draft) return;
    const tok = P.token;
    try {
      const rel = await api.fetchRelated(P.data, 3);
      if (!S.post || S.post.token !== tok) return;
      const box = $("#blRelated"), grid = $("#blRelGrid");
      if (!box || !rel.length) return;
      grid.innerHTML = rel.map((p) => cardHtml(p)).join("");
      box.hidden = false;
    } catch (_) { /* সম্পর্কিত লেখা না এলেও মূল লেখা অক্ষত */ }
  }


  /* ---------------------------------------------------------- নিশ্চিতকরণ-ডায়ালগ (বিদ্যমান .modal-overlay/.modal; ফোকাস-ট্র্যাপ, Esc, ফোকাস ফেরত) */
  let activeDialog = null;
  function confirmDialog({ title, message, confirmLabel = "নিশ্চিত করুন" }) {
    return new Promise((resolve) => {
      const opener = document.activeElement;
      const ov = document.createElement("div");
      ov.className = "modal-overlay cm-overlay";
      ov.innerHTML = `<div class="modal cm-modal" role="alertdialog" aria-modal="true" aria-labelledby="blCfT" aria-describedby="blCfM">
        <div class="modal-head"><h3 id="blCfT">${esc(title)}</h3><button type="button" class="modal-close" data-x aria-label="বন্ধ করুন">${icons.close}</button></div>
        <p id="blCfM" class="cm-confirm-msg">${esc(message)}</p>
        <div class="cm-btnrow"><button type="button" class="btn btn-outline btn-sm" data-cancel>বাতিল</button><button type="button" class="btn btn-danger-ghost btn-sm" data-ok>${esc(confirmLabel)}</button></div></div>`;
      document.body.appendChild(ov); lockScroll();
      requestAnimationFrame(() => ov.classList.add("open"));
      let done = false;
      const close = (v) => {
        if (done) return; done = true; activeDialog = null;
        document.removeEventListener("keydown", onKey, true);
        ov.classList.remove("open"); unlockScroll(); setTimeout(() => ov.remove(), 220);
        try { opener?.focus?.({ preventScroll: true }); } catch (_) { /* */ }
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === "Escape") { e.stopPropagation(); close(false); return; }
        if (e.key !== "Tab") return;
        const f = [...ov.querySelectorAll("button")]; if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      };
      ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-x],[data-cancel]")) close(false); else if (e.target.closest("[data-ok]")) close(true); });
      document.addEventListener("keydown", onKey, true);
      activeDialog = () => close(false);
      setTimeout(() => ov.querySelector("[data-cancel]")?.focus(), 60);
    });
  }

  /* ---------------------------------------------------------- মন্তব্য */
  async function loadComments(reset = true) {
    const P = S.post;
    if (!P?.data || P.draft) return;
    const C = P.comments;
    if (reset) Object.assign(C, { items: [], cursor: null, done: false, error: null, loaded: false });
    C.loading = true;
    const tok = P.token;
    renderComments();
    try {
      const pg = await api.fetchComments(P.data.id, { cursor: C.cursor });
      if (!S.post || S.post.token !== tok) return;
      const seen = new Set(C.items.map((x) => x.id));
      C.items.push(...pg.items.filter((x) => !seen.has(x.id))); C.cursor = pg.cursor; C.done = pg.done; C.loaded = true; C.error = null;
    } catch (e) {
      if (!S.post || S.post.token !== tok) return;
      C.error = api.explain(e);
    }
    C.loading = false;
    renderComments();
  }

  async function loadMine() {
    const P = S.post;
    if (!P?.data || P.draft || !S.user) { if (P) P.mine = []; return; }
    const tok = P.token;
    try {
      const mine = await api.fetchMyPendingComments(P.data.id, S.user.uid);
      if (!S.post || S.post.token !== tok) return;
      P.mine = mine;
    } catch (_) { P.mine = []; }
    renderComments();
  }

  function commentHtml(c, { pending = false } = {}) {
    const name = c.authorName || "সদস্য";
    const mine = !!S.user && c.uid === S.user.uid;
    return `<div class="cm-reply bl-comment${pending ? " is-pending" : ""}" data-cid="${esc(c.id)}">
      <span class="cm-av cm-av-sm" aria-hidden="true">${avatarOrLetter(safeImageSrc(c.authorAvatar), name)}</span>
      <div class="cm-reply-main"><div class="cm-reply-box">
        <div class="cm-reply-top"><b>${esc(name)}</b>
          <span class="cm-sub"><time title="${esc(formatDate(c.createdAt))}">${esc(timeAgo(c.createdAt))}</time>${pending ? ` · <span class="bl-pending">অনুমোদনের অপেক্ষায়</span>` : ""}</span>
          ${mine ? `<button type="button" class="cm-ico" data-bl="del-comment" data-cid="${esc(c.id)}" aria-label="আমার মন্তব্য মুছুন">${icons.trash}</button>` : ""}</div>
        <div class="cm-reply-body">${esc(c.body)}</div></div></div></div>`;
  }

  function commentFormHtml() {
    const P = S.post, p = P.data;
    if (p.commentsOpen === false) return `<p class="bl-note">${icons.info}<span>এই লেখায় মন্তব্য বন্ধ আছে।</span></p>`;
    if (!S.authReady) return "";
    if (!S.user) return `<div class="bl-note bl-note-login"><span>মন্তব্য করতে লগইন করুন।</span><button type="button" class="btn btn-primary btn-sm" data-bl="login">লগইন</button></div>`;
    if (S.blocked) return `<p class="bl-note">${icons.info}<span>আপনার মন্তব্য করার অ্যাক্সেস সীমিত — মন্তব্য করা যাবে না।</span></p>`;
    const [lo, hi] = LIMITS.comment;
    const need = COMMENT_START_STATUS === COMMENT_STATUS.PENDING;
    return `<form class="bl-form" id="blComForm" novalidate>
      <div class="field"><label for="blComText">আপনার মন্তব্য</label>
        <textarea id="blComText" rows="3" maxlength="${hi}" placeholder="লেখাটি নিয়ে আপনার মতামত লিখুন…" required aria-describedby="blComHint blComErr"></textarea>
        <p class="field-hint" id="blComHint">${need ? "মন্তব্য অ্যাডমিনের অনুমোদনের পর প্রকাশিত হবে। " : ""}কমপক্ষে ${fmtN(lo)} অক্ষর · <span id="blComCount">০</span>/${fmtN(hi)}</p>
        <p class="field-error" id="blComErr" role="alert"></p></div>
      <button type="submit" class="btn btn-primary" id="blComSubmit">${icons.send}<span>মন্তব্য জমা দিন</span></button></form>`;
  }

  function renderComments() {
    const P = S.post, host = $("#blComBody");
    if (!P?.data || !host) return;
    const C = P.comments;
    const keepText = host.querySelector("#blComText")?.value || "";
    const hadFocus = document.activeElement?.id === "blComText";
    let listHtml;
    if (C.error && !C.items.length) listHtml = errorHtml(C.error, "retry-comments");
    else if (!C.loaded) listHtml = `<div class="cm-spin" role="status" aria-label="মন্তব্য লোড হচ্ছে"></div>`;
    else if (!C.items.length && !P.mine.length) listHtml = `<p class="bl-note bl-note-empty">এখনো কোনো মন্তব্য নেই — প্রথম মন্তব্যটি আপনিই করুন।</p>`;
    else listHtml = `<div class="bl-comment-list" aria-live="polite">${C.items.map((c) => commentHtml(c)).join("")}${P.mine.map((c) => commentHtml(c, { pending: true })).join("")}</div>`;
    const more = C.loaded && !C.done && !C.error ? `<div class="cm-foot"><button type="button" class="btn btn-outline btn-sm" data-bl="more-comments">আরও মন্তব্য দেখুন</button></div>`
      : C.error && C.items.length ? errorHtml(C.error, "more-comments") : "";
    host.innerHTML = `${listHtml}${more}<div class="bl-comform-wrap">${commentFormHtml()}</div>`;
    const ta = host.querySelector("#blComText");
    if (ta) { ta.value = keepText; updateCount(ta); if (hadFocus) ta.focus({ preventScroll: true }); }
    const heading = $("#blComH");
    if (heading) heading.innerHTML = `মন্তব্য${C.loaded && C.done && C.items.length ? ` <span class="bl-count">(${fmtN(C.items.length)})</span>` : ""}`;
  }

  const updateCount = (ta) => { const c = $("#blComCount"); if (c) c.textContent = fmtN(ta.value.length); };

  async function submitComment() {
    const P = S.post, ta = $("#blComText"), err = $("#blComErr"), btn = $("#blComSubmit");
    if (!P?.data || !ta || P.sending) return;
    if (!S.authReady) { showToast("একটু অপেক্ষা করুন…", "error"); return; }
    if (!S.user) { openAuth(); return; }
    const text = ta.value.trim();
    const [lo, hi] = LIMITS.comment;
    const fail = (m) => { err.textContent = m; ta.closest(".field").classList.add("has-error"); ta.focus(); };
    ta.closest(".field").classList.remove("has-error"); err.textContent = "";
    if (text.length < lo) return fail(`মন্তব্য কমপক্ষে ${fmtN(lo)} অক্ষরের হতে হবে।`);
    if (text.length > hi) return fail(`মন্তব্য সর্বোচ্চ ${fmtN(hi)} অক্ষরের হতে পারে।`);
    P.sending = true; btn.disabled = true; btn.setAttribute("aria-busy", "true");
    const tok = P.token;
    try {
      const author = S.author || (S.author = await api.loadCommenter(S.user));
      const res = await api.createComment(P.data.id, author, text);        // সফল না হওয়া পর্যন্ত "জমা হয়েছে" দেখানো হয় না
      if (!S.post || S.post.token !== tok) return;
      const mineItem = { id: res.id, uid: S.user.uid, authorName: author.name, authorAvatar: author.avatarThumb, body: res.body, status: res.status, createdAt: null };
      if (res.status === COMMENT_STATUS.PENDING) { P.mine.push(mineItem); showToast("মন্তব্য জমা হয়েছে — অনুমোদনের পর প্রকাশিত হবে।"); }
      else { P.comments.items.push(mineItem); showToast("মন্তব্য প্রকাশিত হয়েছে।"); }
      ta.value = "";
    } catch (e) {
      const ex = api.explain(e);
      if (S.post?.token === tok) { P.sending = false; btn.disabled = false; btn.removeAttribute("aria-busy"); fail(ex.message); }
      return;
    }
    P.sending = false;
    renderComments();
  }

  async function removeComment(cid) {
    const P = S.post;
    if (!P?.data || S.busy.has(cid)) return;
    if (!(await confirmDialog({ title: "মন্তব্য মুছবেন?", message: "মন্তব্যটি স্থায়ীভাবে সরে যাবে — এটি আর ফেরানো যাবে না।", confirmLabel: "মুছে ফেলুন" }))) return;
    S.busy.add(cid);
    try {
      await api.deleteOwnComment(P.data.id, cid);
      P.comments.items = P.comments.items.filter((c) => c.id !== cid);
      P.mine = P.mine.filter((c) => c.id !== cid);
      showToast("মন্তব্য মুছে ফেলা হয়েছে।");
      renderComments();
    } catch (e) { showToast(api.explain(e).message, "error"); }
    S.busy.delete(cid);
  }

  /* ---------------------------------------------------------- লেখা লোড */
  function applyPostMeta() {
    const P = S.post;
    if (!P?.data) return;
    const p = P.data, url = articleUrl(base(), p.slug);
    const cover = coverSrc(p.coverImage);
    seo.apply({
      title: `${p.seoTitle || p.title} — ${SITE}`,
      description: p.seoDescription || p.excerpt,
      url, type: "article", image: cover, imageAlt: p.coverAlt || p.title,
      robots: P.draft ? "noindex, nofollow" : "",
      article: P.draft ? null : { publishedTime: isoDate(p.publishedAt), modifiedTime: isoDate(p.updatedAt), author: p.author, section: catName(p.category), tags: p.tags || [] },
      jsonLd: P.draft ? null : postJsonLd(p, { base: base(), categoryName: catName(p.category) })
    });
  }

  async function showPost(slug) {
    const tok = ++S.postToken;
    S.post = { slug, token: tok, data: null, loaded: false, error: null, draft: false, mine: [], sending: false, comments: { items: [], cursor: null, done: false, loading: false, error: null, loaded: false } };
    tocSpy?.disconnect(); tocSpy = null;
    root.innerHTML = postShellHtml();
    jump(0);
    seo.apply({ title: `লেখা — ${SITE}`, description: "", url: slug ? articleUrl(base(), slug) : blogUrl(base()), type: "article", robots: "noindex" });
    if (!slug) { S.post.loaded = true; renderPost(); seo.apply({ title: `লেখাটি পাওয়া যায়নি — ${SITE}`, description: "", url: blogUrl(base()), robots: "noindex" }); focusHeading(); return; }
    if (!S.catsLoaded) loadCategories();
    try {
      let res = await api.fetchPostBySlug(slug);                     // সাধারণ পাঠক: auth-এর জন্য অপেক্ষা নয়
      if (!res.post && S.post?.token === tok) {                      // না পেলে: অ্যাডমিন হলে খসড়া প্রিভিউ
        await authReady();
        if (S.isAdmin) res = await api.fetchDraftBySlug(slug);
      }
      if (!S.post || S.post.token !== tok) return;
      S.post.loaded = true;
      if (!res.post) {
        renderPost();
        seo.apply({ title: `লেখাটি পাওয়া যায়নি — ${SITE}`, description: "", url: blogUrl(base()), robots: "noindex" });
        focusHeading(); return;
      }
      S.post.data = res.post; S.post.draft = res.draft;
      if (res.redirectedFrom && res.post.slug !== slug) {            // পুরোনো স্লাগ → নতুন স্লাগের URL (history না বাড়িয়ে)
        try { history.replaceState(history.state, "", `#blog/${res.post.slug}`); } catch (_) { /* */ }
        S.post.slug = res.post.slug;
      }
      renderPost();
      applyPostMeta();
      focusHeading();
      if (!S.post.draft) { loadComments(true); loadMine(); }
    } catch (e) {
      if (!S.post || S.post.token !== tok) return;
      S.post.loaded = true; S.post.error = api.explain(e);
      renderPost();
      seo.apply({ title: `লেখা — ${SITE}`, description: "", url: articleUrl(base(), slug), robots: "noindex" });
    }
  }

  const focusHeading = () => requestAnimationFrame(() => root.querySelector("#blHeading")?.focus({ preventScroll: true }));
  /** প্রথম auth-ফলাফল না আসা পর্যন্ত অপেক্ষা (অ্যাডমিন কিনা জানতে) — ৩ সেকেন্ডের বেশি আটকে থাকে না */
  const authReady = () => new Promise((res) => { if (S.authReady) return res(); const t0 = Date.now(); const i = setInterval(() => { if (S.authReady || Date.now() - t0 > 3000) { clearInterval(i); res(); } }, 40); });

  /* ---------------------------------------------------------- ইভেন্ট */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      try { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:-1000px;opacity:0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; }
      catch (__) { return false; }
    }
  }

  function onClick(e) {
    const t = e.target.closest("[data-bl]");
    if (!t) return;
    const act = t.dataset.bl;
    switch (act) {
      case "cat": e.preventDefault(); applyFilters({ cat: t.dataset.cat }); break;
      case "cat-link": e.preventDefault(); S.list.cat = t.dataset.cat; S.list.q = ""; S.list.loaded = false; S.list.items = []; location.hash = "#blog"; break;
      case "more": loadList(false); break;
      case "retry": loadList(true); break;
      case "reset": { const i = $("#blSearch"); if (i) i.value = ""; applyFilters({ cat: "", q: "" }); break; }
      case "clear-search": { const i = $("#blSearch"); if (i) { i.value = ""; i.focus(); } applyFilters({ q: "" }); break; }
      case "retry-post": showPost(S.post?.slug || S.route.slug); break;
      case "retry-comments": loadComments(true); break;
      case "more-comments": loadComments(false); break;
      case "login": openAuth(); break;
      case "del-comment": removeComment(t.dataset.cid); break;
      case "copy-link": {
        const url = articleUrl(base(), S.post.data.slug);
        copyText(url).then((ok) => showToast(ok ? "লেখার লিংক কপি হয়েছে।" : "কপি করা যায়নি — লিংকটি হাতে কপি করুন।", ok ? "success" : "error"));
        break;
      }
      case "copy-code": {
        const code = t.closest("pre")?.querySelector("code")?.textContent || "";
        copyText(code).then((ok) => { t.textContent = ok ? "কপি হয়েছে" : "ব্যর্থ"; setTimeout(() => { t.textContent = "কপি"; }, 1600); });
        break;
      }
      case "toc": {                                                     // হ্যাশ না বদলে স্ক্রল (নইলে ব্লগ-রুট ভেঙে যেত)
        e.preventDefault();
        const el = document.getElementById(t.dataset.target);
        if (el) { el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
        break;
      }
      default: break;
    }
  }
  function onSubmit(e) {
    if (e.target.id === "blComForm") { e.preventDefault(); submitComment(); }
    else if (e.target.matches("[data-bl-form]")) { e.preventDefault(); clearTimeout(searchTimer); applyFilters({ q: $("#blSearch").value.trim() }); }
  }
  function onInput(e) {
    if (e.target.id === "blSearch") {
      const v = e.target.value;
      const clear = $("[data-bl='clear-search']"); if (clear) clear.hidden = !v;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { const q = v.trim(); if (q !== S.list.q) applyFilters({ q }); }, 380);        // টাইপ থামলে সার্চ (প্রতি অক্ষরে কোয়েরি নয়)
    } else if (e.target.id === "blComText") updateCount(e.target);
  }
  function onKeydown(e) {
    if (e.target.id === "blComText" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitComment(); }
    else if (e.target.id === "blSearch" && e.key === "Escape" && e.target.value) { e.target.value = ""; applyFilters({ q: "" }); }
  }
  /** কভার ছবি লোড না হলে (ভাঙা লিংক) সুন্দর ফলব্যাকে বদলানো — error ইভেন্ট bubble করে না, তাই capture */
  function onImgError(e) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.hasAttribute("data-bl-img")) return;
    const holder = img.closest(".pf-media, .bl-cover");
    if (!holder) return;
    holder.classList.remove("pf-media");
    holder.classList.add("pf-cover", "bl-cover-fallback");
    if (!holder.closest(".bl-card")) holder.classList.add(`tone-${toneFor(S.post?.data?.category)}`);     // কার্ডে টোন কার্ড নিজেই দেয়
    holder.innerHTML = `<span class="pf-cover-icon">${icons.book}</span>`;
  }

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("input", onInput);
  root.addEventListener("keydown", onKeydown);
  root.addEventListener("error", onImgError, true);
  window.addEventListener("online", () => {
    if (!visible) return;
    if (S.route.name === "list" && S.list.error?.code === "offline") loadList(true);
    else if (S.route.name === "post" && S.post?.error) showPost(S.post.slug);
  });

  function startAuth() {
    if (unwatch) return;
    unwatch = watchAuthState(async (user) => {
      S.user = user; S.author = null; S.isAdmin = false; S.blocked = false;
      if (user) {
        try { const prof = await getUserProfile(user.uid); S.blocked = prof?.communityBlocked === true; S.isAdmin = isAdminProfile(prof); } catch (_) { /* অফলাইনে ব্লক/অ্যাডমিন-তথ্য ছাড়াই; rules আসল প্রহরী */ }
      }
      S.authReady = true;
      if (!visible) return;
      if (S.route.name === "post" && S.post?.data && !S.post.draft) { loadMine(); renderComments(); }
      else if (S.route.name === "list") { const f = $("#blHeading"); if (f && !$(".cm-admin-note") && S.isAdmin) renderListShell(); }
    });
  }

  /* ---------------------------------------------------------- বাইরের API */
  async function show(route) {
    visible = true;
    startAuth();
    if (S.route.name === "list" && root.querySelector("#blGrid")) S.scrollY = window.scrollY;
    S.route = route || { name: "list" };
    document.documentElement.classList.toggle("bl-post", S.route.name === "post");
    if (S.route.name === "post") await showPost(S.route.slug);
    else { S.post = null; tocSpy?.disconnect(); tocSpy = null; await showList(); }
  }

  /** কোনো কারণে (যেমন তথ্য-শিট বন্ধ হওয়ায়) শিরোনাম বদলে গেলে আবার ঠিক করা */
  function refreshMeta() {
    if (!visible) return;
    if (S.route.name === "post" && S.post?.data) applyPostMeta();
    else if (S.route.name === "list") showMetaList();
  }
  function showMetaList() {
    seo.apply({
      title: `ব্লগ ও রিসোর্স — ${SITE}`, description: "ওয়েব, ডিজাইন ও প্রযুক্তি নিয়ে Tech Verse-এর লেখা, গাইড ও অভিজ্ঞতা।", url: blogUrl(base()), type: "website",
      jsonLd: listJsonLd({ base: base(), name: "Tech Verse ব্লগ", description: "ওয়েব, ডিজাইন ও প্রযুক্তি নিয়ে Tech Verse-এর লেখা, গাইড ও অভিজ্ঞতা।" })
    });
  }

  function hide() {
    visible = false;
    if (S.route.name === "list" && root.querySelector("#blGrid")) S.scrollY = window.scrollY;
    document.documentElement.classList.remove("bl-post");
    clearTimeout(searchTimer);
    if (activeDialog) activeDialog();
    if (io) { io.disconnect(); io = null; }
    tocSpy?.disconnect(); tocSpy = null;
    S.postToken++; S.post = null;                              // চলমান পোস্ট/মন্তব্য-লোডের ফলাফল ফেলে দেওয়া (stale update নয়)
    S.list.token++; S.list.loading = false;
    seo.restore();                                             // index.html-এর আসল মেটা/শিরোনাম/JSON-LD ফেরত
    if (unwatch) { unwatch(); unwatch = null; }                // auth-লিসেনার বন্ধ (ব্লগ বন্ধ থাকলে কোনো লিসেনার চলে না)
  }

  return { show, hide, refreshMeta };
}
