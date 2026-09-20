// js/footer.js
// ফুটার রেন্ডার — Quick Links + Contact Us। সব তথ্য js/contact.js থেকে আসে (কোডে), তাই Firestore বা
// অ্যাডমিন প্যানেল লাগে না; ইন্টারনেট না থাকলেও (Service Worker-এর ক্যাশ থেকে) ঠিকঠাক দেখায়।
//
// প্রতিটা সারি ট্যাপ করলে নিজের কাজ করে:
//   Facebook / YouTube / WhatsApp → নতুন ট্যাবে খোলে (WhatsApp-এ আগে থেকে লেখা মেসেজসহ)
//   Email  → মেইল অ্যাপ খোলে       Call → সরাসরি ডায়াল হয়
//   Quick Links → js/info.js-এর তথ্য-শিট
// ইমেইল ও ফোনের পাশের ছোট বাটনে চাপলে কপি হয় (ডেস্কটপে কল/মেইল অ্যাপ না থাকলে কাজে আসে)।

import { icons } from "./icons.js";
import { CONTACT, whatsappUrl, telUrl, mailUrl } from "./contact.js";
import { INFO_ORDER, INFO_LABELS } from "./info.js";
import { showToast } from "./toast.js";
import { escapeHtml as esc } from "./utils.js";

const chev = () => icons.chevronRight;
const sr = (t) => `<span class="sr-only"> (${t})</span>`;

function contactRows() {
  const rows = [
    {
      tone: "blue", icon: icons.facebook, title: "Facebook", sub: CONTACT.facebook.handle,
      href: CONTACT.facebook.url, external: true
    },
    {
      tone: "rose", icon: icons.youtube, title: "YouTube Channel", sub: CONTACT.youtube.handle,
      href: CONTACT.youtube.url, external: true
    },
    {
      tone: "mint", icon: icons.whatsappFill, title: "WhatsApp", sub: CONTACT.whatsapp.display,
      href: whatsappUrl(), external: true
    },
    ...CONTACT.emails.map((m) => ({
      tone: "violet", icon: m.kind === "yahoo" ? icons.yahoo : icons.mail, title: m.address, sub: "Email",
      href: mailUrl(m.address), copy: m.address, copyLabel: "email address", addr: true,
      // লাইন ভাঙতে হলে @ ও . -এর পরে ভাঙবে (gmail.co|m-এর মতো নয়)
      titleHtml: esc(m.address).replace(/([@.])/g, "$1<wbr>")
    })),
    {
      tone: "slate", icon: icons.phone, title: "Call", sub: CONTACT.phone.local,
      href: telUrl(), copy: CONTACT.phone.local, copyLabel: "phone number"
    }
  ];

  return rows
    .map((r) => {
      const ext = r.external ? ` target="_blank" rel="noopener noreferrer"` : "";
      const go = r.external ? icons.external.replace("<svg", '<svg class="contact-go"') : "";
      const hint = r.external ? sr("opens in a new tab") : "";
      const copy = r.copy
        ? `<button type="button" class="contact-copy" data-copy="${esc(r.copy)}" aria-label="Copy ${esc(r.copyLabel)}">${icons.copy}</button>`
        : "";
      return `<li class="contact-item tone-${r.tone}">
        <a class="contact-link" href="${esc(r.href)}"${ext}>
          <span class="contact-ico" aria-hidden="true">${r.icon}</span>
          <span class="contact-txt"><b${r.addr ? ' class="addr"' : ""}>${r.titleHtml || esc(r.title)}</b><small>${esc(r.sub)}</small></span>${go}${hint}
        </a>${copy}
      </li>`;
    })
    .join("");
}

function quickLinks() {
  return INFO_ORDER.map((key) => {
    const meta = INFO_LABELS[key];
    return `<li><a href="#${key}" data-info="${key}" aria-haspopup="dialog"><span lang="en">${esc(meta.label)}</span>${chev()}</a></li>`;
  }).join("");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // পুরোনো ব্রাউজার / নিরাপদ নয় এমন প্রসঙ্গে (http) — বিকল্প উপায়
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }
}

export function renderFooter(el) {
  if (!el) return;
  const year = new Date().getFullYear();
  el.setAttribute("lang", "en"); // ফুটারের সব লেখা ইংরেজি — স্ক্রিন রিডার ও ফন্ট ঠিকমতো বেছে নেয়
  el.innerHTML = `
    <div class="wrap">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="#home" class="brand"><img src="./assets/logo.png" alt="TVsite" class="brand-logo"></a>
          <p>We design, build and support modern websites, web apps and digital products — from the first idea to long-term growth.</p>
          <div class="footer-social">
            <a class="social-btn" href="${esc(CONTACT.facebook.url)}" target="_blank" rel="noopener noreferrer" aria-label="Facebook">${icons.facebook}</a>
            <a class="social-btn" href="${esc(CONTACT.youtube.url)}" target="_blank" rel="noopener noreferrer" aria-label="YouTube">${icons.youtube}</a>
            <a class="social-btn" href="${esc(whatsappUrl())}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">${icons.whatsappFill}</a>
          </div>
        </div>

        <nav class="footer-col" aria-labelledby="ftQuick">
          <h3 class="footer-title" id="ftQuick" lang="en">Quick Links</h3>
          <ul class="footer-links">${quickLinks()}</ul>
        </nav>

        <div class="footer-col">
          <h3 class="footer-title" lang="en">Contact Us</h3>
          <ul class="contact-list">${contactRows()}</ul>
        </div>
      </div>

      <div class="footer-bottom">
        <span lang="en">© ${year} ${esc(CONTACT.brand)}. All rights reserved.</span>
        <span lang="en">Fast · Secure · Beautifully crafted</span>
      </div>
    </div>`;

  // কপি বাটন (ইমেইল / ফোন)
  el.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const text = btn.dataset.copy;
    const ok = await copyText(text);
    showToast(ok ? `Copied: ${text}` : "Couldn't copy — please select the text and copy it manually.", ok ? "success" : "error");
  });
}
