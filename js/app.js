// js/app.js
// মূল এন্ট্রি পয়েন্ট — সব মডিউল এখানে একসাথে যুক্ত হয়।
// কন্টেন্ট Firestore থেকে আসে (js/content.js) — অ্যাডমিন প্যানেলে কিছু বদলালে সাইট রিলোডেই দেখা যায়।
// প্রোফাইল এখন আলাদা পেজ নয়: হেডারের অ্যাভাটার ট্যাপ করলে ডান দিক থেকে স্লাইডার খোলে (js/drawer.js)।

import { getAllContent, getSettings } from "./content.js";
import { defaultSettings } from "./seed-data.js";
import {
  renderServices, renderPortfolio, renderCaseStudies, renderStats,
  renderTestimonials, renderTestimonialDots, renderTeam, renderPricing, renderFAQ,
  avatarOrLetter
} from "./templates.js";
import { animateCounters, initHeroTerminal } from "./animations.js";
import { showToast } from "./toast.js";
import { initRouter, clearHash } from "./router.js";
import { initTheme, toggleTheme } from "./theme.js";
import {
  registerWithEmail, loginWithEmail, loginWithGoogle, loginWithGithub,
  resetPassword, watchAuthState, getUserProfile, ensureUserDoc, friendlyAuthError
} from "./auth.js";
import { escapeHtml, parseAccent, pickAvatar } from "./utils.js";
import { createDrawer } from "./drawer.js";
import { lockScroll, unlockScroll } from "./scrolllock.js";
import { db } from "./firebase-config.js";
import {
  collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let currentUser = null;
let currentProfile = null;
let authResolved = false;
let pendingProfileRoute = false;
let drawer = null;
let siteContent = {
  services: [], portfolio: [], caseStudies: [], testimonials: [], team: [], stats: [], pricingPlans: [], faqItems: []
};
let siteSettings = { ...defaultSettings };

const $ = (id) => document.getElementById(id);

/* ---------------- Nav: থিম বাটন, ☰, স্ক্রল-স্টেট, বর্তমান সেকশন হাইলাইট ---------------- */
function initNav() {
  $("themeToggle").addEventListener("click", toggleTheme);
  $("navToggle").addEventListener("click", () => drawer.open("menu"));

  const nav = $("siteNav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function initScrollSpy() {
  const links = [...document.querySelectorAll("#navLinks a[href^='#']")];
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const targets = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  if (!targets.length || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        const link = byId.get(en.target.id);
        if (!link) return;
        if (en.isIntersecting) {
          links.forEach((l) => l.removeAttribute("aria-current"));
          link.setAttribute("aria-current", "true");
        } else if (link.getAttribute("aria-current") === "true") {
          link.removeAttribute("aria-current");
        }
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  targets.forEach((t) => io.observe(t));
}

/* ---------------- Loading skeletons (Firestore থেকে কন্টেন্ট আসার আগ পর্যন্ত) ---------------- */
function skeletonCards(n) {
  return Array.from({ length: n }, () =>
    `<div class="skel-card"><div class="skel-row skel" style="width:70%;"></div><div class="skel-row skel" style="width:92%;"></div><div class="skel-row skel" style="width:55%;"></div></div>`
  ).join("");
}
function showLoadingSkeletons() {
  ["servicesGrid", "portfolioGrid", "teamGrid", "pricingGrid"].forEach((id) => {
    const el = $(id);
    if (el) el.innerHTML = skeletonCards(id === "servicesGrid" ? 6 : 3);
  });
  if ($("caseList")) $("caseList").innerHTML = skeletonCards(2);
  if ($("faqList")) $("faqList").innerHTML = skeletonCards(3);
  if ($("statsStrip")) $("statsStrip").innerHTML = `<div class="skel-row skel" style="height:90px;width:100%;grid-column:1/-1;border-radius:0;"></div>`;
}

/* ---------------- সেটিংস প্রয়োগ (হিরো টেক্সট, SEO, Code/Course লিংক) — যোগাযোগের তথ্য এখানে নয়, js/contact.js-এ ---------------- */
function applySettings(settings) {
  const set = (id, text) => { const el = $(id); if (el && text) el.textContent = text; };
  set("heroEyebrow", settings.heroEyebrow);
  const titleEl = $("heroTitle");
  if (titleEl && settings.heroTitle) titleEl.innerHTML = parseAccent(settings.heroTitle);
  set("heroSub", settings.heroSubtitle);
  set("heroCtaPrimary", settings.heroCtaPrimary);
  set("heroCtaSecondary", settings.heroCtaSecondary);

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && settings.seoDescription) metaDesc.setAttribute("content", settings.seoDescription);

  if (drawer) drawer.setSettings(settings);
}

/* ---------------- কন্টেন্ট রেন্ডার ---------------- */
function renderContent(content) {
  $("servicesGrid").innerHTML = renderServices(content.services);
  $("portfolioGrid").innerHTML = renderPortfolio(content.portfolio);
  $("caseList").innerHTML = renderCaseStudies(content.caseStudies);
  $("statsStrip").innerHTML = renderStats(content.stats);
  $("tmSlides").innerHTML = renderTestimonials(content.testimonials);
  $("tmDots").innerHTML = renderTestimonialDots(content.testimonials);
  $("teamGrid").innerHTML = renderTeam(content.team);
  $("pricingGrid").innerHTML = renderPricing(content.pricingPlans);
  $("faqList").innerHTML = renderFAQ(content.faqItems);
  buildServicePills();
  // পোর্টফোলিওর বর্তমান ফিল্টার (যদি ইউজার আগেই বেছে থাকে) আবার প্রয়োগ
  const activeChip = document.querySelector(".filter-row .chip.active");
  if (activeChip && activeChip.dataset.filter !== "all") activeChip.click();
}

/* ---------------- Portfolio filter ---------------- */
function initPortfolioFilter() {
  const chips = document.querySelectorAll(".filter-row .chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const cat = chip.dataset.filter;
      document.querySelectorAll("#portfolioGrid .pf-card").forEach((card) => {
        card.style.display = cat === "all" || card.dataset.category === cat ? "" : "none";
      });
    });
  });
}

/* ---------------- FAQ accordion (উচ্চতার অ্যানিমেশন CSS-এ — grid-template-rows) ---------------- */
function initFAQ() {
  $("faqList").addEventListener("click", (e) => {
    const q = e.target.closest(".faq-q");
    if (!q) return;
    const item = q.closest(".faq-item");
    const willOpen = !item.classList.contains("open");
    document.querySelectorAll(".faq-item.open").forEach((el) => {
      el.classList.remove("open");
      el.querySelector(".faq-q").setAttribute("aria-expanded", "false");
    });
    if (willOpen) {
      item.classList.add("open");
      q.setAttribute("aria-expanded", "true");
    }
  });
}

/* ---------------- Testimonial carousel ---------------- */
function initTestimonials() {
  const slides = () => document.querySelectorAll(".tm-slide");
  const dots = () => document.querySelectorAll(".tm-dot");
  let idx = 0;
  function show(i) {
    slides().forEach((s) => s.classList.toggle("active", +s.dataset.i === i));
    dots().forEach((d) => d.classList.toggle("active", +d.dataset.i === i));
    idx = i;
  }
  $("tmDots").addEventListener("click", (e) => {
    const dot = e.target.closest(".tm-dot");
    if (dot) show(+dot.dataset.i);
  });
  setInterval(() => {
    const n = slides().length;
    if (n > 1 && !document.hidden) show((idx + 1) % n);
  }, 6000);
}

/* ---------------- Auth modal ---------------- */
let lastAuthFocus = null;

function openAuthModal(view = "login") {
  const overlay = $("authOverlay");
  if (!overlay.classList.contains("open")) {
    lastAuthFocus = document.activeElement;
    overlay.classList.add("open");
    lockScroll();
  }
  switchAuthView(view);
  setTimeout(() => {
    const first = overlay.querySelector(".auth-view.active input");
    if (first) first.focus({ preventScroll: true });
  }, 120);
}
function closeAuthModal() {
  const overlay = $("authOverlay");
  if (!overlay.classList.contains("open")) return;
  overlay.classList.remove("open");
  unlockScroll();
  if (lastAuthFocus && document.contains(lastAuthFocus) && lastAuthFocus.focus) lastAuthFocus.focus({ preventScroll: true });
}
function switchAuthView(view) {
  document.querySelectorAll(".auth-view").forEach((v) => v.classList.remove("active"));
  $(`view${cap(view)}`).classList.add("active");
  document.querySelectorAll(".auth-tabs button").forEach((t) => t.classList.remove("active"));
  const tabBtn = $(`tab${cap(view)}`);
  if (tabBtn) tabBtn.classList.add("active");
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function setFieldError(fieldEl, message) {
  fieldEl.classList.toggle("has-error", !!message);
  const err = fieldEl.querySelector(".field-error");
  if (err) err.textContent = message || "";
}

function initAuthModal() {
  // "লগইন"/"সাইন আপ" বাটনগুলো (হেডার ছাড়াও যেকোনো [data-open-auth]) — হেডারেরগুলো renderNavAuthArea নিজে বাঁধে
  const overlay = $("authOverlay");
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAuthModal(); });
  document.querySelector(".modal-close").addEventListener("click", closeAuthModal);
  document.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") { closeAuthModal(); return; }
    if (e.key === "Tab") {
      const f = [...overlay.querySelectorAll("button, input, a[href]")].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  $("tabLogin").addEventListener("click", () => switchAuthView("login"));
  $("tabSignup").addEventListener("click", () => switchAuthView("signup"));
  document.querySelectorAll("[data-show-reset]").forEach((b) => b.addEventListener("click", () => switchAuthView("reset")));
  document.querySelectorAll("[data-show-login]").forEach((b) => b.addEventListener("click", () => switchAuthView("login")));

  // পাসওয়ার্ড দেখা/লুকানো
  overlay.addEventListener("click", (e) => {
    const btn = e.target.closest(".pw-toggle");
    if (!btn) return;
    const input = btn.parentElement.querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.classList.toggle("is-shown", show);
    btn.setAttribute("aria-label", show ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখান");
  });

  // ইমেইল লগইন
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const password = e.target.password.value;
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      await loginWithEmail(email, password);
      showToast("সফলভাবে লগইন হয়েছে।");
      e.target.reset();
      closeAuthModal();
    } catch (err) {
      showToast(friendlyAuthError(err), "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ইমেইল সাইন আপ
  $("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const email = e.target.email.value.trim();
    const password = e.target.password.value;
    const pwField = e.target.password.closest(".field");
    if (password.length < 6) {
      setFieldError(pwField, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
      return;
    }
    setFieldError(pwField, "");
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      await registerWithEmail(name, email, password);
      showToast("অ্যাকাউন্ট তৈরি হয়েছে! স্বাগতম।");
      e.target.reset();
      closeAuthModal();
    } catch (err) {
      showToast(friendlyAuthError(err), "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  // পাসওয়ার্ড রিসেট
  $("resetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      await resetPassword(email);
      showToast("পাসওয়ার্ড রিসেট লিংক ইমেইলে পাঠানো হয়েছে।");
      switchAuthView("login");
    } catch (err) {
      showToast(friendlyAuthError(err), "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Google / GitHub
  document.querySelectorAll(".btn-google").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await loginWithGoogle();
        showToast("Google দিয়ে সফলভাবে লগইন হয়েছে।");
        closeAuthModal();
      } catch (err) {
        showToast(friendlyAuthError(err), "error");
      }
    })
  );
  document.querySelectorAll(".btn-github").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await loginWithGithub();
        showToast("GitHub দিয়ে সফলভাবে লগইন হয়েছে।");
        closeAuthModal();
      } catch (err) {
        showToast(friendlyAuthError(err), "error");
      }
    })
  );
}

/* ---------------- Nav auth area (লগইন বাটন <-> অ্যাভাটার) ---------------- */
function renderNavAuthArea() {
  const area = $("authAreaNav");
  if (currentUser) {
    const name = (currentUser.displayName || (currentProfile && currentProfile.name) || "").trim();
    area.innerHTML = `
      <button type="button" class="user-chip" id="userChipBtn" aria-haspopup="dialog" aria-controls="drawer" aria-label="প্রোফাইল খুলুন">
        <span class="chip-avatar-wrap">${avatarOrLetter(pickAvatar(currentUser, currentProfile), name || currentUser.email)}</span>
        <span class="chip-name hide-mobile">${escapeHtml(name || "প্রোফাইল")}</span>
      </button>`;
    $("userChipBtn").addEventListener("click", () => drawer.open("profile"));
  } else {
    area.innerHTML = `<button type="button" class="btn btn-outline btn-sm" data-open-auth="login">লগইন</button>
      <button type="button" class="btn btn-primary btn-sm hide-mobile" data-open-auth="signup">সাইন আপ</button>`;
    area.querySelectorAll("[data-open-auth]").forEach((btn) =>
      btn.addEventListener("click", () => openAuthModal(btn.dataset.openAuth))
    );
  }
}

/* ---------------- Booking form ---------------- */
function buildServicePills() {
  const wrap = $("servicePills");
  if (!wrap) return;
  wrap.innerHTML = siteContent.services
    .map((s, i) => `<button type="button" data-val="${escapeHtml(s.title)}" aria-pressed="${i === 0}"${i === 0 ? ' class="active"' : ""}>${escapeHtml(s.title)}</button>`)
    .join("");
}

function scrollToBooking() {
  const el = $("booking");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** লগইন থাকলে নাম/ইমেইল/ফোন আগেই ভরে দেয় (ইউজার আগে থেকে কিছু লিখে থাকলে সেটা রাখে) */
function prefillBooking() {
  if (!currentUser) return;
  const fill = (id, val) => { const el = $(id); if (el && !el.value && val) el.value = val; };
  fill("bName", (currentProfile && currentProfile.name) || currentUser.displayName);
  fill("bEmail", currentUser.email);
  fill("bPhone", currentProfile && currentProfile.phone);
}

function initBookingForm() {
  const form = $("bookingForm");
  const steps = Array.from(form.querySelectorAll(".form-step"));
  const trackEls = Array.from(form.querySelectorAll(".step-track > span"));
  let step = 0;

  const chosenService = () => {
    const btn = form.querySelector("#servicePills button.active");
    return (btn && btn.dataset.val) || (siteContent.services[0] && siteContent.services[0].title) || "";
  };

  function show(i) {
    steps.forEach((s, idx) => s.classList.toggle("active", idx === i));
    trackEls.forEach((el, idx) => el.classList.toggle("done", idx <= i));
    step = i;
  }

  /** সক্রিয় ধাপের required ঘরগুলো যাচাই — ঠিক না থাকলে ফোকাস + বার্তা */
  function stepIsValid(i) {
    for (const inp of steps[i].querySelectorAll("input[required]")) {
      if (!inp.checkValidity()) {
        inp.focus();
        showToast(inp.type === "email" && inp.value.trim() ? "সঠিক ইমেইল ঠিকানা লিখুন।" : "অনুগ্রহ করে প্রয়োজনীয় ঘরগুলো পূরণ করুন।", "error");
        return false;
      }
    }
    return true;
  }
  function goNext() {
    if (!stepIsValid(step)) return;
    if (step < steps.length - 1) show(step + 1);
  }

  $("servicePills").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    document.querySelectorAll("#servicePills button").forEach((x) => { x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); });
    b.classList.add("active");
    b.setAttribute("aria-pressed", "true");
  });

  form.querySelectorAll(".step-next").forEach((btn) => btn.addEventListener("click", goNext));
  form.querySelectorAll(".step-prev").forEach((btn) =>
    btn.addEventListener("click", () => { if (step > 0) show(step - 1); })
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // প্রথম ধাপে Enter চাপলে সরাসরি জমা না দিয়ে পরের ধাপে যাওয়া
    if (step < steps.length - 1) { goNext(); return; }
    if (!stepIsValid(0)) { show(0); return; }
    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "পাঠানো হচ্ছে...";
    try {
      await addDoc(collection(db, "bookings"), {
        service: chosenService(),
        name: form.bName.value.trim(),
        email: form.bEmail.value.trim(),
        phone: form.bPhone.value.trim(),
        budget: form.bBudget.value,
        timeline: form.bTimeline.value,
        details: form.bDetails.value.trim(),
        uid: currentUser ? currentUser.uid : null,
        status: "নতুন",
        createdAt: serverTimestamp()
      });
      showToast("অনুরোধ পাঠানো হয়েছে! শীঘ্রই যোগাযোগ করা হবে।");
      form.reset();
      buildServicePills();
      show(0);
      prefillBooking();
      if (currentUser) drawer.refreshBookings(true);
    } catch (err) {
      console.error(err);
      showToast("পাঠাতে সমস্যা হয়েছে, আবার চেষ্টা করুন।", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "অনুরোধ পাঠান";
    }
  });

  document.querySelectorAll("[data-open-booking]").forEach((btn) =>
    btn.addEventListener("click", scrollToBooking)
  );
  // প্যাকেজ কার্ডের "কোট চান" বাটনগুলো পরে রেন্ডার হয় — তাই ডেলিগেশন
  $("pricingGrid").addEventListener("click", (e) => {
    if (e.target.closest("[data-open-booking]")) scrollToBooking();
  });
}

/* ---------------- #profile লিংক (পুরোনো রাউট) → স্লাইডার ---------------- */
function openProfileRoute() {
  pendingProfileRoute = false;
  clearHash();
  if (currentUser) drawer.open("profile");
  else openAuthModal("login");
}

/* ---------------- PWA ---------------- */
function initPWA() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

/* ---------------- Init ---------------- */
document.addEventListener("DOMContentLoaded", async () => {
  // ইন্টারঅ্যাক্টিভ অংশগুলো কন্টেন্টের জন্য অপেক্ষা না করেই চালু — ইন্টারনেট ধীর হলেও বাটন কাজ করবে
  initTheme();
  initPWA();
  initHeroTerminal($("terminalBody"));
  showLoadingSkeletons();

  drawer = createDrawer({
    onOpenAuth: (view) => openAuthModal(view),
    onStartProject: scrollToBooking,
    onProfileChange: (profile) => { currentProfile = profile; renderNavAuthArea(); prefillBooking(); }
  });
  drawer.setSettings(siteSettings);

  // তথ্য-শিটের "লগইন খুলুন" বাটন (js/site.js ইভেন্ট পাঠায়)
  document.addEventListener("tv:open-auth", (e) => openAuthModal((e.detail && e.detail.view) || "login"));

  initNav();
  initScrollSpy();
  initAuthModal();
  initPortfolioFilter();
  initFAQ();
  initTestimonials();
  initBookingForm();
  renderNavAuthArea();

  initRouter({
    onProfile: () => { if (authResolved) openProfileRoute(); else pendingProfileRoute = true; },
    onHome: () => {}
  });

  watchAuthState(async (user) => {
    currentUser = user;
    currentProfile = null;
    renderNavAuthArea();
    drawer.setUser(user);
    if (user) {
      try {
        let profile = await getUserProfile(user.uid);
        if (!profile) {
          await ensureUserDoc(user);
          profile = await getUserProfile(user.uid);
        }
        if (currentUser !== user) return; // ইতিমধ্যে লগ আউট/অ্যাকাউন্ট বদল হয়ে গেছে
        currentProfile = profile;
      } catch (err) {
        console.error("Profile load failed:", err);
      }
      drawer.setProfile(currentProfile);
      renderNavAuthArea();
      prefillBooking();
    }
    if (!authResolved) {
      authResolved = true;
      if (pendingProfileRoute || window.location.hash === "#profile") openProfileRoute();
    }
  });

  // কন্টেন্ট ও সেটিংস
  const [content, settings] = await Promise.all([getAllContent(), getSettings()]);
  siteContent = content;
  siteSettings = settings;
  applySettings(settings);
  renderContent(content);
  animateCounters();
});
