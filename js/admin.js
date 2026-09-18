// js/admin.js
// অ্যাডমিন প্যানেলের মূল লজিক। এই ফাইল শুধু admin.html-এ লোড হয় (পাবলিক সাইটে না),
// তাই এখানে ভারী CRUD লজিক রাখলেও পাবলিক সাইটের বান্ডল সাইজে প্রভাব পড়ে না।
//
// নিরাপত্তা মডেল: এই ফাইলের কোনো চেক-ই আসল সুরক্ষা না — আসল সুরক্ষা Firestore Security
// Rules-এর isAdmin() ফাংশনে। এখানকার isAdmin চেক শুধু UI দেখানোর/লুকানোর সিদ্ধান্তে ব্যবহৃত হয়।
//
// Escaping নিয়ম: services/portfolio/ইত্যাদি কন্টেন্ট টাইপ অ্যাডমিন নিজে লেখেন, কিন্তু তারপরও
// escapeHtml() ব্যবহার করা হয়েছে সবখানে — যাতে টাইপ করা টেক্সটে হঠাৎ &, <, > থাকলেও লেআউট
// ভেঙে না যায়। bookings/users কালেকশনের ডেটা ভিজিটর/ইউজার নিজে লেখেন (নাম, ফোন, মেসেজ),
// তাই ওখানে escapeHtml() আরও বেশি জরুরি — XSS ঠেকাতে।

import { db } from "./firebase-config.js";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc,
  query, orderBy, limit, where, getCountFromServer, writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { watchAuthState, logout, getUserProfile, isAdminProfile } from "./auth.js";
import { icons, icon, serviceIconChoices } from "./icons.js";
import { showToast } from "./toast.js";
import { escapeHtml, formatDate, debounce, BOOKING_STATUSES, statusClass } from "./utils.js";
import * as seed from "./seed-data.js";

const SEED_MAP = {
  services: seed.services,
  portfolio: seed.portfolioItems,
  caseStudies: seed.caseStudies,
  testimonials: seed.testimonials,
  team: seed.team,
  stats: seed.stats,
  pricingPlans: seed.pricingPlans,
  faqItems: seed.faqItems
};

const CONTENT_TYPES = {
  services: {
    label: "সার্ভিস", singular: "সার্ভিস", icon: "settings",
    titleField: "title", subField: "desc",
    fields: [
      { key: "title", label: "শিরোনাম", type: "text", required: true },
      { key: "desc", label: "বিবরণ", type: "textarea", required: true, full: true },
      { key: "icon", label: "আইকন", type: "icon" }
    ]
  },
  portfolio: {
    label: "পোর্টফোলিও", singular: "পোর্টফোলিও আইটেম", icon: "layout",
    titleField: "title", subField: "tag",
    fields: [
      { key: "title", label: "শিরোনাম", type: "text", required: true },
      {
        key: "category", label: "ক্যাটাগরি", type: "select", required: true,
        options: [
          { value: "web", label: "ওয়েব অ্যাপ" },
          { value: "pwa", label: "PWA" },
          { value: "design", label: "ডিজাইন" }
        ]
      },
      { key: "tag", label: "ট্যাগ (কার্ডে দেখাবে)", type: "text", required: true },
      { key: "stack", label: "টেক স্ট্যাক", type: "text" },
      { key: "desc", label: "বিবরণ", type: "textarea", required: true, full: true },
      { key: "imageUrl", label: "ছবির URL (ঐচ্ছিক)", type: "url", full: true }
    ]
  },
  caseStudies: {
    label: "কেস স্টাডি", singular: "কেস স্টাডি", icon: "chart",
    titleField: "title", subField: "desc",
    fields: [
      { key: "title", label: "শিরোনাম", type: "text", required: true, full: true },
      { key: "desc", label: "বিবরণ", type: "textarea", required: true, full: true },
      { key: "metric1Value", label: "মেট্রিক ১ — ভ্যালু", type: "text", required: true },
      { key: "metric1Label", label: "মেট্রিক ১ — লেবেল", type: "text", required: true },
      { key: "metric2Value", label: "মেট্রিক ২ — ভ্যালু", type: "text", required: true },
      { key: "metric2Label", label: "মেট্রিক ২ — লেবেল", type: "text", required: true }
    ]
  },
  testimonials: {
    label: "টেস্টিমোনিয়াল", singular: "টেস্টিমোনিয়াল", icon: "message",
    titleField: "name", subField: "role",
    fields: [
      { key: "name", label: "নাম", type: "text", required: true },
      { key: "role", label: "পদবি/প্রতিষ্ঠান", type: "text", required: true },
      { key: "quote", label: "মন্তব্য", type: "textarea", required: true, full: true },
      { key: "avatarUrl", label: "ছবির URL (ঐচ্ছিক)", type: "url", full: true }
    ]
  },
  team: {
    label: "টিম", singular: "টিম মেম্বার", icon: "users",
    titleField: "name", subField: "role",
    fields: [
      { key: "name", label: "নাম", type: "text", required: true },
      { key: "role", label: "পদবি", type: "text", required: true },
      { key: "avatarUrl", label: "ছবির URL (ঐচ্ছিক)", type: "url", full: true }
    ]
  },
  stats: {
    label: "স্ট্যাটস কাউন্টার", singular: "স্ট্যাট", icon: "bolt",
    titleField: "label", subField: "value",
    fields: [
      { key: "value", label: "সংখ্যা", type: "number", required: true },
      { key: "suffix", label: "সাফিক্স (যেমন + বা %)", type: "text" },
      { key: "label", label: "লেবেল", type: "text", required: true, full: true }
    ]
  },
  pricingPlans: {
    label: "প্রাইসিং প্যাকেজ", singular: "প্যাকেজ", icon: "target",
    titleField: "name", subField: "price",
    fields: [
      { key: "name", label: "প্যাকেজের নাম", type: "text", required: true },
      { key: "price", label: "মূল্য", type: "text", required: true },
      { key: "featured", label: "জনপ্রিয় হিসেবে হাইলাইট করো", type: "checkbox" },
      { key: "features", label: "ফিচার তালিকা", type: "lines", full: true, hint: "প্রতি লাইনে একটা ফিচার লিখুন" }
    ]
  },
  faqItems: {
    label: "FAQ", singular: "প্রশ্ন", icon: "book",
    titleField: "q", subField: "a",
    fields: [
      { key: "q", label: "প্রশ্ন", type: "text", required: true, full: true },
      { key: "a", label: "উত্তর", type: "textarea", required: true, full: true }
    ]
  }
};
const CONTENT_ORDER = Object.keys(CONTENT_TYPES);

const ROUTE_TITLES = {
  dashboard: "ড্যাশবোর্ড", bookings: "বুকিং/অনুরোধ", users: "ইউজার", settings: "সেটিংস",
  ...Object.fromEntries(CONTENT_ORDER.map((k) => [k, CONTENT_TYPES[k].label]))
};

let currentUid = null;

/* ================= Boot / auth gate ================= */

document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("admin-body");
  watchAuthState(async (user) => {
    if (!user) return showGate(loginGateHtml());
    let profile = null;
    try { profile = await getUserProfile(user.uid); } catch (err) { console.error(err); }
    if (!isAdminProfile(profile)) return showGate(deniedGateHtml());
    currentUid = user.uid;
    boot();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
});

function showGate(html) {
  document.getElementById("app").innerHTML = html;
}

function loginGateHtml() {
  return `<div class="admin-gate"><div class="admin-gate-box">
    <div class="empty-state-icon">${icons.lock}</div>
    <h2>লগইন প্রয়োজন</h2>
    <p>অ্যাডমিন প্যানেল দেখতে হলে আগে সাইটে লগইন করুন।</p>
    <a class="btn btn-primary" href="./index.html#profile">সাইটে গিয়ে লগইন করুন</a>
  </div></div>`;
}
function deniedGateHtml() {
  return `<div class="admin-gate"><div class="admin-gate-box">
    <div class="empty-state-icon">${icons.warn}</div>
    <h2>এক্সেস নেই</h2>
    <p>এই অ্যাকাউন্টের অ্যাডমিন প্যানেল দেখার অনুমতি নেই।</p>
    <a class="btn btn-outline" href="./index.html">মূল সাইটে ফিরে যান</a>
  </div></div>`;
}

function boot() {
  document.getElementById("app").innerHTML = shellHtml();
  document.getElementById("logoutLink").addEventListener("click", async () => {
    await logout();
    window.location.href = "./index.html";
  });
  document.getElementById("sidebarToggle").addEventListener("click", toggleSidebar);
  document.getElementById("sidebarScrim").addEventListener("click", closeSidebarMobile);
  window.addEventListener("hashchange", route);
  route();
}

function shellHtml() {
  return `
    <div class="admin-shell">
      <div class="admin-sidebar-scrim" id="sidebarScrim"></div>
      <aside class="admin-sidebar" id="sidebar">
        <div class="admin-brand"><img src="./assets/logo.png" alt="TVsite" class="brand-logo"></div>
        <nav class="admin-nav" id="adminNav">${navHtml()}</nav>
        <div class="admin-sidebar-foot">
          <a href="./index.html">${icons.back}<span>সাইটে ফিরুন</span></a>
          <a id="logoutLink" style="cursor:pointer;">${icons.logout}<span>লগ আউট</span></a>
        </div>
      </aside>
      <div class="admin-main">
        <div class="admin-topbar">
          <button class="btn btn-icon btn-outline" id="sidebarToggle" aria-label="মেনু">${icons.menu}</button>
          <span class="admin-topbar-title" id="topbarTitle">ড্যাশবোর্ড</span>
        </div>
        <main class="admin-page" id="page"></main>
      </div>
    </div>
    <div id="modalRoot"></div>`;
}

function navHtml() {
  const item = (r, iconName, label) => `<a href="#${r}" data-route="${r}">${icon(iconName)}<span>${label}</span></a>`;
  return `
    ${item("dashboard", "dashboard", "ড্যাশবোর্ড")}
    ${item("bookings", "inbox", "বুকিং/অনুরোধ")}
    <div class="admin-nav-label">কন্টেন্ট ম্যানেজমেন্ট</div>
    ${CONTENT_ORDER.map((k) => item(k, CONTENT_TYPES[k].icon, CONTENT_TYPES[k].label)).join("")}
    <div class="admin-nav-label">অ্যাকাউন্ট</div>
    ${item("users", "users", "ইউজার")}
    ${item("settings", "settings", "সেটিংস")}
  `;
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebarScrim").classList.toggle("open");
}
function closeSidebarMobile() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarScrim").classList.remove("open");
}

/* ================= Router ================= */

function route() {
  const hash = (window.location.hash || "#dashboard").replace("#", "");
  const valid = hash === "dashboard" || hash === "bookings" || hash === "users" || hash === "settings" || CONTENT_TYPES[hash];
  const r = valid ? hash : "dashboard";
  document.querySelectorAll("#adminNav a").forEach((a) => a.classList.toggle("active", a.dataset.route === r));
  const topTitle = document.getElementById("topbarTitle");
  if (topTitle) topTitle.textContent = ROUTE_TITLES[r] || "";
  closeSidebarMobile();
  const page = document.getElementById("page");
  page.innerHTML = "";
  if (r === "dashboard") renderDashboard(page);
  else if (r === "bookings") renderBookings(page);
  else if (r === "users") renderUsers(page);
  else if (r === "settings") renderSettings(page);
  else renderContentList(page, r);
}

/* ================= Shared UI helpers ================= */

function pageHeadHtml(title, desc, actionsHtml = "") {
  return `<div class="admin-page-head"><div><h1>${title}</h1><p>${desc}</p></div><div class="admin-actions-row">${actionsHtml}</div></div>`;
}
function skeletonTableHtml() {
  return `<div class="skel-card">${[68, 84, 52, 76].map((w) => `<div class="skel-row skel" style="width:${w}%;"></div>`).join("")}</div>`;
}
function skeletonStatsHtml() {
  return `<div class="admin-stat-grid">${[1, 2, 3, 4].map(() => `<div class="admin-stat"><div class="skel-row skel" style="width:40%;height:22px;"></div></div>`).join("")}</div>`;
}
function skeletonFormHtml() {
  return `<div class="admin-card">${[1, 2, 3].map(() => `<div class="skel-row skel" style="width:100%;height:36px;margin-bottom:14px;"></div>`).join("")}</div>`;
}

function bindOverlayClose(overlay) {
  const ov = overlay.querySelector(".modal-overlay");
  if (ov) ov.addEventListener("click", (e) => { if (e.target === ov) closeModal(); });
}
function closeModal() {
  const root = document.getElementById("modalRoot");
  if (root) root.innerHTML = "";
}

function confirmAction(message, onConfirm, confirmLabel = "মুছে ফেলুন", danger = true) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-overlay open confirm-modal">
      <div class="modal">
        <div class="confirm-icon">${icons.warn}</div>
        <h3>নিশ্চিত করুন</h3>
        <p>${message}</p>
        <div class="form-actions">
          <button class="btn btn-ghost" id="confirmNo">বাতিল</button>
          <button class="btn ${danger ? "btn-danger-ghost" : "btn-primary"}" id="confirmYes">${confirmLabel}</button>
        </div>
      </div>
    </div>`;
  bindOverlayClose(root);
  document.getElementById("confirmNo").onclick = closeModal;
  document.getElementById("confirmYes").onclick = async () => {
    closeModal();
    await onConfirm();
  };
}

async function countOf(name, whereArgs) {
  try {
    const ref = collection(db, name);
    const q = whereArgs ? query(ref, where(...whereArgs)) : ref;
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (err) {
    console.error(`count(${name}) failed`, err);
    return 0;
  }
}

/* ================= Dashboard ================= */

async function renderDashboard(page) {
  page.innerHTML = pageHeadHtml("ড্যাশবোর্ড", "আপনার সাইটের একটা সংক্ষিপ্ত চিত্র।") +
    `<div id="dashArea">${skeletonStatsHtml()}${skeletonTableHtml()}</div>`;

  const [totalBookings, newBookings, totalUsers, ...contentCounts] = await Promise.all([
    countOf("bookings"),
    countOf("bookings", ["status", "==", "নতুন"]),
    countOf("users"),
    ...CONTENT_ORDER.map((k) => countOf(k))
  ]);
  const contentTotal = contentCounts.reduce((a, b) => a + b, 0);
  const emptyTypes = CONTENT_ORDER.filter((k, i) => contentCounts[i] === 0);
  const recentBookings = await fetchRecentBookings(5);

  const area = document.getElementById("dashArea");
  area.innerHTML = `
    <div class="admin-stat-grid">
      <div class="admin-stat"><b>${totalBookings}</b><span>মোট অনুরোধ</span></div>
      <div class="admin-stat accent"><b>${newBookings}</b><span>নতুন অনুরোধ</span></div>
      <div class="admin-stat"><b>${totalUsers}</b><span>নিবন্ধিত ইউজার</span></div>
      <div class="admin-stat"><b>${contentTotal}</b><span>কন্টেন্ট আইটেম</span></div>
    </div>
    ${emptyTypes.length ? seedCardHtml(emptyTypes) : ""}
    <div class="admin-card">
      <h3>কন্টেন্ট ওভারভিউ</h3>
      <p>প্রতিটা সেকশনে কতগুলো আইটেম আছে — ম্যানেজ করতে ক্লিক করুন।</p>
      <div class="admin-table-wrap"><table class="admin-table"><tbody>
        ${CONTENT_ORDER.map((k, i) => `
          <tr class="row-clickable" data-goto="${k}">
            <td class="cell-title">${CONTENT_TYPES[k].label}</td>
            <td class="cell-muted">${contentCounts[i]}টা আইটেম</td>
            <td class="cell-actions">${icons.arrow}</td>
          </tr>`).join("")}
      </tbody></table></div>
    </div>
    <div class="admin-card">
      <h3>সাম্প্রতিক অনুরোধ</h3>
      <p>সর্বশেষ ৫টা বুকিং অনুরোধ।</p>
      ${recentBookings.length ? recentBookings.map(recentBookingRowHtml).join("") : `<div class="empty-state"><div class="empty-state-icon">${icons.inbox}</div><p>এখনো কোনো অনুরোধ আসেনি।</p></div>`}
      <div style="margin-top:16px;"><a href="#bookings" class="btn btn-outline btn-sm">সব অনুরোধ দেখুন</a></div>
    </div>`;

  area.querySelectorAll("[data-goto]").forEach((row) => {
    row.addEventListener("click", () => { window.location.hash = row.dataset.goto; });
  });
  const seedBtn = document.getElementById("seedBtn");
  if (seedBtn) seedBtn.addEventListener("click", () => runSeed(emptyTypes));
}

function seedCardHtml(emptyTypes) {
  const names = emptyTypes.map((k) => CONTENT_TYPES[k].label).join(", ");
  return `<div class="admin-card seed-card">
    <div class="empty-state-icon">${icons.seed}</div>
    <div class="seed-card-body">
      <h3>শুরু করতে ডিফল্ট কন্টেন্ট বসান</h3>
      <p>${names} — এই সেকশনগুলো এখনো খালি। নমুনা কন্টেন্ট দিয়ে শুরু করে পরে নিজের মতো এডিট করে নিতে পারেন।</p>
      <button class="btn btn-primary btn-sm" id="seedBtn">${icons.seed} ডিফল্ট কন্টেন্ট বসান</button>
    </div>
  </div>`;
}

async function runSeed(emptyTypes) {
  const btn = document.getElementById("seedBtn");
  if (btn) { btn.disabled = true; btn.textContent = "বসানো হচ্ছে..."; }
  try {
    const batch = writeBatch(db);
    emptyTypes.forEach((key) => {
      (SEED_MAP[key] || []).forEach((item) => {
        const ref = doc(collection(db, key));
        batch.set(ref, item);
      });
    });
    const settingsSnap = await getDoc(doc(db, "settings", "site"));
    if (!settingsSnap.exists()) batch.set(doc(db, "settings", "site"), seed.defaultSettings);
    await batch.commit();
    showToast("ডিফল্ট কন্টেন্ট বসানো হয়েছে।");
    renderDashboard(document.getElementById("page"));
  } catch (err) {
    console.error(err);
    showToast("কন্টেন্ট বসাতে সমস্যা হয়েছে।", "error");
    if (btn) { btn.disabled = false; btn.textContent = "ডিফল্ট কন্টেন্ট বসান"; }
  }
}

async function fetchRecentBookings(n) {
  try {
    const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"), limit(n));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    return [];
  }
}
function recentBookingRowHtml(b) {
  return `<div class="booking-card">
    <div class="booking-card-top"><b>${escapeHtml(b.name || "—")}</b><span class="status-badge ${statusClass(b.status)}">${escapeHtml(b.status || "নতুন")}</span></div>
    <div class="booking-meta"><span>${escapeHtml(b.service || "—")}</span><span>${formatDate(b.createdAt)}</span></div>
  </div>`;
}

/* ================= Bookings ================= */

async function renderBookings(page) {
  page.innerHTML = pageHeadHtml("বুকিং/অনুরোধ", "ভিজিটরদের পাঠানো প্রজেক্ট অনুরোধ এখান থেকে দেখুন ও ম্যানেজ করুন।") +
    `<div class="admin-toolbar">
      <div class="admin-search">${icons.search}<input type="text" id="bookingSearch" placeholder="নাম, ইমেইল বা ফোন দিয়ে খুঁজুন..."></div>
      <select class="admin-select-filter" id="statusFilter">
        <option value="all">সব স্ট্যাটাস</option>
        ${BOOKING_STATUSES.map((s) => `<option value="${escapeHtml(s.value)}">${escapeHtml(s.value)}</option>`).join("")}
      </select>
    </div>
    <div id="bookingArea">${skeletonTableHtml()}</div>`;

  let all = [];
  try {
    const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"), limit(300));
    const snap = await getDocs(q);
    all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    document.getElementById("bookingArea").innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icons.warn}</div><p>অনুরোধ লোড করতে সমস্যা হয়েছে। Firestore ইনডেক্স ঠিকভাবে সেট করা আছে কিনা দেখুন (README দ্রষ্টব্য)।</p></div>`;
    return;
  }

  if (all.length === 300) {
    document.querySelector(".admin-page-head p").insertAdjacentHTML(
      "afterend",
      `<p class="mono-sm muted" style="margin:-8px 0 16px;">সাম্প্রতিক ৩০০টা অনুরোধ দেখানো হচ্ছে।</p>`
    );
  }

  function draw() {
    const term = document.getElementById("bookingSearch").value.trim().toLowerCase();
    const status = document.getElementById("statusFilter").value;
    const filtered = all.filter((b) => {
      const matchesTerm = !term || [b.name, b.email, b.phone].some((v) => String(v || "").toLowerCase().includes(term));
      const matchesStatus = status === "all" || (b.status || "নতুন") === status;
      return matchesTerm && matchesStatus;
    });
    document.getElementById("bookingArea").innerHTML = filtered.length
      ? bookingTableHtml(filtered)
      : `<div class="empty-state"><div class="empty-state-icon">${icons.inbox}</div><p>কোনো অনুরোধ পাওয়া যায়নি।</p></div>`;
    bindBookingEvents(filtered);
  }

  document.getElementById("bookingSearch").addEventListener("input", debounce(draw, 250));
  document.getElementById("statusFilter").addEventListener("change", draw);
  draw();
}

function bookingTableHtml(list) {
  const rows = list.map((b) => `
    <tr class="row-clickable" data-id="${b.id}">
      <td><div class="cell-title">${escapeHtml(b.name || "—")}</div><div class="cell-muted">${escapeHtml(b.email || "—")}</div></td>
      <td class="cell-muted">${escapeHtml(b.service || "—")}</td>
      <td><span class="status-badge ${statusClass(b.status)}">${escapeHtml(b.status || "নতুন")}</span></td>
      <td class="cell-muted">${formatDate(b.createdAt)}</td>
      <td class="cell-actions"><button class="btn btn-outline btn-icon" data-view="${b.id}">${icons.edit}</button></td>
    </tr>`).join("");
  const cards = list.map((b) => `
    <div class="admin-list-card" data-id="${b.id}">
      <div class="admin-list-card-top"><b>${escapeHtml(b.name || "—")}</b><span class="status-badge ${statusClass(b.status)}">${escapeHtml(b.status || "নতুন")}</span></div>
      <p>${escapeHtml(b.service || "—")} · ${formatDate(b.createdAt)}</p>
    </div>`).join("");
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>নাম</th><th>সার্ভিস</th><th>স্ট্যাটাস</th><th>তারিখ</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="admin-mobile-list">${cards}</div>`;
}

function bindBookingEvents(list) {
  document.getElementById("bookingArea").addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-id], .admin-list-card[data-id]");
    if (!row) return;
    const b = list.find((x) => x.id === row.dataset.id);
    if (b) openBookingDetail(b);
  });
}

function openBookingDetail(b) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-overlay open">
      <div class="modal modal-wide">
        <div class="modal-head"><h3>বুকিং বিস্তারিত</h3><button class="modal-close" id="bClose">${icons.close}</button></div>
        <div class="form-grid" style="margin-bottom:18px;">
          <div class="field"><label>নাম</label><div class="cell-title">${escapeHtml(b.name || "—")}</div></div>
          <div class="field"><label>সার্ভিস</label><div class="cell-title">${escapeHtml(b.service || "—")}</div></div>
          <div class="field"><label>ইমেইল</label><div>${b.email ? `<a class="mono-sm" href="mailto:${escapeHtml(b.email)}">${escapeHtml(b.email)}</a>` : "—"}</div></div>
          <div class="field"><label>ফোন / WhatsApp</label><div>${b.phone ? `<a class="mono-sm" target="_blank" rel="noopener" href="https://wa.me/${escapeHtml(String(b.phone).replace(/[^0-9]/g, ""))}">${escapeHtml(b.phone)}</a>` : "—"}</div></div>
          <div class="field"><label>বাজেট</label><div>${escapeHtml(b.budget || "—")}</div></div>
          <div class="field"><label>টাইমলাইন</label><div>${escapeHtml(b.timeline || "—")}</div></div>
          <div class="field field-full"><label>বিস্তারিত</label><div class="muted" style="white-space:pre-wrap;">${escapeHtml(b.details || "—")}</div></div>
          <div class="field field-full"><label>পাঠানো হয়েছে</label><div class="mono-sm muted">${formatDate(b.createdAt)}</div></div>
        </div>
        <div class="field">
          <label>স্ট্যাটাস</label>
          <select id="bStatus">${BOOKING_STATUSES.map((s) => `<option value="${escapeHtml(s.value)}" ${s.value === (b.status || "নতুন") ? "selected" : ""}>${escapeHtml(s.value)}</option>`).join("")}</select>
        </div>
        <div class="form-actions">
          <button class="btn btn-danger-ghost" id="bDelete">${icons.trash} মুছে ফেলুন</button>
          <button class="btn btn-primary" id="bSave">সংরক্ষণ করুন</button>
        </div>
      </div>
    </div>`;
  bindOverlayClose(root);
  document.getElementById("bClose").onclick = closeModal;
  document.getElementById("bSave").onclick = async () => {
    const btn = document.getElementById("bSave");
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "bookings", b.id), { status: document.getElementById("bStatus").value });
      showToast("স্ট্যাটাস আপডেট হয়েছে।");
      closeModal();
      renderBookings(document.getElementById("page"));
    } catch (err) {
      console.error(err);
      showToast("আপডেট করতে সমস্যা হয়েছে।", "error");
      btn.disabled = false;
    }
  };
  document.getElementById("bDelete").onclick = () => {
    confirmAction(`"${escapeHtml(b.name || "এই")}"-এর অনুরোধটা মুছে ফেলতে চান? এই কাজ আর ফেরানো যাবে না।`, async () => {
      try {
        await deleteDoc(doc(db, "bookings", b.id));
        showToast("অনুরোধ মুছে ফেলা হয়েছে।");
        renderBookings(document.getElementById("page"));
      } catch (err) {
        console.error(err);
        showToast("মুছতে সমস্যা হয়েছে।", "error");
      }
    });
  };
}

/* ================= Users ================= */

async function renderUsers(page) {
  page.innerHTML = pageHeadHtml("ইউজার", "নিবন্ধিত ইউজারদের তালিকা — চাইলে কাউকে অ্যাডমিন অ্যাক্সেস দিতে বা বাদ দিতে পারেন।") +
    `<div id="userArea">${skeletonTableHtml()}</div>`;

  let list = [];
  try {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    document.getElementById("userArea").innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icons.warn}</div><p>ইউজার লোড করতে সমস্যা হয়েছে।</p></div>`;
    return;
  }

  document.getElementById("userArea").innerHTML = list.length
    ? userTableHtml(list)
    : `<div class="empty-state"><div class="empty-state-icon">${icons.users}</div><p>এখনো কোনো ইউজার নিবন্ধন করেননি।</p></div>`;
  bindUserEvents(list);
}

function roleActionLabel(isAdmin) {
  return isAdmin ? "অ্যাডমিন বাদ দিন" : "অ্যাডমিন করুন";
}
function userTableHtml(list) {
  const rows = list.map((u) => `
    <tr>
      <td><div class="cell-title">${escapeHtml(u.name || "নাম নেই")}</div><div class="cell-muted">${escapeHtml(u.email || "")}</div></td>
      <td class="cell-muted">${escapeHtml(u.phone || "—")}</td>
      <td>${u.isAdmin === true ? `<span class="role-badge">অ্যাডমিন</span>` : `<span class="cat-badge">সাধারণ ইউজার</span>`}</td>
      <td class="cell-actions"><button class="btn ${u.isAdmin === true ? "btn-danger-ghost" : "btn-outline"} btn-sm" data-toggle="${u.id}">${roleActionLabel(u.isAdmin === true)}</button></td>
    </tr>`).join("");
  const cards = list.map((u) => `
    <div class="admin-list-card">
      <div class="admin-list-card-top"><b>${escapeHtml(u.name || "নাম নেই")}</b>${u.isAdmin === true ? `<span class="role-badge">অ্যাডমিন</span>` : ""}</div>
      <p>${escapeHtml(u.email || "")}${u.phone ? " · " + escapeHtml(u.phone) : ""}</p>
      <button class="btn ${u.isAdmin === true ? "btn-danger-ghost" : "btn-outline"} btn-sm" data-toggle="${u.id}">${roleActionLabel(u.isAdmin === true)}</button>
    </div>`).join("");
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>ইউজার</th><th>ফোন</th><th>রোল</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="admin-mobile-list">${cards}</div>`;
}

function bindUserEvents(list) {
  document.getElementById("userArea").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-toggle]");
    if (!btn) return;
    const u = list.find((x) => x.id === btn.dataset.toggle);
    if (!u) return;
    const makingAdmin = u.isAdmin !== true;
    const who = escapeHtml(u.name || u.email || "এই ইউজার");
    const selfNote = (u.id === currentUid && !makingAdmin) ? " এতে আপনার নিজের অ্যাডমিন এক্সেসও চলে যাবে।" : "";
    const msg = makingAdmin ? `"${who}"-কে অ্যাডমিন করতে চান?` : `"${who}"-এর অ্যাডমিন এক্সেস বাদ দিতে চান?${selfNote}`;
    confirmAction(msg, async () => {
      try {
        await updateDoc(doc(db, "users", u.id), { isAdmin: makingAdmin });
        showToast("আপডেট হয়েছে।");
        renderUsers(document.getElementById("page"));
      } catch (err) {
        console.error(err);
        showToast("আপডেট করতে সমস্যা হয়েছে।", "error");
      }
    }, roleActionLabel(u.isAdmin === true), !makingAdmin);
  });
}

/* ================= Settings ================= */

async function renderSettings(page) {
  page.innerHTML = pageHeadHtml("সেটিংস", "সাইটের হিরো টেক্সট, হোয়াটসঅ্যাপ নম্বর ইত্যাদি এখান থেকে পরিবর্তন করুন।") +
    `<div id="settingsArea">${skeletonFormHtml()}</div>`;

  let current = { ...seed.defaultSettings };
  try {
    const snap = await getDoc(doc(db, "settings", "site"));
    if (snap.exists()) current = { ...current, ...snap.data() };
  } catch (err) { console.error(err); }

  const fields = [
    { key: "siteName", label: "সাইটের নাম" },
    { key: "heroEyebrow", label: "হিরো আইব্রাউ (ছোট লেবেল)" },
    { key: "heroTitle", label: "হিরো টাইটেল", type: "textarea", hint: "কোনো অংশ হাইলাইট রঙে দেখাতে **এভাবে** লিখুন — যেমন: আপনার আইডিয়াকে **দ্রুত, স্মার্ট** রূপ দিই" },
    { key: "heroSubtitle", label: "হিরো সাবটাইটেল", type: "textarea" },
    { key: "heroCtaPrimary", label: "প্রধান বাটনের টেক্সট" },
    { key: "heroCtaSecondary", label: "দ্বিতীয় বাটনের টেক্সট" },
    { key: "whatsappNumber", label: "হোয়াটসঅ্যাপ নম্বর", hint: "দেশের কোডসহ, + বা স্পেস ছাড়া — যেমন 8801XXXXXXXXX" },
    { key: "whatsappMessage", label: "হোয়াটসঅ্যাপ ডিফল্ট মেসেজ", type: "textarea" },
    { key: "seoDescription", label: "SEO বিবরণ (মেটা ট্যাগ)", type: "textarea" }
  ];

  document.getElementById("settingsArea").innerHTML = `
    <form id="settingsForm" class="admin-card settings-form">
      ${fields.map((f) => f.type === "textarea"
        ? `<div class="field"><label>${f.label}</label><textarea name="${f.key}" rows="3">${escapeHtml(current[f.key] || "")}</textarea>${f.hint ? `<div class="field-hint">${f.hint}</div>` : ""}</div>`
        : `<div class="field"><label>${f.label}</label><input type="text" name="${f.key}" value="${escapeHtml(current[f.key] || "")}">${f.hint ? `<div class="field-hint">${f.hint}</div>` : ""}</div>`
      ).join("")}
      <div class="form-actions"><span></span><button type="submit" class="btn btn-primary">সংরক্ষণ করুন</button></div>
    </form>`;

  document.getElementById("settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {};
    fields.forEach((f) => { data[f.key] = String(fd.get(f.key) || "").trim(); });
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await setDoc(doc(db, "settings", "site"), data, { merge: true });
      showToast("সেটিংস সংরক্ষণ হয়েছে।");
    } catch (err) {
      console.error(err);
      showToast("সংরক্ষণ করতে সমস্যা হয়েছে।", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

/* ================= Generic content CRUD ================= */

async function renderContentList(page, typeKey) {
  const type = CONTENT_TYPES[typeKey];
  page.innerHTML = pageHeadHtml(
    type.label,
    `আপনার সাইটের "${type.label}" সেকশন — যোগ, এডিট, মুছে ফেলা ও ক্রম পরিবর্তন এখান থেকেই করা যাবে।`,
    `<button class="btn btn-primary btn-sm" id="addItemBtn">${icons.plus} নতুন ${type.singular}</button>`
  ) + `<div id="listArea">${skeletonTableHtml()}</div>`;

  let items = [];
  try {
    const q = query(collection(db, typeKey), orderBy("order", "asc"));
    const snap = await getDocs(q);
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    document.getElementById("listArea").innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icons.warn}</div><p>লোড করতে সমস্যা হয়েছে।</p></div>`;
    return;
  }

  document.getElementById("addItemBtn").addEventListener("click", () => openContentForm(typeKey, null, items));
  document.getElementById("listArea").innerHTML = items.length
    ? contentTableHtml(typeKey, type, items)
    : `<div class="empty-state"><div class="empty-state-icon">${icon(type.icon)}</div><p>এখনো কোনো ${type.singular} যোগ করা হয়নি — উপরের বাটনে ক্লিক করে শুরু করুন।</p></div>`;
  bindContentListEvents(typeKey, items);
}

function mediaThumb(it) {
  const url = it.imageUrl || it.avatarUrl;
  return url
    ? `<img class="admin-thumb" src="${escapeHtml(url)}" alt="">`
    : `<div class="admin-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--text-faint);">${icons.image}</div>`;
}

function contentTableHtml(typeKey, type, items) {
  const hasMedia = type.fields.some((f) => f.key === "imageUrl" || f.key === "avatarUrl");
  const rows = items.map((it, i) => `
    <tr class="row-clickable" data-id="${it.id}">
      ${hasMedia ? `<td>${mediaThumb(it)}</td>` : ""}
      <td><div class="cell-title">${escapeHtml(String(it[type.titleField] ?? ""))}</div><div class="cell-muted">${escapeHtml(String(it[type.subField] ?? "")).slice(0, 60)}</div></td>
      <td>
        <div class="admin-row-order">
          <button data-move="up" data-idx="${i}" ${i === 0 ? "disabled" : ""} aria-label="উপরে সরান">${icons.up}</button>
          <button data-move="down" data-idx="${i}" ${i === items.length - 1 ? "disabled" : ""} aria-label="নিচে সরান">${icons.down}</button>
        </div>
      </td>
      <td class="cell-actions">
        <button class="btn btn-outline btn-icon" data-edit="${it.id}" aria-label="এডিট">${icons.edit}</button>
        <button class="btn btn-danger-ghost btn-icon" data-del="${it.id}" aria-label="মুছুন">${icons.trash}</button>
      </td>
    </tr>`).join("");

  const cards = items.map((it, i) => `
    <div class="admin-list-card" data-id="${it.id}">
      <div class="admin-list-card-top">
        <b>${escapeHtml(String(it[type.titleField] ?? ""))}</b>
        <div class="admin-row-order">
          <button data-move="up" data-idx="${i}" ${i === 0 ? "disabled" : ""}>${icons.up}</button>
          <button data-move="down" data-idx="${i}" ${i === items.length - 1 ? "disabled" : ""}>${icons.down}</button>
        </div>
      </div>
      <p>${escapeHtml(String(it[type.subField] ?? "")).slice(0, 80)}</p>
      <div class="cell-actions">
        <button class="btn btn-outline btn-sm" data-edit="${it.id}">${icons.edit} এডিট</button>
        <button class="btn btn-danger-ghost btn-sm" data-del="${it.id}">${icons.trash} মুছুন</button>
      </div>
    </div>`).join("");

  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>
      ${hasMedia ? "<th></th>" : ""}<th>${type.singular}</th><th>ক্রম</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <div class="admin-mobile-list">${cards}</div>`;
}

function bindContentListEvents(typeKey, items) {
  const type = CONTENT_TYPES[typeKey];
  const area = document.getElementById("listArea");
  area.addEventListener("click", (e) => {
    const moveBtn = e.target.closest("[data-move]");
    if (moveBtn) { e.stopPropagation(); moveItem(typeKey, items, Number(moveBtn.dataset.idx), moveBtn.dataset.move === "up" ? -1 : 1); return; }
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) { e.stopPropagation(); openContentForm(typeKey, items.find((x) => x.id === editBtn.dataset.edit), items); return; }
    const delBtn = e.target.closest("[data-del]");
    if (delBtn) {
      e.stopPropagation();
      const it = items.find((x) => x.id === delBtn.dataset.del);
      confirmAction(`"${escapeHtml(String(it[type.titleField] || ""))}" মুছে ফেলতে চান? এই কাজ আর ফেরানো যাবে না।`, async () => {
        try {
          await deleteDoc(doc(db, typeKey, it.id));
          showToast(`${type.singular} মুছে ফেলা হয়েছে।`);
          renderContentList(document.getElementById("page"), typeKey);
        } catch (err) {
          console.error(err);
          showToast("মুছতে সমস্যা হয়েছে।", "error");
        }
      });
      return;
    }
    const row = e.target.closest("tr[data-id], .admin-list-card[data-id]");
    if (row) openContentForm(typeKey, items.find((x) => x.id === row.dataset.id), items);
  });
}

async function moveItem(typeKey, items, index, dir) {
  const j = index + dir;
  if (j < 0 || j >= items.length) return;
  const a = items[index], b = items[j];
  try {
    await updateDoc(doc(db, typeKey, a.id), { order: b.order });
    await updateDoc(doc(db, typeKey, b.id), { order: a.order });
    renderContentList(document.getElementById("page"), typeKey);
  } catch (err) {
    console.error(err);
    showToast("ক্রম পরিবর্তন করতে সমস্যা হয়েছে।", "error");
  }
}

function renderField(field, value) {
  const val = value === undefined || value === null ? (field.type === "checkbox" ? false : "") : value;
  if (field.type === "icon") {
    const current = val || serviceIconChoices[0];
    return `<div class="field field-full">
      <label>${field.label}</label>
      <input type="hidden" id="iconField_${field.key}" name="${field.key}" value="${escapeHtml(current)}">
      <div class="icon-picker" data-target="iconField_${field.key}">
        ${serviceIconChoices.map((name) => `<button type="button" data-icon="${name}" class="${name === current ? "active" : ""}" title="${name}">${icon(name)}</button>`).join("")}
      </div>
    </div>`;
  }
  if (field.type === "textarea") {
    return `<div class="field ${field.full ? "field-full" : ""}"><label>${field.label}</label><textarea name="${field.key}" rows="${field.rows || 3}" ${field.required ? "required" : ""}>${escapeHtml(val)}</textarea></div>`;
  }
  if (field.type === "select") {
    return `<div class="field ${field.full ? "field-full" : ""}"><label>${field.label}</label><select name="${field.key}">${field.options.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === val ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select></div>`;
  }
  if (field.type === "checkbox") {
    return `<div class="field-checkbox field-full"><input type="checkbox" id="f_${field.key}" name="${field.key}" ${val ? "checked" : ""}><label for="f_${field.key}">${escapeHtml(field.label)}</label></div>`;
  }
  if (field.type === "lines") {
    const text = Array.isArray(val) ? val.join("\n") : "";
    return `<div class="field field-full"><label>${field.label}</label><textarea name="${field.key}" rows="${field.rows || 4}">${escapeHtml(text)}</textarea><div class="field-hint">${field.hint || "প্রতি লাইনে একটা আইটেম লিখুন"}</div></div>`;
  }
  if (field.type === "number") {
    return `<div class="field ${field.full ? "field-full" : ""}"><label>${field.label}</label><input type="number" step="any" name="${field.key}" value="${val === "" ? "" : Number(val)}" ${field.required ? "required" : ""}></div>`;
  }
  if (field.type === "url") {
    return `<div class="field ${field.full ? "field-full" : ""}"><label>${field.label}</label><input type="url" name="${field.key}" value="${escapeHtml(val)}" placeholder="https://..." data-preview="${field.key}">
      <div class="img-preview-row" id="preview_${field.key}" style="${val ? "" : "display:none;"}"><img class="img-preview" src="${escapeHtml(val)}" id="previewImg_${field.key}" alt=""><span class="field-hint">ছবির প্রিভিউ</span></div>
    </div>`;
  }
  return `<div class="field ${field.full ? "field-full" : ""}"><label>${field.label}</label><input type="text" name="${field.key}" value="${escapeHtml(val)}" ${field.required ? "required" : ""}></div>`;
}

function openContentForm(typeKey, existing, items) {
  const type = CONTENT_TYPES[typeKey];
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-overlay open">
      <div class="modal modal-wide">
        <div class="modal-head">
          <h3>${existing ? `${type.singular} এডিট করুন` : `নতুন ${type.singular}`}</h3>
          <button class="modal-close" id="cfClose">${icons.close}</button>
        </div>
        <form id="contentForm">
          <div class="form-grid">${type.fields.map((f) => renderField(f, existing ? existing[f.key] : undefined)).join("")}</div>
          <div class="form-actions">
            <span></span>
            <div style="display:flex;gap:10px;">
              <button type="button" class="btn btn-ghost" id="cfCancel">বাতিল</button>
              <button type="submit" class="btn btn-primary">সংরক্ষণ করুন</button>
            </div>
          </div>
        </form>
      </div>
    </div>`;
  bindOverlayClose(root);

  const form = document.getElementById("contentForm");
  document.getElementById("cfClose").onclick = closeModal;
  document.getElementById("cfCancel").onclick = closeModal;

  form.querySelectorAll(".icon-picker").forEach((picker) => {
    const target = document.getElementById(picker.dataset.target);
    picker.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        picker.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        target.value = btn.dataset.icon;
      });
    });
  });

  form.querySelectorAll("input[data-preview]").forEach((inp) => {
    inp.addEventListener("input", debounce(() => {
      const wrap = document.getElementById("preview_" + inp.dataset.preview);
      const img = document.getElementById("previewImg_" + inp.dataset.preview);
      if (inp.value) { img.src = inp.value; wrap.style.display = "flex"; }
      else { wrap.style.display = "none"; }
    }, 400));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {};
    type.fields.forEach((f) => {
      if (f.type === "checkbox") data[f.key] = fd.has(f.key);
      else if (f.type === "number") data[f.key] = Number(fd.get(f.key)) || 0;
      else if (f.type === "lines") data[f.key] = String(fd.get(f.key) || "").split("\n").map((s) => s.trim()).filter(Boolean);
      else data[f.key] = String(fd.get(f.key) || "").trim();
    });
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      if (existing) {
        await updateDoc(doc(db, typeKey, existing.id), data);
        showToast(`${type.singular} আপডেট হয়েছে।`);
      } else {
        const nextOrder = items.length ? Math.max(...items.map((x) => Number(x.order) || 0)) + 1 : 1;
        data.order = nextOrder;
        await addDoc(collection(db, typeKey), data);
        showToast(`নতুন ${type.singular} যোগ হয়েছে।`);
      }
      closeModal();
      renderContentList(document.getElementById("page"), typeKey);
    } catch (err) {
      console.error(err);
      showToast("সংরক্ষণ করতে সমস্যা হয়েছে।", "error");
      btn.disabled = false;
    }
  });
}
