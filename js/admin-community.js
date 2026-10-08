// js/admin-community.js
// অ্যাডমিন প্যানেলের "কমিউনিটি মডারেশন" পেজ: রিপোর্ট রিভিউ, আলোচনা/রিপ্লাই লুকানো-মুছা-পুনঃপ্রকাশ, ক্যাটাগরি ম্যানেজ।
// শুধু UI — আসল অনুমতি-যাচাই firestore.rules-এ (isAdmin()); অ্যাডমিন না হলে প্রতিটা অনুরোধই permission-denied হবে।
// admin.js থেকে helpers (pageHeadHtml, confirmAction…) আর্গুমেন্ট হিসেবে আসে — সার্কুলার import এড়াতে।

import * as cm from "./community/api.js";
import { icons } from "./icons.js";
import { showToast } from "./toast.js";
import { escapeHtml, formatDate } from "./utils.js";

const esc = escapeHtml;
const REASON = Object.fromEntries(cm.REPORT_REASONS);
const ST = { active: ["সক্রিয়", "st-done"], hidden: ["লুকানো", "st-progress"], deleted: ["মুছে ফেলা", "st-cancelled"] };
const RST = { open: ["খোলা", "st-new"], reviewing: ["রিভিউ চলছে", "st-contacted"], resolved: ["সমাধান", "st-done"], dismissed: ["বাতিল", "st-cancelled"] };
const badge = (map, k) => `<span class="status-badge ${map[k]?.[1] || "st-new"}">${map[k]?.[0] || esc(k)}</span>`;
const snippet = (t, n = 140) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };
const emptyBox = (msg, ic = "inbox") => `<div class="empty-state"><div class="empty-state-icon">${icons[ic] || icons.inbox}</div><p>${esc(msg)}</p></div>`;
const errBox = (e) => emptyBox(cm.explain(e).message, "warn");
const siteLink = (id) => `./index.html#community/${encodeURIComponent(id)}`;

let tab = "reports";

export function renderCommunity(page, h) {
  const tabs = [["reports", "রিপোর্ট"], ["discussions", "আলোচনা"], ["categories", "ক্যাটাগরি"]];
  page.innerHTML = h.pageHeadHtml("কমিউনিটি মডারেশন", "ইউজারদের রিপোর্ট দেখুন, আলোচনা বা রিপ্লাই লুকান/সরান, ক্যাটাগরি ম্যানেজ করুন।") +
    `<div class="filter-row cm-adm-tabs" id="cmTabs">${tabs.map(([k, l]) => `<button type="button" class="chip${tab === k ? " active" : ""}" data-tab="${k}">${l}<span class="cm-adm-count" id="cmCnt-${k}"></span></button>`).join("")}</div>
     <div id="cmAdminArea"></div>`;
  const area = page.querySelector("#cmAdminArea");
  const open = (k) => {
    tab = k;
    page.querySelectorAll("#cmTabs .chip").forEach((c) => c.classList.toggle("active", c.dataset.tab === k));
    if (k === "reports") reportsTab(area, h);
    else if (k === "discussions") discussionsTab(area, h);
    else categoriesTab(area, h);
  };
  page.querySelector("#cmTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) open(b.dataset.tab); });
  cm.countOpenReports().then((n) => { const el = page.querySelector("#cmCnt-reports"); if (el && n) el.textContent = ` (${n})`; }).catch(() => {});
  open(tab);
}

/* ============================================================ রিপোর্ট */
function reportsTab(area, h) {
  const st = { onlyOpen: true, items: [], cursor: null, done: false, loading: false };
  area.innerHTML = `<div class="filter-row cm-adm-sub" id="rFilter"></div><div id="rList">${h.skeletonTableHtml()}</div><div class="cm-adm-more" id="rFoot"></div>`;
  const list = area.querySelector("#rList"), foot = area.querySelector("#rFoot"), filter = area.querySelector("#rFilter");

  const paintFilter = () => { filter.innerHTML = [[true, "খোলা রিপোর্ট"], [false, "সব রিপোর্ট"]].map(([v, l]) => `<button type="button" class="chip${st.onlyOpen === v ? " active" : ""}" data-only="${v}">${l}</button>`).join(""); };

  function card(r) {
    const t = r.target;
    const live = r.status === "open" || r.status === "reviewing";
    const tBody = t
      ? `<div class="cm-adm-target"><div class="cm-adm-t-top">${t.title ? `<b>${esc(snippet(t.title, 80))}</b>` : `<b>রিপ্লাই</b>`}${badge(ST, t.status)}</div>
         <div class="cm-adm-t-by">${esc(t.authorName || "সদস্য")} · ${formatDate(t.createdAt)}</div><div class="cm-adm-t-body">${esc(snippet(t.body))}</div></div>`
      : `<div class="cm-adm-target is-gone">কনটেন্টটি পাওয়া যায়নি (আগেই সরানো হয়ে থাকতে পারে)।</div>`;
    return `<div class="admin-list-card" data-id="${esc(r.id)}">
      <div class="admin-list-card-top"><b>${esc(REASON[r.reason] || r.reason)} <span class="cat-badge">${r.targetType === "reply" ? "রিপ্লাই" : "আলোচনা"}</span></b>${badge(RST, r.status)}</div>
      <p>${formatDate(r.createdAt)} · রিপোর্টার: <span class="mono-sm">${esc(String(r.reporterUid || "").slice(0, 8))}…</span></p>
      ${r.details ? `<p class="cm-adm-details">“${esc(snippet(r.details, 300))}”</p>` : ""}
      ${tBody}
      <div class="cm-adm-actions">
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${siteLink(r.discussionId)}">দেখুন</a>
        ${live && t && t.status === "active" ? `<button class="btn btn-outline btn-sm" data-act="hidden">লুকান</button><button class="btn btn-danger-ghost btn-sm" data-act="deleted">মুছে ফেলুন</button>` : ""}
        ${r.status === "open" ? `<button class="btn btn-outline btn-sm" data-act="reviewing">রিভিউ শুরু</button>` : ""}
        ${live ? `<button class="btn btn-soft btn-sm" data-act="resolved">সমাধান হয়েছে</button><button class="btn btn-ghost btn-sm" data-act="dismissed">ঠিক আছে — বাতিল</button>` : ""}
      </div></div>`;
  }

  const paint = () => {
    list.innerHTML = st.items.length ? st.items.map(card).join("") : (st.loading ? h.skeletonTableHtml() : emptyBox(st.onlyOpen ? "কোনো খোলা রিপোর্ট নেই — সব ঠিকঠাক!" : "এখনো কোনো রিপোর্ট আসেনি।", "inbox"));
    foot.innerHTML = st.done || !st.items.length ? "" : `<button class="btn btn-outline btn-sm" data-more>আরও দেখুন</button>`;
  };

  async function load(reset) {
    if (st.loading) return;
    if (reset) Object.assign(st, { items: [], cursor: null, done: false });
    st.loading = true; paint();
    try {
      const page = await cm.fetchReports({ onlyOpen: st.onlyOpen, cursor: st.cursor });
      const targets = await Promise.allSettled(page.items.map((r) => cm.fetchReportTarget(r)));
      page.items.forEach((r, i) => { r.target = targets[i].status === "fulfilled" ? targets[i].value : null; });
      st.items.push(...page.items); st.cursor = page.cursor; st.done = page.done;
    } catch (e) { st.loading = false; list.innerHTML = errBox(e); return; }
    st.loading = false; paint();
  }

  area.addEventListener("click", async (e) => {
    if (e.target.closest("[data-more]")) return load(false);
    const f = e.target.closest("[data-only]");
    if (f) { st.onlyOpen = f.dataset.only === "true"; paintFilter(); return load(true); }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const r = st.items.find((x) => x.id === b.closest("[data-id]").dataset.id);
    if (!r) return;
    const act = b.dataset.act;
    const run = async () => {
      try {
        if (act === "hidden" || act === "deleted") { await cm.moderateFromReport(r, act, h.uid); r.status = "resolved"; if (r.target) r.target.status = act; }
        else { await cm.setReportStatus(r.id, act, h.uid); r.status = act; }
        showToast("আপডেট হয়েছে।");
        if (st.onlyOpen && (r.status === "resolved" || r.status === "dismissed")) st.items = st.items.filter((x) => x.id !== r.id);
        paint();
      } catch (err) { showToast(cm.explain(err).message, "error"); }
    };
    if (act === "hidden" || act === "deleted") h.confirmAction(act === "hidden" ? "কনটেন্টটি লুকাতে চান? (পরে \"আলোচনা\" ট্যাব থেকে আবার প্রকাশ করা যাবে)" : "কনটেন্টটি মুছে ফেলতে চান?", run, act === "hidden" ? "লুকান" : "মুছে ফেলুন", act === "deleted");
    else run();
  });
  paintFilter();
  load(true);
}

/* ============================================================ আলোচনা */
function discussionsTab(area, h) {
  const st = { status: "", items: [], cursor: null, done: false, loading: false };
  area.innerHTML = `<div class="filter-row cm-adm-sub" id="dFilter"></div><div id="dList">${h.skeletonTableHtml()}</div><div class="cm-adm-more" id="dFoot"></div>`;
  const list = area.querySelector("#dList"), foot = area.querySelector("#dFoot"), filter = area.querySelector("#dFilter");
  const paintFilter = () => { filter.innerHTML = [["", "সব"], ["active", "সক্রিয়"], ["hidden", "লুকানো"], ["deleted", "মুছে ফেলা"]].map(([v, l]) => `<button type="button" class="chip${st.status === v ? " active" : ""}" data-st="${v}">${l}</button>`).join(""); };

  const card = (d) => `<div class="admin-list-card" data-id="${esc(d.id)}">
    <div class="admin-list-card-top"><b>${esc(snippet(d.title, 90))}</b>${badge(ST, d.status)}</div>
    <p>${esc(d.authorName || "সদস্য")} · <span class="cat-badge">${esc(d.category || "—")}</span> · ${formatDate(d.createdAt)} · ♥ ${d.likeCount || 0} · রিপ্লাই ${d.replyCount || 0}</p>
    <div class="cm-adm-actions">
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${siteLink(d.id)}">দেখুন</a>
      <button class="btn btn-outline btn-sm" data-act="replies">রিপ্লাই</button>
      ${d.status === "active"
        ? `<button class="btn btn-outline btn-sm" data-act="hidden">লুকান</button><button class="btn btn-danger-ghost btn-sm" data-act="deleted">মুছে ফেলুন</button>`
        : `<button class="btn btn-soft btn-sm" data-act="active">প্রকাশ করুন</button>`}
    </div></div>`;

  const paint = () => {
    list.innerHTML = st.items.length ? st.items.map(card).join("") : (st.loading ? h.skeletonTableHtml() : emptyBox("এই ফিল্টারে কোনো আলোচনা নেই।", "chat"));
    foot.innerHTML = st.done || !st.items.length ? "" : `<button class="btn btn-outline btn-sm" data-more>আরও দেখুন</button>`;
  };
  async function load(reset) {
    if (st.loading) return;
    if (reset) Object.assign(st, { items: [], cursor: null, done: false });
    st.loading = true; paint();
    try {
      const page = await cm.fetchAllDiscussions({ status: st.status, cursor: st.cursor });
      st.items.push(...page.items); st.cursor = page.cursor; st.done = page.done;
    } catch (e) { st.loading = false; list.innerHTML = errBox(e); return; }
    st.loading = false; paint();
  }

  area.addEventListener("click", (e) => {
    if (e.target.closest("[data-more]")) return load(false);
    const f = e.target.closest("[data-st]");
    if (f) { st.status = f.dataset.st; paintFilter(); return load(true); }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const d = st.items.find((x) => x.id === b.closest("[data-id]").dataset.id);
    if (!d) return;
    if (b.dataset.act === "replies") return openReplies(d, h);
    const next = b.dataset.act;
    h.confirmAction(next === "active" ? "আলোচনাটি আবার সবার জন্য প্রকাশ করতে চান?" : next === "hidden" ? "আলোচনাটি লুকাতে চান?" : "আলোচনাটি মুছে ফেলতে চান?", async () => {
      try {
        await cm.moderateDiscussion(d.id, next, h.uid);
        d.status = next; showToast("আপডেট হয়েছে।");
        if (st.status && st.status !== next) st.items = st.items.filter((x) => x.id !== d.id);
        paint();
      } catch (err) { showToast(cm.explain(err).message, "error"); }
    }, next === "active" ? "প্রকাশ করুন" : next === "hidden" ? "লুকান" : "মুছে ফেলুন", next === "deleted");
  });
  paintFilter();
  load(true);
}

/** একটা আলোচনার সব রিপ্লাই (লুকানো/মুছে ফেলা সহ) — আলাদা মডালে, রিপ্লাই ধরে ধরে মডারেশন */
async function openReplies(d, h) {
  const root = document.getElementById("modalRoot");
  const shell = (inner) => `<div class="modal-overlay open"><div class="modal modal-wide">
    <div class="modal-head"><h3>রিপ্লাই — ${esc(snippet(d.title, 50))}</h3><button class="modal-close" id="rpClose" aria-label="বন্ধ করুন">${icons.close}</button></div>${inner}</div></div>`;
  root.innerHTML = shell(`<div class="cm-adm-loading">${h.skeletonTableHtml()}</div>`);
  const close = () => { root.innerHTML = ""; };
  root.querySelector("#rpClose").onclick = close;
  root.querySelector(".modal-overlay").addEventListener("click", (e) => { if (e.target.classList.contains("modal-overlay")) close(); });
  let items = [];
  try { items = await cm.fetchAllReplies(d.id); }
  catch (e) { root.innerHTML = shell(errBox(e)); root.querySelector("#rpClose").onclick = close; return; }
  root.innerHTML = shell(items.length ? items.map((r) => `<div class="admin-list-card" data-rid="${esc(r.id)}">
      <div class="admin-list-card-top"><b>${esc(r.authorName || "সদস্য")}</b>${badge(ST, r.status)}</div>
      <p>${formatDate(r.createdAt)}</p><div class="cm-adm-t-body">${esc(snippet(r.body, 300))}</div>
      <div class="cm-adm-actions">${r.status === "active"
        ? `<button class="btn btn-outline btn-sm" data-ra="hidden">লুকান</button><button class="btn btn-danger-ghost btn-sm" data-ra="deleted">মুছে ফেলুন</button>`
        : `<button class="btn btn-soft btn-sm" data-ra="active">প্রকাশ করুন</button>`}</div></div>`).join("") : emptyBox("এই আলোচনায় কোনো রিপ্লাই নেই।", "chat"));
  root.querySelector("#rpClose").onclick = close;
  root.querySelector(".modal-overlay").addEventListener("click", async (e) => {
    if (e.target.classList.contains("modal-overlay")) return close();
    const b = e.target.closest("[data-ra]");
    if (!b) return;
    const rid = b.closest("[data-rid]").dataset.rid;
    b.disabled = true;
    try {
      await cm.moderateReply(d.id, rid, b.dataset.ra, h.uid);
      showToast("আপডেট হয়েছে।");
      d.replyCount = Math.max(0, (d.replyCount || 0) + (b.dataset.ra === "active" ? 1 : (items.find((x) => x.id === rid)?.status === "active" ? -1 : 0)));
      openReplies(d, h);
    } catch (err) { showToast(cm.explain(err).message, "error"); b.disabled = false; }
  });
}

/* ============================================================ ক্যাটাগরি */
async function categoriesTab(area, h) {
  area.innerHTML = h.skeletonTableHtml();
  let cats = [];
  try { cats = await cm.fetchCategories(); } catch (e) { area.innerHTML = errBox(e); return; }

  const paint = () => {
    area.innerHTML = `
      ${cats.length ? "" : `<div class="seed-card"><div class="seed-card-body"><h3>ক্যাটাগরি এখনো বসানো হয়নি</h3>
        <p>পোস্ট করতে হলে ক্যাটাগরি Firestore-এ থাকতে হয়। এক ক্লিকে ৯টা ডিফল্ট ক্যাটাগরি (General, Web Development, JavaScript, Firebase, UI/UX, Programming, Project Help, Tech Verse, Other) বসান।</p>
        <button class="btn btn-primary btn-sm" id="catSeed">ডিফল্ট ক্যাটাগরি বসান</button></div></div>`}
      <div class="admin-card"><h3>নতুন ক্যাটাগরি</h3><p>নাম ইংরেজিতে দিন (এটা থেকেই লিংক-আইডি বানানো হয়, যেমন "Design" → design)।</p>
        <div class="cm-adm-addrow"><div class="field"><label for="catName">নাম</label><input id="catName" maxlength="40" placeholder="যেমন: Design"></div>
        <div class="field"><label for="catOrder">ক্রম</label><input id="catOrder" type="number" min="0" max="9999" value="${(cats.reduce((m, c) => Math.max(m, c.order || 0), 0) + 1)}"></div>
        <button class="btn btn-primary btn-sm" id="catAdd">যোগ করুন</button></div></div>
      ${cats.length ? `<div class="admin-card"><h3>ক্যাটাগরির তালিকা</h3><p>নিষ্ক্রিয় ক্যাটাগরিতে নতুন পোস্ট করা যায় না (পুরোনো পোস্ট থেকে যায়)।</p>
        ${cats.map((c) => `<div class="cm-adm-cat" data-id="${esc(c.id)}">
          <input class="cm-cat-name" value="${esc(c.name)}" maxlength="40" aria-label="নাম">
          <input class="cm-cat-order" type="number" min="0" max="9999" value="${Number(c.order) || 0}" aria-label="ক্রম">
          <span class="cat-badge">${esc(c.id)}</span>
          <button class="btn ${c.active === false ? "btn-soft" : "btn-outline"} btn-sm" data-tg>${c.active === false ? "সক্রিয় করুন" : "নিষ্ক্রিয় করুন"}</button>
          <button class="btn btn-danger-ghost btn-sm" data-del>মুছুন</button></div>`).join("")}</div>` : ""}`;
  };
  paint();
  const reload = async () => { try { cats = await cm.fetchCategories(); } catch (_) {} paint(); };
  const guard = async (fn, okMsg) => { try { await fn(); showToast(okMsg); await reload(); } catch (e) { showToast(cm.explain(e).message, "error"); } };

  area.addEventListener("click", (e) => {
    if (e.target.closest("#catSeed")) return guard(() => cm.seedDefaultCategories(), "ডিফল্ট ক্যাটাগরি বসানো হয়েছে।");
    if (e.target.closest("#catAdd")) {
      const name = area.querySelector("#catName").value.trim(), order = parseInt(area.querySelector("#catOrder").value, 10);
      if (!name) return showToast("ক্যাটাগরির নাম লিখুন।", "error");
      if (cats.some((c) => c.id === cm.slugify(name))) return showToast("এই নামে ক্যাটাগরি আগেই আছে।", "error");
      return guard(() => cm.addCategory({ name, order: Number.isFinite(order) ? order : 0 }), "ক্যাটাগরি যোগ হয়েছে।");
    }
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const c = cats.find((x) => x.id === row.dataset.id);
    if (e.target.closest("[data-tg]")) return guard(() => cm.updateCategory(c.id, { active: c.active === false }), "আপডেট হয়েছে।");
    if (e.target.closest("[data-del]")) h.confirmAction(`"${esc(c.name)}" ক্যাটাগরি মুছে ফেলতে চান? এই ক্যাটাগরির পুরোনো পোস্ট থেকে যাবে।`, () => guard(() => cm.deleteCategory(c.id), "মুছে ফেলা হয়েছে।"));
  });
  area.addEventListener("change", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const c = cats.find((x) => x.id === row.dataset.id);
    if (e.target.classList.contains("cm-cat-name")) {
      const name = e.target.value.trim();
      if (!name) { e.target.value = c.name; return showToast("নাম ফাঁকা রাখা যাবে না।", "error"); }
      guard(() => cm.updateCategory(c.id, { name }), "নাম আপডেট হয়েছে।");
    } else if (e.target.classList.contains("cm-cat-order")) {
      const order = parseInt(e.target.value, 10);
      if (!Number.isFinite(order) || order < 0 || order > 9999) { e.target.value = c.order; return showToast("ক্রম ০–৯৯৯৯ এর মধ্যে দিন।", "error"); }
      guard(() => cm.updateCategory(c.id, { order }), "ক্রম আপডেট হয়েছে।");
    }
  });
}
