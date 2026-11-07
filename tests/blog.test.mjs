// tests/blog.test.mjs — ব্লগের Firebase-মুক্ত লজিকের ইউনিট-টেস্ট (Node; ব্রাউজার/Emulator লাগে না)
//   • js/blog/model.js   : স্লাগ, পড়ার সময়, ট্যাগ, সার্চ-টোকেন, ফর্ম-যাচাই
//   • js/blog/markdown.js: নিরাপদ Markdown → HTML (XSS-প্রতিরোধ, অবৈধ URL, ReDoS-সময়সীমা)
//   • js/blog/seo.js     : JSON-LD বিল্ডার (খাঁটি ফাংশন)
// DOM-ছাঁকনি (toSafeFragment) আসল ব্রাউজারে পরীক্ষা হয়: tests/browser/blog-ui.test.mjs
// চালান:  cd tests && node blog.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// js/ ফাইলগুলো ESM কিন্তু রুটে package.json "type":"module" নেই — অস্থায়ী ফোল্ডারে কপি করে (type=module সহ) ইম্পোর্ট করি; রিপোতে কিছু বদলায় না
const ROOT = new URL("../", import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), "tv-blog-"));
mkdirSync(join(tmp, "js/blog"), { recursive: true });
writeFileSync(join(tmp, "package.json"), '{"type":"module"}');
for (const f of ["js/utils.js", "js/blog/model.js", "js/blog/markdown.js", "js/blog/seo.js"]) if (existsSync(join(ROOT, f))) copyFileSync(join(ROOT, f), join(tmp, f));
const load = (f) => import(pathToFileURL(join(tmp, f)).href);
const M = await load("js/blog/model.js");
const MD = await load("js/blog/markdown.js");
const SEO = existsSync(join(tmp, "js/blog/seo.js")) ? await load("js/blog/seo.js") : null;

/* ---------------------------------------------------------------- model.js */
test("slugify: ASCII স্লাগ; বাংলা-শুধু শিরোনামে ফাঁকা; সীমা ≤৮০; বৈধ regex", () => {
  assert.equal(M.slugify("Hello, World! Firebase & PWA — 2026"), "hello-world-firebase-and-pwa-2026");
  assert.equal(M.slugify("  Café  déjà vu "), "cafe-deja-vu");
  assert.equal(M.slugify("বাংলা শিরোনাম"), "");
  assert.equal(M.slugify("--a--b--"), "a-b");
  const long = M.slugify("word ".repeat(60));
  assert.ok(long.length <= 80 && !long.endsWith("-") && M.isValidSlug(long));
  for (const bad of ["", "Upper", "a b", "a--b", "-a", "a-", "a_b", "a".repeat(81), null, 5]) assert.equal(M.isValidSlug(bad), false, String(bad));
  for (const ok of ["a", "my-post-2", "2026"]) assert.equal(M.isValidSlug(ok), true);
});
test("পড়ার সময়: ২০০ শব্দ/মিনিট, কমপক্ষে ১, সর্বোচ্চ ২৪০; কোড/URL/মার্কআপ বাদ", () => {
  assert.equal(M.readingTimeMinutes(""), 1);
  assert.equal(M.readingTimeMinutes("শব্দ ".repeat(200)), 1);
  assert.equal(M.readingTimeMinutes("শব্দ ".repeat(201)), 2);
  assert.equal(M.readingTimeMinutes("w ".repeat(200 * 500)), 240);
  assert.equal(M.wordCount("# Title\n\nHello **world** [link](http://x.y/very/long/path) `code`"), 5);
  assert.equal(M.wordCount("```js\nconst a = 1;\n```\ntext"), 1);
});
test("ট্যাগ: ইউনিক (case-insensitive), # বাদ, ≤১০টা, প্রতিটা ≤৩০", () => {
  assert.deepEqual(M.normalizeTags("#Web, web , PWA,  Firebase,,"), ["Web", "PWA", "Firebase"]);
  assert.equal(M.normalizeTags(Array.from({ length: 30 }, (_, i) => "t" + i)).length, 10);
  assert.ok(M.normalizeTags("x".repeat(80))[0].length <= 30);
  assert.deepEqual(M.normalizeTags(null), []);
  assert.deepEqual(M.normalizeTags("PWA, firebase, #Web, pwa"), ["PWA", "firebase", "Web"], "কমার পরের স্পেসসহ #Web (e2e-তে ধরা পড়া বাগ)");
  assert.deepEqual(M.normalizeTags("  ## spaced ,\n#x"), ["spaced", "x"]);
});
test("সার্চ-টোকেন: পূর্ণ শব্দ + প্রিফিক্স; বাংলা; ≤৩০০; parseSearch", () => {
  const t = M.buildSearchTokens({ title: "Firebase দিয়ে PWA তৈরি", tags: ["Web"] });
  for (const w of ["firebase", "দিয়ে", "pwa", "তৈরি", "web", "fire", "fireb", "pw", "we"]) assert.ok(t.includes(w), w);
  assert.ok(!t.includes("f"), "১ অক্ষরের প্রিফিক্স নেই");
  assert.ok(M.buildSearchTokens({ title: Array.from({ length: 80 }, (_, i) => "abcdefghijklmnop" + i).join(" ") }).length <= 300);
  assert.deepEqual(M.parseSearch("fire bas pw"), { primary: "fire", rest: ["bas", "pw"] });
  assert.deepEqual(M.parseSearch(" f "), { primary: "", rest: [] });
  assert.equal(M.parseSearch("supercalifragilisticexpialidocious").primary.length, 15);
  const post = { searchTokens: t };
  assert.equal(M.matchesRest(post, ["pw"]), true); assert.equal(M.matchesRest(post, ["zzz"]), false);
  assert.equal(M.toneFor("web"), M.toneFor("web"));
});
test("validatePostInput: সীমা/ফরম্যাট (rules-এর সাথে মেলানো)", () => {
  const ok = { title: "Valid title", slug: "valid-title", excerpt: "", content: "x", category: "web", coverImage: "", coverAlt: "", seoTitle: "", seoDescription: "", featuredOrder: 0, language: "bn" };
  assert.deepEqual(M.validatePostInput(ok), {});
  const bad = (o) => Object.keys(M.validatePostInput({ ...ok, ...o }));
  assert.deepEqual(bad({ title: "ab" }), ["title"]);
  assert.deepEqual(bad({ slug: "Bad Slug" }), ["slug"]);
  assert.deepEqual(bad({ content: "   " }), ["content"]);
  assert.deepEqual(bad({ category: "" }), ["category"]);
  assert.deepEqual(bad({ coverImage: "javascript:alert(1)" }), ["coverImage"]);
  assert.deepEqual(bad({ coverImage: "https://a.example.com/x.png" }), []);
  assert.deepEqual(bad({ featuredOrder: 10000 }), ["featuredOrder"]);
  assert.deepEqual(bad({ language: "fr" }), ["language"]);
  assert.deepEqual(bad({ seoDescription: "s".repeat(321) }), ["seoDescription"]);
});

/* ---------------------------------------------------------------- markdown.js: XSS */
const R = (md) => MD.renderMarkdown(md).html;
// আউটপুটে যত ট্যাগ আছে সবই allowlist-এর ভেতরে এবং অ্যাট্রিবিউট-নামও allowlist-এর ভেতরে (escape-করা টেক্সটে "onerror=" থাকলে সমস্যা নেই — সেটা ট্যাগ নয়)
const TAGS = new Set(["p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "pre", "code", "em", "strong", "del", "br", "hr", "a", "img", "table", "thead", "tbody", "tr", "th", "td", "div"]);
const ATTRS = new Set(["id", "start", "class", "href", "target", "rel", "src", "alt", "loading", "decoding", "referrerpolicy"]);
const noExec = (html) => {
  for (const m of html.matchAll(/<\/?([A-Za-z][A-Za-z0-9]*)([^>]*)>/g)) {
    assert.ok(TAGS.has(m[1].toLowerCase()), `অননুমোদিত ট্যাগ <${m[1]}> → ${html}`);
    const attrs = m[2].replace(/"[^"]*"/g, '""');                          // মান বাদ দিয়ে শুধু নাম
    for (const a of attrs.matchAll(/\s([^\s=\/]+)(?:=)?/g)) assert.ok(ATTRS.has(a[1].toLowerCase()), `অননুমোদিত অ্যাট্রিবিউট ${a[1]} → ${html}`);
  }
  assert.doesNotMatch(html, /<[^>]*\son\w+\s*=/i, html);
};

test("MD: কাঁচা HTML/স্ক্রিপ্ট escape হয় (কোনো ট্যাগ জন্মায় না)", () => {
  for (const evil of [
    "<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "<svg/onload=alert(1)>", "<iframe src=//evil></iframe>",
    "<a href=\"javascript:alert(1)\">x</a>", "<body onload=alert(1)>", "<style>*{display:none}</style>", "<details open ontoggle=alert(1)>",
    "<math><mi xlink:href=\"javascript:alert(1)\">", "\"><script>alert(1)</script>", "<!--<script>-->", "<a\nhref=x\nonclick=alert(1)>"
  ]) {
    const html = R(evil);
    noExec(html);
  }
  assert.match(R("<script>alert(1)</script>"), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
test("MD: লিংকে অবৈধ স্কিম বাদ — javascript:, data:, vbscript:, ট্যাব/নতুন-লাইন/এনকোড কৌশল", () => {
  const bad = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)", " javascript:alert(1)", "java\nscript:alert(1)", "&#106;avascript:alert(1)",
    "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd", "//evil.example.com/x", "ftp://x", "tel:+8801", "\u0001javascript:alert(1)", "j\u200bavascript:alert(1)", "javascript&colon;alert(1)"];
  for (const u of bad) {
    const html = R(`[click](${u.replace(/ /g, "%20").replace(/\n/g, "\n")})`);
    assert.doesNotMatch(html, /<a\b/, `href বসেছে: ${JSON.stringify(u)} → ${html}`);
    noExec(html);
  }
  for (const u of ["https://example.com/a?b=1&c=2", "http://example.com", "mailto:a@b.co", "#blog/other-post", "/path/x", "./x", "../y"]) assert.match(R(`[ok](${u})`), /<a href="/, u);
});
test("MD: বাহ্যিক লিংকে rel=noopener noreferrer + target=_blank; অভ্যন্তরীণ #-এ নয়", () => {
  assert.match(R("[x](https://e.com)"), /<a href="https:\/\/e\.com" target="_blank" rel="noopener noreferrer">x<\/a>/);
  const internal = R("[x](#blog/abc)");
  assert.match(internal, /<a href="#blog\/abc">x<\/a>/); assert.doesNotMatch(internal, /target=/);
});
test("MD: ছবি শুধু https; alt/URL-এ attribute-ইনজেকশন অসম্ভব", () => {
  assert.match(R("![ok](https://img.example.com/a.png)"), /<img src="https:\/\/img\.example\.com\/a\.png" alt="ok" loading="lazy" decoding="async" referrerpolicy="no-referrer">/);
  for (const u of ["http://e.com/a.png", "data:image/png;base64,AAAA", "javascript:alert(1)", "//e.com/a.png", "blob:https://e.com/x"]) assert.doesNotMatch(R(`![x](${u})`), /<img/, u);
  const a = R('![a"onerror="alert(1)](https://e.com/a.png)');
  assert.doesNotMatch(a, /" onerror=|"onerror=/); assert.match(a, /alt="a&quot;onerror=&quot;alert\(1\)"/);
  const u = R('[x](https://e.com/"onmouseover="alert(1)'); noExec(u);
  assert.doesNotMatch(u, /"\s*onmouseover=/);
  const u2 = R('![x](https://e.com/a.png"onerror="alert(1))'); assert.doesNotMatch(u2, /"\s*onerror=/);
});
test("MD: কোড-ব্লক/ইনলাইন কোড escape; ভাষা-ক্লাস স্যানিটাইজড", () => {
  const html = R("```js\n<script>alert(1)</script>\nconst a = '<b>';\n```");
  assert.match(html, /<pre><code class="language-js">&lt;script&gt;alert\(1\)&lt;\/script&gt;/); noExec(html);
  assert.doesNotMatch(R('```js"><script>alert(1)</script>\nx\n```'), /<script/);
  assert.doesNotMatch(R("```a b c\nx\n```"), /class="language-a b/);
  assert.match(R("use `<b>` tag"), /<code>&lt;b&gt;<\/code>/);
  assert.match(R("``a ` b``"), /<code>a ` b<\/code>/);
});
test("MD: প্লেসহোল্ডার-জালিয়াতি (\\u0000) অসম্ভব", () => {
  const html = R("[a](https://e.com) \u00000\u0000 \u00001\u0000 `x`");
  assert.equal((html.match(/<a /g) || []).length, 1);
  assert.doesNotMatch(html, /\u0000/);
});

/* ---------------------------------------------------------------- markdown.js: গঠন */
test("MD: হেডিং-লেভেল (#,##→h2; ###→h3; ####+→h4), আইডি ইউনিক, বাংলা আইডি, TOC-তথ্য", () => {
  const { html, headings } = MD.renderMarkdown("# One\n## One\n### Sub\n#### Deep\n##### Deeper\n## বাংলা হেডিং\n## Hello `code` **b**");
  assert.deepEqual(headings.map((h) => h.level), [2, 2, 3, 4, 4, 2, 2]);
  assert.deepEqual(headings.slice(0, 2).map((h) => h.id), ["bh-one", "bh-one-2"]);
  assert.ok(headings[5].id.startsWith("bh-বাংলা"));
  assert.equal(headings[6].text, "Hello code b");
  assert.equal(new Set(headings.map((h) => h.id)).size, headings.length);
  assert.doesNotMatch(html, /<h1/);
});
test("MD: অনুচ্ছেদ, বোল্ড/ইটালিক/কাটা, snake_case নিরাপদ, গুণ-চিহ্ন", () => {
  assert.equal(R("a **b** *c* ~~d~~"), "<p>a <strong>b</strong> <em>c</em> <del>d</del></p>");
  assert.equal(R("snake_case_word and __init__ here"), "<p>snake_case_word and <strong>init</strong> here</p>");
  assert.equal(R("2 * 3 * 4"), "<p>2 * 3 * 4</p>");
  assert.equal(R("***both***"), "<p><strong><em>both</em></strong></p>");
  assert.equal(R("line one\nline two"), "<p>line one\nline two</p>");
  assert.equal(R("a  \nb"), "<p>a<br>b</p>");
  assert.equal(R("p1\n\np2"), "<p>p1</p>\n<p>p2</p>");
  assert.equal(R("বাংলা **মোটা** লেখা"), "<p>বাংলা <strong>মোটা</strong> লেখা</p>");
});
test("MD: তালিকা — আনঅর্ডার্ড/অর্ডার্ড/স্টার্ট-নম্বর/নেস্টেড", () => {
  assert.equal(R("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
  assert.equal(R("* a\n+ b"), "<ul><li>a</li><li>b</li></ul>");          // মার্কার-চিহ্ন মিশলেও একই তালিকা (সরল আচরণ)
  assert.equal(R("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
  assert.match(R("3. a\n4. b"), /^<ol start="3">/);
  const nested = R("- a\n  - a1\n  - a2\n- b");
  assert.equal(nested, "<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul>");
  assert.equal(R("- a\n\n- b"), "<ul><li>a</li><li>b</li></ul>");
  assert.match(R("- **bold** item with [link](https://e.com)"), /<li><strong>bold<\/strong> item with <a /);
});
test("MD: উদ্ধৃতি, hr, টেবিল (সারিবদ্ধকরণ + escape)", () => {
  assert.equal(R("> quote\n> more"), "<blockquote><p>quote\nmore</p></blockquote>");
  assert.equal(R("> <script>x</script>"), "<blockquote><p>&lt;script&gt;x&lt;/script&gt;</p></blockquote>");
  assert.equal(R("a\n\n---\n\nb"), "<p>a</p>\n<hr>\n<p>b</p>");
  const t = R("| Name | Qty |\n|:--|--:|\n| <b>x</b> | 1 \\| 2 |");
  assert.match(t, /<div class="bl-table-wrap"><table><thead><tr><th>Name<\/th><th class="al-r">Qty<\/th><\/tr><\/thead>/);
  assert.match(t, /<td>&lt;b&gt;x&lt;\/b&gt;<\/td><td class="al-r">1 \| 2<\/td>/);
  noExec(t);
  assert.doesNotMatch(R("a | b\nno separator"), /<table/);
});
test("MD: ইনপুট কখনো ক্র্যাশ করে না (null/সংখ্যা/খালি/অদ্ভুত)", () => {
  for (const v of [null, undefined, "", 12, {}, "\u0000\u0000", "\r\n\r\n", "```", "|", "[", "](", "![](", "- ", "> ", "#"]) assert.doesNotThrow(() => MD.renderMarkdown(v));
  assert.equal(R(""), "");
});

/* ---------------------------------------------------------------- markdown.js: কর্মক্ষমতা (ReDoS) */
test("MD: প্যাথলজিক্যাল ইনপুটেও দ্রুত (প্রতিটা < ১.৫ সেকেন্ড)", () => {
  const cases = {
    brackets: "[".repeat(20000), "bracket-pairs": "[a](".repeat(5000), bangs: "![".repeat(8000), stars: "*".repeat(30000), "star-words": "**a ".repeat(6000),
    ticks: "`".repeat(30000), "tick-words": "`a ".repeat(8000), unders: "_a ".repeat(8000), tildes: "~~a ".repeat(8000),
    "nested-quote": "> ".repeat(2000) + "x", "nested-list": Array.from({ length: 300 }, (_, i) => " ".repeat(i % 40) + "- x").join("\n"),
    "table-pipes": "|".repeat(20000), "long-line": "word ".repeat(30000), "link-ticks": "[`".repeat(8000) + "](x)", "image-spaces": "![" + " ".repeat(30000) + "](https://e.com/a.png)"
  };
  for (const [name, input] of Object.entries(cases)) {
    const t0 = performance.now(); MD.renderMarkdown(input); const ms = performance.now() - t0;
    assert.ok(ms < 1500, `${name}: ${Math.round(ms)}ms`);
  }
  const big = Array.from({ length: 2000 }, (_, i) => `## Heading ${i}\n\nParagraph **${i}** with [link](https://e.com/${i}) and \`code\`.\n\n- a\n- b\n`).join("\n");
  const t0 = performance.now(); MD.renderMarkdown(big); assert.ok(performance.now() - t0 < 1500, "বড় লেখা");
});

/* ---------------------------------------------------------------- seo.js (খাঁটি ফাংশন) */
test("SEO: BlogPosting + BreadcrumbList JSON-LD — শুধু বাস্তব তথ্য, </script>-নিরাপদ", { skip: !SEO }, () => {
  const base = "https://tvsites.vercel.app/";
  const post = { id: "p1", title: "Title </script><script>alert(1)", slug: "my-post", excerpt: "ex", coverImage: "https://img.example.com/c.png", author: "Rahim", tags: ["a", "b"], language: "bn",
    publishedAt: new Date("2026-05-01T10:00:00Z"), updatedAt: new Date("2026-05-02T10:00:00Z"), seoTitle: "", seoDescription: "" };
  const g = SEO.postJsonLd(post, { base, categoryName: "Web" });
  assert.equal(g["@context"], "https://schema.org");
  const bp = g["@graph"].find((x) => x["@type"] === "BlogPosting"), bc = g["@graph"].find((x) => x["@type"] === "BreadcrumbList");
  assert.equal(bp.datePublished, "2026-05-01T10:00:00.000Z"); assert.equal(bp.dateModified, "2026-05-02T10:00:00.000Z");
  assert.equal(bp.author.name, "Rahim"); assert.equal(bp.inLanguage, "bn"); assert.equal(bp.articleSection, "Web");
  assert.equal(bp.mainEntityOfPage["@id"], "https://tvsites.vercel.app/#blog/my-post");
  assert.deepEqual(bc.itemListElement.map((x) => x.position), [1, 2, 3]);
  assert.ok(bp.headline.length <= 110);
  assert.equal(bp.aggregateRating, undefined); assert.equal(bp.review, undefined);       // জাল রেটিং/রিভিউ কখনো নয়
  const nopub = SEO.postJsonLd({ ...post, publishedAt: null, coverImage: "", author: "" }, { base, categoryName: "" })["@graph"][0];
  assert.equal(nopub.datePublished, undefined); assert.equal(nopub.image, undefined);
  const s = SEO.jsonLdText(g);
  assert.doesNotMatch(s, /<\/script/i); assert.doesNotMatch(s, /<script/i);
  assert.deepEqual(JSON.parse(s), JSON.parse(JSON.stringify(g)));
});
