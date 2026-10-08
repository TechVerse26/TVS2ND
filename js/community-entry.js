// js/community-entry.js
// কমিউনিটির হালকা রাউটার — Firebase ছাড়াই চলে (site.js-এর মতো আলাদা মডিউল)।
// #community ও #community/{id} হ্যাশে কমিউনিটি ভিউ দেখায়, অন্য হ্যাশে মূল সাইটে ফেরে।
// আসল কোড (js/community/app.js + Firebase) শুধু কমিউনিটি খুললে ডায়নামিক import হয়:
// Firebase/CDN না এলে (অফলাইন) পুরো সাইট অক্ষত থাকে, কমিউনিটির জায়গায় "অফলাইন + আবার চেষ্টা" দেখায়।

import { icons } from "./icons.js";

const view = document.getElementById("community");
const main = document.getElementById("mainContent");

if (view && main) init();

function init() {
  let app = null, loading = null, isOpen = false, savedTitle = document.title, showingOffline = false;

  function parse() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (h === "community") return { name: "feed" };
    const m = /^community\/([A-Za-z0-9]{1,40})$/.exec(h);
    return m ? { name: "thread", id: m[1] } : null;
  }

  function load() {
    if (!loading) {
      loading = import("./community/app.js")
        .then((m) => (app = m.createCommunity(view)))
        .catch((err) => { loading = null; throw err; });
    }
    return loading;
  }

  function showOffline() {
    showingOffline = true;
    view.innerHTML = `<div class="wrap cm-wrap"><div class="cm-state" role="alert">
      <div class="empty-state-icon">${icons.wifiOff}</div>
      <p>কমিউনিটি লোড করা যায়নি — ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন। সাইটের বাকি অংশ স্বাভাবিকভাবেই কাজ করছে।</p>
      <div class="cm-btnrow cm-btnrow-center"><button type="button" class="btn btn-outline btn-sm" data-cm-reload>${icons.refresh} আবার চেষ্টা করুন</button>
      <a class="btn btn-ghost btn-sm" href="#home">হোমে ফিরুন</a></div></div></div>`;
  }

  function enter() {
    if (isOpen) return;
    isOpen = true;
    savedTitle = document.title;
    main.hidden = true;
    view.hidden = false;
    document.documentElement.classList.add("cm-open");
    window.scrollTo(0, 0);
  }

  function leave() {
    if (!isOpen) return;
    isOpen = false;
    if (app) app.hide();
    view.hidden = true;
    main.hidden = false;
    document.documentElement.classList.remove("cm-open", "cm-thread");
    document.title = savedTitle;
    const id = location.hash.replace(/^#/, "");
    const target = id && id !== "home" ? document.getElementById(id) : null;
    requestAnimationFrame(() => (target ? target.scrollIntoView() : window.scrollTo(0, 0)));
  }

  async function route() {
    const r = parse();
    if (!r) { leave(); return; }
    enter();
    try {
      const c = app || (await load());
      showingOffline = false;
      await c.show(r);
    } catch (err) {
      console.warn("Community load failed:", err);
      showOffline();
    }
  }

  view.addEventListener("click", (e) => { if (e.target.closest("[data-cm-reload]")) location.reload(); });
  window.addEventListener("online", () => { if (isOpen && showingOffline) location.reload(); });
  window.addEventListener("hashchange", route);
  route();
}
