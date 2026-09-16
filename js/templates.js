// js/templates.js
// data.js-এর কন্টেন্ট থেকে প্রতিটি সেকশনের HTML তৈরি করে।

const icons = {
  code: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6 2 12l6 6M16 6l6 6-6 6"/></svg>',
  device: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  server: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><circle cx="7" cy="7" r=".6" fill="currentColor"/><circle cx="7" cy="17" r=".6" fill="currentColor"/></svg>',
  layout: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
  link: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  arrow: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
};

export function renderServices(services) {
  return services
    .map(
      (s, i) => `
    <div class="service-card reveal">
      <span class="service-num">${String(i + 1).padStart(2, "0")}</span>
      <div class="service-icon">${icons[s.icon] || icons.code}</div>
      <h3>${s.title}</h3>
      <p>${s.desc}</p>
    </div>`
    )
    .join("");
}

export function renderPortfolio(items) {
  return items
    .map(
      (p) => `
    <div class="pf-card reveal" data-category="${p.category}">
      <div class="pf-top">
        <span class="pf-tag">${p.tag}</span>
      </div>
      <h3>${p.title}</h3>
      <p>${p.desc}</p>
      <div class="pf-meta">${p.stack}</div>
    </div>`
    )
    .join("");
}

export function renderCaseStudies(cases) {
  return cases
    .map(
      (c) => `
    <div class="case-row reveal">
      <div>
        <h4>${c.title}</h4>
        <p>${c.desc}</p>
      </div>
      <div class="case-metric"><b>${c.metric1.value}</b><span>${c.metric1.label}</span></div>
      <div class="case-metric"><b>${c.metric2.value}</b><span>${c.metric2.label}</span></div>
    </div>`
    )
    .join("");
}

export function renderStats(stats) {
  return stats
    .map(
      (s) => `
    <div class="stat-cell reveal">
      <b data-count="${s.value}" data-suffix="${s.suffix}">0${s.suffix}</b>
      <span>${s.label}</span>
    </div>`
    )
    .join("");
}

export function renderTestimonials(list) {
  return list
    .map(
      (t, i) => `
    <div class="tm-slide${i === 0 ? " active" : ""}" data-i="${i}">
      <p class="tm-quote">“${t.quote}”</p>
      <div class="tm-person"><b>${t.name}</b><span>${t.role}</span></div>
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
  return team
    .map(
      (m) => `
    <div class="team-card reveal">
      <div class="team-avatar">${m.name.charAt(0)}</div>
      <h4>${m.name}</h4>
      <span>${m.role}</span>
    </div>`
    )
    .join("");
}

export function renderPricing(plans) {
  return plans
    .map(
      (p) => `
    <div class="price-card reveal${p.featured ? " featured" : ""}">
      <span class="price-plan">${p.name}</span>
      <div class="price-amount">${p.price}</div>
      <ul class="price-feat">
        ${p.features.map((f) => `<li>${icons.check}<span>${f}</span></li>`).join("")}
      </ul>
      <button class="btn ${p.featured ? "btn-primary" : "btn-outline"} btn-block" data-open-booking>কোট চান</button>
    </div>`
    )
    .join("");
}

export function renderFAQ(items) {
  return items
    .map(
      (f, i) => `
    <div class="faq-item reveal" data-i="${i}">
      <button class="faq-q">${f.q}${icons.plus}</button>
      <div class="faq-a"><p>${f.a}</p></div>
    </div>`
    )
    .join("");
}
