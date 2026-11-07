// js/blog/seo.js
// ব্লগ-পাতার মেটাডেটা: <title>, description, canonical, Open Graph, Twitter Card, article:*, robots, JSON-LD (BlogPosting/Blog + BreadcrumbList)।
// ব্লগ ছাড়লে (restore) index.html-এর আসল মান হুবহু ফেরে — বাকি সাইটের SEO অক্ষত।
//
// ⚠️ সীমাবদ্ধতা (README/docs/BLOG_REPORT.md-এও লেখা): সাইট hash-routing (#blog/স্লাগ) ব্যবহার করে। URL-এর # অংশ সার্ভারে যায় না,
//    তাই ফেসবুক/WhatsApp-এর লিংক-প্রিভিউ ও অনেক ক্রলার সবসময় হোমপেজের মেটা দেখে। এই ফাইল JS-চালানো ক্রলার (যেমন Googlebot-এর রেন্ডারার) ও
//    ব্রাউজার-ট্যাব/বুকমার্কের জন্য সঠিক মেটা বসায় — প্রতিটা লেখার আলাদা ইনডেক্সযোগ্য URL পেতে প্রিরেন্ডার/History-API (Feature 4-এ আলোচিত) লাগবে।

const SITE_NAME = "Tech Verse";
const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t; };
const dateOf = (v) => (v && typeof v.toDate === "function" ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null);
const iso = (v) => { const d = dateOf(v); return d && !Number.isNaN(d.getTime()) ? d.toISOString() : ""; };

/* ---------------------------------------------------------------- URL */
/** সাইটের আসল ঠিকানা — index.html-এর canonical থেকে (ভিজিটর অন্য হোস্টে — যেমন প্রিভিউ-ডিপ্লয় — থাকলেও শেয়ার-লিংক সঠিক থাকে) */
let baseCache = "";
export function siteBase(doc = typeof document !== "undefined" ? document : null) {
  if (baseCache) return baseCache;
  let href = "";
  try { href = doc?.querySelector('link[rel="canonical"]')?.getAttribute("href") || ""; } catch (_) { /* */ }
  if (!/^https?:\/\//i.test(href)) href = typeof location !== "undefined" ? location.origin + location.pathname : "https://tvsites.vercel.app/";
  baseCache = normBase(href);
  return baseCache;
}
export const normBase = (b) => String(b || "").split("#")[0].replace(/\?.*$/, "").replace(/\/?$/, "/");
export const blogUrl = (base) => `${normBase(base)}#blog`;
export const articleUrl = (base, slug) => `${normBase(base)}#blog/${slug}`;

/* ---------------------------------------------------------------- JSON-LD (খাঁটি ফাংশন — Node-এ টেস্টযোগ্য) */
/** ডেটা যা আছে শুধু তাই — তারিখ/লেখক/ছবি না থাকলে ফিল্ড বাদ; কখনো রেটিং/রিভিউ বানানো হয় না */
export function postJsonLd(post, { base, categoryName = "", fallbackImage = "" } = {}) {
  const url = articleUrl(base, post.slug);
  const published = iso(post.publishedAt), modified = iso(post.updatedAt) || published;
  const image = post.coverImage || fallbackImage;
  const bp = {
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: clip(post.seoTitle || post.title, 110),
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    publisher: publisher(base)
  };
  const desc = clip(post.seoDescription || post.excerpt, 300);
  if (desc) bp.description = desc;
  if (image) bp.image = [image];
  if (published) bp.datePublished = published;
  if (modified) bp.dateModified = modified;
  bp.author = post.author ? { "@type": "Person", name: clip(post.author, 120) } : { "@type": "Organization", name: SITE_NAME };
  if (post.language) bp.inLanguage = post.language;
  if (post.tags?.length) bp.keywords = post.tags.join(", ");
  if (categoryName) bp.articleSection = categoryName;
  return {
    "@context": "https://schema.org",
    "@graph": [
      bp,
      breadcrumb(base, [{ name: "Home", url: normBase(base) }, { name: "Blog", url: blogUrl(base) }, { name: clip(post.title, 110), url }])
    ]
  };
}
export function listJsonLd({ base, name, description }) {
  const url = blogUrl(base);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Blog", "@id": `${url}#blog`, name, url, ...(description ? { description } : {}), publisher: publisher(base) },
      breadcrumb(base, [{ name: "Home", url: normBase(base) }, { name: "Blog", url }])
    ]
  };
}
/** প্রকাশক = index.html-এর বিদ্যমান Organization JSON-LD-র একই নাম/লোগো (assets/logo.svg আসল ফাইল) — নতুন কোনো তথ্য বানানো হয় না */
function publisher(base) {
  return { "@type": "Organization", name: SITE_NAME, url: normBase(base), logo: { "@type": "ImageObject", url: `${normBase(base)}assets/logo.svg` } };
}
function breadcrumb(base, items) {
  return { "@type": "BreadcrumbList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })) };
}
/** <script type="application/ld+json"> এর টেক্সট — "<" escape, যাতে "</script>" দিয়ে বেরিয়ে আসা অসম্ভব */
export const jsonLdText = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/* ---------------------------------------------------------------- DOM-ম্যানেজার */
const MANAGED_META = [
  ["name", "description"],
  ["property", "og:type"], ["property", "og:url"], ["property", "og:title"], ["property", "og:description"], ["property", "og:image"],
  ["property", "og:image:width"], ["property", "og:image:height"], ["property", "og:image:alt"],
  ["name", "twitter:card"], ["name", "twitter:title"], ["name", "twitter:description"], ["name", "twitter:image"], ["name", "twitter:image:alt"],
  ["name", "robots"]
];
const LD_ID = "tvBlogLd";

export function createSeo(doc = document) {
  const head = doc.head;
  let snap = null;
  const created = new Set();

  const q = (attr, key) => head.querySelector(`meta[${attr}="${key}"]`);
  const canonicalEl = () => head.querySelector('link[rel="canonical"]');

  function snapshot() {
    if (snap) return;
    siteBase(doc);                                                        // restore-এর আগেই আসল canonical থেকে base ধরে রাখি
    snap = { title: doc.title, canonical: canonicalEl()?.getAttribute("href") ?? null, meta: new Map() };
    for (const [attr, key] of MANAGED_META) { const el = q(attr, key); snap.meta.set(`${attr}|${key}`, el ? el.getAttribute("content") : null); }
  }
  function setMeta(attr, key, value) {
    let el = q(attr, key);
    if (value === "" || value == null) { if (el && created.has(el)) { el.remove(); created.delete(el); } else if (el) el.removeAttribute("content"); return; }
    if (!el) { el = doc.createElement("meta"); el.setAttribute(attr, key); head.appendChild(el); created.add(el); }
    el.setAttribute("content", value);
  }
  function clearArticleMeta() {
    for (const el of head.querySelectorAll('meta[property^="article:"][data-tv-blog]')) el.remove();
  }
  function addArticleMeta(property, value) {
    if (!value) return;
    const el = doc.createElement("meta");
    el.setAttribute("property", property); el.setAttribute("content", value); el.setAttribute("data-tv-blog", "1");
    head.appendChild(el);
  }

  /** @param {{title:string, description?:string, url:string, image?:string, imageAlt?:string, type?:"website"|"article", robots?:string,
   *           article?:{publishedTime?:string, modifiedTime?:string, author?:string, section?:string, tags?:string[]}|null, jsonLd?:object|null}} o */
  function apply(o) {
    snapshot();
    doc.title = clip(o.title, 120) || SITE_NAME;
    const desc = clip(o.description, 300);
    setMeta("name", "description", desc || snap.meta.get("name|description") || "");
    const link = canonicalEl() || Object.assign(doc.createElement("link"), {});
    if (!link.parentNode) { link.setAttribute("rel", "canonical"); head.appendChild(link); created.add(link); }
    link.setAttribute("href", o.url);

    setMeta("property", "og:type", o.type || "website");
    setMeta("property", "og:url", o.url);
    setMeta("property", "og:title", clip(o.title, 120));
    setMeta("property", "og:description", desc);
    const hasImg = !!o.image;
    if (hasImg) {
      setMeta("property", "og:image", o.image);
      setMeta("property", "og:image:alt", clip(o.imageAlt, 200));
      // কভারের মাপ অজানা — সাইটের আসল ১২০০×৬৩০ মান ভুল হবে, তাই বাদ
      setMeta("property", "og:image:width", ""); setMeta("property", "og:image:height", "");
      setMeta("name", "twitter:card", "summary_large_image");
      setMeta("name", "twitter:image", o.image);
      setMeta("name", "twitter:image:alt", clip(o.imageAlt, 200));
    }
    setMeta("name", "twitter:title", clip(o.title, 120));
    setMeta("name", "twitter:description", desc);
    setMeta("name", "robots", o.robots || "");

    clearArticleMeta();
    if (o.article) {
      addArticleMeta("article:published_time", o.article.publishedTime);
      addArticleMeta("article:modified_time", o.article.modifiedTime);
      addArticleMeta("article:author", o.article.author);
      addArticleMeta("article:section", o.article.section);
      for (const t of o.article.tags || []) addArticleMeta("article:tag", t);
    }
    setJsonLd(o.jsonLd);
  }

  function setJsonLd(obj) {
    let el = doc.getElementById(LD_ID);
    if (!obj) { el?.remove(); return; }
    if (!el) { el = doc.createElement("script"); el.type = "application/ld+json"; el.id = LD_ID; head.appendChild(el); }
    el.textContent = jsonLdText(obj);          // textContent: কখনো HTML হিসেবে পার্স হয় না
  }

  /** আসল (index.html-এর) মান ফেরত */
  function restore() {
    if (!snap) return;
    doc.title = snap.title;
    const link = canonicalEl();
    if (link) { if (snap.canonical == null) { link.remove(); } else link.setAttribute("href", snap.canonical); }
    for (const [attr, key] of MANAGED_META) {
      const el = q(attr, key), orig = snap.meta.get(`${attr}|${key}`);
      if (orig == null) { if (el && created.has(el)) el.remove(); else if (el) el.removeAttribute("content"); }
      else if (el) el.setAttribute("content", orig);
      else { const n = doc.createElement("meta"); n.setAttribute(attr, key); n.setAttribute("content", orig); head.appendChild(n); }
    }
    created.clear();
    clearArticleMeta();
    setJsonLd(null);
    snap = null;
  }

  return { apply, restore, setJsonLd, get active() { return !!snap; } };
}
