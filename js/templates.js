// js/templates.js
// Firestore থেকে আসা কন্টেন্ট থেকে প্রতিটি সেকশনের HTML তৈরি করে।
// প্রতিটা ডাইনামিক ভ্যালু escapeHtml() দিয়ে বসানো হয় — শুধু সিকিউরিটির জন্য না, বরং
// যাতে কারো কনটেন্টে হঠাৎ &, <, > থাকলেও পুরো লেআউট ভেঙে না যায়।

import { icons, icon } from "./icons.js";
import { escapeHtml } from "./utils.js";

function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

/** ছবি থাকলে ছবি, না থাকলে নামের প্রথম অক্ষর দিয়ে অ্যাভাটার বানায় — এই কন্টেন্ট সবসময় একটা
    সাইজ/শেপ-নির্ধারক wrapper-এর ভেতরে বসবে (যেমন .team-avatar, .tm-avatar-wrap), তাই এখানে
    নিজে থেকে সাইজ/radius সেট করে না — শুধু wrapper পুরোটা fill করে। প্রোফাইল স্লাইডার ও
    হেডারের অ্যাভাটারেও একই ফাংশন ব্যবহার হয়, যাতে পুরো সাইটে অ্যাভাটার দেখতে একরকম হয়। */
export function avatarOrLetter(url, name) {
  return url
    ? `<img class="avatar-img" src="${escapeHtml(url)}" alt="" loading="lazy">`
    : `<div class="avatar-letter">${escapeHtml(initial(name))}</div>`;
}

export function emptyState(message, iconName = "inbox") {
  return `<div class="empty-state"><div class="empty-state-icon">${icon(iconName)}</div><p>${escapeHtml(message)}</p></div>`;
}

export function renderServices(services) {
  if (!services.length) return emptyState("এখনো কোনো সার্ভিস যোগ করা হয়নি।", "settings");
  return services
    .map(
      (s) => `
    <div class="service-card">
      <div class="service-icon">${icon(s.icon)}</div>
      <h3>${escapeHtml(s.title)}</h3>
      <p>${escapeHtml(s.desc)}</p>
    </div>`
    )
    .join("");
}

/* পোর্টফোলিওতে ছবি না থাকলে ক্যাটাগরি অনুযায়ী রঙিন কভার দেখায় — কার্ড ফাঁকা লাগে না */
const CATEGORY_LOOK = {
  web: { tone: "blue", icon: "globe" },
  pwa: { tone: "mint", icon: "device" },
  design: { tone: "violet", icon: "layout" }
};

export function renderPortfolio(items) {
  if (!items.length) return emptyState("এখনো কোনো পোর্টফোলিও আইটেম যোগ করা হয়নি।", "layout");
  return items
    .map((p) => {
      const look = CATEGORY_LOOK[p.category] || { tone: "slate", icon: "code" };
      return `
    <article class="pf-card tone-${look.tone}" data-category="${escapeHtml(p.category)}">
      ${p.imageUrl
        ? `<div class="pf-media"><img src="${escapeHtml(p.imageUrl)}" alt="" loading="lazy"></div>`
        : `<div class="pf-cover"><span class="pf-cover-icon">${icon(look.icon)}</span></div>`}
      <div class="pf-body">
        <span class="pf-tag">${escapeHtml(p.tag)}</span>
        <h3>${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.desc)}</p>
      </div>
      <div class="pf-meta">${escapeHtml(p.stack)}</div>
    </article>`;
    })
    .join("");
}

export function renderCaseStudies(cases) {
  if (!cases.length) return "";
  return cases
    .map(
      (c) => `
    <div class="case-row">
      <div>
        <h4>${escapeHtml(c.title)}</h4>
        <p>${escapeHtml(c.desc)}</p>
      </div>
      <div class="case-metric"><b>${escapeHtml(c.metric1Value)}</b><span>${escapeHtml(c.metric1Label)}</span></div>
      <div class="case-metric"><b>${escapeHtml(c.metric2Value)}</b><span>${escapeHtml(c.metric2Label)}</span></div>
    </div>`
    )
    .join("");
}

export function renderStats(stats) {
  if (!stats.length) return "";
  return stats
    .map(
      (s) => `
    <div class="stat-cell">
      <b data-count="${Number(s.value) || 0}" data-suffix="${escapeHtml(s.suffix)}">0${escapeHtml(s.suffix)}</b>
      <span>${escapeHtml(s.label)}</span>
    </div>`
    )
    .join("");
}

export function renderTestimonials(list) {
  if (!list.length) return "";
  return list
    .map(
      (t, i) => `
    <div class="tm-slide${i === 0 ? " active" : ""}" data-i="${i}">
      <div class="tm-avatar-wrap">${avatarOrLetter(t.avatarUrl, t.name)}</div>
      <p class="tm-quote">“${escapeHtml(t.quote)}”</p>
      <div class="tm-person"><b>${escapeHtml(t.name)}</b><span>${escapeHtml(t.role)}</span></div>
    </div>`
    )
    .join("");
}

export function renderTestimonialDots(list) {
  return list
    .map((_, i) => `<button class="tm-dot${i === 0 ? " active" : ""}" data-i="${i}" aria-label="টেস্টিমোনিয়াল ${i + 1}"></button>`)
    .join("");
}

export function renderTeam(team) {
  if (!team.length) return emptyState("এখনো কোনো টিম মেম্বার যোগ করা হয়নি।", "users");
  return team
    .map(
      (m) => `
    <div class="team-card">
      <div class="team-avatar">${avatarOrLetter(m.avatarUrl, m.name)}</div>
      <h4>${escapeHtml(m.name)}</h4>
      <span>${escapeHtml(m.role)}</span>
    </div>`
    )
    .join("");
}

export function renderPricing(plans) {
  if (!plans.length) return emptyState("এখনো কোনো প্যাকেজ যোগ করা হয়নি।", "target");
  return plans
    .map(
      (p) => `
    <div class="price-card${p.featured ? " featured" : ""}">
      ${p.featured ? `<span class="price-badge">জনপ্রিয়</span>` : ""}
      <span class="price-plan">${escapeHtml(p.name)}</span>
      <div class="price-amount">${escapeHtml(p.price)}</div>
      <ul class="price-feat">
        ${(p.features || []).map((f) => `<li>${icons.check}<span>${escapeHtml(f)}</span></li>`).join("")}
      </ul>
      <button class="btn ${p.featured ? "btn-primary" : "btn-outline"} btn-block" data-open-booking>কোট চান</button>
    </div>`
    )
    .join("");
}

export function renderFAQ(items) {
  if (!items.length) return emptyState("এখনো কোনো প্রশ্নোত্তর যোগ করা হয়নি।", "message");
  return items
    .map(
      (f, i) => `
    <div class="faq-item" data-i="${i}">
      <button class="faq-q" aria-expanded="false" aria-controls="faqA${i}"><span>${escapeHtml(f.q)}</span><span class="faq-plus">${icons.plus}</span></button>
      <div class="faq-a" id="faqA${i}"><div><p>${escapeHtml(f.a)}</p></div></div>
    </div>`
    )
    .join("");
}
