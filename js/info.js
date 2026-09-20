// js/info.js
// ফুটারের Quick Links-এর পাতাগুলো: About Us, Privacy Policy, Terms & Conditions, Help & Support, Credits।
// প্রতিটা একটা তথ্য-শিটে খোলে (ডেস্কটপে মাঝখানে, ফোনে নিচ থেকে ওঠে) এবং URL-এ #about, #privacy, #terms,
// #help, #credits বসে — তাই সরাসরি লিংক শেয়ার করা যায় (যেমন Google/GitHub লগইনের গোপনীয়তা-নীতির লিংকে)।
//
// ক্লায়েন্ট যা পড়েন সেই সব লেখা এখন ইংরেজিতে, আর কোনো টেক-স্ট্যাক/লাইব্রেরির নাম নেই (ইচ্ছাকৃত)।
// লেখা বদলাতে হলে নিচের পাতা-ফাংশনগুলোতে (aboutPage, privacyPage ...) সরাসরি এডিট করুন।
//   **এভাবে লিখলে মোটা** হয়,   {{credits|Credits}} লিখলে অন্য পাতার লিংক হয়।
// আইনি তারিখ বদলাতে শুধু UPDATED_ISO বদলান।
//
// ব্রাউজারের Back বাটন আগে শিট বন্ধ করে (PWA-তে অ্যাপ থেকে বেরিয়ে যায় না)। লেখাগুলো কোডে — অফলাইনেও খোলে।
// ⚠️ Privacy/Terms সাধারণ ও সহজ ভাষার খসড়া — প্রকাশের আগে নিজের ব্যবসার বাস্তবতার সাথে মিলিয়ে নিন (দরকারে আইনজীবীকে দেখান)।
//    বিশেষ করে: সাইটে অ্যানালিটিক্স/বিজ্ঞাপন ট্র্যাকার যোগ করলে Privacy-র "Cookies" অংশ অবশ্যই হালনাগাদ করুন।

import { icons, icon } from "./icons.js";
import { CONTACT, whatsappUrl, telUrl, mailUrl } from "./contact.js";
import { escapeHtml as esc } from "./utils.js";
import { lockScroll, unlockScroll } from "./scrolllock.js";

export const INFO_ORDER = ["about", "privacy", "terms", "help", "credits"];

export const INFO_LABELS = {
  about: { label: "About Us", tagline: "Who we are and how we work", tone: "blue", icon: "info" },
  privacy: { label: "Privacy Policy", tagline: "How we handle your information", tone: "violet", icon: "shieldCheck" },
  terms: { label: "Terms & Conditions", tagline: "The rules for using our services", tone: "slate", icon: "doc" },
  help: { label: "Help & Support", tagline: "Answers and direct support", tone: "mint", icon: "help" },
  credits: { label: "Credits", tagline: "The people behind this site", tone: "rose", icon: "heart" }
};

/* ------------------------------------------------------------------ লেখার ছোট হেল্পার */
const UPDATED_ISO = "2026-09-20";
const UPDATED = new Date(`${UPDATED_ISO}T00:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
});

/** টেক্সট → নিরাপদ HTML। **মোটা**, আর {{privacy|লেখা}} দিয়ে অন্য পাতার লিংক */
const md = (t) =>
  esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\{\{(\w+)\|([^}]+)\}\}/g, (_, k, label) =>
      INFO_LABELS[k] ? `<a class="info-link" href="#${k}" data-info-go="${k}">${label}</a>` : label
    );

const p = (t) => `<p>${md(t)}</p>`;
const ul = (items) => `<ul class="info-list">${items.map((i) => `<li>${md(i)}</li>`).join("")}</ul>`;
const note = (t) => `<div class="info-note">${md(t)}</div>`;
const sec = (title, body, n) =>
  `<section class="info-sec"><h3>${n ? `<span class="n" aria-hidden="true">${n}</span>` : ""}<span>${esc(title)}</span></h3>${body}</section>`;
const metaLine = () =>
  `<span class="info-meta">${icons.calendar}<span>Last updated: <time datetime="${UPDATED_ISO}">${UPDATED}</time></span></span>`;

const card = (tone, iconKey, title, desc) =>
  `<div class="info-card tone-${tone}"><span class="ico" aria-hidden="true">${icon(iconKey)}</span><b>${esc(title)}</b><span>${esc(desc)}</span></div>`;

/** Call / WhatsApp / Email — তিনটা বড় ট্যাপ-অ্যাকশন */
function contactBlock() {
  const mail = CONTACT.emails[0].address;
  return `<div class="info-actions">
    <a class="info-action tone-slate" href="${esc(telUrl())}"><span class="ico" aria-hidden="true">${icons.phone}</span><span class="txt"><b>Call</b><small>${esc(CONTACT.phone.local)}</small></span></a>
    <a class="info-action tone-mint" href="${esc(whatsappUrl())}" target="_blank" rel="noopener noreferrer"><span class="ico" aria-hidden="true">${icons.whatsappFill}</span><span class="txt"><b>WhatsApp</b><small>Send a message</small></span><span class="sr-only"> (opens in a new tab)</span></a>
    <a class="info-action tone-violet" href="${esc(mailUrl(mail))}"><span class="ico" aria-hidden="true">${icons.mail}</span><span class="txt"><b>Email</b><small>${esc(mail)}</small></span></a>
  </div>`;
}

function moreLinks(current) {
  const chips = INFO_ORDER.filter((k) => k !== current)
    .map((k) => `<a class="chip" href="#${k}" data-info-go="${k}">${esc(INFO_LABELS[k].label)}</a>`)
    .join("");
  return `<div class="info-more"><span>Explore more</span><div class="info-more-row">${chips}</div></div>`;
}

/* ------------------------------------------------------------------ পাতার লেখা */
function aboutPage() {
  return `
    <p class="info-lead">${md("Tech Verse is a software agency that turns ideas into **fast, secure and beautifully crafted** digital products. From the first conversation to launch day and beyond, we work as an extension of your team.")}</p>

    ${sec("What we do", `<div class="info-cards">
      ${card("blue", "code", "Web Applications", "Custom, high-performance web apps built around your workflow and your customers.")}
      ${card("mint", "device", "Mobile-Ready Apps", "Installable, app-like experiences that open instantly and keep working offline.")}
      ${card("violet", "server", "Cloud & Backend Systems", "Secure sign-in, real-time data and dependable infrastructure that grows with you.")}
      ${card("blue", "layout", "UI/UX Design", "Clean, intuitive, mobile-first interfaces shaped around how people really use them.")}
      ${card("mint", "link", "Integrations", "Payments, notifications and third-party services connected into one seamless system.")}
      ${card("violet", "shield", "Support & Maintenance", "Bug fixes, updates and proactive monitoring long after launch day.")}
    </div>`)}

    ${sec("How we work", `<ol class="info-steps">
      <li><span>${md("**Discover** — We learn your goals, users and constraints before we write a single line of code.")}</span></li>
      <li><span>${md("**Plan** — You get a clear scope, timeline and cost, with no surprises along the way.")}</span></li>
      <li><span>${md("**Build** — We deliver in stages and share progress regularly, so you can review and steer as we go.")}</span></li>
      <li><span>${md("**Launch & support** — We go live together, then stay close for updates, fixes and future growth.")}</span></li>
    </ol>`)}

    ${sec("What we stand for", ul([
      "**Performance first** — Fast load times and smooth interactions on every device.",
      "**Mobile-first design** — Most people browse on their phones, so that’s where every design starts.",
      "**Security by design** — Secure sign-in and strict access rules protect your data from day one.",
      "**Honest communication** — Clear updates on progress, timelines and cost, at every step."
    ]))}

    ${sec("Have a project in mind?", `
      ${p("Tell us about your idea and we’ll come back with a clear plan. Send a project request, or reach out to us directly.")}
      <div class="info-cta"><button type="button" class="btn btn-primary" data-info-action="start">Start a project</button></div>
      ${contactBlock()}`)}

    ${moreLinks("about")}`;
}

function privacyPage() {
  return `
    <p class="info-lead">${md("Your privacy matters to us. This policy explains, in plain language, what we collect, why we collect it, how we protect it and the choices you have.")}</p>
    ${metaLine()}

    ${sec("Privacy at a glance", `<div class="info-cards cols-3">
      ${card("violet", "shieldCheck", "Never sold", "We don’t sell your information or share it with advertisers.")}
      ${card("blue", "lock", "No ad tracking", "No advertising cookies or third-party analytics trackers.")}
      ${card("mint", "user", "You’re in control", "Update your details any time, or ask us to delete them.")}
    </div>`)}

    ${sec("Information we collect", ul([
      "**Account details** — Your name and email address, plus optional extras such as a phone number, short bio and profile photo. If you sign in with Google or GitHub, we receive your name, email address and profile photo from that service.",
      "**Project requests** — The details you submit through our project form: name, email, phone or WhatsApp number, budget, timeline and project description.",
      "**Information stored on your device** — Your sign-in session, display preferences (such as light or dark theme) and cached site files that help pages load faster and work offline."
    ]) + p("We can’t see your password — it is handled securely by our authentication provider."), 1)}

    ${sec("How we use your information", ul([
      "To create, secure and maintain your account;",
      "To respond to your project requests and keep you updated on progress;",
      "To fix issues and improve our website and services;",
      "To provide support when you contact us."
    ]) + note("**We never sell your personal information**, and we don’t share it with advertisers."), 2)}

    ${sec("Where your information is stored, and who can access it", ul([
      "**Cloud hosting** — Account and project-request data is stored with trusted cloud providers that host and secure our platform. Their servers may be located outside Bangladesh.",
      "**Fonts and site assets** — Some site assets, such as fonts, are delivered by third-party services. When your browser requests them, those services may receive your IP address and basic device details.",
      "**Google and GitHub sign-in** — If you choose either option, that provider’s own privacy policy applies to the sign-in process.",
      "**Links to other services** — WhatsApp, Facebook, YouTube, phone and email links take you outside our site to those apps and services, which operate under their own policies."
    ]) + p("We may disclose information when required by law or a valid legal request, or when it is necessary to prevent fraud and protect the security of our users and services."), 3)}

    ${sec("Cookies, local storage and tracking", p("We don’t use advertising cookies or third-party analytics trackers. Your browser’s storage is used only for essentials — keeping you signed in and remembering preferences such as your theme. Clearing your browser’s site data removes these items, and you’ll need to sign in again.") + p("If we add anything of this kind in the future, we’ll update this policy to reflect it."), 4)}

    ${sec("Your rights and choices", ul([
      "**Access and correction** — Update your name, phone number, bio and photo at any time from Profile → Edit profile.",
      "**Deletion** — Ask us to delete your account and related data using any of the contact options below. We’ll take care of it, except for records we are legally required to keep.",
      "**Questions and objections** — Ask how your information is used, or object to a particular use, whenever you like."
    ]), 5)}

    ${sec("How long we keep information", p("We keep account information for as long as your account is active, and project records for as long as needed to deliver the work and provide support. Once we receive a deletion request, we act on it within a reasonable time."), 6)}

    ${sec("Security", p("We protect your information with encrypted connections (HTTPS), secure authentication and strict access rules, so each user can see only their own data (authorised administrators aside). No online service can promise absolute security, so please choose a strong password and never share it with anyone."), 7)}

    ${sec("Children’s privacy", p("Our website is not directed at children. If you are under 18, please use it with the permission and supervision of a parent or guardian."), 8)}

    ${sec("Changes to this policy", p("If we make significant changes, we’ll publish the updated policy on this page with a new “last updated” date."), 9)}

    ${sec("Contact us", p("Have a question or request about your privacy? Get in touch any time:") + contactBlock(), 10)}

    ${moreLinks("privacy")}`;
}

function termsPage() {
  return `
    <p class="info-lead">${md("By using the Tech Verse website and services, you agree to the terms below. We’ve written them in plain, straightforward language.")}</p>
    ${metaLine()}

    ${sec("Our services", p("Tech Verse provides software design and development services, including web applications, mobile-ready apps, cloud and backend systems, UI/UX design, integrations and ongoing support. This website lets you explore our work and send us a project request."), 1)}

    ${sec("Your account", ul([
      "Provide accurate information when you create an account.",
      "Keep your password confidential. You are responsible for all activity under your account.",
      "We may suspend or close accounts that show suspicious or abusive behaviour."
    ]), 2)}

    ${sec("Project requests and agreements", ul([
      "Submitting the project form starts a conversation — it is not a binding commitment for either side.",
      "Scope, timeline, pricing and payment terms are set out in a separate written proposal or agreement. Work begins only once both parties have agreed to it.",
      "Packages shown on this website are indicative. Final pricing is confirmed after a consultation."
    ]), 3)}

    ${sec("Payments, changes and cancellations", p("Payment schedules, changes to scope, cancellations and refunds are covered in each project’s written proposal or agreement, which is the final authority for that project."), 4)}

    ${sec("Intellectual property", ul([
      "The design, content, code and branding of this website belong to Tech Verse and may not be copied, sold or redistributed without our permission.",
      "Ownership and usage rights for client projects are as set out in the relevant agreement.",
      "Third-party fonts, icons and other resources remain the property of their creators and are used under their respective licences — see {{credits|Credits}}."
    ]), 5)}

    ${sec("Acceptable use", p("You agree not to:") + ul([
      "use the site for any unlawful purpose;",
      "try to access another person’s account or data without permission;",
      "disrupt or compromise the security or performance of the site, including through spam, fake requests or automated attacks;",
      "send abusive, misleading or harmful content."
    ]), 6)}

    ${sec("Third-party services and links", p("Services such as Google, GitHub, WhatsApp, Facebook and YouTube operate under their own terms. We are not responsible for their content, availability or policies."), 7)}

    ${sec("Availability and liability", ul([
      "The website is provided “as is”. Interruptions can happen because of maintenance, connectivity or third-party issues, so we can’t guarantee uninterrupted access.",
      "To the extent the law allows, we are not liable for indirect or incidental losses, and our total liability for any claim relating to a service will not exceed the amount you paid us for that service."
    ]), 8)}

    ${sec("Changes to these terms", p("We may update these terms from time to time. Changes will be posted on this page with a new date, and continuing to use the site means you accept the updated terms. You can stop using the site at any time."), 9)}

    ${sec("Governing law and disputes", p("These terms are governed by the laws of Bangladesh. If a disagreement arises, we will first try to resolve it through good-faith discussion."), 10)}

    ${sec("Contact us", p("Questions about these terms? We’re happy to help:") + contactBlock(), 11)}

    ${moreLinks("terms")}`;
}

const HELP_QA = [
  {
    q: "How do I start a new project?",
    a: "Head to the project form at the bottom of the home page. It takes two short steps: choose a service and add your contact details, then share your budget, timeline and a few words about your idea. We’ll get back to you soon.",
    action: { key: "start", label: "Go to the project form" }
  },
  {
    q: "Where can I track my request?",
    a: "Sign in and tap your profile picture in the header, then open **My Project**. Every request is listed with its current status — New, Contacted, In progress, Completed or Cancelled."
  },
  {
    q: "I forgot my password. What should I do?",
    a: "On the sign-in form, choose **Forgot password?** and enter your email address — we’ll send you a reset link. If it doesn’t arrive, check your spam or promotions folder. If you’re already signed in, you can also send yourself a reset link from **Account Setting**.",
    action: { key: "login", label: "Open sign-in" }
  },
  {
    q: "I can’t sign in.",
    a: "Double-check your email address and password. If you originally signed up with Google or GitHub, use that same method to sign in. Still stuck? Contact us and mention the email address you’re using — it helps us assist you faster."
  },
  {
    q: "How do I update my profile photo or details?",
    a: "Tap your profile picture and choose **Edit profile**. You can change your name, phone number, bio and photo — new photos are resized automatically."
  },
  {
    q: "Can I install this site as an app on my phone?",
    a: "Yes. In Chrome, open the ⋮ menu and choose **Install app** or **Add to Home screen**. On iPhone, open the site in Safari and tap **Share → Add to Home Screen**. Once installed, the site opens faster and our contact details stay available even without an internet connection."
  },
  {
    q: "The site looks broken or out of date.",
    a: "Refresh the page first. If that doesn’t help, clear this site’s data or cache in your browser settings and open it again."
  }
];

function helpPage() {
  const qa = HELP_QA.map(
    (item) => `<details class="info-q">
      <summary><span>${esc(item.q)}</span>${icons.chevronRight}</summary>
      <div class="ans">${p(item.a)}${item.action ? `<button type="button" class="btn btn-soft btn-sm" data-info-action="${item.action.key}">${esc(item.action.label)}</button>` : ""}</div>
    </details>`
  ).join("");
  return `
    <p class="info-lead">${md("Need a hand? Try the quick answers below, or get in touch directly — we’re glad to help.")}</p>

    ${sec("Contact us directly", contactBlock() + note("We reply as quickly as we can. **For urgent matters**, WhatsApp or a phone call is the fastest way to reach us."))}

    ${sec("Frequently asked questions", qa)}

    ${moreLinks("help")}`;
}

function creditRow(tone, iconKey, title, desc, pills = []) {
  return `<div class="info-credit tone-${tone}">
    <span class="ico" aria-hidden="true">${icon(iconKey)}</span>
    <div class="txt"><b>${esc(title)}</b><span class="d">${md(desc)}</span>
      ${pills.length ? `<div class="info-pills">${pills.map((x) => `<span class="info-pill">${esc(x)}</span>`).join("")}</div>` : ""}
    </div>
  </div>`;
}

function creditsPage() {
  return `
    <p class="info-lead">${md("Great work is never done alone. Here’s a thank-you to the people and resources behind this site.")}</p>

    ${sec("With thanks to", [
      creditRow("blue", "code", "Tech Verse — Design & Development", "This website was designed and built in-house by the Tech Verse team.", ["Design", "Development"]),
      creditRow("mint", "book", "Typography", "**Plus Jakarta Sans**, **Hind Siliguri** and **JetBrains Mono** — created by their respective type designers and used under the SIL Open Font Licence.", ["Open licence"]),
      creditRow("violet", "sparkle", "Iconography", "A custom icon set drawn for this website, with a few glyphs adapted from open-source icon libraries and used under their licences.", ["Open source"]),
      creditRow("slate", "shield", "Brands & trademarks", "Google, GitHub, WhatsApp, Facebook, YouTube and Yahoo names and logos are trademarks of their respective owners, shown only to help you recognise those services.", ["Trademarks"]),
      creditRow("rose", "heart", "You", "Thank you to our clients, visitors and community for your trust and feedback — it shapes everything we build.")
    ].join(""))}

    ${moreLinks("credits")}`;
}

const PAGES = { about: aboutPage, privacy: privacyPage, terms: termsPage, help: helpPage, credits: creditsPage };

/* ------------------------------------------------------------------ শিট (খোলা/বন্ধ, হিস্ট্রি, ফোকাস) */
let api = null;

export function openInfo(key) {
  if (api) api.open(key);
}

export function initInfo(opts = {}) {
  if (api) return api;

  const overlay = document.createElement("div");
  overlay.className = "info-overlay";
  overlay.id = "infoOverlay";
  overlay.innerHTML = `
    <div class="info-sheet" role="dialog" aria-modal="true" aria-labelledby="infoTitle" lang="en">
      <header class="info-head">
        <span class="info-ico" id="infoIco"></span>
        <div class="info-titles"><h2 id="infoTitle" tabindex="-1" lang="en"></h2><p id="infoSub"></p></div>
        <button type="button" class="info-close" aria-label="Close">${icons.close}</button>
      </header>
      <div class="info-body" id="infoBody"></div>
    </div>`;
  document.body.appendChild(overlay);

  const sheet = overlay.querySelector(".info-sheet");
  const ico = overlay.querySelector("#infoIco");
  const title = overlay.querySelector("#infoTitle");
  const sub = overlay.querySelector("#infoSub");
  const body = overlay.querySelector("#infoBody");
  const originalTitle = document.title;

  const state = {
    open: false,
    key: null,
    depth: 0,          // এই শিট থেকে আমরা যতগুলো history এন্ট্রি যোগ করেছি
    deepLoaded: false, // শিটের নিচের এন্ট্রিটার URL-এ নিজেই #key আছে (সরাসরি লিংক/টাইপ করা)
    expectClean: false,
    navigating: false,
    pending: [],
    lastFocus: null
  };

  const cleanUrl = () => window.location.pathname + window.location.search;
  const keyFromHash = () => {
    const k = window.location.hash.replace("#", "");
    return PAGES[k] ? k : null;
  };

  function afterNav(fn) {
    if (state.navigating) state.pending.push(fn);
    else fn();
  }
  function flushPending() {
    state.pending.splice(0).forEach((fn) => fn());
  }
  function travel(n) {
    state.navigating = true;
    history.go(-n);
    setTimeout(() => { if (state.navigating) { state.navigating = false; flushPending(); } }, 400);
  }

  function render(key) {
    const meta = INFO_LABELS[key];
    state.key = key;
    ico.className = `info-ico tone-${meta.tone}`;
    ico.innerHTML = icon(meta.icon);
    title.textContent = meta.label;
    sub.textContent = meta.tagline;
    body.innerHTML = PAGES[key]();
    body.scrollTop = 0;
    document.title = `${meta.label} — ${CONTACT.brand}`;
  }

  function show(key, { push }) {
    const wasOpen = state.open;
    if (!wasOpen) {
      state.lastFocus = document.activeElement;
      state.open = true;
      lockScroll();
      overlay.classList.add("open");
    }
    render(key);
    if (push) {
      state.depth += 1;
      try { history.pushState({ tvInfo: state.depth }, "", `#${key}`); } catch (_) {}
    }
    if (!wasOpen) setTimeout(() => title.focus({ preventScroll: true }), 60);
  }

  function hide() {
    if (!state.open) return;
    state.open = false;
    overlay.classList.remove("open");
    unlockScroll();
    document.title = originalTitle;
    const f = state.lastFocus;
    state.lastFocus = null;
    if (f && document.contains(f) && typeof f.focus === "function") setTimeout(() => f.focus({ preventScroll: true }), 0);
  }

  function open(key) {
    if (!PAGES[key]) return;
    afterNav(() => {
      if (state.open && state.key === key) return;
      if (!state.open) state.deepLoaded = false;
      show(key, { push: true });
    });
  }

  function close() {
    if (!state.open) return;
    const depth = state.depth;
    const deep = state.deepLoaded;
    state.depth = 0;
    state.deepLoaded = false;
    hide();
    if (depth > 0) {
      state.expectClean = deep;
      travel(depth);
    } else if (deep) {
      try { history.replaceState(null, "", cleanUrl()); } catch (_) {}
    }
  }

  /** URL/হিস্ট্রির সাথে শিটের অবস্থা মেলানো (Back/Forward, হাতে লেখা #লিংক, সরাসরি লিংকে ঢোকা) */
  function sync() {
    state.navigating = false;
    const key = keyFromHash();
    const st = window.history.state;
    const d = (st && st.tvInfo) || 0;
    if (state.expectClean) {
      state.expectClean = false;
      if (key) { try { history.replaceState(null, "", cleanUrl()); } catch (_) {} }
      hide();
    } else if (key) {
      if (!state.open) {
        state.depth = d;
        state.deepLoaded = d === 0;
        show(key, { push: false });
      } else {
        state.depth = d;
        if (key !== state.key) render(key);
      }
    } else if (state.open) {
      state.depth = 0;
      state.deepLoaded = false;
      hide();
    }
    flushPending();
  }

  window.addEventListener("popstate", sync);
  window.addEventListener("hashchange", () => {
    // popstate আগে থেকেই মিলিয়ে দিয়ে থাকলে কিছু করার নেই (sync ইডেমপোটেন্ট)
    const key = keyFromHash();
    if ((key && (!state.open || key !== state.key)) || (!key && state.open)) sync();
  });

  /* ক্লিক: ফুটারের লিংক ([data-info]), শিটের ভেতরের ক্রস-লিংক ([data-info-go]), বাটন ([data-info-action]) */
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-info], [data-info-go]");
    if (link) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // নতুন ট্যাবে খুললে আসল #লিংকেই যাবে
      e.preventDefault();
      open(link.dataset.info || link.dataset.infoGo);
      return;
    }
    const act = e.target.closest("[data-info-action]");
    if (act && overlay.contains(act)) {
      const which = act.dataset.infoAction;
      close();
      afterNav(() => requestAnimationFrame(() => {
        if (which === "start" && opts.onStartProject) opts.onStartProject();
        if (which === "login" && opts.onOpenAuth) opts.onOpenAuth("login");
      }));
      return;
    }
    if (e.target === overlay || e.target.closest(".info-close")) close();
  });

  document.addEventListener("keydown", (e) => {
    if (!state.open) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...sheet.querySelectorAll('a[href], button:not([disabled]), summary, [tabindex="0"]')].filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!sheet.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement === title)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // সরাসরি লিংকে ঢুকলে (যেমন /index.html#privacy) শিট খুলে দেয়
  if (keyFromHash()) sync();

  api = { open, close, isOpen: () => state.open };
  return api;
}
