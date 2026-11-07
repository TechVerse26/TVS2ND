// js/blog/markdown.js
// ব্লগের লেখা (Markdown) → নিরাপদ HTML। কোনো লাইব্রেরি নেই (~২৫০ লাইন), দুই স্তরের সুরক্ষা:
//   স্তর ১) renderMarkdown(): সব টেক্সট আগে escape; ট্যাগ বানায় শুধু এই ফাইল (allowlist) — কাঁচা HTML/স্ক্রিপ্ট কখনো পাস হয় না।
//           লিংক/ছবির URL-এ শুধু নিরাপদ স্কিম (http/https/mailto; ছবিতে শুধু https; অভ্যন্তরীণ #/রিলেটিভ) — javascript:/data: বাদ।
//   স্তর ২) toSafeFragment(): ফলাফল আবার একটা নিষ্ক্রিয় <template>-এ পার্স করে DOM-allowlist দিয়ে ছেঁকে (ট্যাগ + অ্যাট্রিবিউট + URL
//           আবার যাচাই) — প্রথম স্তরে ভুল থাকলেও ধরা পড়ে। লাইভ DOM-এ কখনো কাঁচা Firestore স্ট্রিং innerHTML হয় না।
// সমর্থিত: ## / ### / #### হেডিং (# ও ## দুটোই h2 — পেজের h1 হলো শিরোনাম), অনুচ্ছেদ, **বোল্ড**, *ইটালিক*, ~~কাটা~~, `কোড`, ```কোড-ব্লক```,
//          [লিংক](url), ![ছবি](https://…), - তালিকা / ১. তালিকা (নেস্টেড), > উদ্ধৃতি, ---, টেবিল (| a | b |)।
// অসমর্থিত (ইচ্ছাকৃত): কাঁচা HTML, iframe/embed, স্ক্রিপ্ট — এসব টেক্সট হিসেবে দেখায়।

import { escapeHtml } from "../utils.js";

/* ---------------------------------------------------------------- URL যাচাই */
// ব্রাউজার স্কিমের ভেতরের ট্যাব/নতুন-লাইন/কন্ট্রোল ক্যারেক্টার উপেক্ষা করে ("java\tscript:") — তাই আগে সব সাফ করে স্কিম দেখি
const stripCtl = (s) => String(s || "").replace(/[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g, "");

/** লিংকের href: https/http/mailto, অভ্যন্তরীণ (#…, /…, ./…, ../…)। বাকি সব (javascript:, data:, vbscript:, file: …) → "" */
export function safeHref(raw) {
  const url = String(raw || "").trim();
  const clean = stripCtl(url);
  if (!clean || clean.length > 2048) return "";
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(clean);
  if (scheme) return ["http", "https", "mailto"].includes(scheme[1].toLowerCase()) ? clean : "";
  if (clean.startsWith("//")) return "";                                  // protocol-relative বাদ
  return /^(#|\/|\.\/|\.\.\/)/.test(clean) ? clean : "";
}
/** ছবির src: শুধু https (http ছবি mixed-content হিসেবে ব্লক হয়; data:/blob: নয়) */
export function safeImgSrc(raw) {
  const clean = stripCtl(String(raw || "").trim());
  return /^https:\/\/[^\s"'<>]{1,2040}$/i.test(clean) ? clean : "";
}
const isExternal = (href) => /^https?:/i.test(href);

/* ---------------------------------------------------------------- ইনলাইন */
const NUL = "\u0000";
const MAX_EMPHASIS_LEN = 20000;
/** একটা লাইন/অনুচ্ছেদের ইনলাইন মার্কআপ → HTML। কোড/লিংক/ছবি আগে প্লেসহোল্ডারে সরিয়ে, বাকি টেক্সট escape করে তবেই ইটালিক/বোল্ড বসে। */
export function renderInline(raw) {
  const stash = [];
  const hold = (html) => { stash.push(html); return `${NUL}${stash.length - 1}${NUL}`; };
  let s = String(raw || "").replace(/\u0000/g, "");

  // ১) ইনলাইন কোড: `…` / ``…``
  s = s.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, __, code) => hold(`<code>${escapeHtml(code.trim())}</code>`));
  // ২) ছবি: ![alt](url "title")
  s = s.replace(/!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g, (m, alt, url) => {
    const src = safeImgSrc(url);
    return src ? hold(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`) : escapeHtml(alt);
  });
  // ৩) লিংক: [text](url "title") — text-এর ভেতরে বোল্ড/ইটালিক/কোড চলে (রিকার্সিভ), নেস্টেড লিংক নয়
  s = s.replace(/\[((?:[^\[\]]|`[^`]*`)+)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g, (m, text, url) => {
    const href = safeHref(url);
    const inner = renderInline(text.replace(/\[|\]/g, ""));
    if (!href) return hold(inner);
    const ext = isExternal(href);
    return hold(`<a href="${escapeHtml(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${inner}</a>`);
  });
  // ৪) বাকি সব টেক্সট escape (এরপর আর কোনো '<' থাকে না)
  s = escapeHtml(s);
  if (s.length > MAX_EMPHASIS_LEN) return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)] ?? "");   // অস্বাভাবিক লম্বা অনুচ্ছেদ: ধীর regex এড়াতে জোর-মার্কআপ বাদ
  // ৫) জোর: ***bi***, **b**, *i*, __b__, _i_, ~~del~~  (শব্দের ভেতরের _ বাদ — snake_case নিরাপদ)
  s = s.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>")
       .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
       .replace(/(^|[^*\w])\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/g, "$1<em>$2</em>")
       .replace(/(^|[\s(])__(?=\S)([\s\S]*?\S)__(?=$|[\s).,!?:;])/g, "$1<strong>$2</strong>")
       .replace(/(^|[\s(])_(?=\S)([\s\S]*?\S)_(?=$|[\s).,!?:;])/g, "$1<em>$2</em>")
       .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
  // ৬) দুই-স্পেস + নতুন লাইন = <br>
  s = s.replace(/ {2,}\n/g, "<br>");
  // ৭) প্লেসহোল্ডার ফেরত
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)] ?? "");
}

/* ---------------------------------------------------------------- হেডিং আইডি (TOC-এর জন্য) */
export function headingSlug(text) {
  const s = String(text || "").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return s || "section";
}
const plainOf = (md) => String(md || "").replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_~]/g, "").trim();

/* ---------------------------------------------------------------- ব্লক-পার্সার */
const RE = {
  fence: /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^\n]*$/,
  heading: /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/,
  hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
  quote: /^ {0,3}>[ \t]?/,
  ul: /^( *)([-*+])[ \t]+(.*)$/,
  ol: /^( *)(\d{1,9})[.)][ \t]+(.*)$/,
  tableSep: /^ *\|? *:?-{1,}:? *(\| *:?-{1,}:? *)*\|? *$/
};
const splitRow = (line) => {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
};
const isBlockStart = (l) => RE.fence.test(l) || RE.heading.test(l) || RE.hr.test(l) || RE.quote.test(l) || RE.ul.test(l) || RE.ol.test(l);

/** Markdown → { html, headings:[{level,id,text}] } — html সবসময় নিরাপদ-by-construction (ও toSafeFragment-এ আবার ছাঁকা হয়) */
export function renderMarkdown(source) {
  const lines = String(source || "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const headings = [];
  const usedIds = new Map();
  const uid = (base) => { const n = (usedIds.get(base) || 0) + 1; usedIds.set(base, n); return n === 1 ? base : `${base}-${n}`; };

  function blocks(ls) {
    const out = [];
    let i = 0;
    while (i < ls.length) {
      const line = ls[i];
      if (!line.trim()) { i++; continue; }

      // কোড-ব্লক
      let m = RE.fence.exec(line);
      if (m) {
        const mark = m[1], lang = /^[A-Za-z0-9+#.-]{1,20}$/.test(m[2]) ? m[2].toLowerCase().replace(/[^a-z0-9+#-]/g, "") : "";
        const buf = []; i++;
        while (i < ls.length && !(new RegExp(`^ {0,3}${mark[0]}{${mark.length},}\\s*$`).test(ls[i]))) { buf.push(ls[i]); i++; }
        i++; // বন্ধ-ফেন্স
        out.push(`<pre><code${lang ? ` class="language-${lang}"` : ""}>${escapeHtml(buf.join("\n"))}</code></pre>`);
        continue;
      }
      // হেডিং: # ও ## → h2; ### → h3; #### বা বেশি → h4
      m = RE.heading.exec(line);
      if (m) {
        const level = m[1].length <= 2 ? 2 : m[1].length === 3 ? 3 : 4;
        const text = plainOf(m[2]);
        const id = "bh-" + uid(headingSlug(text));
        headings.push({ level, id, text });
        out.push(`<h${level} id="${id}">${renderInline(m[2])}</h${level}>`);
        i++; continue;
      }
      if (RE.hr.test(line)) { out.push("<hr>"); i++; continue; }
      // উদ্ধৃতি
      if (RE.quote.test(line)) {
        const buf = [];
        while (i < ls.length && (RE.quote.test(ls[i]) || (ls[i].trim() && !isBlockStart(ls[i]) && buf.length))) { buf.push(ls[i].replace(RE.quote, "")); i++; }
        out.push(`<blockquote>${blocks(buf).join("")}</blockquote>`);
        continue;
      }
      // টেবিল
      if (line.includes("|") && i + 1 < ls.length && RE.tableSep.test(ls[i + 1]) && ls[i + 1].includes("-")) {
        const head = splitRow(line), seps = splitRow(ls[i + 1]);
        if (head.length === seps.length) {
          const al = seps.map((c) => (/^:-+:$/.test(c) ? "al-c" : /-:$/.test(c) ? "al-r" : ""));
          const cell = (tag, c, k) => `<${tag}${al[k] ? ` class="${al[k]}"` : ""}>${renderInline(c)}</${tag}>`;
          const rows = []; i += 2;
          while (i < ls.length && ls[i].trim() && ls[i].includes("|")) {
            const cs = splitRow(ls[i]);
            rows.push(`<tr>${head.map((_, k) => cell("td", cs[k] || "", k)).join("")}</tr>`); i++;
          }
          out.push(`<div class="bl-table-wrap"><table><thead><tr>${head.map((c, k) => cell("th", c, k)).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`);
          continue;
        }
      }
      // তালিকা (নেস্টেড: বাড়তি ইন্ডেন্ট = ভেতরের তালিকা)
      if (RE.ul.test(line) || RE.ol.test(line)) {
        const res = list(ls, i);
        out.push(res.html); i = res.next;
        continue;
      }
      // অনুচ্ছেদ
      const buf = [line];
      i++;
      while (i < ls.length && ls[i].trim() && !isBlockStart(ls[i]) && !(ls[i].includes("|") && i + 1 < ls.length && RE.tableSep.test(ls[i + 1]) && ls[i + 1].includes("-"))) { buf.push(ls[i]); i++; }
      out.push(`<p>${renderInline(buf.join("\n"))}</p>`);
    }
    return out;
  }

  function list(ls, start) {
    const first = RE.ul.exec(ls[start]) || RE.ol.exec(ls[start]);
    const ordered = !RE.ul.test(ls[start]);
    const baseIndent = first[1].length;
    const tag = ordered ? "ol" : "ul";
    const startNum = ordered ? Number(first[2]) : 1;
    const items = [];
    let i = start;
    while (i < ls.length) {
      const m = (ordered ? RE.ol : RE.ul).exec(ls[i]);
      if (!m || m[1].length !== baseIndent) {
        // একই-স্তরের অন্য ধরনের তালিকা বা কম ইন্ডেন্ট → শেষ
        if (!ls[i].trim()) {
          // ফাঁকা লাইনের পরে একই তালিকার পরের আইটেম থাকলে চালিয়ে যাই
          let j = i; while (j < ls.length && !ls[j].trim()) j++;
          const nm = j < ls.length ? (ordered ? RE.ol : RE.ul).exec(ls[j]) : null;
          if (nm && nm[1].length === baseIndent) { i = j; continue; }
        }
        break;
      }
      const body = [m[ordered ? 3 : 3]];
      i++;
      // এই আইটেমের ভেতরের লাইন: বেশি ইন্ডেন্টযুক্ত (নেস্টেড বা ধারাবাহিক) বা ফাঁকা+বেশি-ইন্ডেন্ট
      const sub = [];
      while (i < ls.length) {
        const l = ls[i];
        if (!l.trim()) { let j = i; while (j < ls.length && !ls[j].trim()) j++; if (j < ls.length && /^ +/.test(ls[j]) && ls[j].match(/^ */)[0].length > baseIndent) { sub.push(""); i++; continue; } break; }
        if (l.match(/^ */)[0].length > baseIndent) { sub.push(l.slice(Math.min(l.match(/^ */)[0].length, baseIndent + 2))); i++; continue; }
        break;
      }
      let inner = renderInline(body[0]);
      if (sub.some((l) => l.trim())) {
        const nested = blocks(sub);
        // প্রথম অনুচ্ছেদটা আইটেমের টেক্সটের সাথে জোড়া লাগে না — আলাদা ব্লক হিসেবে বসাই
        inner += nested.join("");
      }
      items.push(`<li>${inner}</li>`);
    }
    return { html: `<${tag}${ordered && startNum !== 1 && startNum < 100000 ? ` start="${startNum}"` : ""}>${items.join("")}</${tag}>`, next: i };
  }

  const html = blocks(lines).join("\n");
  return { html, headings };
}

/* ---------------------------------------------------------------- স্তর ২: DOM-allowlist ছাঁকনি (শুধু ব্রাউজারে — template/DOM লাগে) */
const ALLOWED = {
  p: [], h2: ["id"], h3: ["id"], h4: ["id"], ul: [], ol: ["start"], li: [], blockquote: [], pre: [], code: ["class"],
  em: [], strong: [], del: [], br: [], hr: [], a: ["href", "target", "rel"], img: ["src", "alt", "loading", "decoding", "referrerpolicy"],
  table: [], thead: [], tbody: [], tr: [], th: ["class"], td: ["class"], div: ["class"]
};
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "base", "svg", "math", "form", "input", "button", "textarea", "select", "template", "noscript", "frame", "frameset", "applet", "audio", "video", "source", "track", "canvas", "dialog"]);
const ATTR_OK = {
  id: (v) => /^bh-[\p{L}\p{N}\p{M}_-]{1,70}$/u.test(v),
  class: (v, tag) => (tag === "code" ? /^language-[a-z0-9+#-]{1,20}$/.test(v) : tag === "div" ? v === "bl-table-wrap" : /^(al-c|al-r)$/.test(v)),
  start: (v) => /^\d{1,5}$/.test(v),
  href: (v) => safeHref(v) === v.trim() && !!safeHref(v),
  src: (v) => !!safeImgSrc(v),
  alt: (v) => v.length <= 500,
  loading: (v) => v === "lazy", decoding: (v) => v === "async", referrerpolicy: (v) => v === "no-referrer",
  target: (v) => v === "_blank",
  rel: (v) => v === "noopener noreferrer"
};
function cleanNode(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) continue;                                    // টেক্সট
    if (child.nodeType !== 1) { child.remove(); continue; }                // কমেন্ট/PI ইত্যাদি
    const tag = child.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) { child.remove(); continue; }
    const allowedAttrs = ALLOWED[tag];
    if (!allowedAttrs) { cleanNode(child); child.replaceWith(...child.childNodes); continue; }   // অজানা ট্যাগ → ট্যাগ ফেলে ভেতরের (ছাঁকা) টেক্সট রাখি
    for (const attr of [...child.attributes]) {
      const name = attr.name.toLowerCase();
      if (!allowedAttrs.includes(name) || !ATTR_OK[name] || !ATTR_OK[name](attr.value, tag)) child.removeAttribute(attr.name);
    }
    if (tag === "a") {                                                      // বাহ্যিক লিংক সবসময় নিরাপদ rel/target-এ
      const href = child.getAttribute("href");
      if (!href) { child.replaceWith(...child.childNodes); continue; }
      if (isExternal(href)) { child.setAttribute("target", "_blank"); child.setAttribute("rel", "noopener noreferrer"); }
      else { child.removeAttribute("target"); child.removeAttribute("rel"); }
    }
    if (tag === "img" && !child.getAttribute("src")) { child.remove(); continue; }
    if (tag === "div" && child.getAttribute("class") !== "bl-table-wrap") { child.replaceWith(...child.childNodes); continue; }
    cleanNode(child);
  }
}
/** নিষ্ক্রিয় <template>-এ পার্স (স্ক্রিপ্ট/ছবি লোড হয় না) → ছেঁকে → DocumentFragment। লাইভ DOM-এ replaceChildren(fragment) দিন। */
export function toSafeFragment(html, doc = document) {
  const tpl = doc.createElement("template");
  tpl.innerHTML = html;
  cleanNode(tpl.content);
  return tpl.content;
}
/** এক ধাপে: Markdown → { fragment, headings } */
export function renderArticle(markdown, doc = document) {
  const { html, headings } = renderMarkdown(markdown);
  return { fragment: toSafeFragment(html, doc), headings };
}
