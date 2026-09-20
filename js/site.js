// js/site.js
// Firebase-নির্ভর নয় এমন অংশ — ফুটার (Quick Links + Contact Us), তথ্য-শিট ও WhatsApp বাটন।
//
// এগুলো আলাদা মডিউলে রাখা হয়েছে ইচ্ছা করেই: Firebase-এর ফাইল (gstatic.com থেকে) কোনো কারণে লোড না হলেও
// (ধীর/ব্লক করা নেটওয়ার্ক, অফলাইন) যোগাযোগের তথ্য ও বাটনগুলো যেন সবসময় কাজ করে। তথ্য সব js/contact.js-এ।

import { renderFooter } from "./footer.js";
import { initInfo } from "./info.js";
import { whatsappUrl } from "./contact.js";

function scrollToBooking() {
  const el = document.getElementById("booking");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function initWhatsApp() {
  const btn = document.getElementById("waFloat");
  const tip = document.getElementById("waTooltip");
  if (!btn) return;
  if (tip) {
    const show = () => tip.classList.add("show");
    const hide = () => tip.classList.remove("show");
    btn.addEventListener("mouseenter", show);
    btn.addEventListener("mouseleave", hide);
    // কীবোর্ডে ট্যাব করে এলে টুলটিপ দেখায় (মাউস-ক্লিকে ফোকাস হলে নয়, নইলে ট্যাব ফেরার পর আটকে থাকত)
    btn.addEventListener("focus", () => { if (btn.matches(":focus-visible")) show(); });
    btn.addEventListener("blur", hide);
  }
  // নম্বর ও মেসেজ কোডে (js/contact.js) — Firestore/অ্যাডমিন থেকে নয়
  btn.addEventListener("click", () => window.open(whatsappUrl(), "_blank", "noopener"));
}

renderFooter(document.getElementById("siteFooter"));

initInfo({
  onStartProject: scrollToBooking,
  // লগইন মডালটা app.js-এর (Firebase) — তাই ইভেন্টের মাধ্যমে জানানো হয়
  onOpenAuth: (view) => document.dispatchEvent(new CustomEvent("tv:open-auth", { detail: { view } }))
});

initWhatsApp();
