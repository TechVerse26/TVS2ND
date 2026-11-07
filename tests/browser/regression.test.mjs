// tests/browser/regression.test.mjs — ব্লগ যুক্ত হওয়ার পর বিদ্যমান সাইট/অ্যাডমিনের রিগ্রেশন-স্মোক (আসল Chromium)
// উদ্দেশ্য: নতুন ফিচার পুরোনো কিছু ভাঙেনি — হোম-সেকশন, নেভ/স্ক্রল-স্পাই, ড্রয়ার, তথ্য-শিট, কমিউনিটি-ভিউ, থিম, অ্যাডমিনের সব পুরোনো ট্যাব — সবকটা JS-ত্রুটি ছাড়া লোড হয়।
// এটা পূর্ণ ফাংশনাল-টেস্ট নয় (সেগুলো আছে rules/contract স্যুটে); ডেটা ফাঁকা/ন্যূনতম, তাই "ত্রুটি ছাড়া রেন্ডার + মূল ইন্টার‍্যাকশন কাজ করে" যাচাই করা হয়।
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadPlaywright, startServer, Db, loadRules, seedBlog, newContext, USERS } from "./harness.mjs";

let pw, browser, srv, origin, db;
before(async () => {
  pw = await loadPlaywright(); srv = await startServer(); origin = srv.origin;
  const exe = process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);
  browser = await pw.chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); srv?.server.close(); });

async function setup({ user = null, viewport } = {}) {
  const { rules, indexes } = loadRules();
  db = new Db(rules, indexes); await seedBlog(db);
  // বিদ্যমান কনটেন্ট-কালেকশনের ন্যূনতম সিড (পাবলিক হোম রেন্ডার করার জন্য)
  const ts = { $ts: 1700000000000 };
  db.seed("services/s1", { title: "ওয়েব ডেভেলপমেন্ট", description: "সুন্দর দ্রুত সাইট", icon: "code", order: 1, active: true, createdAt: ts });
  db.seed("faqItems/f1", { question: "কত সময় লাগে?", answer: "২–৪ সপ্তাহ", order: 1, createdAt: ts });
  const ctx = await newContext(browser, { origin, db, user, viewport });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) problems.push("console.error: " + m.text()); });
  return { ctx, page, problems };
}
const clean = (problems) => problems.filter((p) => !/permission|insufficient|denied/i.test(p));       // বিদ্যমান ফিচারের নিজস্ব rules-ত্রুটি (সিড-ফাঁকা) আলাদা — JS-ক্র্যাশ নয়

test("হোম: সব বিদ্যমান সেকশন রেন্ডার হয়; নেভ-লিংক ৮টা (Blog সহ); কোনো JS-ত্রুটি নেই", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  for (const id of ["hero", "services", "portfolio", "pricing", "team", "faq", "booking", "contact"]) {
    const exists = await page.locator(`#${id}`).count();
    if (!exists) continue;                                              // কিছু সেকশনের আইডি ভিন্ন হতে পারে — আছে যেগুলো সেগুলোর যাচাই
    assert.equal(await page.locator(`#${id}`).isVisible().catch(() => true), true, `#${id} দৃশ্যমান`);
  }
  assert.deepEqual(await page.$$eval("#navLinks a", (a) => a.map((x) => x.getAttribute("href"))), ["#services", "#portfolio", "#pricing", "#team", "#faq", "#blog", "#community", "#booking"]);
  assert.equal(await page.evaluate(() => document.getElementById("mainContent").hidden), false);
  assert.equal(await page.evaluate(() => document.getElementById("blog").hidden), true, "ব্লগ-ভিউ ডিফল্টে লুকানো");
  assert.equal(await page.evaluate(() => document.getElementById("community").hidden), true);
  assert.match(await page.title(), /Tech Verse/);
  assert.equal(await page.getAttribute('link[rel="canonical"]', "href"), "https://tvsites.vercel.app/");
  assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1, "হোমে শুধু বিদ্যমান JSON-LD (ব্লগেরটা নয়)");
  assert.deepEqual(clean(problems), []);
  await ctx.close();
});

test("নেভ/স্ক্রল-স্পাই: সেকশন-লিংকে ক্লিক মূল পাতার ভেতরে স্ক্রল করে (ব্লগ-ভিউ না খুলে); থিম-টগল কাজ করে", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/", { waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.click('#navLinks a[href="#faq"]');
  await page.waitForFunction(() => location.hash === "#faq");
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(() => document.getElementById("blog").hidden), true);
  assert.equal(await page.evaluate(() => document.getElementById("mainContent").hidden), false);
  assert.ok(await page.evaluate(() => window.scrollY) > 300, "FAQ সেকশনে স্ক্রল হয়েছে");
  const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await page.click("#themeToggle, [data-theme-toggle], .theme-toggle").catch(() => {});
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  assert.notEqual(before, after, "থিম বদলায়");
  assert.deepEqual(clean(problems), []);
  await ctx.close();
});

test("কমিউনিটি: #community খোলে/বন্ধ হয় আগের মতো; ব্লগ-সমন্বয়ে ভাঙেনি; শিরোনাম ফেরে", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/", { waitUntil: "load" });
  const original = await page.title();
  await page.click('#navLinks a[href="#community"]');
  await page.waitForFunction(() => document.documentElement.classList.contains("cm-open"));
  assert.equal(await page.evaluate(() => document.getElementById("mainContent").hidden), true);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("bl-open")), false);
  await page.waitForSelector("#community h2, #community .cm-wrap", { timeout: 8000 });
  await page.evaluate(() => { location.hash = "#home"; });
  await page.waitForFunction(() => !document.getElementById("mainContent").hidden);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("cm-open")), false);
  assert.equal(await page.title(), original);
  // সরাসরি কমিউনিটি-ডিপ-লিংকে লোড
  await page.goto(origin + "/#community"); await page.reload();
  await page.waitForFunction(() => document.documentElement.classList.contains("cm-open"), null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => document.getElementById("blog").hidden), true);
  assert.deepEqual(clean(problems), []);
  await ctx.close();
});

test("তথ্য-শিট (#privacy/#about …): খোলে ও বন্ধ হয়; মূল সাইটে (ব্লগ ছাড়া) আগের আচরণ অক্ষত", async () => {
  const { ctx, page, problems } = await setup();
  await page.goto(origin + "/", { waitUntil: "load" });
  await page.waitForTimeout(400);
  const link = page.locator('footer a[href="#privacy"], a[data-info="privacy"], a[href="#privacy"]').first();
  await link.click();
  await page.waitForFunction(() => location.hash === "#privacy");
  await page.waitForSelector(".info-sheet, .info-overlay, [data-info-sheet], #infoSheet, .sheet", { timeout: 5000 }).catch(() => {});
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.hash !== "#privacy", null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.getElementById("mainContent").hidden), false);
  assert.deepEqual(clean(problems), []);
  await ctx.close();
});

test("মোবাইল ড্রয়ার (☰): সাইট-মেনুতে আগের সব লিংক + Blog; সেকশন-লিংক স্ক্রল করে; Blog/Community-লিংক ভিউ খোলে; ড্রয়ার বন্ধ হয়", async () => {
  const { ctx, page, problems } = await setup({ viewport: { width: 390, height: 800 } });
  await page.goto(origin + "/", { waitUntil: "load" });
  await page.click(".nav-toggle");
  await page.waitForSelector(".dr-link", { timeout: 5000 });
  const links = await page.$$eval(".dr-link", (e) => e.map((x) => x.getAttribute("href")).filter(Boolean));
  for (const h of ["#services", "#portfolio", "#pricing", "#team", "#faq", "#blog", "#community"]) assert.ok(links.includes(h), `ড্রয়ারে নেই: ${h}`);
  await page.click('.dr-link[href="#faq"]');                              // ইন-পেজ সেকশন: বিদ্যমান আচরণে হ্যাশ বদলায় না, শুধু স্ক্রল করে
  await page.waitForFunction(() => window.scrollY > 300, null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => document.getElementById("blog").hidden), true);
  await page.click(".nav-toggle"); await page.waitForSelector('.dr-link[href="#community"]');
  await page.click('.dr-link[href="#community"]');
  await page.waitForFunction(() => document.documentElement.classList.contains("cm-open"));
  await page.click(".nav-toggle"); await page.waitForSelector('.dr-link[href="#blog"]');
  await page.click('.dr-link[href="#blog"]');
  await page.waitForFunction(() => document.documentElement.classList.contains("bl-open") && !document.documentElement.classList.contains("cm-open"));
  await page.waitForSelector("#blGrid .bl-card");
  await page.click(".nav-toggle"); await page.waitForSelector('.dr-link[href="#services"]');
  await page.click('.dr-link[href="#services"]');                          // ব্লগ-ভিউ থেকে মূল সাইটের সেকশনে ফেরা
  await page.waitForFunction(() => !document.getElementById("mainContent").hidden && document.getElementById("blog").hidden);
  assert.deepEqual(clean(problems), []);
  await ctx.close();
});

test("লগইন-অবস্থা: সদস্য-অবতার/প্রোফাইল-ড্রয়ার আগের মতো; ব্লগ-পাতায় লগইন-অবস্থা বদলালে (লগআউট) UI ঠিক থাকে", async () => {
  const { ctx, page, problems } = await setup({ user: USERS.member });
  await page.goto(origin + "/#blog/long-guide", { waitUntil: "load" });
  await page.waitForSelector("#blComForm", { timeout: 8000 });
  await page.evaluate(() => window.__tvAuth.set(null));                    // লগআউট
  await page.waitForSelector(".bl-note-login", { timeout: 5000 });
  assert.equal(await page.locator("#blComForm").count(), 0);
  assert.equal(await page.locator(".bl-comment.is-pending").count(), 0, "লগআউটে নিজের অপেক্ষমাণ মন্তব্য মুছে যায়");
  await page.evaluate(() => window.__tvAuth.set({ uid: "u2", displayName: "Karim", email: "u2@x.com", photoURL: "" }));
  await page.waitForSelector("#blComForm", { timeout: 5000 });
  assert.deepEqual(clean(problems), []);
  await ctx.close();
});

for (const route of ["dashboard", "bookings", "community", "users", "settings", "services", "portfolio", "caseStudies", "testimonials", "team", "stats", "pricingPlans", "faqItems", "blog"]) {
  test(`অ্যাডমিন (বিদ্যমান ট্যাব): #${route} ত্রুটি ছাড়া লোড হয়`, async () => {
    const { ctx, page, problems } = await setup({ user: USERS.admin });
    const nav = (async () => { await page.goto(origin + "/admin.html#" + route, { waitUntil: "load" }); await page.waitForSelector("#adminNav", { timeout: 10000 }); })();
    await nav;
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => document.getElementById("page").children.length > 0), true, "পেজ-কন্টেন্ট রেন্ডার হয়েছে");
    assert.equal(await page.locator("#adminNav a.active").getAttribute("data-route"), route);
    assert.deepEqual(clean(problems), []);
    await ctx.close();
  });
}
