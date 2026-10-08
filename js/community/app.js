// js/community/app.js
// কমিউনিটি UI — ফিড, আলোচনার পাতা (রিপ্লাই), লাইক, শেয়ার, এডিট/মুছা, রিপোর্ট ও অ্যাডমিন মেনু।
// শুধু Pure JS; বিদ্যমান ক্লাস/টোকেন (.btn, .chip, .modal, .field, .skel…) আবার ব্যবহার করে।
// js/community-entry.js ডায়নামিক import করে — Firebase না এলে (অফলাইন) বাকি সাইট অক্ষত থাকে।

import { escapeHtml, safeImageSrc, formatDate } from "../utils.js";
import { avatarOrLetter, emptyState } from "../templates.js";
import { icons } from "../icons.js";
import { showToast } from "../toast.js";
import { lockScroll, unlockScroll } from "../scrolllock.js";
import { watchAuthState, getUserProfile } from "../auth.js";
import * as api from "./api.js";

const esc = escapeHtml;
const nf = new Intl.NumberFormat("bn-BD");
const fmtN = (n) => nf.format(Number(n) || 0);
let rtf = null;
try { rtf = new Intl.RelativeTimeFormat("bn", { numeric: "auto" }); } catch (_) { /* পুরোনো ব্রাউজার */ }

/** "৫ মিনিট আগে" ধরনের সময় — সার্ভার টাইমস্ট্যাম্প পেন্ডিং (null) হলে "এইমাত্র" */
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

const skeleton = (n = 3) => Array.from({ length: n }, () =>
  `<div class="skel-card cm-skel" aria-hidden="true"><div class="cm-skel-top"><span class="skel cm-skel-av"></span><span class="skel skel-row cm-w40"></span></div>` +
  `<div class="skel skel-row cm-skel-title cm-w75"></div><div class="skel skel-row cm-w95"></div><div class="skel skel-row cm-w60"></div></div>`).join("");

function swap(el, html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  const fresh = t.content.firstElementChild;
  const focusAct = el.contains(document.activeElement) ? document.activeElement.dataset?.cm : null;
  el.replaceWith(fresh);
  if (focusAct) fresh.querySelector(`[data-cm="${focusAct}"]`)?.focus({ preventScroll: true });
  return fresh;
}

/* ============================================================ মডাল / বটম-শিট */
function openSheet({ title, bodyHtml, wide = false, onMount, onClose }) {
  const opener = document.activeElement;
  const ov = document.createElement("div");
  ov.className = "modal-overlay cm-overlay";
  ov.innerHTML = `<div class="modal${wide ? " modal-wide" : ""} cm-modal" role="dialog" aria-modal="true" aria-labelledby="cmSheetTitle">
    <div class="modal-head"><h3 id="cmSheetTitle">${esc(title)}</h3>
    <button type="button" class="modal-close" data-sheet-close aria-label="বন্ধ করুন">${icons.close}</button></div>
    <div class="cm-modal-body">${bodyHtml}</div></div>`;
  document.body.appendChild(ov);
  lockScroll();
  requestAnimationFrame(() => ov.classList.add("open"));
  let closed = false;
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...ov.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]")].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  function close() {
    if (closed) return;
    closed = true;
    ov.classList.remove("open");
    unlockScroll();
    document.removeEventListener("keydown", onKey, true);
    setTimeout(() => ov.remove(), 280);
    if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
    if (onClose) onClose();
  }
  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-sheet-close]")) close(); });
  document.addEventListener("keydown", onKey, true);
  if (onMount) onMount(ov, close);
  setTimeout(() => (ov.querySelector("[data-autofocus]") || ov.querySelector(".modal-close")).focus({ preventScroll: true }), 80);
  return { el: ov, close };
}

function confirmSheet({ title, message, okLabel = "নিশ্চিত করুন", danger = false }) {
  return new Promise((resolve) => {
    let decided = false;
    openSheet({
      title,
      bodyHtml: `<p class="cm-confirm-msg">${esc(message)}</p><div class="cm-btnrow">
        <button type="button" class="btn btn-outline" data-sheet-close${danger ? " data-autofocus" : ""}>বাতিল</button>
        <button type="button" class="btn ${danger ? "btn-danger-ghost" : "btn-primary"}" data-ok${danger ? "" : " data-autofocus"}>${esc(okLabel)}</button></div>`,
      onMount: (el, close) => el.querySelector("[data-ok]").addEventListener("click", () => { decided = true; resolve(true); close(); }),
      onClose: () => { if (!decided) resolve(false); }
    });
  });
}

/* ============================================================ মূল কন্ট্রোলার */
export function createCommunity(root) {
  const S = {
    user: null, profile: null, isAdmin: false, blocked: false, authReady: false,
    cats: api.DEFAULT_CATEGORIES.slice(), catsFromDb: false, catsLoaded: false,
    feed: { cat: "", items: [], cursor: null, done: false, loading: false, error: null, loaded: false, token: 0 },
    thread: null, threadToken: 0,
    route: { name: "feed" }, scrollY: 0, internalNav: false,
    reported: new Set(), busy: new Set()
  };
  const $ = (sel) => root.querySelector(sel);
  let io = null, stopKb = null, unwatch = null, visible = false;

  /* ---------------------------------------------------------- হেল্পার */
  const catName = (id) => S.cats.find((c) => c.id === id)?.name || api.DEFAULT_CATEGORIES.find((c) => c.id === id)?.name || id || "General";
  const shareUrl = (id) => `${location.origin}${location.pathname}#community/${id}`;
  const findDiscussion = (id) => (S.thread?.disc?.id === id ? S.thread.disc : S.feed.items.find((d) => d.id === id));
  const openAuth = () => document.dispatchEvent(new CustomEvent("tv:open-auth", { detail: { view: "login" } }));

  function requireAuth(msg = "এই কাজের জন্য লগইন করুন।") {
    if (!S.authReady) { showToast("একটু অপেক্ষা করুন…", "error"); return false; }
    if (!S.user) { showToast(msg, "error"); openAuth(); return false; }
    if (S.blocked) { showToast("আপনার কমিউনিটি অ্যাক্সেস অ্যাডমিন সীমিত করেছেন।", "error"); return false; }
    return true;
  }

  function trackKeyboard() { // মোবাইলে কীবোর্ড খুললে বটম-শিট/রিপ্লাই বার কীবোর্ডের ওপরে উঠে আসে (--cm-kb)
    const vv = window.visualViewport;
    if (!vv) return () => {};
    const upd = () => document.documentElement.style.setProperty("--cm-kb", Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) + "px");
    vv.addEventListener("resize", upd); vv.addEventListener("scroll", upd); upd();
    return () => { vv.removeEventListener("resize", upd); vv.removeEventListener("scroll", upd); document.documentElement.style.removeProperty("--cm-kb"); };
  }

  /* ---------------------------------------------------------- টেমপ্লেট */
  function errorHtml(err, act) {
    const off = err.code === "offline";
    return `<div class="cm-state" role="alert"><div class="empty-state-icon">${off ? icons.wifiOff : icons.warn}</div>
      <p>${esc(err.message)}</p>${err.retryable !== false ? `<button type="button" class="btn btn-outline btn-sm" data-cm="${act}">${icons.refresh} আবার চেষ্টা করুন</button>` : ""}</div>`;
  }

  function cardHtml(d, { full = false } = {}) {
    const uid = S.user?.uid;
    const liked = !!uid && (d.likedBy || []).includes(uid);
    const long = !full && (String(d.body).length > 260 || (String(d.body).match(/\n/g) || []).length > 3);
    const id = esc(d.id);
    const name = d.authorName || "সদস্য";
    const title = full
      ? `<h2 class="cm-title" id="cmHeading" tabindex="-1">${esc(d.title)}</h2>`
      : `<h3 class="cm-title"><a href="#community/${id}">${esc(d.title)}</a></h3>`;
    return `<article class="cm-card${full ? " is-full" : ""}" data-id="${id}">
      <header class="cm-meta">
        <span class="cm-av">${avatarOrLetter(safeImageSrc(d.authorAvatar), name)}</span>
        <div class="cm-who"><b>${esc(name)}</b>
          <span class="cm-sub"><time title="${esc(formatDate(d.createdAt))}">${esc(timeAgo(d.createdAt))}</time>${d.editedAt ? ` · <span class="cm-edited">সম্পাদিত</span>` : ""}</span></div>
        <button type="button" class="cm-ico" data-cm="menu" data-kind="discussion" aria-haspopup="dialog" aria-label="আরও অপশন">${icons.more}</button>
      </header>
      <span class="cm-cat">${esc(catName(d.category))}</span>
      ${title}
      <div class="cm-body${long ? " is-clamp" : ""}"${full ? "" : ` data-cm="open"`}>${esc(d.body)}</div>
      ${long ? `<a class="cm-readmore" href="#community/${id}">আরও পড়ুন</a>` : ""}
      <footer class="cm-actions">
        <button type="button" class="cm-act${liked ? " is-on" : ""}" data-cm="like" aria-pressed="${liked}" aria-label="লাইক">${icons.heart}<span>${fmtN(d.likeCount)}</span></button>
        ${full
          ? `<button type="button" class="cm-act" data-cm="focus-reply" aria-label="রিপ্লাই লিখুন">${icons.chat}<span>${fmtN(d.replyCount)}</span></button>`
          : `<a class="cm-act" href="#community/${id}" aria-label="রিপ্লাই দেখুন">${icons.chat}<span>${fmtN(d.replyCount)}</span></a>`}
        <button type="button" class="cm-act" data-cm="share" aria-label="শেয়ার / লিংক কপি">${icons.share}<span>শেয়ার</span></button>
      </footer></article>`;
  }

  function replyHtml(r) {
    const liked = !!S.user && (r.likedBy || []).includes(S.user.uid);
    const name = r.authorName || "সদস্য";
    return `<div class="cm-reply" data-rid="${esc(r.id)}" id="r-${esc(r.id)}">
      <span class="cm-av cm-av-sm">${avatarOrLetter(safeImageSrc(r.authorAvatar), name)}</span>
      <div class="cm-reply-main"><div class="cm-reply-box">
        <div class="cm-reply-top"><b>${esc(name)}</b>
          <span class="cm-sub"><time title="${esc(formatDate(r.createdAt))}">${esc(timeAgo(r.createdAt))}</time>${r.editedAt ? ` · <span class="cm-edited">সম্পাদিত</span>` : ""}</span>
          <button type="button" class="cm-ico" data-cm="menu" data-kind="reply" aria-haspopup="dialog" aria-label="আরও অপশন">${icons.more}</button></div>
        ${r.replyToName ? `<div class="cm-quote">${icons.reply}<span>${esc(r.replyToName)}</span></div>` : ""}
        <div class="cm-reply-body">${esc(r.body)}</div></div>
        <div class="cm-actions cm-actions-sm">
          <button type="button" class="cm-act${liked ? " is-on" : ""}" data-cm="like" aria-pressed="${liked}" aria-label="লাইক">${icons.heart}<span>${fmtN(r.likeCount)}</span></button>
          <button type="button" class="cm-act" data-cm="reply-to">${icons.reply}<span>উত্তর দিন</span></button>
        </div></div></div>`;
  }

  /* ---------------------------------------------------------- ফিড */
  function renderFeedShell() {
    root.innerHTML = `<div class="wrap cm-wrap">
      <div class="cm-head">
        <div class="section-head cm-head-t"><h2 id="cmHeading" tabindex="-1">কমিউনিটি</h2>
          <p>প্রশ্ন করুন, অভিজ্ঞতা শেয়ার করুন, একে অপরকে সাহায্য করুন।</p></div>
        <div class="cm-head-actions">
          <button type="button" class="btn btn-ghost btn-icon" data-cm="refresh" aria-label="রিফ্রেশ করুন">${icons.refresh}</button>
          <button type="button" class="btn btn-primary" data-cm="new">${icons.plus}<span>নতুন আলোচনা</span></button></div>
      </div>
      ${S.isAdmin ? `<p class="cm-admin-note"><a href="./admin.html#community">মডারেশন প্যানেল খুলুন →</a></p>` : ""}
      <div class="filter-row cm-cats" id="cmCats" role="group" aria-label="ক্যাটাগরি"></div>
      <div class="cm-list" id="cmList" aria-live="polite"></div>
      <div class="cm-foot" id="cmFoot"></div></div>`;
    renderCats();
    renderList();
  }

  function renderCats() {
    const el = $("#cmCats");
    if (!el) return;
    const cats = S.cats.filter((c) => c.active !== false);
    const btn = (id, label) => `<button type="button" class="chip${S.feed.cat === id ? " active" : ""}" data-cm="cat" data-cat="${esc(id)}" aria-pressed="${S.feed.cat === id}">${esc(label)}</button>`;
    el.innerHTML = btn("", "সব") + cats.map((c) => btn(c.id, c.name)).join("");
  }

  function renderList() {
    const list = $("#cmList"), foot = $("#cmFoot");
    if (!list) return;
    const f = S.feed;
    if (io) { io.disconnect(); io = null; }
    foot.innerHTML = "";
    if (f.error && !f.items.length) { list.innerHTML = errorHtml(f.error, "retry"); return; }
    if (!f.items.length) {
      list.innerHTML = f.loading || !f.loaded ? skeleton(3)
        : `${emptyState(f.cat ? "এই ক্যাটাগরিতে এখনো কোনো আলোচনা নেই।" : "এখনো কোনো আলোচনা নেই — প্রথম আলোচনাটি আপনিই শুরু করুন!", "chat")}`;
      return;
    }
    list.innerHTML = f.items.map((d) => cardHtml(d)).join("");
    if (f.error) foot.innerHTML = errorHtml(f.error, "more");
    else if (f.loading) foot.innerHTML = `<div class="cm-spin" role="status" aria-label="লোড হচ্ছে"></div>`;
    else if (f.done) foot.innerHTML = `<p class="cm-end">সব আলোচনা দেখা হয়েছে।</p>`;
    else {
      foot.innerHTML = `<button type="button" class="btn btn-outline" data-cm="more">আরও দেখুন</button>`;
      if ("IntersectionObserver" in window) {
        io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) loadFeed(false); }, { rootMargin: "500px 0px" });
        io.observe(foot);
      }
    }
  }

  async function loadCategories() {
    try {
      const list = await api.fetchCategories();
      if (list.length) { S.cats = list; S.catsFromDb = true; }
    } catch (_) { /* ডিফল্ট তালিকা দিয়েই চলবে */ }
    S.catsLoaded = true;
    renderCats();
  }

  async function loadFeed(reset = false) {
    const f = S.feed;
    if (f.loading) return;
    if (reset) Object.assign(f, { items: [], cursor: null, done: false, error: null, loaded: false });
    f.loading = true; f.error = null;
    const tok = ++f.token;
    renderList();
    try {
      const page = await api.fetchDiscussions({ category: f.cat, cursor: f.cursor });
      if (tok !== f.token) return;
      f.items.push(...page.items); f.cursor = page.cursor; f.done = page.done; f.loaded = true;
    } catch (e) {
      if (tok !== f.token) return;
      f.error = api.explain(e);
    }
    f.loading = false;
    renderList();
  }

  function selectCat(id) {
    S.feed.cat = id;
    S.feed.token++;
    S.feed.loading = false;
    renderCats();
    loadFeed(true);
  }

  async function showFeed() {
    renderFeedShell();
    document.title = "কমিউনিটি — Tech Verse";
    if (!S.catsLoaded) loadCategories();
    if (!S.feed.loaded && !S.feed.loading) await loadFeed(true);
    requestAnimationFrame(() => window.scrollTo(0, S.scrollY || 0));
  }

  /* ---------------------------------------------------------- আলোচনার পাতা */
  function replyBarHtml() {
    const T = S.thread, d = T?.disc;
    if (!d || d.status !== "active") return "";
    if (!S.authReady) return "";
    if (!S.user) return `<div class="cm-replybar cm-replybar-note"><span>রিপ্লাই দিতে লগইন করুন</span><button type="button" class="btn btn-primary btn-sm" data-cm="login">লগইন</button></div>`;
    if (S.blocked) return `<div class="cm-replybar cm-replybar-note"><span>আপনার কমিউনিটি অ্যাক্সেস সীমিত — রিপ্লাই দেওয়া যাবে না।</span></div>`;
    return `<form class="cm-replybar" id="cmReplyForm" novalidate>
      ${T.replyTo ? `<div class="cm-replyto"><span>${icons.reply}<b>${esc(T.replyTo.authorName || "সদস্য")}</b>-কে উত্তর</span><button type="button" class="cm-ico" data-cm="clear-replyto" aria-label="বাতিল">${icons.close}</button></div>` : ""}
      <div class="cm-replybar-row">
        <label class="sr-only" for="cmReplyText">আপনার রিপ্লাই</label>
        <textarea id="cmReplyText" rows="1" maxlength="2000" placeholder="আপনার উত্তর লিখুন…" enterkeyhint="send"></textarea>
        <button type="submit" class="btn btn-primary btn-icon" aria-label="রিপ্লাই পাঠান">${icons.send}</button></div></form>`;
  }

  function paintReplyBar() {
    const el = $("#cmReplyBar");
    if (!el) return;
    const prev = $("#cmReplyText")?.value || "";
    el.innerHTML = replyBarHtml();
    const ta = $("#cmReplyText");
    if (ta && prev) { ta.value = prev; autoGrow(ta); }
  }

  const autoGrow = (ta) => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; };

  function paintReplies() {
    const T = S.thread, box = $("#cmReplies"), foot = $("#cmRepliesFoot");
    if (!T || !box) return;
    const head = $("#cmRepliesCount");
    if (head && T.disc) head.textContent = `(${fmtN(T.disc.replyCount)})`;
    if (T.repliesError && !T.replies.length) box.innerHTML = errorHtml(T.repliesError, "retry-replies");
    else if (!T.replies.length) box.innerHTML = T.repliesLoading || !T.repliesLoaded ? skeleton(2) : `<p class="cm-noreply">এখনো কোনো রিপ্লাই নেই — প্রথম উত্তরটি আপনিই দিন।</p>`;
    else box.innerHTML = T.replies.map(replyHtml).join("");
    foot.innerHTML = !T.replies.length ? "" : T.repliesError ? errorHtml(T.repliesError, "more-replies")
      : T.repliesLoading ? `<div class="cm-spin" role="status" aria-label="লোড হচ্ছে"></div>`
      : T.done ? "" : `<button type="button" class="btn btn-outline btn-sm" data-cm="more-replies">আরও রিপ্লাই দেখুন</button>`;
  }

  function renderThread() {
    const T = S.thread, d = T.disc;
    let inner;
    if (T.error && !d) inner = errorHtml(T.error, "retry");
    else if (!d) inner = skeleton(1);
    else {
      const note = d.status !== "active"
        ? `<div class="cm-banner" role="status">${icons.eyeOff}<span>এই আলোচনাটি ${d.status === "hidden" ? "অ্যাডমিন লুকিয়ে রেখেছেন" : "মুছে ফেলা হয়েছে"} — শুধু আপনি/অ্যাডমিন দেখতে পারছেন।</span></div>` : "";
      inner = `${cardHtml(d, { full: true })}${note}
        <section class="cm-replies-sec" aria-labelledby="cmRepliesHead">
          <h3 id="cmRepliesHead" class="cm-replies-h">রিপ্লাই <span id="cmRepliesCount">(${fmtN(d.replyCount)})</span></h3>
          <div class="cm-replies" id="cmReplies" aria-live="polite"></div><div class="cm-foot" id="cmRepliesFoot"></div></section>
        <div class="cm-replybar-wrap" id="cmReplyBar"></div>`;
    }
    root.innerHTML = `<div class="wrap cm-wrap cm-thread-wrap">
      <div class="cm-crumb"><button type="button" class="btn btn-ghost btn-sm" data-cm="back">${icons.back}<span>কমিউনিটি</span></button></div>
      <div id="cmThread">${inner}</div></div>`;
    if (d) { paintReplies(); paintReplyBar(); }
  }

  async function loadReplies(reset = false) {
    const T = S.thread;
    if (!T || !T.disc || T.repliesLoading) return;
    if (T.disc.status !== "active" && !S.isAdmin) { T.done = true; T.repliesLoaded = true; paintReplies(); return; }
    if (reset) Object.assign(T, { replies: [], cursor: null, done: false, repliesError: null, repliesLoaded: false });
    T.repliesLoading = true; T.repliesError = null;
    const tok = T.token;
    paintReplies();
    try {
      const page = await api.fetchReplies(T.id, { cursor: T.cursor });
      if (S.thread?.token !== tok) return;
      T.replies.push(...page.items); T.cursor = page.cursor; T.done = page.done; T.repliesLoaded = true;
    } catch (e) {
      if (S.thread?.token !== tok) return;
      T.repliesError = api.explain(e);
    }
    T.repliesLoading = false;
    paintReplies();
  }

  async function showThread(id) {
    const cached = S.feed.items.find((d) => d.id === id) || null;
    const T = S.thread = { id, disc: cached, replies: [], cursor: null, done: false, loading: true, error: null, replyTo: null,
      repliesLoading: false, repliesError: null, repliesLoaded: false, token: ++S.threadToken };
    renderThread();
    window.scrollTo(0, 0);
    try {
      const fresh = await api.fetchDiscussion(id);
      if (S.thread?.token !== T.token) return;
      if (!fresh) throw new api.CommunityError("not-found", "আলোচনাটি পাওয়া যায়নি বা সরিয়ে ফেলা হয়েছে।", false);
      T.disc = fresh;
    } catch (e) {
      if (S.thread?.token !== T.token) return;
      const err = api.explain(e);
      if (!(err.code === "offline" && T.disc)) { // ক্যাশ থাকলে অফলাইনেও কার্ডটা দেখানো হয়, রিপ্লাই অংশে retry আসে
        T.error = err.code === "permission-denied" ? new api.CommunityError("not-found", "আলোচনাটি পাওয়া যায়নি বা সরিয়ে ফেলা হয়েছে।", false) : err;
        T.disc = null;
        T.loading = false;
        renderThread();
        return;
      }
    }
    T.loading = false;
    document.title = `${T.disc.title} — কমিউনিটি · Tech Verse`;
    renderThread();
    root.querySelector("#cmHeading")?.focus({ preventScroll: true });
    loadReplies(true);
  }

  function syncFeedCopy() { // আলোচনার পাতার পরিবর্তন ফিডের কপিতেও প্রতিফলিত করা
    const d = S.thread?.disc;
    const f = d && S.feed.items.find((x) => x.id === d.id);
    if (f) Object.assign(f, { likedBy: d.likedBy, likeCount: d.likeCount, replyCount: d.replyCount, title: d.title, body: d.body, editedAt: d.editedAt });
  }

  function setReplyTo(rid) {
    const T = S.thread;
    if (!T) return;
    if (rid) {
      if (!requireAuth("উত্তর দিতে লগইন করুন।")) return;
      const r = T.replies.find((x) => x.id === rid);
      if (!r) return;
      T.replyTo = { id: r.id, authorName: r.authorName || "" };
    } else T.replyTo = null;
    paintReplyBar();
    $("#cmReplyText")?.focus();
  }

  async function submitReply() {
    const T = S.thread, ta = $("#cmReplyText");
    if (!T || !ta || !requireAuth("রিপ্লাই দিতে লগইন করুন।")) return;
    const body = ta.value.trim();
    if (!body) { ta.focus(); return; }
    if (body.length > api.LIMITS.reply[1]) { showToast("রিপ্লাই সর্বোচ্চ ২০০০ অক্ষরের হতে পারে।", "error"); return; }
    const btn = $("#cmReplyForm button[type=submit]");
    btn.disabled = true;
    try {
      const author = await api.loadAuthor(S.user);
      const rid = await api.createReply(T.id, author, { body, replyTo: T.replyTo });
      const now = new Date();
      const item = { id: rid, uid: author.uid, authorName: author.name, authorAvatar: author.avatarThumb, body, status: "active",
        createdAt: now, updatedAt: now, editedAt: null, likedBy: [], likeCount: 0,
        ...(T.replyTo ? { replyToId: T.replyTo.id, replyToName: T.replyTo.authorName } : {}) };
      T.disc.replyCount = (T.disc.replyCount || 0) + 1;
      T.replyTo = null; ta.value = "";
      if (T.done) T.replies.push(item);
      syncFeedCopy(); paintItem(T.id); paintReplies(); paintReplyBar();
      if (T.done) document.getElementById("r-" + rid)?.scrollIntoView({ block: "center", behavior: "smooth" });
      else showToast("রিপ্লাই প্রকাশ হয়েছে — তালিকার শেষে দেখা যাবে।");
    } catch (e) {
      showToast(api.explain(e).message, "error");
    } finally { btn.disabled = false; }
  }

  /* ---------------------------------------------------------- লাইক / শেয়ার */
  function paintItem(did, rid) {
    if (rid) {
      const el = root.querySelector(`.cm-reply[data-rid="${CSS.escape(rid)}"]`), r = S.thread?.replies.find((x) => x.id === rid);
      if (el && r) swap(el, replyHtml(r));
      return;
    }
    const d = findDiscussion(did);
    root.querySelectorAll(`.cm-card[data-id="${CSS.escape(did)}"]`).forEach((el) => d && swap(el, cardHtml(d, { full: el.classList.contains("is-full") })));
  }

  async function toggleLike({ did, rid }) {
    if (!requireAuth("লাইক দিতে লগইন করুন।")) return;
    const item = rid ? S.thread?.replies.find((r) => r.id === rid) : findDiscussion(did);
    const key = `like:${did}:${rid || ""}`;
    if (!item || S.busy.has(key)) return;
    S.busy.add(key);
    const uid = S.user.uid, before = { likedBy: item.likedBy || [], likeCount: item.likeCount || 0 };
    const had = before.likedBy.includes(uid);
    item.likedBy = had ? before.likedBy.filter((x) => x !== uid) : [...before.likedBy, uid];
    item.likeCount = item.likedBy.length;
    paintItem(did, rid);
    try { await api.setLike({ did, rid, uid, like: !had }); if (!rid) syncFeedCopy(); }
    catch (e) { Object.assign(item, before); paintItem(did, rid); showToast(api.explain(e).message, "error"); }
    finally { S.busy.delete(key); }
  }

  async function shareDiscussion(did) {
    const d = findDiscussion(did), url = shareUrl(did);
    try { if (navigator.share) { await navigator.share({ title: d?.title || "Tech Verse কমিউনিটি", url }); return; } }
    catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); showToast("লিংক কপি হয়েছে।"); return; } catch (_) { /* নিচের ফলব্যাক */ }
    const ta = Object.assign(document.createElement("textarea"), { value: url });
    ta.setAttribute("readonly", ""); ta.className = "sr-only";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove();
    showToast(ok ? "লিংক কপি হয়েছে।" : url, ok ? "success" : "error");
  }

  /* ---------------------------------------------------------- তৈরি / এডিট */
  function composerHtml({ mode, item, sel }) {
    const cats = S.cats.filter((c) => c.active !== false);
    return `<form id="cmForm" novalidate>
      ${mode === "create" ? `<div class="field"><label for="cmCat">ক্যাটাগরি</label>
        <select id="cmCat">${cats.map((c) => `<option value="${esc(c.id)}"${c.id === sel ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>` : ""}
      <div class="field"><label for="cmTitle">শিরোনাম</label>
        <input id="cmTitle" type="text" maxlength="120" autocomplete="off" placeholder="আপনার প্রশ্ন বা বিষয়" value="${esc(item?.title || "")}" data-autofocus>
        <div class="field-hint"><span id="cmTitleN">0</span>/১২০</div></div>
      <div class="field"><label for="cmBody">বিস্তারিত</label>
        <textarea id="cmBody" rows="7" maxlength="5000" placeholder="বিস্তারিত লিখুন…">${esc(item?.body || "")}</textarea>
        <div class="field-hint"><span id="cmBodyN">0</span>/৫০০০</div></div>
      <div class="cm-form-err" id="cmFormErr" role="alert"></div>
      <button type="submit" class="btn btn-primary btn-block">${mode === "create" ? "প্রকাশ করুন" : "সংরক্ষণ করুন"}</button></form>`;
  }

  function wireComposer(el, close, { mode, item }) {
    const title = el.querySelector("#cmTitle"), body = el.querySelector("#cmBody"), err = el.querySelector("#cmFormErr");
    const count = () => { el.querySelector("#cmTitleN").textContent = fmtN(title.value.length); el.querySelector("#cmBodyN").textContent = fmtN(body.value.length); };
    title.addEventListener("input", count); body.addEventListener("input", count); count();
    const fail = (m) => { err.textContent = m; err.classList.add("show"); };
    el.querySelector("#cmForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      err.classList.remove("show");
      const t = title.value.trim(), b = body.value.trim(), category = el.querySelector("#cmCat")?.value;
      if (t.length < api.LIMITS.title[0]) return fail("শিরোনাম কমপক্ষে ৩ অক্ষরের হতে হবে।");
      if (b.length < api.LIMITS.body[0]) return fail("বিস্তারিত কমপক্ষে ৩ অক্ষর লিখুন।");
      const btn = el.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (mode === "create") {
          const author = await api.loadAuthor(S.user);
          const id = await api.createDiscussion(author, { title: t, body: b, category });
          close(); showToast("আলোচনা প্রকাশ হয়েছে।");
          const now = new Date();
          if (!S.feed.cat || S.feed.cat === category) {
            S.feed.items.unshift({ id, uid: author.uid, authorName: author.name, authorAvatar: author.avatarThumb, title: t, body: b, category,
              status: "active", createdAt: now, updatedAt: now, editedAt: null, likedBy: [], likeCount: 0, replyCount: 0 });
            S.feed.loaded = true;
            if (S.route.name === "feed") renderList();
          }
        } else {
          await api.editDiscussion(item.id, { title: t, body: b });
          Object.assign(item, { title: t, body: b, editedAt: new Date() });
          close(); showToast("আলোচনা আপডেট হয়েছে।");
          if (S.thread?.disc === item) { syncFeedCopy(); document.title = `${t} — কমিউনিটি · Tech Verse`; renderThread(); }
          else paintItem(item.id);
        }
      } catch (e) {
        const ex = api.explain(e);
        fail(ex.code === "permission-denied" && mode === "create" && !S.catsFromDb
          ? (S.isAdmin ? "ক্যাটাগরি এখনো সেটআপ হয়নি — অ্যাডমিন প্যানেল → কমিউনিটি → \"ডিফল্ট ক্যাটাগরি বসান\" চাপুন।" : "এখন পোস্ট করা যাচ্ছে না — একটু পরে আবার চেষ্টা করুন।")
          : ex.message);
        btn.disabled = false;
      }
    });
  }

  function openComposer() {
    if (!requireAuth("নতুন আলোচনা শুরু করতে লগইন করুন।")) return;
    const first = S.cats.find((c) => c.active !== false);
    openSheet({ title: "নতুন আলোচনা", wide: true, bodyHtml: composerHtml({ mode: "create", sel: S.feed.cat || first?.id }), onMount: (el, close) => wireComposer(el, close, { mode: "create" }) });
  }

  function openEditDiscussion(item) {
    openSheet({ title: "আলোচনা এডিট", wide: true, bodyHtml: composerHtml({ mode: "edit", item }), onMount: (el, close) => wireComposer(el, close, { mode: "edit", item }) });
  }

  function openEditReply(item, did) {
    openSheet({
      title: "রিপ্লাই এডিট",
      bodyHtml: `<form id="cmForm" novalidate><div class="field"><label for="cmBody">আপনার রিপ্লাই</label>
        <textarea id="cmBody" rows="5" maxlength="2000" data-autofocus>${esc(item.body)}</textarea></div>
        <div class="cm-form-err" id="cmFormErr" role="alert"></div><button type="submit" class="btn btn-primary btn-block">সংরক্ষণ করুন</button></form>`,
      onMount: (el, close) => el.querySelector("#cmForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const b = el.querySelector("#cmBody").value.trim(), err = el.querySelector("#cmFormErr");
        if (!b) { err.textContent = "রিপ্লাই ফাঁকা রাখা যাবে না।"; err.classList.add("show"); return; }
        const btn = el.querySelector("button[type=submit]"); btn.disabled = true;
        try {
          await api.editReply(did, item.id, b);
          Object.assign(item, { body: b, editedAt: new Date() });
          close(); showToast("রিপ্লাই আপডেট হয়েছে।"); paintItem(did, item.id);
        } catch (e) { err.textContent = api.explain(e).message; err.classList.add("show"); btn.disabled = false; }
      })
    });
  }

  /* ---------------------------------------------------------- মেনু / মুছা / রিপোর্ট / মডারেশন */
  async function openMenu(kind, did, rid) {
    const item = kind === "reply" ? S.thread?.replies.find((r) => r.id === rid) : findDiscussion(did);
    if (!item) return;
    const mine = !!S.user && item.uid === S.user.uid;
    const targetId = kind === "reply" ? rid : did, rkey = `${kind}:${targetId}`;
    if (S.user && !mine && !S.reported.has(rkey) && await api.hasReported(S.user.uid, kind, targetId)) S.reported.add(rkey);
    const rows = [];
    if (kind === "discussion") rows.push(["copy", "copy", "লিংক কপি করুন"]);
    if (mine && item.status === "active") { rows.push(["edit", "pencil", "এডিট করুন"]); rows.push(["delete", "trash", "মুছে ফেলুন", "danger"]); }
    if (!mine) rows.push(["report", "flag", S.reported.has(rkey) ? "রিপোর্ট করা হয়েছে" : "রিপোর্ট করুন", S.reported.has(rkey) ? "off" : ""]);
    if (S.isAdmin && item.status === "active") {
      rows.push(["hide", "eyeOff", "লুকান (মডারেশন)"]);
      if (!mine) rows.push(["mod-delete", "trash", "মুছে ফেলুন (মডারেশন)", "danger"]);
    }
    openSheet({
      title: kind === "reply" ? "রিপ্লাই" : "আলোচনা",
      bodyHtml: `<div class="cm-menu">${rows.map(([a, ic, label, mod]) =>
        `<button type="button" class="cm-menu-item${mod === "danger" ? " is-danger" : ""}" data-menu="${a}"${mod === "off" ? " disabled" : ""}>${icons[ic]}<span>${esc(label)}</span></button>`).join("")}</div>`,
      onMount: (el, close) => el.addEventListener("click", (e) => {
        const b = e.target.closest("[data-menu]");
        if (!b) return;
        close();
        const a = b.dataset.menu;
        setTimeout(() => {
          if (a === "copy") shareDiscussion(did);
          else if (a === "edit") kind === "reply" ? openEditReply(item, did) : openEditDiscussion(item);
          else if (a === "delete") removeOwn(kind, did, rid);
          else if (a === "report") openReport(kind, did, rid);
          else if (a === "hide") moderate(kind, did, rid, "hidden");
          else if (a === "mod-delete") moderate(kind, did, rid, "deleted");
        }, 120);
      })
    });
  }

  function dropItem(kind, did, rid) {
    if (kind === "reply") {
      const T = S.thread;
      T.replies = T.replies.filter((r) => r.id !== rid);
      T.disc.replyCount = Math.max(0, (T.disc.replyCount || 0) - 1);
      syncFeedCopy(); paintItem(did); paintReplies();
    } else {
      S.feed.items = S.feed.items.filter((d) => d.id !== did);
      if (S.route.name === "thread") { S.internalNav ? history.back() : (location.hash = "#community"); } else renderList();
    }
  }

  async function removeOwn(kind, did, rid) {
    const ok = await confirmSheet({ title: kind === "reply" ? "রিপ্লাই মুছবেন?" : "আলোচনা মুছবেন?", message: "মুছে ফেললে এটি আর কেউ দেখতে পারবে না।", okLabel: "মুছে ফেলুন", danger: true });
    if (!ok) return;
    try {
      if (kind === "reply") await api.deleteReply(did, rid); else await api.deleteDiscussion(did);
      showToast("মুছে ফেলা হয়েছে।"); dropItem(kind, did, rid);
    } catch (e) { showToast(api.explain(e).message, "error"); }
  }

  async function moderate(kind, did, rid, status) {
    const ok = await confirmSheet({ title: status === "hidden" ? "কনটেন্ট লুকাবেন?" : "কনটেন্ট মুছবেন?", message: status === "hidden" ? "এটি সবার কাছ থেকে লুকানো থাকবে; অ্যাডমিন প্যানেল থেকে আবার প্রকাশ করা যাবে।" : "এটি সবার কাছ থেকে সরে যাবে (অ্যাডমিন প্যানেলে রেকর্ড থাকবে)।", okLabel: status === "hidden" ? "লুকান" : "মুছে ফেলুন", danger: status === "deleted" });
    if (!ok) return;
    try {
      if (kind === "reply") await api.moderateReply(did, rid, status, S.user.uid); else await api.moderateDiscussion(did, status, S.user.uid);
      showToast(status === "hidden" ? "লুকানো হয়েছে।" : "মুছে ফেলা হয়েছে।"); dropItem(kind, did, rid);
    } catch (e) { showToast(api.explain(e).message, "error"); }
  }

  function openReport(kind, did, rid) {
    if (!requireAuth("রিপোর্ট করতে লগইন করুন।")) return;
    const targetId = kind === "reply" ? rid : did;
    openSheet({
      title: "রিপোর্ট করুন",
      bodyHtml: `<p class="cm-confirm-msg">কেন রিপোর্ট করছেন? অ্যাডমিন বিষয়টি পর্যালোচনা করবেন।</p>
        <form id="cmReportForm" novalidate><fieldset class="cm-reasons"><legend class="sr-only">রিপোর্টের কারণ</legend>
        ${api.REPORT_REASONS.map(([v, l], i) => `<label class="cm-reason"><input type="radio" name="reason" value="${v}"${i === 0 ? " checked" : ""}><span>${esc(l)}</span></label>`).join("")}</fieldset>
        <div class="field"><label for="cmDetails">অতিরিক্ত তথ্য (ঐচ্ছিক)</label><textarea id="cmDetails" rows="3" maxlength="500"></textarea></div>
        <div class="cm-form-err" id="cmFormErr" role="alert"></div><button type="submit" class="btn btn-primary btn-block">রিপোর্ট জমা দিন</button></form>`,
      onMount: (el, close) => el.querySelector("#cmReportForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const btn = el.querySelector("button[type=submit]"), err = el.querySelector("#cmFormErr");
        btn.disabled = true;
        try {
          await api.submitReport({ uid: S.user.uid, targetType: kind, targetId, discussionId: did,
            reason: el.querySelector("input[name=reason]:checked").value, details: el.querySelector("#cmDetails").value.trim() });
          S.reported.add(`${kind}:${targetId}`);
          close(); showToast("রিপোর্ট জমা হয়েছে — ধন্যবাদ।");
        } catch (e) {
          const ex = api.explain(e);
          err.textContent = ex.code === "permission-denied" ? "আপনি আগেই এই কনটেন্ট রিপোর্ট করেছেন (বা এখন রিপোর্ট করা যাচ্ছে না)।" : ex.message;
          err.classList.add("show"); btn.disabled = false;
        }
      })
    });
  }

  /* ---------------------------------------------------------- নেভিগেশন ও ইভেন্ট */
  const go = (id) => { S.internalNav = true; location.hash = "#community/" + id; };
  const goBack = () => { if (S.internalNav && history.length > 1) history.back(); else location.hash = "#community"; };
  const focusReply = () => { const ta = $("#cmReplyText"); if (ta) { ta.scrollIntoView({ block: "center" }); ta.focus(); } else if (!S.user) openAuth(); };

  function refresh() {
    if (S.route.name === "thread") showThread(S.route.id);
    else { loadCategories(); loadFeed(true); }
  }

  function onClick(e) {
    const el = e.target.closest("[data-cm]");
    if (!el || !root.contains(el)) return;
    const card = el.closest(".cm-card"), rep = el.closest(".cm-reply");
    const did = card?.dataset.id || S.thread?.id, rid = rep?.dataset.rid || null;
    switch (el.dataset.cm) {
      case "new": return openComposer();
      case "refresh": case "retry": return refresh();
      case "cat": return selectCat(el.dataset.cat || "");
      case "more": return loadFeed(false);
      case "like": return toggleLike({ did, rid });
      case "share": return shareDiscussion(did);
      case "menu": return openMenu(el.dataset.kind, did, rid);
      case "open": if (!window.getSelection().toString()) go(did); return;
      case "back": return goBack();
      case "reply-to": return setReplyTo(rid);
      case "clear-replyto": return setReplyTo(null);
      case "focus-reply": return focusReply();
      case "login": return openAuth();
      case "more-replies": return loadReplies(false);
      case "retry-replies": return loadReplies(true);
    }
  }

  function onSubmit(e) { if (e.target.id === "cmReplyForm") { e.preventDefault(); submitReply(); } }
  function onInput(e) { if (e.target.id === "cmReplyText") autoGrow(e.target); }
  function onKeydown(e) { if (e.target.id === "cmReplyText" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitReply(); } }

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("input", onInput);
  root.addEventListener("keydown", onKeydown);
  window.addEventListener("online", () => {
    if (!visible) return;
    if (S.route.name === "feed" && S.feed.error?.code === "offline") loadFeed(true);
    else if (S.route.name === "thread" && (S.thread?.error || S.thread?.repliesError)) refresh();
  });

  function startAuth() {
    if (unwatch) return;
    unwatch = watchAuthState(async (user) => {
      S.user = user; S.profile = null; S.reported.clear();
      if (user) { try { S.profile = await getUserProfile(user.uid); } catch (_) { /* অফলাইনে প্রোফাইল ছাড়াই */ } }
      S.isAdmin = S.profile?.isAdmin === true;
      S.blocked = S.profile?.communityBlocked === true;
      S.authReady = true;
      if (!visible) return;
      if (S.route.name === "thread" && S.thread?.disc) { paintReplyBar(); root.querySelectorAll(".cm-card, .cm-reply").forEach((el) => { const r = el.dataset.rid; paintItem(el.dataset.id || S.thread.id, r); }); }
      else if (S.route.name === "feed") renderFeedShell();
    });
  }

  /* ---------------------------------------------------------- বাইরের API */
  async function show(route) {
    visible = true;
    if (!stopKb) stopKb = trackKeyboard();
    startAuth();
    if (S.route.name === "feed" && root.querySelector("#cmList")) S.scrollY = window.scrollY;
    S.route = route || { name: "feed" };
    document.documentElement.classList.toggle("cm-thread", S.route.name === "thread");
    if (S.route.name === "thread") await showThread(S.route.id);
    else { S.thread = null; await showFeed(); }
  }

  function hide() {
    visible = false;
    if (S.route.name === "feed" && root.querySelector("#cmList")) S.scrollY = window.scrollY;
    document.documentElement.classList.remove("cm-thread");
    document.querySelectorAll(".cm-overlay").forEach((o) => { if (o.classList.contains("open")) unlockScroll(); o.remove(); });
    if (io) { io.disconnect(); io = null; }
    if (stopKb) { stopKb(); stopKb = null; }
  }

  return { show, hide };
}
