// tests/blog-contract.test.mjs — ব্লগ: "ক্লায়েন্ট-কোড ↔ firestore.rules / indexes / storage.rules / ওয়্যারিং" চুক্তি-যাচাই (Node ছাড়া কিছু লাগে না)
// contract.test.mjs-এর ব্লগ-সংস্করণ: js/blog/*.js যে ফিল্ড-সেট লেখে, যে সীমা/স্ট্যাটাস ব্যবহার করে, যে কোয়েরি চালায় — সব rules ও ইনডেক্সের সাথে হুবহু মেলে কিনা।
// ভবিষ্যতে কেউ JS-এ ফিল্ড যোগ করে rules না বদলালে (বা উল্টো) এই টেস্ট ফেল করে — ডিপ্লয়ের পর "permission-denied" ধরার আগেই।
// চালান:  cd tests && node blog-contract.test.mjs
import { readFileSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const RULES = read("firestore.rules"), API = read("js/blog/api.js"), AAPI = read("js/blog/admin-api.js"), APP = read("js/blog/app.js"), ADM = read("js/admin-blog.js"), SEO = read("js/blog/seo.js");
const STORAGE = read("storage.rules");

// model.js (Node-এ ESM): অস্থায়ী type=module ফোল্ডারে কপি
const tmp = mkdtempSync(join(tmpdir(), "tv-bc-"));
mkdirSync(join(tmp, "js/blog"), { recursive: true }); writeFileSync(join(tmp, "package.json"), '{"type":"module"}');
copyFileSync(join(ROOT, "js/blog/model.js"), join(tmp, "js/blog/model.js"));
const M = await import(pathToFileURL(join(tmp, "js/blog/model.js")).href);

/* ---------- হেল্পার ---------- */
const sorted = (a) => [...new Set(a)].sort();
const strs = (s) => [...s.matchAll(/'([^']*)'/g)].map((m) => m[1]);
function ruleFn(name) {                                       // rules-এর "function name(...)" থেকে পরের function/সেকশন পর্যন্ত
  const i = RULES.indexOf(`function ${name}(`); assert.ok(i >= 0, `rules-এ function ${name}() নেই`);
  const rest = RULES.slice(i + 10); const j = rest.search(/\n {4}(function |\/\/ ===|\/\/ ----)/);
  return j < 0 ? rest : rest.slice(0, j);
}
const ruleList = (body, call) => { const m = new RegExp(`${call}\\((?:\\s*[\\w.]+,\\s*)?\\[([^\\]]*)\\]`).exec(body); assert.ok(m, `rules-এ ${call}([...]) পাইনি`); return strs(m[1]); };
function jsFn(src, name) {                                    // "export async function name(" থেকে পরের top-level export/function পর্যন্ত
  const m = new RegExp(`(?:export )?(?:async )?function ${name}\\(`).exec(src); assert.ok(m, `${name}() নেই`);
  const rest = src.slice(m.index + 10); const j = rest.search(/\n(?:\/\*\*|export |async function |function |\/\* ===)/);
  return src.slice(m.index, m.index + 10 + (j < 0 ? rest.length : j));
}
/** { a: 1, b, c: f(x, y) } অবজেক্ট-লিটারালের টপ-লেভেল কী-তালিকা (নেস্টিং-সচেতন) */
function objKeys(body) {
  const out = []; let depth = 0, cur = "";
  for (const ch of body) {
    if ("([{".includes(ch)) depth++; if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((t) => t.trim()).filter(Boolean).map((t) => /^([A-Za-z_]\w*)\s*(?::|$)/.exec(t)?.[1]).filter(Boolean);
}
const literalAfter = (src, marker) => { const i = src.indexOf(marker); assert.ok(i >= 0, `"${marker}" নেই`); let j = src.indexOf("{", i), d = 0, k = j; for (; k < src.length; k++) { if (src[k] === "{") d++; if (src[k] === "}") { d--; if (!d) break; } } return src.slice(j + 1, k); };

/* ============================================================ ফিল্ড-সেট */
test("পোস্ট-তৈরি: admin-api createPost-এর ২৬টা ফিল্ড == rules validNewBlogPost-এর hasExactly", () => {
  const client = objKeys(literalAfter(jsFn(AAPI, "createPost"), "const data = {"));
  const rules = ruleList(ruleFn("validNewBlogPost"), "hasExactly");
  assert.equal(client.length, 26);
  assert.deepEqual(sorted(client), sorted(rules));
});
test("পোস্ট-এডিট: updatePost/setPostStatus যা লেখে ⊆ rules validBlogPostEdit-এর অনুমোদিত তালিকা; immutable ফিল্ড কখনো নয়", () => {
  const allowed = ruleList(ruleFn("validBlogPostEdit"), "changed.hasOnly");
  const up = jsFn(AAPI, "updatePost"), st = jsFn(AAPI, "setPostStatus");
  const forKeys = strs(/for \(const k of \[([^\]]*)\]\)/.exec(up)[1].replace(/"/g, "'"));
  const assigned = [...up.matchAll(/patch\.(\w+) =/g)].map((m) => m[1]);
  const statusKeys = objKeys(/const patch = \{([^}]*)\}/.exec(st)[1]);
  for (const k of [...forKeys, ...assigned, ...statusKeys]) assert.ok(allowed.includes(k), `ক্লায়েন্ট '${k}' লেখে কিন্তু rules-এর edit-তালিকায় নেই`);
  for (const k of ["author", "authorAvatar", "createdBy", "createdAt", "contentFormat"]) { assert.ok(!allowed.includes(k), `rules '${k}' এডিট করতে দেয়!`); assert.ok(![...forKeys, ...assigned].includes(k), `ক্লায়েন্ট '${k}' বদলাতে চায়`); }
});
test("মন্তব্য-তৈরি: createComment-এর ৭টা ফিল্ড == rules validNewBlogComment; throttle-ডক == { lastAt }", () => {
  const cc = jsFn(API, "createComment");
  const client = objKeys(/batch\.set\(ref, \{([^}]*)\}\)/.exec(cc)[1]);
  assert.deepEqual(sorted(client), sorted(ruleList(ruleFn("validNewBlogComment"), "hasExactly")));
  assert.deepEqual(objKeys(/blogCommentThrottle[^{]*\{([^}]*)\}/.exec(cc)[1]), ["lastAt"]);
  assert.deepEqual(sorted(ruleList(RULES.slice(RULES.indexOf("match /blogCommentThrottle/")), "hasExactly")), ["lastAt"]);
});
test("মডারেশন: moderateComment-এর ফিল্ড == rules validBlogCommentModeration; মালিক-মুছা == validOwnerSoftDelete (status+updatedAt)", () => {
  const mc = jsFn(AAPI, "moderateComment");
  assert.deepEqual(sorted(objKeys(/b\.update\(tvDoc\([^)]*\),\s*\{([^}]*)\}\)/.exec(mc)[1])), sorted(ruleList(ruleFn("validBlogCommentModeration"), "changed.hasOnly")));
  assert.deepEqual(sorted(objKeys(/updateDoc\(tvDoc\([^)]*\),\s*\{([^}]*)\}\)/.exec(jsFn(API, "deleteOwnComment"))[1])), ["status", "updatedAt"]);
});
test("স্লাগ-ক্লেইম: createPost/updatePost { postId, createdAt } লেখে == rules validSlugClaim", () => {
  for (const fn of ["createPost", "updatePost"]) assert.deepEqual(sorted(objKeys(/blogSlugs", \w+(?:\.\w+)?\), \{([^}]*)\}/.exec(jsFn(AAPI, fn))[1])), ["createdAt", "postId"]);
  assert.deepEqual(sorted(ruleList(ruleFn("validSlugClaim"), "hasExactly")), ["createdAt", "postId"]);
});
test("ক্যাটাগরি: addCategory { name, order, active, createdAt } == rules (কমিউনিটির validNewCategory পুনর্ব্যবহার)", () => {
  assert.deepEqual(sorted(objKeys(/b\.set\(tvDoc\([^)]*\),\s*\{([^}]*)\}\)/.exec(jsFn(AAPI, "addCategory"))[1])), ["active", "createdAt", "name", "order"]);
  assert.deepEqual(sorted(ruleList(ruleFn("validNewCategory"), "hasExactly")), ["active", "createdAt", "name", "order"]);
  assert.match(RULES, /match \/blogCategories\/\{categoryId\} \{[\s\S]*?validNewCategory\(categoryId\)[\s\S]*?validCategoryEdit\(\)/);
});

/* ============================================================ সীমা ও মান */
test("সীমা: model.js LIMITS == rules (শিরোনাম, সারসংক্ষেপ, বিষয়বস্তু, alt, SEO, ট্যাগ, টোকেন, স্লাগ, history, readingTime, featuredOrder, মন্তব্য)", () => {
  const c = ruleFn("validNewBlogPost"), e = ruleFn("validBlogPostEdit"), cm = ruleFn("validNewBlogComment"), L = M.LIMITS;
  const has = (txt, re, msg) => assert.match(txt, re, msg);
  has(c, new RegExp(`isText\\(d\\.title, ${L.title[0]}, ${L.title[1]}\\)`)); has(e, new RegExp(`isText\\(d\\.title, ${L.title[0]}, ${L.title[1]}\\)`));
  has(c, new RegExp(`isText\\(d\\.excerpt, 0, ${L.excerpt}\\)`)); has(e, new RegExp(`isText\\(d\\.excerpt, 0, ${L.excerpt}\\)`));
  has(c, new RegExp(`isText\\(d\\.content, ${L.content[0]}, ${L.content[1]}\\)`)); has(e, new RegExp(`isText\\(d\\.content, ${L.content[0]}, ${L.content[1]}\\)`));
  has(c, new RegExp(`isText\\(d\\.coverAlt, 0, ${L.coverAlt}\\)`)); has(e, new RegExp(`isText\\(d\\.coverAlt, 0, ${L.coverAlt}\\)`));
  has(c, new RegExp(`isText\\(d\\.seoTitle, 0, ${L.seoTitle}\\)`)); has(e, new RegExp(`isText\\(d\\.seoTitle, 0, ${L.seoTitle}\\)`));
  has(c, new RegExp(`isText\\(d\\.seoDescription, 0, ${L.seoDescription}\\)`)); has(e, new RegExp(`isText\\(d\\.seoDescription, 0, ${L.seoDescription}\\)`));
  has(c, new RegExp(`d\\.tags\\.size\\(\\) <= ${L.tags}`)); has(e, new RegExp(`d\\.tags\\.size\\(\\) <= ${L.tags}`));
  has(c, new RegExp(`d\\.searchTokens\\.size\\(\\) <= ${L.searchTokens}`)); has(e, new RegExp(`d\\.searchTokens\\.size\\(\\) <= ${L.searchTokens}`));
  has(ruleFn("isSlug"), new RegExp(`s\\.size\\(\\) <= ${L.slug}`));
  has(ruleFn("blogSlugChangeOk"), new RegExp(`d\\.slugHistory\\.size\\(\\) <= ${L.slugHistory}`));
  has(c, new RegExp(`d\\.readingTime >= ${L.readingTime[0]} && d\\.readingTime <= ${L.readingTime[1]}`)); has(e, new RegExp(`d\\.readingTime >= ${L.readingTime[0]} && d\\.readingTime <= ${L.readingTime[1]}`));
  has(c, new RegExp(`d\\.featuredOrder >= ${L.featuredOrder[0]} && d\\.featuredOrder <= ${L.featuredOrder[1]}`)); has(e, new RegExp(`d\\.featuredOrder >= ${L.featuredOrder[0]} && d\\.featuredOrder <= ${L.featuredOrder[1]}`));
  has(cm, new RegExp(`isText\\(d\\.body, ${L.comment[0]}, ${L.comment[1]}\\)`));
  has(c, /d\.category\.matches\('\[a-z0-9-\]\{1,40\}'\)/); assert.equal(M.CATEGORY_RE.source, "^[a-z0-9-]{1,40}$");
  has(ruleFn("isSlug"), /matches\('\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*'\)/); assert.equal(M.SLUG_RE.source, "^[a-z0-9]+(?:-[a-z0-9]+)*$");
});
test("স্ট্যাটাস/ভাষা/মন্তব্য-নীতি: STATUS, LANGS, COMMENT_STATUS, COMMENT_START_STATUS, throttle-সেকেন্ড == rules", () => {
  assert.deepEqual(sorted(Object.values(M.STATUS)), sorted(strs(/d\.status in \[([^\]]*)\]/.exec(ruleFn("validNewBlogPost"))[1])));
  assert.deepEqual(sorted(M.LANGS), sorted(strs(/d\.language in \[([^\]]*)\]/.exec(ruleFn("validNewBlogPost"))[1])));
  assert.deepEqual(sorted(Object.values(M.COMMENT_STATUS)), sorted(strs(/d\.status in \[([^\]]*)\]/.exec(ruleFn("validBlogCommentModeration"))[1])));
  assert.equal(strs(ruleFn("blogCommentStartStatus"))[0], M.COMMENT_START_STATUS, "rules ও model.js-এর শুরুর মন্তব্য-স্ট্যাটাস মেলে না");
  const secs = [...RULES.matchAll(/duration\.value\((\d+), 's'\)/g)].map((m) => Number(m[1]));
  assert.ok(secs.length >= 2 && secs.every((s) => s === M.COMMENT_THROTTLE_SECONDS), `throttle: rules ${secs} vs model ${M.COMMENT_THROTTLE_SECONDS}`);
});

/* ============================================================ নিরাপত্তা-কাঠামো */
test("rules: ব্লগ-কালেকশনে কোথাও 'if true' দিয়ে লেখা/মুছা নেই; পাবলিক-পড়া শুধু প্রকাশিত/অনুমোদিত; কমেন্টে হার্ড-ডিলিট শুধু অনাথ", () => {
  for (const col of ["blogPosts", "blogSlugs", "blogCommentThrottle", "blogCategories"]) {
    const i = RULES.indexOf(`match /${col}/`); assert.ok(i >= 0, col);
    const blk = RULES.slice(i, i + 3500);
    assert.doesNotMatch(blk.split("\n      match /")[0], /allow (create|update|delete|write)[^:\n]*: if true/, `${col}: লেখা-নিয়ম খোলা!`);
  }
  const posts = RULES.slice(RULES.indexOf("match /blogPosts/"));
  assert.match(posts, /allow get: if resource\.data\.status == 'published';/);
  assert.match(posts, /allow list: if resource\.data\.status == 'published' && request\.query\.limit <= 50;/);
  assert.match(posts, /allow delete: if isAdmin\(\) && resource\.data\.status == 'draft';/);
  assert.match(posts, /allow list: if resource\.data\.status == 'approved' && request\.query\.limit <= 50 && blogPostIsPublished\(postId\);/);
  assert.match(posts, /allow delete: if isAdmin\(\) && !exists\(blogPostPath\(postId\)\);/);
  assert.match(RULES, /match \/blogSlugs\/\{slug\} \{\s*allow get: if isAdmin\(\);/);
  assert.doesNotMatch(RULES.slice(RULES.indexOf("match /blogSlugs/"), RULES.indexOf("match /blogCommentThrottle/")), /allow update/, "স্লাগ-ক্লেইম কখনো আপডেট হয় না");
  assert.match(RULES, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/, "default-deny অক্ষত");
});
test("পাবলিক কোয়েরি: js/blog/api.js-এর প্রতিটা blogPosts-কোয়েরি status == published ফিল্টারসহ (শুধু fetchDraftBySlug অ্যাডমিন-প্রিভিউ — rules-এ আটকানো); প্রতিটায় limit()", () => {
  const fns = [...API.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
  for (const f of fns) {
    const body = jsFn(API, f);
    if (!/tvCol\("blogPosts"\)/.test(body)) continue;
    if (f === "fetchDraftBySlug") { assert.ok(/e\?\.code !== "denied"/.test(body), "ড্রাফট-প্রিভিউ permission-denied সামলায় না"); continue; }
    assert.match(body, /STATUS\.PUBLISHED/, `${f}: প্রকাশিত-ফিল্টার নেই!`);
    assert.match(body, /limit\(/, `${f}: limit নেই (rules ≤৫০ চায়)`);
  }
  assert.match(jsFn(API, "fetchComments"), /where\("status", "==", COMMENT_STATUS\.APPROVED\)/);
  assert.match(jsFn(API, "fetchMyPendingComments"), /where\("uid", "==", uid\)/);
  assert.ok(!/blogCommentThrottle/.test(API.replace(/\/\/[^\n]*/g, "").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(jsFn(API, "createComment").replace(/\/\/[^\n]*/g, ""), "")), "throttle শুধু createComment-এ");
});
test("XSS-সুরক্ষা (সোর্স-স্ক্যান): লেখার content শুধু renderArticle() দিয়ে বসে; কোনো Firestore-টেক্সট ছাড়া-escape টেমপ্লেটে নয়", () => {
  assert.equal((APP.match(/renderArticle\(/g) || []).length, 1);
  assert.match(APP, /renderArticle\(p\.content\)/); assert.match(APP, /box\.replaceChildren\(fragment\)/);
  assert.doesNotMatch(APP, /\$\{[^}]*\.content[^}]*\}/, "content টেমপ্লেটে ঢুকছে");
  assert.doesNotMatch(APP, /insertAdjacentHTML|outerHTML\s*=|document\.write/);
  // সবচেয়ে সম্ভাব্য রিগ্রেশন: কেউ ${p.title} জাতীয় "খালি" (esc ছাড়া) ইন্টারপোলেশন লিখলে ধরা পড়ে। (আসল DOM-স্তরের প্রমাণ: tests/browser/blog-ui.test.mjs-এর XSS-টেস্ট)
  const bare = [...APP.matchAll(/\$\{\s*(?:p|c|P\.data|it|post|P)\.(?:title|excerpt|author|authorName|authorAvatar|body|coverAlt|coverImage|slug|tags|category|seoTitle|seoDescription)\s*\}/g)].map((m) => m[0]);
  assert.deepEqual(bare, [], "ছাড়া-escape ইন্টারপোলেশন: " + bare.join(" | "));
  const admCode = ADM.split("\n").filter((l) => !/toLowerCase\(\)\.includes\(/.test(l)).join("\n");       // সার্চ-ফিল্টার-স্ট্রিং HTML-এ যায় না
  const bareAdm = [...admCode.matchAll(/\$\{\s*(?:p|c|v|post|it)\.(?:title|excerpt|author|authorName|body|coverAlt|coverImage|slug|seoTitle|seoDescription|content|name|id)\s*\}/g)].map((m) => m[0]);
  assert.deepEqual(bareAdm, [], "অ্যাডমিন: ছাড়া-escape ইন্টারপোলেশন: " + bareAdm.join(" | "));
  assert.doesNotMatch(SEO, /innerHTML/, "seo.js-এ innerHTML নেই"); assert.match(SEO, /\.textContent = jsonLdText\(obj\)/);
  assert.ok(!/innerHTML/.test(read("js/blog/markdown.js").replace(/tpl\.innerHTML = html;/, "").replace(/\/\/[^\n]*/g, "")), "markdown.js: শুধু নিষ্ক্রিয় <template>-এ innerHTML");
});
test("অ্যাডমিন-UI: অ্যাডমিন-লেখা শুধু admin-api.js দিয়ে; পাবলিক app.js অ্যাডমিন-API/Storage ইম্পোর্ট করে না", () => {
  assert.doesNotMatch(APP, /admin-api|firebase-storage|setDoc|deleteDoc|writeBatch/);
  assert.doesNotMatch(API.replace(jsFn(API, "createComment"), "").replace(jsFn(API, "deleteOwnComment"), ""), /writeBatch\(|setDoc\(|deleteDoc\(|updateDoc\(|batch\./, "পাবলিক api.js-এ মন্তব্যের বাইরে কোনো লেখা নেই");
  assert.match(AAPI, /import\("https:\/\/www\.gstatic\.com\/firebasejs\/10\.13\.0\/firebase-storage\.js"\)/, "Storage SDK lazy (শুধু আপলোডে)");
  assert.doesNotMatch(ADM, /localStorage|sessionStorage/);
  assert.match(ADM, /safeImageSrc/, "কভার-প্রিভিউ শুধু যাচাই-করা URL");
});

/* ============================================================ ইনডেক্স ও Storage */
test("firestore.indexes.json: ব্লগের ৮টা কম্পোজিট ইনডেক্স (লেখা ৭ + মন্তব্য ১) ঠিক আছে", () => {
  const idx = JSON.parse(read("firestore.indexes.json")).indexes.map((x) => `${x.collectionGroup}:${x.queryScope}:${x.fields.map((f) => `${f.fieldPath}/${f.arrayConfig ? "C" : f.order[0]}`).join(",")}`);
  for (const need of [
    "blogPosts:COLLECTION:status/A,publishedAt/D", "blogPosts:COLLECTION:status/A,category/A,publishedAt/D", "blogPosts:COLLECTION:status/A,searchTokens/C,publishedAt/D",
    "blogPosts:COLLECTION:status/A,category/A,searchTokens/C,publishedAt/D", "blogPosts:COLLECTION:status/A,featured/A,featuredOrder/A", "blogPosts:COLLECTION:status/A,slugHistory/C",
    "blogPosts:COLLECTION:status/A,updatedAt/D", "comments:COLLECTION:status/A,createdAt/A"
  ]) assert.ok(idx.includes(need), "ইনডেক্স নেই: " + need);
  assert.equal(new Set(idx).size, idx.length, "ডুপ্লিকেট ইনডেক্স");
  for (const raw of JSON.parse(read("firestore.indexes.json")).indexes) if (raw.collectionGroup === "blogPosts" || raw.collectionGroup === "comments") assert.ok(raw.fields.length >= 2, "কম্পোজিটে কমপক্ষে ২ ফিল্ড");
});
test("storage.rules: default-deny, শুধু অ্যাডমিন লেখে, শুধু jpeg/png/webp ≤২MB, নিরাপদ ফাইলনাম; admin-api COVER_MAX/টাইপ == rules; firebase.json-এ যুক্ত", () => {
  assert.match(STORAGE, /match \/\{allPaths=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(STORAGE, /allow create: if isAdmin\(\)/); assert.match(STORAGE, /allow update: if false;/); assert.match(STORAGE, /allow delete: if isAdmin\(\);/);
  assert.match(STORAGE, /firestore\.get\(\/databases\/\(default\)\/documents\/tvProject\/main\/users\/\$\(request\.auth\.uid\)\)\.data\.get\('isAdmin', false\) == true/);
  assert.match(STORAGE, /request\.resource\.size <= 2 \* 1024 \* 1024/); assert.match(AAPI, /COVER_MAX = 2 \* 1024 \* 1024/);
  assert.match(STORAGE, /contentType\.matches\('image\/\(jpeg\|png\|webp\)'\)/); assert.deepEqual(sorted(/COVER_TYPES = \[([^\]]*)\]/.exec(AAPI)[1].match(/image\/\w+/g)), ["image/jpeg", "image/png", "image/webp"]);
  assert.match(STORAGE, /file\.matches\('\[A-Za-z0-9\._-\]\{1,120\}'\)/);
  assert.doesNotMatch(STORAGE, /image\/svg|image\/gif/);
  assert.ok(/blog\/covers\/\$\{name\}/.test(AAPI) && /match \/blog\/covers\/\{file\}/.test(STORAGE), "আপলোড-পাথ == rules-পাথ");
  assert.equal(JSON.parse(read("firebase.json")).storage.rules, "storage.rules");
  assert.ok(!/allow (read|write|create|update|delete)[^:\n]*: if true/.test(STORAGE.replace(/allow read: if true;/, "")), "Storage-এ শুধু কভার-ছবির পাবলিক-পড়া");
});

/* ============================================================ ওয়্যারিং */
test("ওয়্যারিং: index.html (নেভ/সেকশন/CSS/স্ক্রিপ্ট), ড্রয়ার, SW-শেল, admin (নেভ/রাউট/CSS) — সব ব্লগ-ফাইল আছে ও ডিস্কে বিদ্যমান", () => {
  const html = read("index.html"), adminHtml = read("admin.html"), sw = read("sw.js"), drawer = read("js/drawer.js"), admin = read("js/admin.js");
  assert.match(html, /<a href="#blog">Blog<\/a>/); assert.match(html, /<section class="section bl-section" id="blog"[^>]*hidden><\/section>/);
  assert.match(html, /href="\.\/css\/blog\.css"/); assert.match(html, /src="\.\/js\/blog-entry\.js"/);
  assert.ok(html.indexOf("community-entry.js") < html.indexOf("blog-entry.js"), "community-entry আগে (hashchange-ক্রম)");
  assert.match(drawer, /blog: "book"/); assert.match(drawer, /id === "blog"/); assert.match(drawer, /bl-open/);
  const shell = [...sw.matchAll(/"\.\/([^"]+)"/g)].map((m) => m[1]);
  for (const f of ["css/blog.css", "js/blog-entry.js", "js/blog/app.js", "js/blog/api.js", "js/blog/model.js", "js/blog/markdown.js", "js/blog/seo.js"]) { assert.ok(shell.includes(f), `SW-শেলে নেই: ${f}`); assert.ok(existsSync(join(ROOT, f)), `ফাইল নেই: ${f}`); }
  assert.match(sw, /CACHE_NAME = "techverse-shell-v01\.00\.0(3[1-9]|[4-9]\d)"/, "শেল বদলেছে — ক্যাশ-ভার্সন বাড়ানো দরকার (≥ ০৩১)");
  assert.match(adminHtml, /css\/blog\.css/); assert.match(adminHtml, /css\/community\.css/);
  assert.match(admin, /renderBlog/); assert.match(admin, /leaveBlog\(\)/); assert.match(admin, /item\("blog", "book", "ব্লগ"\)/); assert.match(admin, /hash === "blog"/);
  for (const f of ["js/admin-blog.js", "js/blog/admin-api.js", "storage.rules", "docs/BLOG_REPORT.md"]) assert.ok(existsSync(join(ROOT, f)), `ফাইল নেই: ${f}`);
});
test("community-entry: ব্লগ-সমন্বয় (bl-open চেক; শিরোনাম enter-এ নতুন করে ধরা হয় না) — অন্য আচরণ অক্ষত", () => {
  const ce = read("js/community-entry.js");
  assert.match(ce, /classList\.contains\("bl-open"\)\) return;/);
  assert.doesNotMatch(ce, /isOpen = true;\s*savedTitle = document\.title;/);
  assert.match(ce, /document\.title = savedTitle;/); assert.match(ce, /hashchange/);
});
test("SEO: seo.js শুধু বাস্তব তথ্য (রেটিং/রিভিউ বানায় না); canonical-ভিত্তি index.html থেকে", () => {
  assert.doesNotMatch(SEO, /aggregateRating|ratingValue|reviewCount|"Review"/);
  assert.match(SEO, /link\[rel="canonical"\]/);
  assert.match(read("index.html"), /<link rel="canonical" href="https:\/\/tvsites\.vercel\.app\/"/);
});
