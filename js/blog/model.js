// js/blog/model.js
// ব্লগের Firebase-মুক্ত শেয়ার্ড লজিক — পাবলিক ব্লগ (js/blog/app.js), অ্যাডমিন (js/admin-blog.js) ও টেস্ট (Node) তিনজনই এটা ব্যবহার করে।
// এখানকার সীমা/স্ট্যাটাস firestore.rules-এর সাথে হুবহু মেলে (tests/contract.test.mjs এটা যাচাই করে)।
// ক্লায়েন্ট-সাইড যাচাই শুধু ভালো UX-এর জন্য; আসল নিরাপত্তা firestore.rules-এ।

/* ---------------------------------------------------------------- ধ্রুবক (rules-এর সাথে মেলানো) */
export const LIMITS = {
  title: [3, 160], excerpt: 400, content: [1, 100000], coverAlt: 200,
  tags: 10, tagLen: 30, seoTitle: 120, seoDescription: 320,
  slug: 80, slugHistory: 10, searchTokens: 300, readingTime: [1, 240],
  featuredOrder: [0, 9999], comment: [2, 1500]
};
export const STATUS = { DRAFT: "draft", PUBLISHED: "published" };
export const COMMENT_STATUS = { PENDING: "pending", APPROVED: "approved", HIDDEN: "hidden", DELETED: "deleted" };
// নতুন মন্তব্যের শুরুর স্ট্যাটাস। "approved" করলে আগাম-অনুমোদন ছাড়াই প্রকাশ হবে — তখন firestore.rules-এর blogCommentStartStatus()-ও একই বদলাতে হবে।
export const COMMENT_START_STATUS = COMMENT_STATUS.PENDING;
export const COMMENT_THROTTLE_SECONDS = 20;     // rules: blogCommentThrottleOk() — দুই মন্তব্যের মাঝে ন্যূনতম ব্যবধান
export const LANGS = ["bn", "en"];
export const PAGE_SIZE = 9;                     // পাবলিক তালিকায় প্রথমে ৯টা (rules-এ limit ≤ ৫০ বাধ্যতামূলক)
export const COMMENT_PAGE = 20;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CATEGORY_RE = /^[a-z0-9-]{1,40}$/;
export const SEARCH_PREFIX = [2, 15];           // সার্চ-টোকেনের প্রিফিক্স দৈর্ঘ্য (code point)

/* ---------------------------------------------------------------- স্লাগ */
/** শিরোনাম → URL-সেফ ASCII স্লাগ। বাংলা-শুধু শিরোনামে ফাঁকা ফেরে — তখন অ্যাডমিনকে ইংরেজি স্লাগ দিতে হয়। */
export function slugify(input, max = LIMITS.slug) {
  const s = String(input || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")     // é → e
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, max).replace(/-+$/g, "");
}
export const isValidSlug = (s) => typeof s === "string" && s.length >= 1 && s.length <= LIMITS.slug && SLUG_RE.test(s);

/* ---------------------------------------------------------------- টেক্সট বিশ্লেষণ */
const WORD_RE = /[\p{L}\p{N}\p{M}]+/gu;
/** মার্কডাউনের চিহ্ন বাদ দিয়ে শব্দ গোনার জন্য পরিষ্কার টেক্সট */
export function plainText(md) {
  return String(md || "")
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ")        // কোড-ব্লক
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ")             // ছবি → alt
    .replace(/\[([^\]]*)\]\([^)]*\)/g, " $1 ")              // লিংক → টেক্সট
    .replace(/`([^`]*)`/g, " $1 ")
    .replace(/^[ \t]*(?:#{1,6}|>|[-*+]|\d+[.)])[ \t]+/gm, "")
    .replace(/[*_~|]+/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
}
export function wordCount(md) {
  const m = plainText(md).match(WORD_RE);
  return m ? m.length : 0;
}
/** আনুমানিক পড়ার সময় (মিনিট) — প্রতি মিনিটে ২০০ শব্দ ধরে; কমপক্ষে ১ */
export function readingTimeMinutes(md) {
  const [lo, hi] = LIMITS.readingTime;
  return Math.min(hi, Math.max(lo, Math.ceil(wordCount(md) / 200)));
}
export function excerptFrom(md, n = 180) {
  const t = plainText(md).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t;
}

/* ---------------------------------------------------------------- ট্যাগ */
/** ইনপুট (কমা-ভাগ করা স্ট্রিং বা অ্যারে) → পরিষ্কার, ইউনিক (ছোট-বড় হাতের পার্থক্য ছাড়া), ≤১০টা, প্রতিটা ≤৩০ অক্ষর */
export function normalizeTags(raw) {
  const arr = Array.isArray(raw) ? raw : String(raw || "").split(/[,\n،]/);
  const seen = new Set(), out = [];
  for (const t of arr) {
    const tag = String(t || "").replace(/\s+/g, " ").trim().replace(/^#+\s*/, "").slice(0, LIMITS.tagLen).trim();      // আগে ছেঁটে তারপর # বাদ (কমার পরের স্পেসসহ " #Web"-ও)
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key); out.push(tag);
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}

/* ---------------------------------------------------------------- সার্চ */
export const words = (text) => (String(text || "").toLowerCase().match(WORD_RE) || []);

/** শিরোনাম + ট্যাগের শব্দ ও শব্দের প্রিফিক্স (২–১৫ code point) → searchTokens (array-contains সার্চের জন্য)।
 *  আগে পূর্ণ শব্দ, তারপর ছোট থেকে বড় প্রিফিক্স — ৩০০-র সীমায় কাটলে শুধু সবচেয়ে বড় প্রিফিক্স বাদ পড়ে। */
export function buildSearchTokens({ title = "", tags = [] } = {}) {
  const ws = [...new Set(words(`${title} ${(tags || []).join(" ")}`))];
  const out = new Set();
  const cps = ws.map((w) => Array.from(w).slice(0, SEARCH_PREFIX[1]));
  cps.forEach((a, i) => { if (a.length >= SEARCH_PREFIX[0]) out.add(a.join("")); else if (a.length === 1 && ws[i].length >= 1) out.add(ws[i]); });
  for (let len = SEARCH_PREFIX[0]; len <= SEARCH_PREFIX[1]; len++) {
    for (const a of cps) if (a.length >= len) out.add(a.slice(0, len).join(""));
    if (out.size >= LIMITS.searchTokens) break;
  }
  return [...out].slice(0, LIMITS.searchTokens);
}

/** ইউজারের সার্চ লেখা → { primary: সার্ভারে যাবে (সবচেয়ে লম্বা শব্দ, ≤১৫), rest: বাকি শব্দ (ক্লায়েন্টে ফিল্টার) }। ২ অক্ষরের কম হলে primary = "" */
export function parseSearch(q) {
  const ws = [...new Set(words(q))].map((w) => Array.from(w).slice(0, SEARCH_PREFIX[1]).join("")).filter((w) => Array.from(w).length >= SEARCH_PREFIX[0]);
  if (!ws.length) return { primary: "", rest: [] };
  const primary = ws.reduce((a, b) => (Array.from(b).length > Array.from(a).length ? b : a));
  return { primary, rest: ws.filter((w) => w !== primary) };
}
/** primary সার্ভার থেকে এসেছে; বাকি শব্দগুলো পোস্টের টোকেনে আছে কিনা */
export const matchesRest = (post, rest) => !rest.length || rest.every((w) => (post.searchTokens || []).includes(w));

/* ---------------------------------------------------------------- ক্যাটাগরির রঙ (ফলব্যাক কভার ও ব্যাজ) */
const TONES = ["blue", "mint", "violet", "slate"];
export function toneFor(key) {
  let h = 0;
  for (const ch of String(key || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

/* ---------------------------------------------------------------- ফর্ম যাচাই (অ্যাডমিন এডিটর) — rules-এর সাথে মেলানো; বার্তা বাংলায় */
export function validatePostInput(p) {
  const e = {};
  const t = String(p.title || "").trim();
  if (t.length < LIMITS.title[0]) e.title = "শিরোনাম কমপক্ষে ৩ অক্ষরের হতে হবে।";
  else if (t.length > LIMITS.title[1]) e.title = `শিরোনাম সর্বোচ্চ ${LIMITS.title[1]} অক্ষর।`;
  if (!isValidSlug(p.slug)) e.slug = "স্লাগে শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও হাইফেন (-) চলবে (যেমন: my-first-post)।";
  if (String(p.excerpt || "").length > LIMITS.excerpt) e.excerpt = `সারসংক্ষেপ সর্বোচ্চ ${LIMITS.excerpt} অক্ষর।`;
  const c = String(p.content || "");
  if (c.trim().length < LIMITS.content[0]) e.content = "লেখার বিষয়বস্তু খালি রাখা যাবে না।";
  else if (c.length > LIMITS.content[1]) e.content = `বিষয়বস্তু সর্বোচ্চ ${LIMITS.content[1]} অক্ষর।`;
  if (!CATEGORY_RE.test(String(p.category || ""))) e.category = "একটা ক্যাটাগরি বেছে নিন।";
  if (p.coverImage && !/^https?:\/\/[^\s]+$/i.test(p.coverImage)) e.coverImage = "ছবির লিংক http:// বা https:// দিয়ে শুরু হতে হবে।";
  if (String(p.coverImage || "").length > 2048) e.coverImage = "ছবির লিংক অনেক লম্বা।";
  if (String(p.coverAlt || "").length > LIMITS.coverAlt) e.coverAlt = `ছবির বর্ণনা সর্বোচ্চ ${LIMITS.coverAlt} অক্ষর।`;
  if (String(p.seoTitle || "").length > LIMITS.seoTitle) e.seoTitle = `SEO টাইটেল সর্বোচ্চ ${LIMITS.seoTitle} অক্ষর।`;
  if (String(p.seoDescription || "").length > LIMITS.seoDescription) e.seoDescription = `SEO বিবরণ সর্বোচ্চ ${LIMITS.seoDescription} অক্ষর।`;
  const fo = Number(p.featuredOrder);
  if (!Number.isFinite(fo) || fo < LIMITS.featuredOrder[0] || fo > LIMITS.featuredOrder[1]) e.featuredOrder = "ফিচার্ড ক্রম ০–৯৯৯৯ এর মধ্যে হতে হবে।";
  if (!LANGS.includes(p.language)) e.language = "ভাষা বেছে নিন।";
  return e;
}
