// js/app.js
// মূল এন্ট্রি পয়েন্ট — সব মডিউল এখানে একসাথে যুক্ত হয়।

import {
  services, portfolioItems, caseStudies, testimonials, team, stats, pricingPlans, faqItems
} from "./data.js";
import {
  renderServices, renderPortfolio, renderCaseStudies, renderStats,
  renderTestimonials, renderTestimonialDots, renderTeam, renderPricing, renderFAQ
} from "./templates.js";
import { initScrollReveal, animateCounters, initHeroTerminal } from "./animations.js";
import { showToast } from "./toast.js";
import { initRouter, goTo } from "./router.js";
import {
  registerWithEmail, loginWithEmail, loginWithGoogle, loginWithGithub,
  resetPassword, logout, watchAuthState, getUserProfile, saveUserProfile, friendlyAuthError
} from "./auth.js";
import { db } from "./firebase-config.js";
import {
  collection, addDoc, query, where, orderBy, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const WHATSAPP_NUMBER = "8801957329211"; // 01957329211 -> আন্তর্জাতিক ফরম্যাট (+880)

let currentUser = null;

/* ---------------- Theme ---------------- */
function initTheme() {
  const saved = localStorage.getItem("tv-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  const btn = document.getElementById("themeToggle");
  btn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("tv-theme", next);
  });
}

/* ---------------- Mobile nav ---------------- */
function initMobileNav() {
  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");
  toggle.addEventListener("click", () => {
    links.classList.toggle("open");
  });
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => links.classList.remove("open"))
  );
}

/* ---------------- Render static content ---------------- */
function renderContent() {
  document.getElementById("servicesGrid").innerHTML = renderServices(services);
  document.getElementById("portfolioGrid").innerHTML = renderPortfolio(portfolioItems);
  document.getElementById("caseList").innerHTML = renderCaseStudies(caseStudies);
  document.getElementById("statsStrip").innerHTML = renderStats(stats);
  document.getElementById("tmSlides").innerHTML = renderTestimonials(testimonials);
  document.getElementById("tmDots").innerHTML = renderTestimonialDots(testimonials);
  document.getElementById("teamGrid").innerHTML = renderTeam(team);
  document.getElementById("pricingGrid").innerHTML = renderPricing(pricingPlans);
  document.getElementById("faqList").innerHTML = renderFAQ(faqItems);
  document.getElementById("year").textContent = new Date().getFullYear();
  buildServicePills();
}

/* ---------------- Portfolio filter ---------------- */
function initPortfolioFilter() {
  const chips = document.querySelectorAll(".filter-row .chip");
  const cards = () => document.querySelectorAll("#portfolioGrid .pf-card");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const cat = chip.dataset.filter;
      cards().forEach((card) => {
        card.style.display = cat === "all" || card.dataset.category === cat ? "" : "none";
      });
    });
  });
}

/* ---------------- FAQ accordion ---------------- */
function initFAQ() {
  document.getElementById("faqList").addEventListener("click", (e) => {
    const q = e.target.closest(".faq-q");
    if (!q) return;
    const item = q.closest(".faq-item");
    const a = item.querySelector(".faq-a");
    const isOpen = item.classList.contains("open");
    document.querySelectorAll(".faq-item.open").forEach((el) => {
      el.classList.remove("open");
      el.querySelector(".faq-a").style.maxHeight = null;
    });
    if (!isOpen) {
      item.classList.add("open");
      a.style.maxHeight = a.scrollHeight + "px";
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
  document.getElementById("tmDots").addEventListener("click", (e) => {
    const dot = e.target.closest(".tm-dot");
    if (dot) show(+dot.dataset.i);
  });
  if (testimonials.length > 1) {
    setInterval(() => show((idx + 1) % testimonials.length), 6000);
  }
}

/* ---------------- WhatsApp float ---------------- */
function initWhatsApp() {
  const btn = document.getElementById("waFloat");
  const tip = document.getElementById("waTooltip");
  btn.addEventListener("mouseenter", () => tip.classList.add("show"));
  btn.addEventListener("mouseleave", () => tip.classList.remove("show"));
  btn.addEventListener("click", () => {
    const msg = encodeURIComponent("আসসালামু আলাইকুম, আমি Tech Verse থেকে একটা প্রজেক্ট নিয়ে কথা বলতে চাই।");
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, "_blank");
  });
}

/* ---------------- Auth modal ---------------- */
function openAuthModal(view = "login") {
  document.getElementById("authOverlay").classList.add("open");
  switchAuthView(view);
}
function closeAuthModal() {
  document.getElementById("authOverlay").classList.remove("open");
}
function switchAuthView(view) {
  document.querySelectorAll(".auth-view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view${cap(view)}`).classList.add("active");
  document.querySelectorAll(".auth-tabs button").forEach((t) => t.classList.remove("active"));
  const tabBtn = document.getElementById(`tab${cap(view)}`);
  if (tabBtn) tabBtn.classList.add("active");
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function setFieldError(fieldEl, message) {
  fieldEl.classList.toggle("has-error", !!message);
  const err = fieldEl.querySelector(".field-error");
  if (err) err.textContent = message || "";
}

function initAuthModal() {
  document.querySelectorAll("[data-open-auth]").forEach((btn) =>
    btn.addEventListener("click", () => openAuthModal(btn.dataset.openAuth || "login"))
  );
  document.getElementById("authOverlay").addEventListener("click", (e) => {
    if (e.target.id === "authOverlay") closeAuthModal();
  });
  document.querySelector(".modal-close").addEventListener("click", closeAuthModal);

  document.getElementById("tabLogin").addEventListener("click", () => switchAuthView("login"));
  document.getElementById("tabSignup").addEventListener("click", () => switchAuthView("signup"));
  document.querySelectorAll("[data-show-reset]").forEach((b) => b.addEventListener("click", () => switchAuthView("reset")));
  document.querySelectorAll("[data-show-login]").forEach((b) => b.addEventListener("click", () => switchAuthView("login")));

  // ইমেইল লগইন
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const password = e.target.password.value;
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      await loginWithEmail(email, password);
      showToast("সফলভাবে লগইন হয়েছে।");
      closeAuthModal();
    } catch (err) {
      showToast(friendlyAuthError(err), "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ইমেইল সাইন আপ
  document.getElementById("signupForm").addEventListener("submit", async (e) => {
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
      closeAuthModal();
    } catch (err) {
      showToast(friendlyAuthError(err), "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  // পাসওয়ার্ড রিসেট
  document.getElementById("resetForm").addEventListener("submit", async (e) => {
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

/* ---------------- Nav auth area (login button <-> user chip) ---------------- */
function renderNavAuthArea() {
  const area = document.getElementById("authAreaNav");
  if (currentUser) {
    const letter = (currentUser.displayName || currentUser.email || "?").charAt(0).toUpperCase();
    area.innerHTML = `
      <button class="user-chip" id="userChipBtn">
        ${currentUser.photoURL ? `<img src="${currentUser.photoURL}" alt="">` : `<span class="avatar-fallback">${letter}</span>`}
        <span class="hide-mobile">${currentUser.displayName || "প্রোফাইল"}</span>
      </button>`;
    document.getElementById("userChipBtn").addEventListener("click", () => goTo("profile"));
  } else {
    area.innerHTML = `<button class="btn btn-outline btn-sm" data-open-auth="login">লগইন</button>
      <button class="btn btn-primary btn-sm hide-mobile" data-open-auth="signup">সাইন আপ</button>`;
    area.querySelectorAll("[data-open-auth]").forEach((btn) =>
      btn.addEventListener("click", () => openAuthModal(btn.dataset.openAuth))
    );
  }
}

/* ---------------- Booking form ---------------- */
function buildServicePills() {
  const wrap = document.getElementById("servicePills");
  if (!wrap) return;
  wrap.innerHTML = services
    .map((s, i) => `<button type="button" data-val="${s.title}"${i === 0 ? ' class="active"' : ""}>${s.title}</button>`)
    .join("");
}

function initBookingForm() {
  const steps = Array.from(document.querySelectorAll(".form-step"));
  const trackEls = Array.from(document.querySelectorAll(".step-track span"));
  let step = 0;
  let chosenService = services[0]?.title || "";

  function show(i) {
    steps.forEach((s, idx) => s.classList.toggle("active", idx === i));
    trackEls.forEach((el, idx) => el.classList.toggle("done", idx <= i));
    step = i;
  }

  document.getElementById("servicePills").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    document.querySelectorAll("#servicePills button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    chosenService = b.dataset.val;
  });

  document.querySelectorAll(".step-next").forEach((btn) =>
    btn.addEventListener("click", () => {
      const active = steps[step];
      const requiredInputs = active.querySelectorAll("input[required]");
      for (const inp of requiredInputs) {
        if (!inp.value.trim()) {
          inp.focus();
          showToast("অনুগ্রহ করে প্রয়োজনীয় ঘরগুলো পূরণ করুন।", "error");
          return;
        }
      }
      if (step < steps.length - 1) show(step + 1);
    })
  );
  document.querySelectorAll(".step-prev").forEach((btn) =>
    btn.addEventListener("click", () => { if (step > 0) show(step - 1); })
  );

  document.getElementById("bookingForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "পাঠানো হচ্ছে...";
    try {
      await addDoc(collection(db, "bookings"), {
        service: chosenService,
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
      show(0);
    } catch (err) {
      showToast("পাঠাতে সমস্যা হয়েছে, আবার চেষ্টা করুন।", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "অনুরোধ পাঠান";
    }
  });

  document.querySelectorAll("[data-open-booking]").forEach((btn) =>
    btn.addEventListener("click", () => {
      document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
    })
  );
}

/* ---------------- Profile view ---------------- */
async function renderProfileView() {
  if (!currentUser) {
    openAuthModal("login");
    goTo("home");
    return;
  }
  document.getElementById("profileName").textContent = currentUser.displayName || "নাম দেওয়া হয়নি";
  document.getElementById("profileEmail").textContent = currentUser.email || "";
  const avatar = document.getElementById("profileAvatarWrap");
  const letter = (currentUser.displayName || currentUser.email || "?").charAt(0).toUpperCase();
  avatar.innerHTML = currentUser.photoURL
    ? `<img class="profile-avatar" src="${currentUser.photoURL}" alt="">`
    : `<div class="profile-avatar">${letter}</div>`;

  const profile = await getUserProfile(currentUser.uid);
  const form = document.getElementById("profileForm");
  form.pName.value = profile?.name || currentUser.displayName || "";
  form.pPhone.value = profile?.phone || "";

  // বুকিং হিস্টরি
  const list = document.getElementById("profileBookings");
  list.innerHTML = `<div class="empty-state">লোড হচ্ছে...</div>`;
  try {
    const q = query(collection(db, "bookings"), where("uid", "==", currentUser.uid), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    if (snap.empty) {
      list.innerHTML = `<div class="empty-state">এখনো কোনো অনুরোধ পাঠানো হয়নি।</div>`;
    } else {
      list.innerHTML = snap.docs
        .map((d) => {
          const b = d.data();
          return `<div class="booking-mini"><b>${b.service}</b><span>স্ট্যাটাস: ${b.status || "নতুন"}</span></div>`;
        })
        .join("");
    }
  } catch (_) {
    list.innerHTML = `<div class="empty-state">বুকিং হিস্টরি লোড করা যায়নি।</div>`;
  }
}

function initProfile() {
  document.getElementById("profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      await saveUserProfile(currentUser.uid, {
        name: e.target.pName.value.trim(),
        phone: e.target.pPhone.value.trim()
      });
      showToast("প্রোফাইল আপডেট হয়েছে।");
    } catch (_) {
      showToast("আপডেট করতে সমস্যা হয়েছে।", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await logout();
    showToast("লগআউট হয়েছে।");
    goTo("home");
  });
}

/* ---------------- Router views ---------------- */
function showHomeView() {
  document.getElementById("mainContent").style.display = "";
  document.getElementById("profileView").classList.remove("active");
}
function showProfileViewShell() {
  document.getElementById("mainContent").style.display = "none";
  document.getElementById("profileView").classList.add("active");
  renderProfileView();
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
document.addEventListener("DOMContentLoaded", () => {
  renderContent();
  initTheme();
  initMobileNav();
  initPortfolioFilter();
  initFAQ();
  initTestimonials();
  initWhatsApp();
  initAuthModal();
  initBookingForm();
  initProfile();
  initPWA();
  initHeroTerminal(document.getElementById("terminalBody"));
  initScrollReveal();
  animateCounters();

  initRouter({ onHome: showHomeView, onProfile: showProfileViewShell });

  watchAuthState((user) => {
    currentUser = user;
    renderNavAuthArea();
    if (window.location.hash === "#profile") {
      user ? renderProfileView() : (openAuthModal("login"), goTo("home"));
    }
  });
});
