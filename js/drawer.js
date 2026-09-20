// js/drawer.js
// প্রোফাইল স্লাইডার — হেডারের অ্যাভাটার (বা মোবাইলের ☰) ট্যাপ করলে ডান দিক থেকে স্লাইড করে ঢোকে।
//
// ভেতরে একটা ছোট "প্যানেল স্ট্যাক" আছে:
//   profile  → অনুমোদিত মকআপ অনুযায়ী প্রোফাইল (অ্যাভাটার, Edit profile / Code / Course, স্ট্যাটস, রো)
//   about / projects / account / edit → প্রোফাইল থেকে ঢোকা সাব-প্যানেল
//   menu     → সাইটের মেনু (সেকশন লিংক, অন্য সাইট, থিম) — লগইন না থাকলে এটাই রুট
//
// ব্রাউজারের Back বাটন (আর অ্যান্ড্রয়েডের ব্যাক জেসচার) স্ট্যাকের সাথে মেলানো: history.state.tvDrawer = গভীরতা।
// তাই PWA-তে Back চাপলে অ্যাপ থেকে বেরিয়ে না গিয়ে আগে স্লাইডার/সাব-প্যানেল বন্ধ হয়।

import { icons, icon } from "./icons.js";
import { avatarOrLetter } from "./templates.js";
import { escapeHtml as esc, formatDate, formatDay, statusClass, safeUrl, pickAvatar, providerLabel } from "./utils.js";
import { db } from "./firebase-config.js";
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { saveUserProfile, logout, resetPassword, sendVerification, isAdminProfile, friendlyAuthError } from "./auth.js";
import { showToast } from "./toast.js";
import { getThemePref, setThemePref, onThemeChange } from "./theme.js";
import { lockScroll, unlockScroll } from "./scrolllock.js";

const TITLES = {
  profile: "Profile",
  menu: "Menu",
  about: "About",
  projects: "My Project",
  account: "Account Setting",
  edit: "Edit profile"
};

const NAV_ICONS = {
  home: "home", services: "layout", portfolio: "globe", pricing: "target", team: "users", faq: "message", booking: "mail"
};

const chev = () => icons.chevronRight.replace("<svg", '<svg class="chev"');
const isActiveBooking = (b) => b.status !== "সম্পন্ন" && b.status !== "বাতিল";

/** ছবি → মাঝখান থেকে বর্গাকারে কেটে ২৫৬×২৫৬ JPEG (সাধারণত ২০–৩০KB) — Firestore ডকুমেন্টে নিরাপদে ঢোকে */
async function fileToAvatarData(file, size = 256) {
  const img = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad-image")); };
    el.src = url;
  });
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error("bad-image");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff"; // স্বচ্ছ PNG-র পেছনে সাদা
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
  let q = 0.86;
  let data = canvas.toDataURL("image/jpeg", q);
  while (data.length > 120000 && q > 0.5) { q -= 0.1; data = canvas.toDataURL("image/jpeg", q); }
  return data;
}

export function createDrawer(opts = {}) {
  const state = {
    open: false,
    user: null,
    profile: null,
    settings: {},
    bookings: [],
    bookingsState: "idle", // idle | loading | ready | error
    bookingsError: "",
    bookingsAt: 0,
    filter: "all", // all | active | done
    stack: [],
    lastFocus: null,
    navigating: false,
    pending: []
  };

  /* ---------------------------------------------------------------- DOM */
  const mount = document.createElement("div");
  mount.innerHTML = `
    <div class="dr-scrim" id="drScrim"></div>
    <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="drTitle" aria-hidden="true" inert>
      <header class="dr-head">
        <button type="button" class="dr-iconbtn" id="drBack" aria-label="বন্ধ করুন">${icons.chevronLeft}</button>
        <h2 class="dr-title" id="drTitle" lang="en">Profile</h2>
        <button type="button" class="dr-iconbtn is-boxed" id="drMenu" aria-label="সাইট মেনু">${icons.menu}</button>
      </header>
      <div class="dr-body">
        ${Object.keys(TITLES).map((n) => `<section class="dr-panel" data-panel="${n}" tabindex="-1" aria-hidden="true" inert></section>`).join("")}
      </div>
    </aside>
    <input type="file" id="drPhotoInput" accept="image/*" hidden>`;
  while (mount.firstChild) document.body.appendChild(mount.firstChild);

  const drawerEl = document.getElementById("drawer");
  const scrimEl = document.getElementById("drScrim");
  const titleEl = document.getElementById("drTitle");
  const backBtn = document.getElementById("drBack");
  const menuBtn = document.getElementById("drMenu");
  const photoInput = document.getElementById("drPhotoInput");
  const panels = {};
  drawerEl.querySelectorAll(".dr-panel").forEach((el) => { panels[el.dataset.panel] = el; });

  // পেজ রিলোডের পর history.state-এ পুরোনো tvDrawer থেকে গেলে সেটা পরিষ্কার
  if (history.state && history.state.tvDrawer) { try { history.replaceState(null, ""); } catch (_) {} }

  const current = () => state.stack[state.stack.length - 1];

  /* ------------------------------------------------------------ helpers */
  function displayName() {
    return (state.user && state.user.displayName) || (state.profile && state.profile.name) || "";
  }
  function avatarUrl() { return pickAvatar(state.user, state.profile); }

  function counts() {
    const list = state.bookings;
    const done = list.filter((b) => b.status === "সম্পন্ন").length;
    const cancelled = list.filter((b) => b.status === "বাতিল").length;
    return { total: list.length, done, active: list.length - done - cancelled };
  }

  function externalUrl(which) {
    return safeUrl(state.settings[which === "code" ? "codeUrl" : "courseUrl"]);
  }

  function themeSeg() {
    const pref = getThemePref();
    const items = [["system", "সিস্টেম", icons.monitor], ["light", "লাইট", icons.sun], ["dark", "ডার্ক", icons.moon]];
    return `<div class="dr-seg" role="group" aria-label="থিম">${items
      .map(([k, l, i]) => `<button type="button" data-theme-pref="${k}" aria-pressed="${pref === k}">${i}${l}</button>`)
      .join("")}</div>`;
  }

  function infoRow(tone, iconHtml, label, value, end = "") {
    return `<div class="dr-info tone-${tone}"><span class="ico">${iconHtml}</span><div class="txt"><small>${label}</small><b>${esc(value)}</b></div>${end ? `<span class="end">${end}</span>` : ""}</div>`;
  }

  /* -------------------------------------------------------- panel: profile */
  function actionLink(which, iconHtml, label) {
    const url = externalUrl(which);
    return url
      ? `<a class="dr-act" lang="en" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${iconHtml}${label}</a>`
      : `<button type="button" class="dr-act" lang="en" data-act="link-missing" data-which="${which}">${iconHtml}${label}</button>`;
  }

  function statTile(kind, tone, iconHtml, num, label, bn) {
    const ready = state.bookingsState === "ready";
    const shown = ready ? String(num) : state.bookingsState === "error" ? "!" : "–";
    return `<button type="button" class="dr-stat tone-${tone}" data-stat="${kind}" aria-label="${label} (${bn}): ${shown}">
      <span class="ico">${iconHtml}</span>
      <span class="num${ready ? "" : " is-loading"}">${shown}</span>
      <span class="lbl" lang="en">${label}</span>
      <span class="lbl-bn">${bn}</span>
    </button>`;
  }

  function profileHtml() {
    const u = state.user;
    const name = displayName() || "নাম দেওয়া হয়নি";
    const url = avatarUrl();
    const c = counts();
    return `
      <div class="dr-hero">
        <button type="button" class="dr-avatar" data-act="photo" aria-label="প্রোফাইল ছবি ${url ? "পরিবর্তন" : "যোগ"} করুন">
          ${url ? `<img src="${esc(url)}" alt=""><span class="dr-cam">${icons.camera}</span>` : `${icons.camera}<span lang="en">Photo</span>`}
        </button>
        ${isAdminProfile(state.profile) ? `<a class="dr-admin" href="./admin.html" aria-label="Admin">${icons.gear}<span>Admin</span></a>` : ""}
        <h3 class="dr-name">${esc(name)}</h3>
        <p class="dr-email">${esc(u.email || "")}</p>
      </div>
      <div class="dr-actions">
        <button type="button" class="dr-act" data-go="edit" lang="en">${icons.pencil}Edit profile</button>
        ${actionLink("code", icons.code, "Code")}
        ${actionLink("course", icons.cap, "Course")}
      </div>
      <div class="dr-stats">
        ${statTile("all", "mint", icons.bars, c.total, "Total", "মোট অনুরোধ")}
        ${statTile("active", "blue", icons.play, c.active, "Ongoing", "চলমান")}
        ${statTile("done", "violet", icons.checkDisc, c.done, "Ended", "সম্পন্ন")}
      </div>
      <div class="dr-rows">
        <button type="button" class="dr-row tone-blue" data-go="about">
          <span class="ico">${icons.userFill}</span>
          <span class="txt"><b lang="en">About</b><small>আমার সম্পর্কে জানুন</small></span>${chev()}
        </button>
        <button type="button" class="dr-row tone-slate" data-go="projects">
          <span class="ico">${icons.code}</span>
          <span class="txt"><b lang="en">My Project</b><small>আমার প্রজেক্ট ও অনুরোধ</small></span>${chev()}
        </button>
        <button type="button" class="dr-row tone-violet" data-go="account">
          <span class="ico">${icons.shieldCheck}</span>
          <span class="txt"><b lang="en">Account Setting</b><small>নিরাপত্তা, থিম ও লগ আউট</small></span>${chev()}
        </button>
      </div>`;
  }

  /* --------------------------------------------------------- panel: about */
  function aboutHtml() {
    const u = state.user;
    const p = state.profile || {};
    const name = displayName() || "নাম দেওয়া হয়নি";
    const bio = (p.bio || "").trim();
    const provider = (u.providerData || []).map((x) => providerLabel(x.providerId)).join(", ") || "—";
    const member = p.createdAt || (u.metadata && u.metadata.creationTime);
    const verified = u.emailVerified
      ? `<span class="dr-pill tone-mint">যাচাই করা</span>`
      : `<span class="dr-pill tone-slate">যাচাই হয়নি</span>`;
    return `
      <div class="dr-about-head">
        <div class="dr-about-av">${avatarOrLetter(avatarUrl(), name || u.email)}</div>
        <div class="who">
          <h3>${esc(name)}</h3>
          <p>${esc(u.email || "")}</p>
          ${isAdminProfile(state.profile) ? `<span class="role-badge">${icons.shieldCheck}অ্যাডমিন</span>` : ""}
        </div>
      </div>
      <div class="dr-card pad dr-bio-card">
        ${bio ? `<p>${esc(bio)}</p>` : `<p class="empty">নিজের সম্পর্কে এখনো কিছু লেখা হয়নি।</p>`}
        <button type="button" class="btn btn-soft btn-sm" data-go="edit">${icons.pencil}${bio ? "বদলান" : "লিখুন"}</button>
      </div>
      <div class="dr-group-title">অ্যাকাউন্টের তথ্য</div>
      <div class="dr-card">
        ${infoRow("blue", icons.mail, "ইমেইল", u.email || "—", verified)}
        ${infoRow("mint", icons.phone, "ফোন", p.phone || "যোগ করা হয়নি")}
        ${infoRow("violet", icons.key, "লগইন পদ্ধতি", provider)}
        ${infoRow("slate", icons.calendar, "সদস্য হয়েছেন", formatDay(member))}
      </div>`;
  }

  /* ------------------------------------------------------ panel: projects */
  function bookingHtml(b) {
    const cls = statusClass(b.status);
    const rows = [["বাজেট", b.budget], ["সময়সীমা", b.timeline], ["ফোন", b.phone], ["জমা দেওয়া", formatDate(b.createdAt)]]
      .filter(([, v]) => v && v !== "—");
    const sub = [formatDay(b.createdAt), b.budget].filter((v) => v && v !== "—").join(" · ");
    return `
      <details class="bk ${cls}">
        <summary>
          <span class="bk-ico">${icons.code}</span>
          <span class="bk-main"><b>${esc(b.service || "প্রজেক্ট অনুরোধ")}</b><small>${esc(sub)}</small></span>
          <span class="status-badge ${cls}">${esc(b.status || "নতুন")}</span>
          ${chev().replace('class="chev"', 'class="chev bk-chev"')}
        </summary>
        <div class="bk-body">
          <dl class="bk-kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
          ${b.details ? `<p class="bk-details">${esc(b.details)}</p>` : ""}
        </div>
      </details>`;
  }

  function projectsHtml() {
    const s = state.bookingsState;
    if (s === "idle" || s === "loading") {
      return [72, 72, 72].map(() => `<div class="skel-card" style="margin-bottom:10px;padding:18px"><div class="skel skel-row" style="width:55%"></div><div class="skel skel-row" style="width:80%"></div></div>`).join("");
    }
    if (s === "error") {
      return `<div class="dr-empty"><div class="empty-state-icon">${icons.warn}</div><p>${esc(state.bookingsError)}</p><button type="button" class="btn btn-soft btn-sm" data-act="reload-bookings">আবার চেষ্টা করুন</button></div>`;
    }
    const startBtn = `<div class="dr-cta"><button type="button" class="btn btn-primary btn-block" data-act="start">${icons.plus}নতুন প্রজেক্ট শুরু করুন</button></div>`;
    if (!state.bookings.length) {
      return `<div class="dr-empty"><div class="empty-state-icon">${icons.inbox}</div><p>এখনো কোনো প্রজেক্ট অনুরোধ জমা দেননি।</p></div>${startBtn}`;
    }
    const c = counts();
    const list = state.bookings.filter((b) => (state.filter === "all" ? true : state.filter === "active" ? isActiveBooking(b) : b.status === "সম্পন্ন"));
    const chips = [["all", "সব", c.total], ["active", "চলমান", c.active], ["done", "সম্পন্ন", c.done]]
      .map(([k, l, n]) => `<button type="button" class="chip${state.filter === k ? " active" : ""}" data-filter="${k}" aria-pressed="${state.filter === k}">${l}<small>${n}</small></button>`)
      .join("");
    return `<div class="dr-filters" role="group" aria-label="ফিল্টার">${chips}</div>
      ${list.length ? list.map(bookingHtml).join("") : `<div class="dr-empty"><p>এই ফিল্টারে কোনো অনুরোধ নেই।</p></div>`}
      ${startBtn}`;
  }

  /* ------------------------------------------------------- panel: account */
  function accountHtml() {
    const u = state.user;
    const usesPassword = (u.providerData || []).some((x) => x.providerId === "password");
    return `
      <div class="dr-group-title">নিরাপত্তা</div>
      <div class="dr-card">
        <div class="dr-info tone-${u.emailVerified ? "mint" : "slate"}">
          <span class="ico">${icons.mail}</span>
          <div class="txt"><small>ইমেইল যাচাই</small><b>${u.emailVerified ? "যাচাই করা হয়েছে" : "এখনো যাচাই হয়নি"}</b></div>
          ${u.emailVerified ? "" : `<button type="button" class="btn btn-soft btn-sm end" data-act="verify">লিংক পাঠান</button>`}
        </div>
        ${usesPassword ? `<div class="dr-info tone-violet">
          <span class="ico">${icons.key}</span>
          <div class="txt"><small>পাসওয়ার্ড</small><b>রিসেট লিংক ইমেইলে পাঠান</b></div>
          <button type="button" class="btn btn-soft btn-sm end" data-act="reset">পাঠান</button>
        </div>` : ""}
      </div>
      <div class="dr-group-title">থিম</div>
      <div class="dr-card pad">${themeSeg()}</div>
      <div class="dr-group-title">সেশন</div>
      <div class="dr-card tight">
        <button type="button" class="dr-link is-danger" data-act="logout"><span class="ico">${icons.logout}</span><span class="t">লগ আউট</span></button>
      </div>`;
  }

  /* --------------------------------------------------------- panel: edit */
  function editPhotoHtml() {
    const url = avatarUrl();
    const hasCustom = !!(state.profile && state.profile.avatarData);
    return `
      <button type="button" class="dr-avatar sm" data-act="photo" aria-label="প্রোফাইল ছবি ${url ? "পরিবর্তন" : "যোগ"} করুন">
        ${url ? `<img src="${esc(url)}" alt="">` : `${icons.camera}<span>Photo</span>`}
      </button>
      <div class="txt">
        <b>প্রোফাইল ছবি</b>
        <small>ছবি নিজে থেকেই ছোট করে সংরক্ষণ হবে।</small>
        <div class="row">
          <button type="button" class="btn btn-soft btn-sm" data-act="photo">${url ? "ছবি বদলান" : "ছবি বেছে নিন"}</button>
          ${hasCustom ? `<button type="button" class="btn btn-ghost btn-sm" data-act="photo-remove">সরিয়ে দিন</button>` : ""}
        </div>
      </div>`;
  }

  function editHtml() {
    const p = state.profile || {};
    return `
      <form class="dr-form" id="drEditForm" novalidate>
        <div class="dr-edit-photo" id="drEditPhoto">${editPhotoHtml()}</div>
        <div class="field" id="drNameField">
          <label for="drName">নাম</label>
          <input id="drName" type="text" maxlength="60" autocomplete="name" value="${esc(displayName())}">
          <div class="field-error">নাম লিখুন।</div>
        </div>
        <div class="field">
          <label for="drPhone">ফোন নম্বর</label>
          <input id="drPhone" type="tel" maxlength="20" autocomplete="tel" placeholder="01XXXXXXXXX" value="${esc(p.phone || "")}">
        </div>
        <div class="field">
          <label for="drBio">নিজের সম্পর্কে</label>
          <textarea id="drBio" rows="4" maxlength="200" placeholder="নিজের সম্পর্কে দু-এক লাইন লিখুন…">${esc(p.bio || "")}</textarea>
          <div class="dr-counter"><span id="drBioCount">${(p.bio || "").length}</span>/200</div>
        </div>
        <button type="submit" class="btn btn-primary btn-lg btn-block" id="drSave">সংরক্ষণ করুন</button>
      </form>`;
  }

  /* --------------------------------------------------------- panel: menu */
  function menuHtml() {
    const u = state.user;
    const top = u
      ? `<button type="button" class="dr-me" data-go="profile">
           <span class="av">${avatarOrLetter(avatarUrl(), displayName() || u.email)}</span>
           <span class="txt"><b>${esc(displayName() || "প্রোফাইল")}</b><small>${esc(u.email || "")}</small></span>${chev()}
         </button>`
      : `<div class="dr-guest">
           <div class="ico">${icons.user}</div>
           <h3>স্বাগতম!</h3>
           <p>লগইন করলে আপনার প্রজেক্ট অনুরোধ, প্রোফাইল ও অ্যাকাউন্ট এক জায়গায় দেখতে পারবেন।</p>
           <div class="btns">
             <button type="button" class="btn btn-primary" data-open-auth="login">লগইন</button>
             <button type="button" class="btn btn-outline" data-open-auth="signup">সাইন আপ</button>
           </div>
         </div>`;

    const navLinks = [...document.querySelectorAll("#navLinks a[href^='#']")].map((a) => ({
      id: a.getAttribute("href").slice(1), label: a.textContent.trim()
    }));
    const links = [{ id: "home", label: "হোম" }, ...navLinks]
      .map((l) => `<a class="dr-link tone-slate" href="#${esc(l.id)}" data-scroll="#${esc(l.id)}"><span class="ico">${icon(NAV_ICONS[l.id])}</span><span class="t">${esc(l.label)}</span>${chev()}</a>`)
      .join("");

    const site = (which, tone, iconHtml, label) => {
      const url = externalUrl(which);
      const ext = icons.external.replace("<svg", '<svg class="chev"');
      return url
        ? `<a class="dr-link tone-${tone}" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span class="ico">${iconHtml}</span><span class="t">${label}</span>${ext}</a>`
        : `<button type="button" class="dr-link tone-${tone}" data-act="link-missing" data-which="${which}"><span class="ico">${iconHtml}</span><span class="t">${label}</span>${ext}</button>`;
    };

    return `${top}
      <div class="dr-group-title">এই সাইট</div>
      <div class="dr-card tight"><div class="dr-links">${links}</div></div>
      <div class="dr-group-title">আমাদের অন্য সাইট</div>
      <div class="dr-card tight"><div class="dr-links">
        ${site("code", "blue", icons.code, "Code")}
        ${site("course", "violet", icons.cap, "Course")}
      </div></div>
      <div class="dr-group-title">থিম</div>
      <div class="dr-card pad">${themeSeg()}</div>`;
  }

  /* ------------------------------------------------------------ rendering */
  function render(name, html) { if (panels[name]) panels[name].innerHTML = html; }
  function renderProfile() { if (state.user) render("profile", profileHtml()); }
  function renderAbout() { if (state.user) render("about", aboutHtml()); }
  function renderProjects() { if (state.user) render("projects", projectsHtml()); }
  function renderAccount() { if (state.user) render("account", accountHtml()); }
  function renderMenu() { render("menu", menuHtml()); }
  function renderEdit() { if (state.user) render("edit", editHtml()); }
  function renderEditPhoto() {
    const box = document.getElementById("drEditPhoto");
    if (box) box.innerHTML = editPhotoHtml();
  }
  function renderAll() {
    renderProfile(); renderAbout(); renderProjects(); renderAccount(); renderMenu();
  }

  /* ------------------------------------------------------- stack & history */
  function applyStack(animate) {
    const top = current();
    Object.entries(panels).forEach(([name, el]) => {
      const idx = state.stack.indexOf(name);
      const active = name === top;
      el.classList.toggle("no-anim", !animate);
      el.classList.toggle("is-active", active);
      el.classList.toggle("is-behind", idx > -1 && !active);
      el.inert = !active;
      el.setAttribute("aria-hidden", active ? "false" : "true");
    });
    if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => Object.values(panels).forEach((el) => el.classList.remove("no-anim"))));
    titleEl.textContent = TITLES[top] || "";
    backBtn.setAttribute("aria-label", state.stack.length > 1 ? "ফিরে যান" : "বন্ধ করুন");
    menuBtn.classList.toggle("is-off", !state.user || top === "menu");
    menuBtn.disabled = !state.user || top === "menu";
  }

  function pushEntry() {
    try { history.pushState({ tvDrawer: state.stack.length }, ""); } catch (_) {}
  }

  function afterHistory(fn) {
    if (state.navigating) state.pending.push(fn); else fn();
  }
  function flushPending() {
    state.pending.splice(0).forEach((fn) => fn());
  }
  function travel(n) {
    // n ধাপ পেছনে — history.go একটাই popstate ফায়ার করে
    state.navigating = true;
    history.go(-n);
    setTimeout(() => { if (state.navigating) { state.navigating = false; flushPending(); } }, 400); // নিরাপত্তা-জাল
  }

  function go(name) {
    if (!state.open || !panels[name]) return;
    if (name !== "menu" && !state.user) return;
    const idx = state.stack.indexOf(name);
    if (idx === state.stack.length - 1) return;
    if (idx > -1) { backBy(state.stack.length - 1 - idx); return; }
    if (name === "edit") renderEdit();
    state.stack.push(name);
    pushEntry();
    applyStack(true);
    panels[name].scrollTop = 0;
    panels[name].focus({ preventScroll: true });
  }

  function backBy(n) {
    if (n <= 0) return;
    if (history.state && history.state.tvDrawer) travel(n);
    else { state.stack.length = Math.max(1, state.stack.length - n); applyStack(true); }
  }

  function back() {
    if (state.stack.length > 1) backBy(1); else close();
  }

  function hide() {
    if (!state.open) return;
    state.open = false;
    drawerEl.classList.remove("is-open");
    scrimEl.classList.remove("is-open");
    drawerEl.setAttribute("aria-hidden", "true");
    drawerEl.inert = true;
    unlockScroll();
    state.stack = [];
    const f = state.lastFocus;
    state.lastFocus = null;
    if (f && document.contains(f) && typeof f.focus === "function") setTimeout(() => f.focus({ preventScroll: true }), 0);
  }

  function open(panel) {
    const want = state.user ? (panel && TITLES[panel] ? panel : "profile") : "menu";
    if (state.open) { go(want); return; }
    afterHistory(() => {
      state.lastFocus = document.activeElement;
      state.open = true;
      state.stack = [want];
      renderAll();
      if (want === "edit") renderEdit();
      applyStack(false);
      pushEntry();
      drawerEl.inert = false;
      drawerEl.removeAttribute("aria-hidden");
      lockScroll();
      requestAnimationFrame(() => {
        drawerEl.classList.add("is-open");
        scrimEl.classList.add("is-open");
      });
      if (state.user) loadBookings();
      setTimeout(() => backBtn.focus({ preventScroll: true }), 80);
    });
  }

  function close() {
    if (!state.open) return;
    const depth = (history.state && history.state.tvDrawer) || 0;
    hide();
    if (depth > 0) travel(depth);
  }

  window.addEventListener("popstate", () => {
    const depth = (history.state && history.state.tvDrawer) || 0;
    state.navigating = false;
    if (!state.open) {
      if (depth) { try { history.replaceState(null, ""); } catch (_) {} } // Forward দিয়ে পুরোনো এন্ট্রিতে গেলে সেটা নিষ্ক্রিয়
    } else if (depth === 0) {
      hide();
    } else if (depth < state.stack.length) {
      state.stack.length = depth;
      applyStack(true);
    } else if (depth > state.stack.length) {
      try { history.replaceState(null, ""); } catch (_) {}
    }
    flushPending();
  });

  /* --------------------------------------------------------------- data */
  async function loadBookings(force = false) {
    const user = state.user;
    if (!user || state.bookingsState === "loading") return;
    if (!force && state.bookingsState === "ready" && Date.now() - state.bookingsAt < 60000) return;
    state.bookingsState = "loading";
    renderProfile(); renderProjects();
    try {
      const q = query(collection(db, "bookings"), where("uid", "==", user.uid), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      if (state.user !== user) return;
      state.bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.bookingsState = "ready";
      state.bookingsAt = Date.now();
    } catch (err) {
      if (state.user !== user) return;
      console.error("Bookings load failed:", err);
      state.bookingsState = "error";
      state.bookingsError = err && err.code === "permission-denied"
        ? "Firestore Security Rules আপডেট করা হয়নি — বুকিং দেখার অনুমতি নেই। README-র ধাপ ২ দেখুন।"
        : err && err.code === "failed-precondition"
          ? "Firestore-এ প্রয়োজনীয় কম্পোজিট ইনডেক্স তৈরি হয়নি। README-র ধাপ ৩ দেখুন।"
          : "অনুরোধের তালিকা লোড করা যায়নি — ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।";
    }
    renderProfile(); renderProjects();
  }

  async function handlePhotoFile(file) {
    const user = state.user;
    if (!file || !user) return;
    if (!/^image\//.test(file.type)) { showToast("অনুগ্রহ করে একটি ছবি বেছে নিন।", "error"); return; }
    if (file.size > 12 * 1024 * 1024) { showToast("ছবিটি অনেক বড় (১২ MB-এর বেশি) — ছোট একটি ছবি বেছে নিন।", "error"); return; }
    const avatars = drawerEl.querySelectorAll(".dr-avatar");
    avatars.forEach((a) => a.classList.add("is-busy"));
    try {
      const data = await fileToAvatarData(file);
      await saveUserProfile(user.uid, { avatarData: data });
      state.profile = { ...(state.profile || {}), avatarData: data };
      profileChanged();
      showToast("প্রোফাইল ছবি আপডেট হয়েছে।");
    } catch (err) {
      console.error("Avatar save failed:", err);
      showToast("ছবি সংরক্ষণ করা যায়নি — আবার চেষ্টা করুন।", "error");
    } finally {
      drawerEl.querySelectorAll(".dr-avatar").forEach((a) => a.classList.remove("is-busy"));
    }
  }

  async function removePhoto() {
    const user = state.user;
    if (!user) return;
    try {
      await saveUserProfile(user.uid, { avatarData: "" });
      state.profile = { ...(state.profile || {}), avatarData: "" };
      profileChanged();
      showToast("প্রোফাইল ছবি সরানো হয়েছে।");
    } catch (err) {
      console.error(err);
      showToast("ছবি সরানো যায়নি — আবার চেষ্টা করুন।", "error");
    }
  }

  async function submitEdit(form) {
    const user = state.user;
    if (!user) return;
    const nameInput = form.querySelector("#drName");
    const name = nameInput.value.trim();
    const phone = form.querySelector("#drPhone").value.trim();
    const bio = form.querySelector("#drBio").value.trim();
    const nameField = form.querySelector("#drNameField");
    nameField.classList.toggle("has-error", !name);
    if (!name) { nameInput.focus(); return; }
    const btn = form.querySelector("#drSave");
    btn.disabled = true;
    btn.textContent = "সংরক্ষণ হচ্ছে…";
    try {
      await saveUserProfile(user.uid, { name, phone, bio });
      state.profile = { ...(state.profile || {}), name, phone, bio };
      profileChanged(false);
      showToast("প্রোফাইল সংরক্ষণ হয়েছে।");
      back();
    } catch (err) {
      console.error("Profile save failed:", err);
      showToast("প্রোফাইল সংরক্ষণ করা যায়নি — আবার চেষ্টা করুন।", "error");
      btn.disabled = false;
      btn.textContent = "সংরক্ষণ করুন";
    }
  }

  /** প্রোফাইলের তথ্য বদলালে যেসব জায়গা দেখায় সেগুলো আপডেট (এডিট ফর্মের টাইপ করা লেখা না মুছে) */
  function profileChanged(refreshEditPhoto = true) {
    renderProfile(); renderAbout(); renderMenu();
    if (refreshEditPhoto) renderEditPhoto();
    if (typeof opts.onProfileChange === "function") opts.onProfileChange(state.profile);
  }

  /* ------------------------------------------------------------ actions */
  function scrollToHash(hash) {
    const id = String(hash || "").replace("#", "");
    if (!id || id === "home") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleAct(el) {
    switch (el.dataset.act) {
      case "photo": photoInput.click(); break;
      case "photo-remove": removePhoto(); break;
      case "reload-bookings": loadBookings(true); break;
      case "start":
        close();
        afterHistory(() => requestAnimationFrame(() => (opts.onStartProject ? opts.onStartProject() : scrollToHash("#booking"))));
        break;
      case "link-missing":
        showToast(isAdminProfile(state.profile)
          ? "এই লিংকটি এখনো সেট করা হয়নি — অ্যাডমিন প্যানেল → সেটিংস থেকে বসান।"
          : "এই লিংকটি খুব শীঘ্রই যুক্ত করা হবে।", "error");
        break;
      case "verify":
        try { await sendVerification(); showToast("যাচাইকরণ লিংক আপনার ইমেইলে পাঠানো হয়েছে।"); }
        catch (err) { showToast(friendlyAuthError(err), "error"); }
        break;
      case "reset":
        try { await resetPassword(state.user.email); showToast("পাসওয়ার্ড রিসেট লিংক আপনার ইমেইলে পাঠানো হয়েছে।"); }
        catch (err) { showToast(friendlyAuthError(err), "error"); }
        break;
      case "logout":
        try { await logout(); showToast("লগ আউট হয়েছে।"); }
        catch (err) { showToast(friendlyAuthError(err), "error"); }
        break;
      default: break;
    }
  }

  drawerEl.addEventListener("click", (e) => {
    const t = e.target;
    const goEl = t.closest("[data-go]");
    if (goEl) { go(goEl.dataset.go); return; }
    const actEl = t.closest("[data-act]");
    if (actEl) { handleAct(actEl); return; }
    const statEl = t.closest("[data-stat]");
    if (statEl) { state.filter = statEl.dataset.stat; renderProjects(); go("projects"); return; }
    const fltEl = t.closest("[data-filter]");
    if (fltEl) { state.filter = fltEl.dataset.filter; renderProjects(); return; }
    const themeEl = t.closest("[data-theme-pref]");
    if (themeEl) { setThemePref(themeEl.dataset.themePref); return; }
    const scrollEl = t.closest("[data-scroll]");
    if (scrollEl) {
      e.preventDefault();
      const target = scrollEl.dataset.scroll;
      close();
      afterHistory(() => requestAnimationFrame(() => scrollToHash(target)));
      return;
    }
    const authEl = t.closest("[data-open-auth]");
    if (authEl) {
      const view = authEl.dataset.openAuth;
      close();
      afterHistory(() => opts.onOpenAuth && opts.onOpenAuth(view));
    }
  });

  drawerEl.addEventListener("input", (e) => {
    if (e.target.id === "drBio") {
      const counter = document.getElementById("drBioCount");
      if (counter) counter.textContent = String(e.target.value.length);
    }
  });
  drawerEl.addEventListener("submit", (e) => {
    if (e.target.id === "drEditForm") { e.preventDefault(); submitEdit(e.target); }
  });

  photoInput.addEventListener("change", () => {
    const file = photoInput.files && photoInput.files[0];
    photoInput.value = "";
    handlePhotoFile(file);
  });
  backBtn.addEventListener("click", back);
  menuBtn.addEventListener("click", () => go("menu"));
  scrimEl.addEventListener("click", close);

  onThemeChange(() => { renderMenu(); renderAccount(); });

  /* ------------------------------------------------- keyboard (Esc, Tab) */
  function focusables() {
    const scopes = [drawerEl.querySelector(".dr-head"), panels[current()]].filter(Boolean);
    const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), summary';
    return scopes
      .flatMap((s) => [...s.querySelectorAll(sel)])
      .filter((el) => !el.classList.contains("is-off") && el.offsetParent !== null);
  }
  document.addEventListener("keydown", (e) => {
    if (!state.open) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (!drawerEl.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ------------------------------------- swipe right (edge / title bar) */
  let drag = null;
  drawerEl.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const rect = drawerEl.getBoundingClientRect();
    const fromEdge = t.clientX - rect.left < 26;
    if (!fromEdge && !e.target.closest(".dr-head")) return;
    drag = { x: t.clientX, y: t.clientY, dx: 0, active: false, w: rect.width };
  }, { passive: true });
  drawerEl.addEventListener("touchmove", (e) => {
    if (!drag) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.x;
    const dy = t.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (dx > 10 && dx > Math.abs(dy) * 1.4) {
        drag.active = true;
        drawerEl.classList.add("is-dragging");
        scrimEl.style.transition = "none";
      } else return;
    }
    drag.dx = Math.max(0, dx);
    drawerEl.style.transform = `translateX(${drag.dx}px)`;
    scrimEl.style.opacity = String(Math.max(0, 1 - drag.dx / drag.w));
  }, { passive: true });
  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.active) return;
    drawerEl.classList.remove("is-dragging");
    drawerEl.style.transform = "";
    scrimEl.style.transition = "";
    scrimEl.style.opacity = "";
    if (d.dx > Math.min(110, d.w * 0.28)) back();
  };
  drawerEl.addEventListener("touchend", endDrag);
  drawerEl.addEventListener("touchcancel", endDrag);

  /* ---------------------------------------------------------- public API */
  function setUser(user) {
    const changed = (state.user && state.user.uid) !== (user && user.uid);
    state.user = user || null;
    if (changed) {
      state.profile = null;
      state.bookings = [];
      state.bookingsState = "idle";
      state.bookingsAt = 0;
      state.filter = "all";
    }
    if (!state.user) {
      // লগ আউটের পর আগের ইউজারের তথ্য DOM-এ পড়ে না থাকুক
      ["profile", "about", "projects", "account", "edit"].forEach((n) => { panels[n].innerHTML = ""; });
      if (state.open) close();
    }
    renderAll();
    if (state.open) applyStack(false);
    if (state.user && state.open) loadBookings();
  }

  function setProfile(profile) {
    state.profile = profile || null;
    renderProfile(); renderAbout(); renderMenu(); renderAccount();
  }

  function setSettings(settings) {
    state.settings = settings || {};
    renderProfile(); renderMenu();
  }

  renderMenu();

  return {
    open,
    close,
    isOpen: () => state.open,
    setUser,
    setProfile,
    setSettings,
    refreshBookings: (force = true) => loadBookings(force)
  };
}
