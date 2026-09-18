// js/templates.js
// Firestore থেকে আসা কন্টেন্ট থেকে প্রতিটি সেকশনের HTML তৈরি করে।
// প্রতিটা ডাইনামিক ভ্যালু escapeHtml() দিয়ে বসানো হয় — শুধু সিকিউরিটির জন্য না, বরং
// যাতে কারো কনটেন্টে হঠাৎ &, <, > থাকলেও পুরো লেআউট ভেঙে না যায় (এটাই আগের "আইকন/ফিচার
// ঠিকভাবে দেখা যায় না" সমস্যাগুলোর একটা সাধারণ কারণ হতে পারে)।

import { icons, icon } from "./icons.js";
import { escapeHtml } from "./utils.js";

function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

/** ছবি থাকলে ছবি, না থাকলে নামের প্রথম অক্ষর দিয়ে অ্যাভাটার বানায় — এই কন্টেন্ট সবসময় একটা
    সাইজ/শেপ-নির্ধারক wrapper-এর ভেতরে বসবে (যেমন .team-avatar, .tm-avatar-wrap), তাই এখানে
    নিজে থেকে সাইজ/radius সেট করে না — শুধু wrapper পুরোটা fill করে। profile ও nav-chip
    অ্যাভাটারেও app.js এই একই ফাংশন ব্যবহার করে, যাতে পুরো সাইটে avatar দেখতে একরকম হয়। */
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
      (s, i) => `
    <div class="service-card reveal">
      <span class="service-num">${String(i + 1).padStart(2, "0")}</span>
      <div class="service-icon">${icon(s.icon)}</div>
      <h3>${escapeHtml(s.title)}</h3>
      <p>${escapeHtml(s.desc)}</p>
    </div>`
    )
    .join("");
}

export function renderPortfolio(items) {
  if (!items.length) return emptyState("এখনো কোনো পোর্টফোলিও আইটেম যোগ করা হয়নি।", "layout");
  return items
    .map(
      (p) => `
    <div class="pf-card reveal" data-category="${escapeHtml(p.category)}">
      ${p.imageUrl
        ? `<div class="pf-media"><img src="${escapeHtml(p.imageUrl)}" alt="" loading="lazy"></div>`
        : ""}
      <div class="pf-top">
        <span class="pf-tag">${escapeHtml(p.tag)}</span>
      </div>
      <h3>${escapeHtml(p.title)}</h3>
      <p>${escapeHtml(p.desc)}</p>
      <div class="pf-meta">${escapeHtml(p.stack)}</div>
    </div>`
    )
    .join("");
}

export function renderCaseStudies(cases) {
  if (!cases.length) return "";
  return cases
    .map(
      (c) => `
    <div class="case-row reveal">
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
    <div class="stat-cell reveal">
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
    <div class="team-card reveal">
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
    <div class="price-card reveal${p.featured ? " featured" : ""}">
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
    <div class="faq-item reveal" data-i="${i}">
      <button class="faq-q">${escapeHtml(f.q)}${icons.plus}</button>
      <div class="faq-a"><p>${escapeHtml(f.a)}</p></div>
    </div>`
    )
    .join("");
}
