// tests/browser/blog-ui.test.mjs — পাবলিক ব্লগের আসল-ব্রাউজার (Chromium) টেস্ট
// চালান:  cd tests && node browser/blog-ui.test.mjs        (Playwright + Chromium লাগে: npm i -D playwright && npx playwright install chromium)
//   বিকল্প Chromium: CHROMIUM_PATH=/path/to/chrome node browser/blog-ui.test.mjs
// ব্যাখ্যা: harness.mjs দেখুন — Firebase মক, কিন্তু ডেটা-অ্যাক্সেস আসল firestore.rules + firestore.indexes.json-এর বিরুদ্ধে চলে।
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { loadPlaywright, startServer, Db, loadRules, seedBlog, newContext, USERS } from "./harness.mjs";

const SHOTS = process.env.TV_SHOTS || "";            // স্ক্রিনশট ফোল্ডার (ঐচ্ছিক)
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let pw, browser, srv, origin, db;

before(async () => {
  pw = await loadPlaywright();
  srv = await startServer(); origin = srv.origin;
  const exe = process.env.CHROMIUM_PATH || (await import("node:fs")).existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") && "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" || undefined;
  browser = await pw.chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); srv?.server.close(); });

/** প্রতিটা টেস্টে নতুন ডেটাবেস + কনটেক্সট (টেস্ট একে অপরকে প্রভাবিত করে না) */
async function setup({ user = null, viewport, offline = false } = {}) {
  const { rules, indexes } = loadRules();
  db = new Db(rules, indexes); await seedBlog(db);
  const ctx = await newContext(browser, { origin, db, user, viewport, offline });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) problems.push("console.error: " + m.text()); });
  page.on("dialog", (d) => { problems.push("DIALOG: " + d.message()); d.dismiss(); });
  return { ctx, page, problems };
}
const waitCards = (page, n = 1) => page.waitForFunction((k) => document.querySelectorAll("#blGrid .bl-card").length >= k && !document.querySelector("#blGrid .skel"), n, { timeout: 8000 });
const waitPost = (page) => page.waitForSelector("#blContent h2, #blContent p", { timeout: 8000 });
const cardTitles = (page) => page.$$eval("#blGrid .bl-card h3", (els) => els.map((e) => e.textContent.trim()));
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const noIndexErrors = () => assert.deepEqual(db.indexErrors, [], "composite index অনুপস্থিত: " + db.indexErrors.join(" | "));

/* ============================================================================ নেভিগেশন ও তালিকা */
test("নেভ: 'Blog' লিংক আছে; ক্লিকে #blog খোলে, মূল সাইট লুকায়, শিরোনাম বদলায়; হোমে ফিরলে সব আগের মতো", async () => {
  const { ctx, page, problems } = await setup();
  const original = (await (async () => { await page.goto(origin + "/", { waitUntil: "load" }); return page.title(); })());
  assert.equal(await page.locator('#navLinks a[href="#blog"]').count(), 1);
  assert.equal(await page.locator('#navLinks a[href="#blog"]').textContent(), "Blog");
  await page.click('#navLinks a[href="#blog"]');
  await waitCards(page);
  assert.equal(await page.evaluate(() => document.getElementById("mainContent").hidden), true);
  assert.equal(await page.evaluate(() => document.getElementById("blog").hidden), false);
  assert.match(await page.title(), /ব্লগ ও রিসোর্স/);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("bl-open")), true);
  assert.equal(await page.getAttribute('#navLinks a[href="#blog"]', "aria-current"), "true");
  await page.click(".nav .brand, a.brand");               // লোগো → হোম
  await page.waitForFunction(() => !document.getElementById("mainContent").hidden);
  assert.equal(await page.evaluate(() => document.getElementById("blog").hidden), true);
  assert.equal(await page.title(), original, "শিরোনাম আসলটাই ফেরে");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("bl-open")), false);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test("তালিকা: ফিচার্ড স্ট্রিপ + প্রথমে ৯টা পোস্ট (ফিচার্ড বাদে), Load More, শেষে 'সব দেখা হয়েছে'; সব কোয়েরি rules+index পাস", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/#blog", { waitUntil: "load" });
  await waitCards(page);
  assert.equal(await page.locator("#blFeatGrid .bl-card").count(), 2);
  assert.deepEqual(await page.$$eval("#blFeatGrid .bl-card h3", (e) => e.map((x) => x.textContent.trim())), ["ফিচার্ড: Tech Verse-এর নতুন সার্ভিস", "ফিচার্ড: ডিজাইন সিস্টেম কেস স্টাডি"], "featuredOrder অনুযায়ী");
  const first = await cardTitles(page);
  assert.equal(first.length, 7, "প্রথম ৯টার মধ্যে ২টা ফিচার্ড ওপরে — নিচে ডুপ্লিকেট নয়");
  assert.ok(!first.some((t) => t.startsWith("ফিচার্ড")));
  assert.equal(await page.locator("#blGrid .bl-card a.bl-link").first().getAttribute("href"), "#blog/post-01", "ফিচার্ড বাদে নতুন-আগে");
  await page.click('[data-bl="more"]');
  await page.waitForFunction(() => document.querySelectorAll("#blGrid .bl-card").length > 7);
  while (await page.locator('[data-bl="more"]').count()) { const n = await page.locator("#blGrid .bl-card").count(); await page.click('[data-bl="more"]'); await page.waitForFunction((k) => document.querySelectorAll("#blGrid .bl-card").length > k || document.querySelector(".cm-end"), n); }
  await page.waitForSelector(".cm-end");
  const all = await cardTitles(page);
  assert.equal(new Set(all).size, all.length, "কোনো ডুপ্লিকেট নেই");
  assert.ok(!all.includes("গোপন খসড়া লেখা"), "খসড়া কখনো পাবলিক তালিকায় নয়");
  assert.equal(all.length, 16, "প্রকাশিত ১৮টার মধ্যে ২টা ফিচার্ড-স্ট্রিপে; খসড়া নয় ⇒ গ্রিডে ১৬");
  noIndexErrors(); assert.deepEqual(problems, []);
  await shot(page, "01-list-desktop");
  await ctx.close();
});

test("ফিল্টার: ক্যাটাগরি, সার্চ (প্রিফিক্স, বাংলা, একাধিক শব্দ), দুটো একসাথে, খালি ফলাফল, রিসেট; নিষ্ক্রিয় ক্যাটাগরি চিপ নেই", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/#blog", { waitUntil: "load" });
  await waitCards(page);
  assert.deepEqual(await page.$$eval("#blCats .chip", (e) => e.map((x) => x.textContent.trim())), ["সব", "ওয়েব ডেভেলপমেন্ট", "ডিজাইন", "টিপস"], "নিষ্ক্রিয় 'আর্কাইভ' বাদ");
  // ক্যাটাগরি
  await page.click('#blCats .chip:has-text("ডিজাইন")');
  await waitCards(page);
  assert.equal(await page.getAttribute('#blCats .chip:has-text("ডিজাইন")', "aria-pressed"), "true");
  assert.equal(await page.locator("#blFeatured").isHidden(), true, "ফিল্টার চালু থাকলে ফিচার্ড স্ট্রিপ লুকায়");
  const design = await cardTitles(page);
  assert.ok(design.length >= 5 && design.every((t) => ["CSS Grid দিয়ে লেআউট", "Typography ও পাঠযোগ্যতা", "রঙের মনস্তত্ত্ব", "Dark Mode ডিজাইন", "অ্যাক্সেসিবিলিটি চেকলিস্ট", "ফিচার্ড: ডিজাইন সিস্টেম কেস স্টাডি"].includes(t)), design.join(" | "));
  assert.ok(design.includes("ফিচার্ড: ডিজাইন সিস্টেম কেস স্টাডি"), "ফিল্টারে ফিচার্ডও সাধারণ কার্ড হিসেবে আসে");
  // ক্যাটাগরি + সার্চ একসাথে
  await page.fill("#blSearch", "dark");
  await page.waitForFunction(() => document.querySelectorAll("#blGrid .bl-card").length === 1, null, { timeout: 5000 });
  assert.deepEqual(await cardTitles(page), ["Dark Mode ডিজাইন"]);
  await page.fill("#blSearch", "firebase");           // ডিজাইন + firebase = কিছুই নয়
  await page.waitForSelector("#blGrid .empty-state", { timeout: 5000 });
  assert.match(await page.textContent("#blGrid .empty-state"), /কোনো লেখা পাওয়া যায়নি/);
  await page.click('[data-bl="reset"]');
  await waitCards(page);
  assert.equal(await page.inputValue("#blSearch"), "");
  assert.equal(await page.locator("#blFeatured").isVisible(), true);
  // সার্চ: প্রিফিক্স ("fire"), বাংলা, একাধিক শব্দ
  await page.fill("#blSearch", "fire");
  await page.waitForFunction(() => { const t = [...document.querySelectorAll("#blGrid .bl-card h3")].map((e) => e.textContent); return t.length === 2 && t.every((x) => /Firebase|Firestore/.test(x)); }, null, { timeout: 5000 });
  await page.fill("#blSearch", "রঙের");
  await page.waitForFunction(() => document.querySelectorAll("#blGrid .bl-card").length === 1 && /রঙের/.test(document.querySelector("#blGrid .bl-card h3").textContent), null, { timeout: 5000 });
  await page.fill("#blSearch", "firebase authentication");        // সার্ভারে সবচেয়ে লম্বা শব্দ, বাকিটা ক্লায়েন্টে
  await page.waitForFunction(() => document.querySelectorAll("#blGrid .bl-card").length === 1 && /Authentication/.test(document.querySelector("#blGrid .bl-card h3").textContent), null, { timeout: 5000 });
  await page.fill("#blSearch", "firebase xyznotfound");
  await page.waitForSelector("#blGrid .empty-state", { timeout: 5000 });
  // ক্লিয়ার-বাটন ও Esc
  await page.click('[data-bl="clear-search"]'); await waitCards(page);
  assert.equal(await page.inputValue("#blSearch"), "");
  await page.fill("#blSearch", "css"); await page.waitForFunction(() => document.querySelectorAll("#blGrid .bl-card").length === 1);
  await page.press("#blSearch", "Escape"); await waitCards(page, 7);
  // এক-অক্ষরের সার্চ কোনো কোয়েরি-সীমা ভাঙে না (অগ্রাহ্য, সব লেখাই দেখায়)
  await page.fill("#blSearch", "f"); await page.waitForTimeout(700); await waitCards(page, 7);
  noIndexErrors(); assert.deepEqual(problems, []);
  await ctx.close();
});

test("তালিকা: স্ট্যাল-রেস নেই — দ্রুত ফিল্টার বদলালে শেষ ফিল্টারের ফলাফলই দেখায়", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/#blog", { waitUntil: "load" });
  await waitCards(page);
  await page.click('#blCats .chip:has-text("ওয়েব")');
  await page.click('#blCats .chip:has-text("টিপস")');
  await page.click('#blCats .chip:has-text("ডিজাইন")');
  await waitCards(page);
  await page.waitForTimeout(400);
  const t = await cardTitles(page);
  assert.ok(t.length > 0 && !t.includes("Firebase Authentication গাইড"), "ওয়েব-ক্যাটাগরির ফলাফল ঢুকে পড়েনি: " + t.join(" | "));
  assert.equal(await page.getAttribute('#blCats .chip.active', "data-cat"), "design");
  assert.deepEqual(problems, []);
  await ctx.close();
});

/* ============================================================================ লেখার পাতা */
test("লেখা: শিরোনাম, লেখক, তারিখ, পড়ার সময়, ক্যাটাগরি, ট্যাগ, কভার, সূচিপত্র, কোড/টেবিল/ছবি/লিংক — সব ঠিক রেন্ডার", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/#blog/long-guide", { waitUntil: "load" });
  await waitPost(page);
  assert.equal(await page.locator("h1#blHeading").textContent(), "দীর্ঘ গাইড: ওয়েব অ্যাপ বানানোর ধাপ");
  assert.equal(await page.locator("article[lang='bn']").count(), 1);
  assert.match(await page.textContent(".bl-byline"), /Admin Rahman/);
  assert.match(await page.textContent(".bl-byline"), /৯ মিনিট পড়া/);
  assert.equal(await page.locator("time[datetime]").first().getAttribute("datetime"), "2026-05-02T10:00:00.000Z");
  assert.equal((await page.textContent("#blCatLabel")).trim(), "ওয়েব ডেভেলপমেন্ট");
  assert.deepEqual(await page.$$eval(".bl-taglist .bl-tag", (e) => e.map((x) => x.textContent)), ["#guide", "#web", "#pwa"]);
  assert.equal(await page.locator(".bl-cover img").getAttribute("alt"), "গাইডের কভার");
  // সূচিপত্র (লম্বা লেখা)
  const toc = await page.$$eval(".bl-toc a", (e) => e.map((x) => x.textContent));
  assert.deepEqual(toc, ["ভূমিকা", "প্রথম ধাপ", "উপধাপ", "দ্বিতীয় ধাপ", "উপসংহার"]);
  const hashBefore = await page.evaluate(() => location.hash);
  await page.click('.bl-toc a:has-text("দ্বিতীয় ধাপ")');
  assert.equal(await page.evaluate(() => location.hash), hashBefore, "সূচিপত্রে ক্লিক হ্যাশ বদলায় না (রাউট ভাঙে না)");
  await page.waitForFunction(() => document.activeElement && /দ্বিতীয় ধাপ/.test(document.activeElement.textContent));
  assert.equal(await page.locator("#blContent h2").count(), 4);
  assert.equal(await page.locator("#blContent h3").count(), 1);
  // কোড, টেবিল, ছবি, লিংক
  assert.match(await page.textContent("#blContent pre code"), /const a = "<b>safe<\/b>";/);
  assert.equal(await page.locator("#blContent pre code b").count(), 0, "কোডের ভেতরের <b> ট্যাগ হয়নি");
  assert.equal(await page.locator("#blContent .bl-table-wrap table th").count(), 2);
  assert.equal(await page.locator("#blContent img").getAttribute("loading"), "lazy");
  assert.equal(await page.getAttribute('#blContent a:has-text("অন্য লেখা")', "href"), "#blog/post-01");
  assert.equal(await page.getAttribute('#blContent a:has-text("অন্য লেখা")', "target"), null);
  assert.equal(await page.getAttribute('#blContent a:has-text("বাইরের লিংক")', "rel"), "noopener noreferrer");
  assert.equal(await page.getAttribute('#blContent a:has-text("বাইরের লিংক")', "target"), "_blank");
  // কোড-কপি বাটন
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page.click(".bl-copycode");
  await page.waitForFunction(() => document.querySelector(".bl-copycode").textContent === "কপি হয়েছে", null, { timeout: 3000 });
  // সম্পর্কিত লেখা (একই ক্যাটাগরি, বর্তমানটা বাদে)
  await page.waitForSelector("#blRelated:not([hidden]) .bl-card");
  const rel = await page.$$eval("#blRelGrid .bl-card h3", (e) => e.map((x) => x.textContent.trim()));
  assert.ok(rel.length >= 1 && rel.length <= 3 && !rel.includes("দীর্ঘ গাইড: ওয়েব অ্যাপ বানানোর ধাপ"));
  noIndexErrors(); assert.deepEqual(problems, []);
  await shot(page, "02-article-desktop");
  await ctx.close();
});

test("লেখা: ছোট লেখায় সূচিপত্র নেই; ভাঙা কভার ফলব্যাকে বদলায়; ইংরেজি/বাংলা lang অ্যাট্রিবিউট", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/#blog/featured-news", { waitUntil: "load" });
  await waitPost(page);
  assert.equal(await page.locator("#blTocWrap").isHidden(), true);
  await page.waitForSelector(".bl-cover.bl-cover-fallback", { timeout: 5000 });          // broken.example.com ব্লক করা আছে
  assert.equal(await page.locator(".bl-cover img").count(), 0);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test("লেখা: শেয়ার-লিংক আসল (canonical) URL ব্যবহার করে; কপি-লিংক কাজ করে; নতুন-ট্যাব নিরাপদ rel", async () => {
  const { ctx, page, problems } = await setup();
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page.goto(origin + "/#blog/long-guide", { waitUntil: "load" });
  await waitPost(page);
  const url = "https://tvsites.vercel.app/#blog/long-guide";           // index.html-এর canonical + #blog/স্লাগ (লোকালহোস্ট নয়)
  const hrefs = await page.$$eval(".bl-share a", (e) => e.map((x) => ({ href: x.href, rel: x.rel, target: x.target })));
  assert.equal(hrefs.length, 3);
  assert.ok(hrefs[0].href.startsWith("https://wa.me/?text=") && decodeURIComponent(hrefs[0].href).includes(url));
  assert.equal(hrefs[1].href, "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url));
  assert.ok(hrefs[2].href.startsWith("https://twitter.com/intent/tweet?url=" + encodeURIComponent(url)));
  assert.ok(hrefs.every((h) => h.target === "_blank" && h.rel === "noopener noreferrer"));
  await page.click('[data-bl="copy-link"]');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), url);
  assert.match(await page.textContent("#toast, .toast, [role=status].toast, .toast-wrap") ?? "", /কপি হয়েছে/);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test("নিরাপত্তা: আক্রমণ-ভরা লেখা/শিরোনাম/মন্তব্য আসল DOM-এ কোনো স্ক্রিপ্ট চালায় না ও বিপজ্জনক নোড বানায় না", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/#blog/xss-demo", { waitUntil: "load" });
  await waitPost(page);
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.__xss), undefined, "কোনো পেলোড চলেনি");
  const bad = await page.$$eval("#blog script, #blog iframe, #blog object, #blog embed, #blog form, #blog [onerror], #blog [onclick], #blog [onload], #blContent svg, #blContent style, #blContent link, #blContent meta", (e) => e.map((x) => x.outerHTML.slice(0, 60)));
  assert.deepEqual(bad, [], "বিপজ্জনক নোড");
  assert.equal(await page.$$eval("#blContent a", (e) => e.filter((a) => /^javascript:/i.test(a.getAttribute("href"))).length), 0);
  assert.equal(await page.$$eval("#blContent img", (e) => e.length), 0, "javascript: ছবি বাদ");
  assert.match(await page.textContent("h1#blHeading"), /<img src=x onerror=window\.__xss=6>/, "শিরোনামের HTML টেক্সট হিসেবে দেখায়");
  assert.match(await page.textContent("#blContent"), /<script>window\.__xss=1<\/script>/, "কাঁচা HTML টেক্সট হিসেবে");
  assert.equal(await page.locator("#blContent a[href='https://example.com']").count(), 1);
  // মন্তব্যে HTML — টেক্সট হিসেবে (এই পোস্টে নয়; দীর্ঘ গাইডের মন্তব্যে c2)
  await page.goto(origin + "/#blog/long-guide"); await waitPost(page); await page.waitForSelector(".bl-comment");
  assert.match(await page.textContent(".bl-comment-list"), /<b>HTML<\/b> <script>window\.__xss=8<\/script>/);
  assert.equal(await page.locator(".bl-comment-list script, .cm-reply-body b, .cm-reply-body *").count(), 0, "মন্তব্যের বডিতে কোনো ট্যাগ নেই — শুধু টেক্সট");
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test("নিরাপত্তা: DOM-ছাঁকনি (toSafeFragment) সরাসরি আক্রমণ-HTML-এও নিরাপদ (দ্বিতীয় স্তর)", async () => {
  const { ctx, page } = await setup();
  await page.goto(origin + "/", { waitUntil: "load" });
  const out = await page.evaluate(async () => {
    const { toSafeFragment } = await import("/js/blog/markdown.js");
    const attacks = [
      '<p onclick="window.__xss=1">x</p>', '<img src=x onerror="window.__xss=2">', '<img src="https://img.example.com/a.png" onerror="window.__xss=3">', '<a href="javascript:window.__xss=4">x</a>',
      '<a href="  JaVaScRiPt:window.__xss=5">x</a>', '<a href="data:text/html,<script>window.__xss=6</script>">x</a>', '<svg onload="window.__xss=7"><circle/></svg>', '<iframe src="https://evil.example"></iframe>',
      '<script>window.__xss=8</script>', '<style>body{display:none}</style>', '<form action="https://evil.example"><input name=x></form>', '<math><mi xlink:href="javascript:1">x</mi></math>',
      '<div class="bl-table-wrap"><table><tr><td style="x" onmouseover="window.__xss=9">c</td></tr></table></div>', '<h2 id="bh-ok" onfocus="window.__xss=10">h</h2>', '<h2 id="not-allowed">h</h2>',
      '<a href="https://example.com" target="_self" rel="opener">x</a>', '<a href="#blog/x" target="_blank">x</a>', '<img src="http://insecure.example/a.png">', '<img src="//evil.example/a.png">',
      '<template><script>window.__xss=11</script></template>', '<noscript><img src=x onerror="window.__xss=12"></noscript>', '<object data="x"></object><embed src="x">', '<button onclick="window.__xss=13">b</button>',
      '<span style="position:fixed;inset:0">overlay</span>', '<div class="evil">d</div>', '<code class="language-js onclick">c</code>', '<ol start="3x"><li>a</li></ol>', '<video src=x onerror="window.__xss=14"></video>',
      '<a href="https://ok.example/p?x=1&y=2">ok</a>', '<img src="https://img.example.com/ok.png" alt="fine">'
    ];
    return attacks.map((h) => { const f = toSafeFragment(h); const d = document.createElement("div"); d.appendChild(f); return d.innerHTML; });
  });
  const joined = out.join("\n");
  assert.doesNotMatch(joined, /<script|<iframe|<svg|<style|<form|<input|<math|<object|<embed|<button|<video|<template|<noscript/i);
  assert.doesNotMatch(joined, /\son\w+=/i);
  assert.doesNotMatch(joined, /javascript:/i); assert.doesNotMatch(joined, /data:text/i); assert.doesNotMatch(joined, /src="http:/i); assert.doesNotMatch(joined, /src="\/\//);
  assert.doesNotMatch(joined, /\sstyle=/i);
  assert.equal(out[14], "<h2>h</h2>", "অননুমোদিত id বাদ");
  assert.equal(out[13], '<h2 id="bh-ok">h</h2>');
  assert.equal(out[15], '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>', "বাহ্যিক লিংকে নিরাপদ rel/target বাধ্যতামূলক");
  assert.equal(out[16], '<a href="#blog/x">x</a>', "অভ্যন্তরীণ লিংকে target নেই");
  assert.equal(out[24], "<div>d</div>".replace("<div>", "").replace("</div>", ""), "অজানা class-যুক্ত div ফ্ল্যাট");
  assert.equal(out[26], "<ol><li>a</li></ol>");
  assert.equal(out[28], '<a href="https://ok.example/p?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">ok</a>');
  assert.equal(out[29], '<img src="https://img.example.com/ok.png" alt="fine">');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  await ctx.close();
});

test("লেখা: খসড়া পাবলিকের কাছে 'পাওয়া যায়নি' (noindex); অজানা/অবৈধ স্লাগেও; মূল সাইটে নয়", async () => {
  const { ctx, page, problems } = await setup();
  for (const slug of ["secret-draft", "does-not-exist", "Bad%20Slug", "a--b"]) {
    await page.goto(origin + "/#blog/" + slug, { waitUntil: "load" });
    await page.reload();
    await page.waitForSelector(".bl-nf", { timeout: 8000 });
    assert.equal(await page.textContent(".bl-nf"), "লেখাটি পাওয়া যায়নি", slug);
    assert.equal(await page.evaluate(() => document.getElementById("mainContent").hidden), true, "মূল সাইটে ফেরেনি");
    assert.equal(await page.getAttribute('meta[name="robots"]', "content"), "noindex");
    assert.match(await page.title(), /লেখাটি পাওয়া যায়নি/);
  }
  assert.ok(!(await page.content()).includes("এটি প্রকাশিত নয়"), "খসড়ার বিষয়বস্তু কখনো ডেলিভার হয়নি");
  // সাধারণ সদস্যও খসড়া দেখে না
  const m = await setup({ user: USERS.member });
  await m.page.goto(origin + "/#blog/secret-draft", { waitUntil: "load" });
  await m.page.waitForSelector(".bl-nf", { timeout: 8000 });
  assert.ok(!(await m.page.content()).includes("এটি প্রকাশিত নয়"));
  assert.deepEqual(problems, []);
  await ctx.close(); await m.ctx.close();
});

test("লেখা: অ্যাডমিন খসড়া প্রিভিউ দেখে (ব্যানার + noindex + মন্তব্য/শেয়ার নেই); পুরোনো-স্লাগ নতুনে রিডাইরেক্ট", async () => {
  const { ctx, page, problems } = await setup({ user: USERS.admin });
  await page.goto(origin + "/#blog/secret-draft", { waitUntil: "load" });
  await page.waitForSelector(".bl-draft", { timeout: 8000 });
  assert.match(await page.textContent(".bl-draft"), /খসড়া প্রিভিউ/);
  assert.equal(await page.textContent("h1#blHeading"), "গোপন খসড়া লেখা");
  assert.equal(await page.getAttribute('meta[name="robots"]', "content"), "noindex, nofollow");
  assert.equal(await page.locator("#blComments, .bl-share, #blRelated").count(), 0);
  assert.equal(await page.locator('script#tvBlogLd').count(), 0, "খসড়ায় JSON-LD নেই");
  // পুরোনো স্লাগ (সবার জন্য)
  const g = await setup();
  await g.page.goto(origin + "/#blog/older-name", { waitUntil: "load" });
  await g.page.waitForSelector("h1#blHeading", { timeout: 8000 });
  assert.equal(await g.page.textContent("h1#blHeading"), "নাম বদলানো লেখা");
  assert.equal(await g.page.evaluate(() => location.hash), "#blog/new-name", "URL নতুন স্লাগে বদলে যায়");
  assert.equal(await g.page.getAttribute('link[rel="canonical"]', "href"), "https://tvsites.vercel.app/#blog/new-name");
  noIndexErrors(); assert.deepEqual(problems, []);
  await ctx.close(); await g.ctx.close();
});

/* ============================================================================ SEO */
test("SEO: লেখার মেটা/canonical/OG/Twitter/article:*/JSON-LD ঠিক; ছাড়লে index.html-এর আসল মান হুবহু ফেরে", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/", { waitUntil: "load" });
  const snap = () => page.evaluate(() => ({
    title: document.title, canonical: document.querySelector('link[rel="canonical"]')?.href,
    desc: document.querySelector('meta[name="description"]')?.content, ogTitle: document.querySelector('meta[property="og:title"]')?.content, ogUrl: document.querySelector('meta[property="og:url"]')?.content,
    ogType: document.querySelector('meta[property="og:type"]')?.content, ogImage: document.querySelector('meta[property="og:image"]')?.content, twCard: document.querySelector('meta[name="twitter:card"]')?.content,
    ld: document.querySelectorAll('script[type="application/ld+json"]').length, robots: document.querySelector('meta[name="robots"]')?.content || null, article: document.querySelectorAll('meta[property^="article:"]').length,
    headMeta: document.head.querySelectorAll("meta,link,script").length
  }));
  const before = await snap();
  await page.evaluate(() => { location.hash = "#blog/long-guide"; });
  await waitPost(page);
  await page.waitForFunction(() => document.querySelector('meta[property="og:type"]')?.content === "article");
  const d = await snap();
  assert.equal(d.title, "SEO টাইটেল: ওয়েব অ্যাপ গাইড — Tech Verse");
  assert.equal(d.canonical, "https://tvsites.vercel.app/#blog/long-guide");
  assert.equal(d.desc, "ওয়েব অ্যাপ বানানোর ধাপে ধাপে গাইড।");
  assert.equal(d.ogUrl, "https://tvsites.vercel.app/#blog/long-guide");
  assert.equal(d.ogType, "article"); assert.equal(d.ogImage, "https://img.example.com/cover.png"); assert.equal(d.twCard, "summary_large_image");
  assert.ok(d.article >= 5, "article:published_time, modified_time, author, section, tag×3");
  assert.equal(d.ld, before.ld + 1);
  const ld = await page.evaluate(() => JSON.parse(document.getElementById("tvBlogLd").textContent));
  const bp = ld["@graph"].find((x) => x["@type"] === "BlogPosting"), bc = ld["@graph"].find((x) => x["@type"] === "BreadcrumbList");
  assert.equal(bp.headline, "SEO টাইটেল: ওয়েব অ্যাপ গাইড"); assert.equal(bp.author.name, "Admin Rahman"); assert.equal(bp.inLanguage, "bn");
  assert.equal(bp.datePublished, "2026-05-02T10:00:00.000Z"); assert.equal(bp.keywords, "guide, web, pwa"); assert.equal(bp.articleSection, "ওয়েব ডেভেলপমেন্ট");
  assert.equal(bp.publisher.logo.url, "https://tvsites.vercel.app/assets/logo.svg");
  assert.deepEqual(bc.itemListElement.map((x) => x.name), ["Home", "Blog", "দীর্ঘ গাইড: ওয়েব অ্যাপ বানানোর ধাপ"]);
  assert.equal(bp.aggregateRating, undefined);
  // তালিকা-পাতার মেটা
  await page.evaluate(() => { location.hash = "#blog"; });
  await page.waitForFunction(() => document.title.startsWith("ব্লগ ও রিসোর্স"));
  const l = await snap();
  assert.equal(l.canonical, "https://tvsites.vercel.app/#blog");
  const ldl = await page.evaluate(() => JSON.parse(document.getElementById("tvBlogLd").textContent));
  assert.deepEqual(ldl["@graph"].map((x) => x["@type"]), ["Blog", "BreadcrumbList"]);
  assert.equal(l.article, 0, "article:* মেটা তালিকায় নেই");
  // ফেরা: হুবহু আসল
  await page.evaluate(() => { location.hash = "#home"; });
  await page.waitForFunction(() => !document.getElementById("mainContent").hidden);
  const after = await snap();
  assert.deepEqual(after, before, "আসল মেটা/শিরোনাম/canonical/JSON-LD হুবহু ফেরত এসেছে");
  assert.deepEqual(problems, []);
  await ctx.close();
});

/* ============================================================================ মন্তব্য */
test("মন্তব্য (অতিথি): শুধু অনুমোদিত মন্তব্য; লুকানো/অপেক্ষমাণ নয়; লগইন-প্রম্পট; মন্তব্য-বন্ধ নোটিশ", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/#blog/long-guide", { waitUntil: "load" });
  await page.waitForSelector(".bl-comment", { timeout: 8000 });
  const texts = await page.$$eval(".bl-comment-list .cm-reply-body", (e) => e.map((x) => x.textContent));
  assert.equal(texts.length, 3);
  assert.ok(texts.includes("চমৎকার লেখা!") && !texts.some((t) => /লুকানো|অপেক্ষমাণ/.test(t)));
  assert.match(await page.textContent(".bl-note-login"), /মন্তব্য করতে লগইন করুন/);
  let opened = false;
  await page.evaluate(() => document.addEventListener("tv:open-auth", () => { window.__authOpened = true; }));
  await page.click('[data-bl="login"]');
  assert.equal(await page.evaluate(() => window.__authOpened), true);
  await page.goto(origin + "/#blog/closed-comments"); await waitPost(page);
  await page.waitForSelector(".bl-note");
  assert.match(await page.textContent("#blComBody"), /মন্তব্য বন্ধ আছে/);
  assert.equal(await page.locator("#blComForm").count(), 0);
  noIndexErrors(); assert.deepEqual(problems, []);
  await ctx.close();
});

test("মন্তব্য (সদস্য): নিজের অপেক্ষমাণ দেখে; জমা → 'অনুমোদনের অপেক্ষায়'; পরপর জমা throttle-এ আটকায়; নিজেরটা মুছে (কনফার্ম-ডায়ালগ); ভ্যালিডেশন", async () => {
  const { ctx, page, problems } = await setup({ user: USERS.member });
  await page.goto(origin + "/#blog/long-guide", { waitUntil: "load" });
  await page.waitForSelector("#blComForm", { timeout: 8000 });
  assert.equal(await page.locator(".bl-comment.is-pending").count(), 1, "নিজের পুরোনো অপেক্ষমাণ মন্তব্য");
  assert.match(await page.textContent(".bl-comment.is-pending"), /আমার অপেক্ষমাণ মন্তব্য/);
  assert.ok(!(await page.textContent(".bl-comment-list")).includes("অন্যের অপেক্ষমাণ"), "অন্যের অপেক্ষমাণ মন্তব্য কখনো নয়");
  assert.match(await page.textContent("#blComHint"), /অনুমোদনের পর প্রকাশিত হবে/);
  // ভ্যালিডেশন
  await page.fill("#blComText", "a"); await page.click("#blComSubmit");
  assert.match(await page.textContent("#blComErr"), /কমপক্ষে/);
  assert.equal(await page.locator(".bl-comment.is-pending").count(), 1);
  // সফল জমা
  const msg = "নতুন একটি মন্তব্য — ধন্যবাদ!";
  await page.fill("#blComText", msg);
  assert.equal(await page.textContent("#blComCount"), new Intl.NumberFormat("bn-BD").format(msg.length), "অক্ষর-কাউন্টার");
  await page.click("#blComSubmit");
  await page.waitForFunction(() => document.querySelectorAll(".bl-comment.is-pending").length === 2);
  assert.equal(await page.inputValue("#blComText"), "", "ফর্ম খালি হয়েছে");
  const rows = [...db.sim.docs.entries()].filter(([p]) => p.startsWith("tvProject/main/blogPosts/plong/comments/") && p.split("/").length === 6 && !["c1", "c2", "c3", "c4", "c5", "c6"].includes(p.split("/").pop()));
  assert.equal(rows.length, 1);
  const c = rows[0][1];
  assert.equal(c.status, "pending"); assert.equal(c.uid, "u1"); assert.equal(c.authorName, "Rahim Uddin"); assert.equal(c.body, "নতুন একটি মন্তব্য — ধন্যবাদ!");
  assert.ok(db.has("blogCommentThrottle/u1"), "throttle-ডক একই batch-এ লেখা হয়েছে");
  // পরপর দ্বিতীয় মন্তব্য — ২০ সেকেন্ডের মধ্যে rules আটকায়
  await page.fill("#blComText", "দ্বিতীয় মন্তব্য খুব তাড়াতাড়ি");
  await page.click("#blComSubmit");
  await page.waitForFunction(() => /২০ সেকেন্ড/.test(document.getElementById("blComErr")?.textContent || ""));
  assert.equal(await page.inputValue("#blComText"), "দ্বিতীয় মন্তব্য খুব তাড়াতাড়ি", "লেখা হারায়নি");
  assert.equal(await page.locator(".bl-comment.is-pending").count(), 2);
  // নিজের অপেক্ষমাণ মন্তব্য মোছা — কনফার্ম-ডায়ালগ (native dialog নয়)
  await page.click('.bl-comment.is-pending [data-bl="del-comment"]');
  await page.waitForSelector('[role="alertdialog"]');
  await page.click('[role="alertdialog"] [data-cancel]');
  await page.waitForFunction(() => !document.querySelector('[role="alertdialog"]'));
  assert.equal(await page.locator(".bl-comment.is-pending").count(), 2, "বাতিল করলে মুছে না");
  await page.click('.bl-comment.is-pending [data-bl="del-comment"]');
  await page.click('[role="alertdialog"] [data-ok]');
  await page.waitForFunction(() => document.querySelectorAll(".bl-comment.is-pending").length === 1);
  noIndexErrors(); assert.deepEqual(problems, []);
  await shot(page, "03-comments");
  await ctx.close();
});

test("মন্তব্য (ব্লকড ইউজার): ফর্ম নেই — সীমিত-অ্যাক্সেস নোটিশ; (rules-ও আটকায়)", async () => {
  const { ctx, page, problems } = await setup({ user: USERS.blocked });
  await page.goto(origin + "/#blog/long-guide", { waitUntil: "load" });
  await page.waitForSelector(".bl-note", { timeout: 8000 });
  await page.waitForFunction(() => /সীমিত/.test(document.getElementById("blComBody").textContent), null, { timeout: 5000 });
  assert.equal(await page.locator("#blComForm").count(), 0);
  assert.deepEqual(problems, []);
  await ctx.close();
});

/* ============================================================================ সমন্বয়, নেভিগেশন, ফোকাস */
test("সমন্বয়: #blog ↔ #community সরাসরি যাওয়া-আসায় মূল সাইট ঝলকায় না, শিরোনাম ঠিক, bl-open/cm-open একসাথে নয়", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/", { waitUntil: "load" });
  const original = await page.title();
  const states = [];
  await page.exposeFunction("__rec", (s) => states.push(s));
  await page.evaluate(() => { new MutationObserver(() => window.__rec({ main: document.getElementById("mainContent").hidden, cm: document.documentElement.classList.contains("cm-open"), bl: document.documentElement.classList.contains("bl-open") })).observe(document.getElementById("mainContent"), { attributes: true, attributeFilter: ["hidden"] }); });
  await page.evaluate(() => { location.hash = "#blog"; }); await page.waitForSelector("#blGrid .bl-card");
  await page.evaluate(() => { location.hash = "#community"; }); await page.waitForFunction(() => document.documentElement.classList.contains("cm-open") && !document.documentElement.classList.contains("bl-open"));
  assert.equal(await page.evaluate(() => document.getElementById("mainContent").hidden), true);
  assert.equal(await page.evaluate(() => document.getElementById("blog").hidden), true);
  await page.evaluate(() => { location.hash = "#blog/long-guide"; }); await waitPost(page);
  assert.equal(await page.evaluate(() => document.getElementById("community").hidden), true);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("cm-open")), false);
  assert.equal(await page.evaluate(() => document.getElementById("mainContent").hidden), true);
  await page.evaluate(() => { location.hash = "#services"; }); await page.waitForFunction(() => !document.getElementById("mainContent").hidden);
  assert.equal(await page.title(), original, "কমিউনিটি/ব্লগ ঘুরে এসেও আসল শিরোনাম");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("bl-open") || document.documentElement.classList.contains("cm-open")), false);
  // ব্লগ→কমিউনিটি→ব্লগ-এর মাঝখানে মূল সাইট একবারও দৃশ্যমান হয়নি (blog↔community ধাপে)
  const flashes = states.filter((s) => s.main === false && (s.cm || s.bl));
  assert.equal(flashes.length, 0, "মূল সাইট ঝলক: " + JSON.stringify(flashes));
  assert.deepEqual(problems.filter((p) => !/community|Community/.test(p)), []);
  await ctx.close();
});

test("সমন্বয়: তথ্য-শিট (#privacy) ব্লগের ওপর খুললে ব্লগ নিচে খোলাই থাকে; বন্ধে লেখা/শিরোনাম/মেটা অক্ষত, রি-ফেচ নেই", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/#blog/long-guide", { waitUntil: "load" });
  await waitPost(page); await page.waitForSelector(".bl-comment");
  const title = await page.title();
  const q0 = db.log.filter((l) => l.op === "query").length;
  await page.evaluate(() => document.querySelector('[data-info="privacy"], a[href="#privacy"]')?.click());
  await page.waitForFunction(() => location.hash === "#privacy");
  assert.equal(await page.evaluate(() => document.getElementById("mainContent").hidden), true, "মূল সাইট ফেরেনি");
  assert.equal(await page.evaluate(() => document.getElementById("blog").hidden), false);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.hash === "#blog/long-guide");
  await page.waitForTimeout(300);
  assert.equal(await page.title(), title, "শিরোনাম ফিরে এসেছে");
  assert.equal(db.log.filter((l) => l.op === "query").length, q0, "আবার ফেচ হয়নি");
  assert.equal(await page.locator("h1#blHeading").count(), 1);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test("ব্যাক-বাটন: লেখা থেকে ফিরলে তালিকা, ফিল্টার ও স্ক্রল অবস্থানসহ ফেরে; ফোকাস শিরোনামে", async () => {
  const { ctx, page, problems } = await setup({ viewport: { width: 1280, height: 700 } });
  // (ক) ফিল্টার মনে থাকে
  await page.goto(origin + "/#blog", { waitUntil: "load" });
  await waitCards(page);
  await page.click('#blCats .chip:has-text("ডিজাইন")'); await waitCards(page);
  const before = await cardTitles(page);
  await page.click("#blGrid .bl-card a.bl-link");
  await waitPost(page);
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "blHeading", null, { timeout: 3000 });      // ফোকাস লেখার h1-এ (পরের ফ্রেমে বসে)
  await page.goBack();
  await waitCards(page);
  assert.equal(await page.getAttribute("#blCats .chip.active", "data-cat"), "design", "ফিল্টার মনে আছে");
  assert.deepEqual(await cardTitles(page), before, "আগের তালিকাই (ফেচ ছাড়া)");
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "blHeading", null, { timeout: 3000 });
  // (খ) স্ক্রল-অবস্থান মনে থাকে (ফিল্টারহীন, লম্বা তালিকা)
  await page.click('[data-bl="reset"], #blCats .chip:has-text("সব")'); await waitCards(page, 7);
  await page.click('[data-bl="more"]'); await page.waitForFunction(() => document.querySelectorAll("#blGrid .bl-card").length > 9);
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 900); });         // সাইটের html{scroll-behavior:smooth} এড়িয়ে তাৎক্ষণিক (নইলে অ্যানিমেশন-সময়ে y অনিশ্চিত)
  await page.waitForFunction(() => Math.abs(window.scrollY - 900) < 2);
  const y = await page.evaluate(() => { const a = [...document.querySelectorAll("#blGrid .bl-card a.bl-link")][6]; const yy = window.scrollY; a.click(); return yy; });
  assert.ok(y > 500, "পেজ স্ক্রল করা গেছে: " + y);
  await waitPost(page);
  assert.equal(await page.evaluate(() => window.scrollY), 0, "লেখা সবসময় ওপর থেকে শুরু");
  await page.goBack();
  await waitCards(page, 9);
  await page.waitForFunction((yy) => Math.abs(window.scrollY - yy) < 8, y, { timeout: 4000 });
  assert.deepEqual(problems, []);
  await ctx.close();
});

/* ============================================================================ রেসপন্সিভ, অ্যাক্সেসিবিলিটি */
for (const [w, cols] of [[1280, 3], [900, 2], [760, 2], [375, 1]]) {
  test(`রেসপন্সিভ ${w}px: গ্রিড ${cols} কলাম; অনুভূমিক ওভারফ্লো নেই (তালিকা ও লেখা)`, async () => {
    const { ctx, page, problems } = await setup({ viewport: { width: w, height: 900 } });
    await page.goto(origin + "/#blog", { waitUntil: "load" });
    await waitCards(page);
    const colsNow = await page.$eval("#blGrid", (g) => getComputedStyle(g).gridTemplateColumns.split(" ").length);
    assert.equal(colsNow, cols);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "তালিকা: অনুভূমিক স্ক্রল");
    await shot(page, `04-list-${w}`);
    await page.goto(origin + "/#blog/long-guide"); await waitPost(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "লেখা: অনুভূমিক স্ক্রল");
    const tableOk = await page.$eval(".bl-table-wrap", (e) => e.scrollWidth >= e.clientWidth);
    assert.ok(tableOk);
    await shot(page, `05-article-${w}`);
    assert.deepEqual(problems, []);
    await ctx.close();
  });
}

test("নেভ: ৯০১–১১০০px-এ ৮টা লিংক এক সারিতে ধরে (ওভারফ্লো/র‍্যাপ নেই); ৯০০px-এ ড্রয়ার মেনুতে 'Blog' আছে", async () => {
  for (const w of [901, 960, 1024, 1100, 1180]) {
    const { ctx, page } = await setup({ viewport: { width: w, height: 800 } });
    await page.goto(origin + "/", { waitUntil: "load" });
    const r = await page.evaluate(() => {
      const nav = document.getElementById("navLinks"), links = [...nav.querySelectorAll("a")];
      const tops = new Set(links.map((a) => Math.round(a.getBoundingClientRect().top)));
      const header = document.querySelector(".nav .wrap");
      return { count: links.length, rows: tops.size, overflow: nav.scrollWidth > nav.clientWidth + 1, headerOverflow: header.scrollWidth > header.clientWidth + 1, h: document.querySelector(".nav").offsetHeight };
    });
    assert.equal(r.count, 8, `${w}px`); assert.equal(r.rows, 1, `${w}px: লিংক র‍্যাপ করেছে`); assert.equal(r.overflow, false, `${w}px`); assert.equal(r.headerOverflow, false, `${w}px: হেডার ওভারফ্লো`);
    if (w === 901) await shot(page, "06-nav-901");
    await ctx.close();
  }
  const { ctx, page } = await setup({ viewport: { width: 390, height: 800 } });
  await page.goto(origin + "/", { waitUntil: "load" });
  await page.click(".nav-toggle");
  await page.waitForSelector('.dr-link[href="#blog"]', { timeout: 5000 });
  assert.match(await page.textContent('.dr-link[href="#blog"]'), /Blog/);
  await page.click('.dr-link[href="#blog"]');
  await page.waitForSelector("#blGrid .bl-card", { timeout: 8000 });
  assert.equal(await page.evaluate(() => document.getElementById("blog").hidden), false);
  await shot(page, "07-drawer-blog");
  await ctx.close();
});

test("অ্যাক্সেসিবিলিটি: ল্যান্ডমার্ক/হেডিং/নাম/ফোকাস/কীবোর্ড — তালিকা ও লেখা", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/#blog", { waitUntil: "load" });
  await waitCards(page);
  assert.equal(await page.evaluate(() => document.querySelectorAll("#blog h2").length), 1, "তালিকা-পাতায় একটাই h2 (পেজ-শিরোনাম)");
  assert.equal(await page.getAttribute("#blSearch", "type"), "search");
  assert.equal(await page.locator('label[for="blSearch"]').count(), 1);
  assert.equal(await page.getAttribute("form[role=search]", "role"), "search");
  assert.equal(await page.getAttribute("#blCats", "role"), "group");
  const unnamed = await page.$$eval("#blog button, #blog a, #blog input", (els) => els.filter((e) => !(e.getAttribute("aria-label") || e.textContent.trim() || (e.labels && e.labels.length))).map((e) => e.outerHTML.slice(0, 80)));
  assert.deepEqual(unnamed, [], "নামহীন ইন্টারঅ্যাক্টিভ এলিমেন্ট");
  assert.equal(await page.$$eval("#blog img", (e) => e.filter((i) => !i.hasAttribute("alt")).length), 0, "alt অ্যাট্রিবিউট ছাড়া ছবি");
  // কীবোর্ড: Tab দিয়ে কার্ড-লিংকে পৌঁছে Enter
  await page.focus("#blCats .chip:last-child");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement.className);
  assert.match(focused, /bl-link/, "চিপের পর পরের ফোকাস কার্ড-লিংক: " + focused);
  const ring = await page.evaluate(() => { const a = document.activeElement; return getComputedStyle(a, "::after").outlineStyle; });
  assert.notEqual(ring, "none", "কার্ড-লিংকে দৃশ্যমান ফোকাস");
  await page.keyboard.press("Enter");
  await waitPost(page);
  // লেখার পাতা: একটাই h1; হেডিং-ক্রম; ছবির alt; রিমোশন ও aria
  assert.equal(await page.locator("#blog h1").count(), 1);
  const levels = await page.$$eval("#blog h1, #blog h2, #blog h3, #blog h4", (e) => e.map((x) => +x.tagName[1]));
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] - levels[i - 1] <= 1, "হেডিং-স্তর লাফ: " + levels.join(","));
  assert.equal(await page.$$eval("#blog img", (e) => e.filter((i) => !i.hasAttribute("alt")).length), 0);
  assert.equal(await page.getAttribute(".bl-share", "role"), "group");
  await page.goto(origin + "/#blog/long-guide"); await waitPost(page); await page.waitForSelector(".bl-toc");
  assert.equal(await page.getAttribute(".bl-toc", "aria-labelledby"), "blTocH");
  assert.equal(await page.locator("#blTocH").count(), 1);
  const lv = await page.$$eval("#blog h1, #blog h2, #blog h3, #blog h4", (e) => e.map((x) => +x.tagName[1]));
  for (let i = 1; i < lv.length; i++) assert.ok(lv[i] - lv[i - 1] <= 1, "হেডিং-স্তর লাফ (দীর্ঘ লেখা): " + lv.join(","));
  assert.equal(await page.$$eval("#blog [id]", (e) => { const ids = e.map((x) => x.id); return ids.length - new Set(ids).size; }), 0, "ডুপ্লিকেট id নেই");
  assert.deepEqual(problems, []);
  await ctx.close();
});

test("অফলাইন (১): কোড-মডিউলই লোড হয়নি → ব্লগ-ভিউতে অফলাইন-বার্তা + 'আবার চেষ্টা'; সাইটের বাকি অংশ অক্ষত; অনলাইনে ফিরে সফল", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/", { waitUntil: "load" });
  await ctx.setOffline(true);
  await page.evaluate(() => { location.hash = "#blog"; });
  await page.waitForSelector("#blog [data-bl-reload]", { timeout: 8000 });
  assert.match(await page.textContent("#blog .cm-state"), /ব্লগ লোড করা যায়নি/);
  assert.equal(await page.evaluate(() => document.getElementById("mainContent").hidden), true);
  await page.click('#blog a[href="#home"]');                                          // হোমে ফিরলে মূল সাইট ঠিক
  await page.waitForFunction(() => !document.getElementById("mainContent").hidden);
  assert.ok(await page.locator("#services, #hero, .hero").count() > 0, "মূল সাইট অক্ষত");
  await page.evaluate(() => { location.hash = "#blog"; }); await page.waitForSelector("#blog [data-bl-reload]");
  await ctx.setOffline(false);                                                       // 'online' ইভেন্টে ব্লগ-ভিউ নিজে থেকেই রিলোড হয় (blog-entry.js)
  await page.waitForSelector("#blGrid .bl-card", { timeout: 15000 });
  assert.deepEqual(problems.filter((p) => !/offline|Failed|net::|ERR_/i.test(p)), []);
  await ctx.close();
});

test("অফলাইন (২): কোড লোড আছে কিন্তু Firestore নাগালের বাইরে → ফিল্টার/Load More-এ ত্রুটি + retry; বিদ্যমান কার্ড অক্ষত; অনলাইনে ফিরে সফল", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/#blog", { waitUntil: "load" });
  await waitCards(page);
  const n = await page.locator("#blGrid .bl-card").count();
  // Load More অফলাইনে
  await ctx.setOffline(true);
  await page.click('[data-bl="more"]');
  await page.waitForSelector("#blFoot .cm-state", { timeout: 8000 });
  assert.match(await page.textContent("#blFoot .cm-state"), /অফলাইনে/);
  assert.equal(await page.locator("#blGrid .bl-card").count(), n, "বিদ্যমান কার্ড অক্ষত");
  await ctx.setOffline(false);
  await page.click('#blFoot [data-bl="more"]');
  await page.waitForFunction((k) => document.querySelectorAll("#blGrid .bl-card").length > k, n);
  // ফিল্টার অফলাইনে: ত্রুটি দেখায়; অনলাইনে ফিরলে নিজে থেকেই আবার চেষ্টা করে
  await ctx.setOffline(true);
  await page.click('#blCats .chip:has-text("ডিজাইন")');
  await page.waitForSelector("#blGrid .cm-state", { timeout: 8000 });
  assert.equal(await page.locator("#blGrid .bl-card").count(), 0);
  assert.equal(await page.getAttribute('#blCats .chip.active', "data-cat"), "design", "ফিল্টার-অবস্থা বজায়");
  await ctx.setOffline(false);
  await waitCards(page);
  assert.ok((await cardTitles(page)).includes("CSS Grid দিয়ে লেআউট"), "অনলাইনে ফিরে স্বয়ংক্রিয় রিট্রাই");
  // সার্ভার-ত্রুটি (অনলাইন, কিন্তু Firestore ব্যর্থ): ম্যানুয়াল 'আবার চেষ্টা' বাটন
  db.fail = "unavailable";
  await page.click('#blCats .chip:has-text("টিপস")');
  await page.waitForSelector('#blGrid [data-bl="retry"]', { timeout: 8000 });
  db.fail = null;
  await page.click('#blGrid [data-bl="retry"]');
  await waitCards(page);
  assert.equal(await page.getAttribute('#blCats .chip.active', "data-cat"), "tips");
  // লেখার পাতা: অফলাইনে ত্রুটি → অনলাইনে নিজে থেকেই লোড; সার্ভার-ত্রুটিতে ম্যানুয়াল retry
  await ctx.setOffline(true);
  await page.evaluate(() => { location.hash = "#blog/long-guide"; });
  await page.waitForSelector("#blPost .cm-state", { timeout: 8000 });
  await ctx.setOffline(false);
  await waitPost(page);
  assert.equal(await page.textContent("h1#blHeading"), "দীর্ঘ গাইড: ওয়েব অ্যাপ বানানোর ধাপ");
  db.fail = "unavailable";
  await page.evaluate(() => { location.hash = "#blog/post-01"; });
  await page.waitForSelector('#blPost [data-bl="retry-post"]', { timeout: 8000 });
  db.fail = null;
  await page.click('#blPost [data-bl="retry-post"]');
  await page.waitForFunction(() => document.querySelector("h1#blHeading")?.textContent === "Firebase Authentication গাইড", null, { timeout: 8000 });
  assert.deepEqual(problems.filter((p) => !/offline|Failed|net::|ERR_/i.test(p)), []);
  await ctx.close();
});

for (const theme of ["light", "dark"]) {
  test(`কনট্রাস্ট (${theme}): কার্ড/লেখা/মন্তব্য/মেটা সব টেক্সট WCAG AA (≥ ৪.৫:১) — টোকেন-ভিত্তিক`, async () => {
    const { ctx, page } = await setup();
    await page.addInitScript((t) => localStorage.setItem("tv-theme", t), theme);
    await page.goto(origin + "/#blog/long-guide", { waitUntil: "load" });
    await waitPost(page); await page.waitForSelector(".bl-comment"); await page.waitForSelector("#blRelated:not([hidden])");
    if (theme === "dark") assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark");
    const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const pairs = await page.evaluate(() => ["#blContent p", ".bl-lead", ".bl-byline .bl-sub", ".bl-card .bl-sub", ".bl-card .bl-excerpt", ".bl-toc a", ".bl-tag", ".cm-reply-body", ".cm-reply-top .cm-sub", ".bl-note", ".pf-tag", ".bl-share-t", ".bl-content a"].map((sel) => {
      const el = document.querySelector(sel); if (!el) return null;
      let bg = el, bgc = "rgba(0, 0, 0, 0)"; while (bg && /rgba\(0, 0, 0, 0\)|transparent/.test(bgc)) { bgc = getComputedStyle(bg).backgroundColor; bg = bg.parentElement; }
      return { sel, fg: getComputedStyle(el).color, bg: bgc };
    }).filter(Boolean));
    assert.ok(pairs.length >= 10, "যথেষ্ট এলিমেন্ট মাপা হয়েছে");
    for (const p of pairs) {
      const a = lum(p.fg), b = lum(p.bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(ratio >= 4.5, `${theme} ${p.sel}: কনট্রাস্ট ${ratio.toFixed(2)} (${p.fg} / ${p.bg})`);
    }
    await shot(page, `08-article-${theme}`);
    await ctx.close();
  });
}
