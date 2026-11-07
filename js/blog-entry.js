// js/blog-entry.js
// ব্লগের হালকা রাউটার — Firebase ছাড়াই চলে (community-entry.js-এর মতো আলাদা মডিউল)।
// #blog ও #blog/{স্লাগ} হ্যাশে ব্লগ-ভিউ দেখায়, অন্য হ্যাশে মূল সাইটে ফেরে।
// আসল কোড (js/blog/app.js + Firebase) শুধু ব্লগ খুললে ডায়নামিক import হয়:
// Firebase/CDN না এলে (অফলাইন) পুরো সাইট অক্ষত থাকে, ব্লগের জায়গায় "অফলাইন + আবার চেষ্টা" দেখায়।
//
// কমিউনিটির সাথে সমন্বয়: দুটো ভিউ-ই #mainContent লুকায়। কোনটা খোলা (html.cm-open / html.bl-open) দেখে শুধু তখনই মূল সাইট ফেরানো হয়
// যখন অন্য ভিউ খোলা নেই — তাই #community ↔ #blog সরাসরি যাওয়ার সময় মূল সাইট এক ঝলকও দেখা যায় না (hashchange-হ্যান্ডলারের ক্রম যাই হোক)।

import { icons } from "./icons.js";

const view = document.getElementById("blog");
const main = document.getElementById("mainContent");

if (view && main) init();

function init() {
  const html = document.documentElement;
  const baseTitle = document.title;                       // সাইটের আসল শিরোনাম — ফেরার সময় এটাই বসে
  const INFO_KEYS = new Set(["about", "privacy", "terms", "help", "credits"]);   // js/info.js-এর শিট-হ্যাশ (এগুলো খুললে ব্লগ নিচে খোলাই থাকে)
  let app = null, loading = null, isOpen = false, showingOffline = false, shown = "", seq = 0;

  function parse() {
    let h = location.hash.replace(/^#/, "");
    try { h = decodeURIComponent(h); } catch (_) { return /^blog(\/|$)/.test(h) ? { name: "post", slug: null } : null; }
    if (h === "blog") return { name: "list" };
    if (!h.startsWith("blog/")) return null;
    const m = /^blog\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(h);
    return { name: "post", slug: m && m[1].length <= 80 ? m[1] : null };    // অবৈধ স্লাগ → "লেখা পাওয়া যায়নি" পাতা (মূল সাইটে নয়)
  }
  const keyOf = (r) => (r.name === "list" ? "list" : `post:${r.slug}`);

  function load() {
    if (!loading) {
      loading = import("./blog/app.js")
        .then((m) => (app = m.createBlog(view)))
        .catch((err) => { loading = null; throw err; });
    }
    return loading;
  }

  function showOffline() {
    showingOffline = true; shown = "";
    view.innerHTML = `<div class="wrap cm-wrap"><div class="cm-state" role="alert">
      <div class="empty-state-icon">${icons.wifiOff}</div>
      <p>ব্লগ লোড করা যায়নি — ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন। সাইটের বাকি অংশ স্বাভাবিকভাবেই কাজ করছে।</p>
      <div class="cm-btnrow cm-btnrow-center"><button type="button" class="btn btn-outline btn-sm" data-bl-reload>${icons.refresh} আবার চেষ্টা করুন</button>
      <a class="btn btn-ghost btn-sm" href="#home">হোমে ফিরুন</a></div></div></div>`;
  }

  function enter() {
    if (isOpen) return;
    isOpen = true;
    main.hidden = true;
    view.hidden = false;
    html.classList.add("bl-open");
    const prev = html.style.scrollBehavior; html.style.scrollBehavior = "auto"; void html.offsetHeight; window.scrollTo(0, 0); html.style.scrollBehavior = prev;      // সাইটের smooth-scroll এড়িয়ে তাৎক্ষণিক
  }

  function leave() {
    if (!isOpen) return;
    isOpen = false; shown = ""; seq++;
    if (app) app.hide();
    view.hidden = true;
    html.classList.remove("bl-open", "bl-post");
    if (!html.classList.contains("cm-open")) {            // কমিউনিটি খুলে গেলে মূল সাইট ফেরানো হবে না (কমিউনিটি নিজেই #mainContent লুকিয়ে রাখে)
      main.hidden = false;
      document.title = baseTitle;
    }
    const id = location.hash.replace(/^#/, "");
    const target = id && id !== "home" ? document.getElementById(id) : null;
    requestAnimationFrame(() => { if (!html.classList.contains("cm-open")) (target ? target.scrollIntoView() : window.scrollTo(0, 0)); });
  }

  async function route() {
    const r = parse();
    if (!r) {
      // তথ্য-শিট (#privacy, #about …) ব্লগের ওপর খুললে ব্লগ যেমন আছে তেমনই থাকে — বন্ধ হলে history ফিরে আসে (নিচের "একই রুট" শাখা)
      if (isOpen && INFO_KEYS.has(location.hash.replace(/^#/, ""))) return;
      leave(); return;
    }
    enter();
    const k = keyOf(r);
    if (k === shown && app && !showingOffline) { app.refreshMeta(); return; }     // একই রুট (যেমন তথ্য-শিট বন্ধ করে ফেরা): আবার লোড নয়, শুধু শিরোনাম/মেটা ঠিক করা
    const my = ++seq;
    try {
      const c = app || (await load());
      if (my !== seq) return;                              // এর মাঝে ব্যবহারকারী অন্য জায়গায় গেছে
      showingOffline = false;
      shown = k;
      await c.show(r);
    } catch (err) {
      if (my !== seq) return;
      console.warn("Blog load failed:", err);
      showOffline();
    }
  }

  view.addEventListener("click", (e) => { if (e.target.closest("[data-bl-reload]")) location.reload(); });
  window.addEventListener("online", () => { if (isOpen && showingOffline) location.reload(); });
  window.addEventListener("hashchange", route);
  route();
}
