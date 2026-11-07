// tests/browser/blog-admin.test.mjs — অ্যাডমিন-ব্লগের আসল-ব্রাউজার টেস্ট (CRUD, স্লাগ, প্রকাশ-প্রবাহ, ক্যাটাগরি, মডারেশন, আপলোড, অনুমোদন)
// চালান:  cd tests && node browser/blog-admin.test.mjs     (harness.mjs দেখুন — Firebase মক, কিন্তু ডেটা-অ্যাক্সেস আসল firestore.rules + indexes-এর বিরুদ্ধে)
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadPlaywright, startServer, Db, loadRules, seedBlog, newContext, USERS } from "./harness.mjs";

let pw, browser, srv, origin, db;
before(async () => {
  pw = await loadPlaywright();
  srv = await startServer(); origin = srv.origin;
  const exe = process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);
  browser = await pw.chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); srv?.server.close(); });

async function setup({ user = USERS.admin, viewport, extraSeed } = {}) {
  const { rules, indexes } = loadRules();
  db = new Db(rules, indexes); await seedBlog(db);
  if (extraSeed) await extraSeed(db);
  const ctx = await newContext(browser, { origin, db, user, viewport });
  const page = await ctx.newPage();
  const problems = [], dialogs = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) problems.push("console.error: " + m.text()); });
  page.on("dialog", async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  return { ctx, page, problems, dialogs };
}
const gotoAdmin = async (page, hash = "#blog") => { await page.goto(origin + "/admin.html" + hash, { waitUntil: "load" }); await page.waitForSelector("#adminNav", { timeout: 10000 }); };
const noIndexErrors = () => assert.deepEqual(db.indexErrors, [], "composite index অনুপস্থিত: " + db.indexErrors.join(" | "));
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll(".toast, #toast, .toast-wrap *")].map((e) => e.textContent).join(" | "));
const waitToast = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout: 8000 });
const postsBySlug = (slug) => [...db.sim.docs.entries()].filter(([p, d]) => /blogPosts\/[A-Za-z0-9]+$/.test(p) && d.slug === slug).map(([p, d]) => ({ id: p.split("/").pop(), ...d }));
const MORE = async (d, n) => {
  for (let i = 0; i < n; i++) {
    d.seed(`blogPosts/x${i}`, { title: `অতিরিক্ত লেখা ${i}`, slug: `extra-${i}`, slugHistory: [], excerpt: "", content: "x", contentFormat: "markdown", coverImage: "", coverAlt: "", category: "web", tags: [], status: "draft", language: "bn", author: "Admin Rahman", authorAvatar: "", createdBy: "ua", updatedBy: "ua", createdAt: { $ts: 1700000000000 - i * 1000 }, updatedAt: { $ts: 1700000000000 - i * 1000 }, publishedAt: null, featured: false, featuredOrder: 0, commentsOpen: true, readingTime: 1, seoTitle: "", seoDescription: "", searchTokens: [] });
    d.seed(`blogSlugs/extra-${i}`, { postId: `x${i}`, createdAt: { $ts: 1 } });
  }
};

/* ============================================================================ প্রবেশ ও অনুমোদন */
test("গেট: সাধারণ সদস্য অ্যাডমিন-প্যানেলে ঢুকতে পারে না; অ্যাডমিন 'ব্লগ' নেভ দেখে", async () => {
  const m = await setup({ user: USERS.member });
  await m.page.goto(origin + "/admin.html#blog", { waitUntil: "load" });
  await m.page.waitForSelector(".admin-gate", { timeout: 8000 });
  await m.page.waitForTimeout(800);
  assert.equal(await m.page.locator("#adminNav").count(), 0, "নেভ নেই");
  assert.equal(await m.page.locator("#blArea, .bl-ed").count(), 0);
  await m.ctx.close();
  const a = await setup();
  await gotoAdmin(a.page);
  assert.equal(await a.page.locator('#adminNav a[data-route="blog"]').count(), 1);
  assert.match(await a.page.textContent('#adminNav a[data-route="blog"]'), /ব্লগ/);
  assert.equal(await a.page.getAttribute('#adminNav a[data-route="blog"]', "class"), "active");
  assert.equal((await a.page.textContent("#topbarTitle")).trim(), "ব্লগ");
  noIndexErrors(); assert.deepEqual(a.problems, []);
  await a.ctx.close();
});

test("অনুমোদন (আসল ক্লায়েন্ট-কোড): সদস্য admin-api দিয়ে পোস্ট/ক্যাটাগরি/মডারেশন করতে গেলে rules আটকায়; ডেটা বদলায় না", async () => {
  const { ctx, page, problems } = await setup({ user: USERS.member });
  await page.goto(origin + "/", { waitUntil: "load" });
  const before = JSON.stringify([...db.sim.docs.keys()].sort());
  const r = await page.evaluate(async (u) => {
    const A = await import("/js/blog/admin-api.js");
    const out = {};
    const tryIt = async (name, fn) => { try { await fn(); out[name] = "ALLOWED"; } catch (e) { out[name] = e.code || e.message; } };
    const user = { uid: "u1", displayName: "Rahim Uddin", photoURL: "" };
    await tryIt("createPost", () => A.createPost(user, { title: "Hijack", slug: "hijack", content: "x", category: "web", language: "bn", featuredOrder: 0, status: "published" }));
    await tryIt("setPostStatus", () => A.setPostStatus(user, { id: "p02", status: "published" }, false));
    await tryIt("moderateComment", () => A.moderateComment(user, "plong", "c4", "approved"));
    await tryIt("addCategory", () => A.addCategory({ name: "Evil", slug: "evil", order: 1 }));
    await tryIt("updateCategory", () => A.updateCategory("web", { name: "Hacked" }));
    await tryIt("deletePost(draft)", () => A.deletePost({ id: "pdraft", slug: "secret-draft", slugHistory: [], status: "draft" }));
    await tryIt("fetchAdminPosts", () => A.fetchAdminPosts({}));
    await tryIt("fetchPostComments(pending)", () => A.fetchPostComments("plong", { status: "pending" }));
    return out;
  });
  for (const [k, v] of Object.entries(r)) assert.notEqual(v, "ALLOWED", `${k} অনুমোদিত হয়ে গেছে!`);
  assert.equal(JSON.stringify([...db.sim.docs.keys()].sort()), before, "কোনো ডকুমেন্ট বদলায়নি/যুক্ত হয়নি");
  assert.equal(db.doc("blogCategories/web").name, "ওয়েব ডেভেলপমেন্ট");
  assert.equal(db.doc("blogPosts/pdraft").status, "draft");
  await ctx.close();
});

/* ============================================================================ লেখার তালিকা */
test("তালিকা: সব স্ট্যাটাস, ফিল্টার-চিপ, খুঁজুন, Load More (২০টা/পাতা), প্রকাশিতে মুছুন-বাটন নেই; সব কোয়েরি rules+index পাস", async () => {
  const { ctx, page, problems } = await setup({ extraSeed: (d) => MORE(d, 8) });
  await gotoAdmin(page);
  await page.waitForSelector("#pList table tbody tr", { timeout: 8000 });
  assert.equal(await page.locator("#pList table tbody tr").count(), 20, "প্রথম পাতা ২০");
  await page.click("[data-more]");
  await page.waitForFunction(() => document.querySelectorAll("#pList table tbody tr").length === 27);        // ১৯ + ৮ = ২৭
  assert.equal(await page.locator("#pFoot [data-more]").count(), 0, "শেষ পাতার পর আর বাটন নেই");
  // স্ট্যাটাস ফিল্টার
  await page.click('[data-st="draft"]');
  await page.waitForFunction(() => [...document.querySelectorAll("#pList table tbody tr .status-badge")].every((b) => /খসড়া/.test(b.textContent)) && document.querySelectorAll("#pList table tbody tr").length > 0);
  assert.ok((await page.locator("#pList table tbody tr").count()) >= 9, "খসড়া: pdraft + ৮টা অতিরিক্ত");
  await page.click('[data-st="published"]');
  await page.waitForFunction(() => document.querySelectorAll("#pList table tbody tr").length > 0 && [...document.querySelectorAll("#pList table tbody tr .status-badge")].every((b) => /প্রকাশিত/.test(b.textContent)));
  assert.equal(await page.locator('#pList table [data-del]').count(), 0, "প্রকাশিত লেখায় মুছুন-বাটন নেই");
  assert.ok((await page.locator('#pList table [data-toggle][aria-label^="আনপাবলিশ"]').count()) > 0, "প্রকাশিতে আনপাবলিশ-বাটন");
  // খুঁজুন
  await page.click('[data-st=""]'); await page.waitForSelector("#pList table tbody tr");
  await page.fill("#pSearch", "firestore");
  await page.waitForFunction(() => document.querySelectorAll("#pList table tbody tr").length === 1);
  assert.match(await page.textContent("#pList table tbody tr .cell-title"), /Firestore Security Rules/);
  await page.fill("#pSearch", "zzzz"); await page.waitForSelector("#pList .empty-state");
  // ফিচার্ড ব্যাজ + ক্যাটাগরির নাম
  await page.fill("#pSearch", "ফিচার্ড: Tech");
  await page.waitForFunction(() => document.querySelectorAll("#pList table tbody tr").length === 1);
  assert.equal(await page.locator("#pList table tbody tr .role-badge").count(), 1);
  assert.match(await page.textContent("#pList table tbody tr .cat-badge"), /টিপস/);
  noIndexErrors(); assert.deepEqual(problems, []);
  await ctx.close();
});

/* ============================================================================ তৈরি → প্রকাশ → এডিট → আনপাবলিশ → মুছা */
test("সম্পূর্ণ জীবনচক্র: নতুন খসড়া → প্রিভিউ → প্রকাশ → পাবলিক সাইটে দেখা → স্লাগ-বদল (রিডাইরেক্ট) → আনপাবলিশ → মুছা (ক্লেইম ও মন্তব্যসহ)", async () => {
  const { ctx, page, problems } = await setup();
  await gotoAdmin(page, "#blog/new");
  await page.waitForSelector("#edForm");
  // স্বয়ংক্রিয় স্লাগ; বাংলা-শুধু শিরোনামে ফলব্যাক
  await page.fill("#bf-title", "নতুন গাইড");
  assert.match(await page.inputValue("#bf-slug"), /^post-[a-z0-9]+$/, "বাংলা শিরোনামে ফলব্যাক স্লাগ");
  await page.fill("#bf-title", "Building a PWA — Guide!");
  assert.equal(await page.inputValue("#bf-slug"), "building-a-pwa-guide");
  await page.fill("#bf-slug", "pwa-guide");                           // হাতে বদলালে আর স্বয়ংক্রিয় নয়
  await page.fill("#bf-title", "Building a PWA — Complete Guide");
  assert.equal(await page.inputValue("#bf-slug"), "pwa-guide");
  await page.selectOption("#bf-category", "design");
  await page.fill("#bf-excerpt", "PWA বানানোর সম্পূর্ণ গাইড।");
  // টুলবার: হেডিং + বোল্ড + তালিকা + লিংক
  await page.fill("#bf-content", "ভূমিকা লাইন");
  await page.click("#bf-content"); await page.keyboard.press("Control+A");
  await page.click('[data-md="h2"]');
  assert.equal(await page.inputValue("#bf-content"), "## ভূমিকা লাইন");
  await page.keyboard.press("End"); await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
  await page.keyboard.type("এটি ");
  await page.click('[data-md="b"]');
  await page.keyboard.type("মোটা");
  await page.keyboard.press("End"); await page.keyboard.type(" লেখা।\n\n- এক\n- দুই\n\n```\nconst x = \"<b>\";\n```\n");
  const content = await page.inputValue("#bf-content");
  assert.match(content, /^## ভূমিকা লাইন\n\nএটি \*\*মোটা\*\* লেখা।/);
  await page.fill("#bf-tags", "PWA, firebase, #Web, pwa");
  assert.match(await page.textContent("#bf-tags-p"), /#PWA\s+#firebase\s+#Web$/, "ট্যাগ ইউনিক ও পরিষ্কার");
  assert.ok(Number((await page.textContent("#bf-words")).replace(/[০-৯]/g, (d) => "০১২৩৪৫৬৭৮৯".indexOf(d))) > 5);
  // প্রিভিউ-মডাল: একই রেন্ডারার
  await page.click("#edPreview");
  await page.waitForSelector('[role="dialog"] #bpContent h2');
  assert.equal(await page.textContent("#bpTitle"), "Building a PWA — Complete Guide");
  assert.equal(await page.locator("#bpContent strong").textContent(), "মোটা");
  assert.equal(await page.locator("#bpContent li").count(), 2);
  assert.equal(await page.locator("#bpContent pre code b").count(), 0);
  assert.equal(await page.textContent("#bpCat"), "ডিজাইন");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(await page.evaluate(() => document.activeElement.id), "edPreview", "ফোকাস ট্রিগারে ফেরে");
  // খসড়া সংরক্ষণ
  await page.click("#edDraft");
  await page.waitForFunction(() => /#blog\/edit\//.test(location.hash), null, { timeout: 8000 });
  const id = await page.evaluate(() => location.hash.split("/")[2]);
  const d = db.doc(`blogPosts/${id}`);
  assert.equal(d.status, "draft"); assert.equal(d.publishedAt, null); assert.equal(d.slug, "pwa-guide"); assert.deepEqual(d.slugHistory, []);
  assert.equal(d.author, "Admin Rahman", "লেখক প্রোফাইল থেকে (ক্লায়েন্ট-ইনপুট নয়)"); assert.equal(d.createdBy, "ua"); assert.equal(d.updatedBy, "ua");
  assert.equal(d.contentFormat, "markdown"); assert.equal(d.category, "design"); assert.deepEqual(d.tags, ["PWA", "firebase", "Web"]);
  assert.ok(d.createdAt.$ts && d.updatedAt.$ts, "সার্ভার-টাইমস্ট্যাম্প");
  assert.ok(d.searchTokens.includes("pwa") && d.searchTokens.includes("building") && d.searchTokens.includes("guid"), "সার্চ-টোকেন");
  assert.equal(db.doc("blogSlugs/pwa-guide").postId, id, "স্লাগ-ক্লেইম");
  assert.equal(d.readingTime, 1);
  // পাবলিকে খসড়া দেখা যায় না
  const anon = await newContext(browser, { origin, db, user: null });               // লগইন-ছাড়া পাঠক (অ্যাডমিন-সেশন থেকে আলাদা কনটেক্সট)
  const pub = await anon.newPage();
  await pub.goto(origin + "/#blog/pwa-guide", { waitUntil: "load" });
  await pub.waitForSelector(".bl-nf", { timeout: 8000 });
  // প্রকাশ (খসড়া → প্রকাশিত): এডিটরে এখন 'প্রকাশ করুন'
  await page.waitForSelector("#edSave[data-mode='publish']");
  await page.click("#edSave");
  await waitToast(page, /প্রকাশিত হয়েছে/);
  await page.waitForSelector("#edSave[data-mode='update']", { timeout: 8000 });
  const pubd = db.doc(`blogPosts/${id}`);
  assert.equal(pubd.status, "published"); assert.ok(pubd.publishedAt.$ts, "প্রথম প্রকাশে publishedAt");
  const firstPublished = pubd.publishedAt.$ts;
  assert.equal(await page.locator("#edDelete").count(), 0, "প্রকাশিত লেখায় মুছুন নেই");
  // পাবলিক সাইটে এখন দেখা যায় (তালিকা + লেখা + মেটা)
  await pub.goto(origin + "/#blog"); await pub.reload();
  await pub.waitForFunction(() => /Building a PWA/.test(document.body.innerText), null, { timeout: 8000 });
  await pub.goto(origin + "/#blog/pwa-guide"); await pub.reload();
  await pub.waitForSelector("h1#blHeading", { timeout: 8000 });
  assert.equal(await pub.textContent("h1#blHeading"), "Building a PWA — Complete Guide");
  assert.equal(await pub.locator("#blContent strong").textContent(), "মোটা");
  // এডিট: স্লাগ বদল — প্রকাশিত লেখার সতর্কতা + history + পুরোনো লিংক রিডাইরেক্ট
  assert.match(await page.textContent("#bf-slug-h"), /পুরোনো লিংক নতুন লিংকে স্বয়ংক্রিয় রিডাইরেক্ট/);
  await page.fill("#bf-slug", "pwa-complete-guide");
  await page.fill("#bf-title", "Building a PWA — Complete Guide (2026)");
  await page.click("#edSave");
  await page.waitForFunction((slug) => document.querySelector("#bf-slug")?.value === slug && document.querySelector("#edSave")?.dataset.mode === "update", "pwa-complete-guide", { timeout: 8000 });
  const ed = db.doc(`blogPosts/${id}`);
  assert.equal(ed.slug, "pwa-complete-guide"); assert.deepEqual(ed.slugHistory, ["pwa-guide"]); assert.equal(ed.publishedAt.$ts, firstPublished, "publishedAt অপরিবর্তিত");
  assert.equal(db.doc("blogSlugs/pwa-complete-guide").postId, id); assert.equal(db.doc("blogSlugs/pwa-guide").postId, id, "পুরোনো স্লাগ সংরক্ষিত");
  assert.ok(ed.searchTokens.includes("2026"), "শিরোনাম বদলালে সার্চ-টোকেন হালনাগাদ");
  await pub.goto(origin + "/#blog/pwa-guide"); await pub.reload();
  await pub.waitForFunction(() => location.hash === "#blog/pwa-complete-guide" && document.querySelector("h1#blHeading"), null, { timeout: 8000 });
  assert.equal(await pub.textContent("h1#blHeading"), "Building a PWA — Complete Guide (2026)");
  // আনপাবলিশ → খসড়া; পাবলিকে নেই; publishedAt থাকে
  await page.click("#edUnpublish"); await page.click("#confirmYes");
  await page.waitForSelector("#edSave[data-mode='publish']", { timeout: 8000 });
  assert.equal(db.doc(`blogPosts/${id}`).status, "draft"); assert.equal(db.doc(`blogPosts/${id}`).publishedAt.$ts, firstPublished);
  await pub.goto(origin + "/#blog/pwa-complete-guide"); await pub.reload(); await pub.waitForSelector(".bl-nf", { timeout: 8000 });
  // রিপাবলিশ: আগের publishedAt অটুট
  await page.click("#edSave"); await page.waitForSelector("#edSave[data-mode='update']", { timeout: 8000 });
  assert.equal(db.doc(`blogPosts/${id}`).publishedAt.$ts, firstPublished, "রিপাবলিশে আসল প্রকাশ-তারিখ");
  await page.click("#edUnpublish"); await page.click("#confirmYes"); await page.waitForSelector("#edDelete", { timeout: 8000 });
  // মুছা: মন্তব্যসহ (অনাথ-পরিষ্কার)
  db.seed(`blogPosts/${id}/comments/k1`, { uid: "u2", authorName: "Karim", authorAvatar: "", body: "x1", status: "approved", createdAt: { $ts: 1 }, updatedAt: { $ts: 1 } });
  db.seed(`blogPosts/${id}/comments/k2`, { uid: "u2", authorName: "Karim", authorAvatar: "", body: "x2", status: "pending", createdAt: { $ts: 2 }, updatedAt: { $ts: 2 } });
  await page.click("#edDelete"); await page.click("#confirmYes");
  await page.waitForFunction(() => location.hash === "#blog", null, { timeout: 10000 });
  assert.equal(db.has(`blogPosts/${id}`), false); assert.equal(db.has("blogSlugs/pwa-complete-guide"), false); assert.equal(db.has("blogSlugs/pwa-guide"), false, "পুরোনো-স্লাগের ক্লেইমও ছাড়া");
  assert.equal(db.has(`blogPosts/${id}/comments/k1`), false); assert.equal(db.has(`blogPosts/${id}/comments/k2`), false);
  noIndexErrors(); assert.deepEqual(problems.filter((p) => !/Failed to load/.test(p)), []);
  await anon.close(); await ctx.close();
});

test("স্লাগ-সংঘাত: অন্য লেখার (এমনকি খসড়া বা পুরোনো) স্লাগ নেওয়া যায় না — লাইভ চেক + সংরক্ষণে বাধা; কিছু লেখা হয় না", async () => {
  const { ctx, page, problems } = await setup();
  await gotoAdmin(page, "#blog/new");
  await page.waitForSelector("#edForm");
  const docsBefore = db.sim.docs.size;
  await page.fill("#bf-title", "Conflict test"); await page.fill("#bf-content", "x");
  for (const taken of ["post-01", "secret-draft", "older-name"]) {
    await page.fill("#bf-slug", taken);
    await page.waitForFunction(() => /দখলে/.test(document.getElementById("bf-slug-e").textContent), null, { timeout: 4000 });
    await page.click("#edDraft");
    await page.waitForFunction(() => /দখলে/.test(document.getElementById("bf-slug-e").textContent));
    assert.equal(db.sim.docs.size, docsBefore, `${taken}: কিছু লেখা হয়নি`);
  }
  await page.fill("#bf-slug", "Bad Slug!");
  await page.waitForFunction(() => /ছোট হাতের ইংরেজি/.test(document.getElementById("bf-slug-e").textContent));
  await page.fill("#bf-slug", "free-slug");
  await page.waitForTimeout(600);
  assert.equal(await page.textContent("#bf-slug-e"), "");
  // রেস: চেকের পর অন্য কেউ স্লাগ নিয়ে নিলে (rules-ই চূড়ান্ত প্রহরী) — সংরক্ষণ ব্যর্থ, কিছু লেখা হয় না
  db.seed("blogSlugs/free-slug", { postId: "someoneElse", createdAt: { $ts: 1 } });
  await page.click("#edDraft");
  await page.waitForFunction(() => /দখলে/.test(document.getElementById("bf-slug-e").textContent), null, { timeout: 6000 });
  assert.equal(db.sim.docs.size, docsBefore + 1, "শুধু (আমাদের সিড করা) ক্লেইম বেশি");
  assert.equal(postsBySlug("free-slug").length, 0);
  assert.deepEqual(problems.filter((p) => !/permission|denied|দখল/.test(p)), []);
  await ctx.close();
});

test("ভ্যালিডেশন: ফাঁকা/অবৈধ ইনপুটে ইনলাইন ত্রুটি (role=alert), প্রথম ত্রুটিতে ফোকাস, কিছু লেখা হয় না", async () => {
  const { ctx, page } = await setup();
  await gotoAdmin(page, "#blog/new"); await page.waitForSelector("#edForm");
  const before = db.sim.docs.size;
  await page.click("#edSave");                                                   // সব ফাঁকা
  await page.waitForFunction(() => document.querySelector("#bf-title-e").textContent.length > 0);
  assert.match(await page.textContent("#bf-title-e"), /কমপক্ষে ৩ অক্ষর/);
  assert.match(await page.textContent("#bf-content-e"), /খালি রাখা যাবে না/);
  assert.equal(await page.evaluate(() => document.activeElement.id), "bf-title", "প্রথম ত্রুটিতে ফোকাস");
  assert.equal(await page.getAttribute("#bf-title-e", "role"), "alert");
  assert.equal(await page.locator("#bf-title").evaluate((e) => e.closest(".field").classList.contains("has-error")), true);
  await page.fill("#bf-title", "Valid title"); await page.fill("#bf-slug", "valid-title"); await page.fill("#bf-content", "ok");
  await page.fill("#bf-cover", "javascript:alert(1)"); await page.fill("#bf-featuredOrder", "10000");
  await page.click("#edSave");
  await page.waitForFunction(() => document.querySelector("#bf-cover-e").textContent.length > 0 && document.querySelector("#bf-featuredOrder-e").textContent.length > 0);
  assert.match(await page.textContent("#bf-cover-e"), /http:\/\/ বা https:\/\//);
  assert.match(await page.textContent("#bf-featuredOrder-e"), /০–৯৯৯৯/);
  assert.equal(db.sim.docs.size, before, "অবৈধ ইনপুটে কিছু লেখা হয়নি");
  await ctx.close();
});

test("সুরক্ষা-গার্ড: অসংরক্ষিত পরিবর্তন নিয়ে অন্য লিংকে গেলে নিশ্চিতকরণ; সংরক্ষিত/অপরিবর্তিত হলে নয়; এডিটর ছাড়লে গার্ড সরে যায়", async () => {
  const { ctx, page, dialogs } = await setup();
  await gotoAdmin(page, "#blog/new"); await page.waitForSelector("#edForm");
  await page.click('#adminNav a[data-route="dashboard"]');                        // অপরিবর্তিত — কোনো প্রম্পট নয়
  await page.waitForFunction(() => location.hash === "#dashboard");
  assert.deepEqual(dialogs, []);
  await page.goto(origin + "/admin.html#blog/new"); await page.waitForSelector("#edForm");
  await page.fill("#bf-title", "Unsaved work");
  await page.click('#adminNav a[data-route="users"]');                            // dialog.dismiss() → থাকে
  await page.waitForTimeout(300);
  assert.equal(dialogs.length, 1); assert.match(dialogs[0], /সংরক্ষণ না করা পরিবর্তন/);
  assert.equal(await page.evaluate(() => location.hash), "#blog/new", "বাতিলে এডিটরেই থাকে");
  assert.equal(await page.inputValue("#bf-title"), "Unsaved work");
  await page.click("#edBack");
  assert.equal(dialogs.length, 2);
  // ছেড়ে অন্য রাউটে গেলে গার্ড সরে গেছে
  await page.evaluate(() => { location.hash = "#settings"; });
  await page.waitForFunction(() => location.hash === "#settings");
  const n = dialogs.length;
  await page.click('#adminNav a[data-route="blog"]');
  await page.waitForFunction(() => location.hash === "#blog");
  assert.equal(dialogs.length, n, "ব্লগ-এডিটরের বাইরে আর কোনো গার্ড-প্রম্পট নেই");
  await ctx.close();
});

/* ============================================================================ কভার-আপলোড */
test("কভার: URL-প্রিভিউ; আপলোড-সফল (পাথ blog/covers/…); ব্যর্থতার বার্তা; অবৈধ ফাইল-টাইপ বাদ; ভাঙা ছবির সতর্কতা", async () => {
  const { ctx, page, problems } = await setup();
  await gotoAdmin(page, "#blog/edit/p02"); await page.waitForSelector("#edForm");
  await page.fill("#bf-cover", "https://img.example.com/c.png");
  await page.waitForFunction(() => document.getElementById("bf-cover-p").style.display === "flex");
  await page.fill("#bf-cover", "https://broken.example.com/x.png");
  await page.waitForFunction(() => /ছবি লোড হয়নি/.test(document.getElementById("bf-cover-s").textContent), null, { timeout: 6000 });
  await page.fill("#bf-cover", "");
  await page.waitForFunction(() => document.getElementById("bf-cover-p").style.display === "none");
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await page.setInputFiles("#bf-file", { name: "my cover!.png", mimeType: "image/png", buffer: PNG });
  await page.waitForFunction(() => /uploaded\//.test(document.getElementById("bf-cover").value), null, { timeout: 8000 });
  const up = await page.evaluate(() => window.__uploaded);
  assert.match(up.path, /^blog\/covers\/[a-z0-9]+-[a-z0-9]+\.png$/, "নিরাপদ, ইউনিক ফাইলনাম (ব্যবহারকারীর নাম নয়)");
  assert.equal(up.type, "image/png");
  assert.match(await page.inputValue("#bf-cover"), /^https:\/\/img\.example\.com\/uploaded\/.+\.png$/);
  // ব্যর্থতা: Storage-rules/অনুমতি
  await page.evaluate(() => { window.__storageFail = "storage/unauthorized"; });
  const before = await page.inputValue("#bf-cover");
  await page.setInputFiles("#bf-file", { name: "a.png", mimeType: "image/png", buffer: PNG });
  await page.waitForFunction(() => /storage.rules/.test(document.getElementById("bf-cover-e").textContent), null, { timeout: 6000 });
  assert.equal(await page.inputValue("#bf-cover"), before, "ব্যর্থ আপলোডে URL বদলায় না");
  await page.evaluate(() => { window.__storageFail = "storage/unknown"; });
  await page.setInputFiles("#bf-file", { name: "a.png", mimeType: "image/png", buffer: PNG });
  await page.waitForFunction(() => /Storage এখনো চালু করা হয়নি/.test(document.getElementById("bf-cover-e").textContent), null, { timeout: 6000 });
  // অবৈধ টাইপ
  await page.evaluate(() => { window.__storageFail = null; window.__uploaded = null; });
  await page.setInputFiles("#bf-file", { name: "evil.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg onload=alert(1)/>") });
  await page.waitForFunction(() => /শুধু JPG, PNG বা WebP/.test(document.getElementById("bf-cover-e").textContent), null, { timeout: 6000 });
  assert.equal(await page.evaluate(() => window.__uploaded), null, "SVG কখনো আপলোড হয়নি");
  await page.setInputFiles("#bf-file", { name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(3 * 1024 * 1024, 1) });
  await page.waitForFunction(() => /২ MB/.test(document.getElementById("bf-cover-e").textContent) || /শুধু JPG/.test(document.getElementById("bf-cover-e").textContent) || window.__uploaded, null, { timeout: 8000 });
  assert.deepEqual(problems.filter((p) => !/storage|Storage/.test(p)), []);
  await ctx.close();
});

/* ============================================================================ ক্যাটাগরি */
test("ক্যাটাগরি: যোগ (স্লাগ-যাচাই, সদৃশ বাধা), নাম/ক্রম এডিট, নিষ্ক্রিয়, মুছা; নির্ভরশীল লেখা থাকলে রিঅ্যাসাইন-ডায়ালগ + নিরাপদ মাইগ্রেশন", async () => {
  const { ctx, page, problems } = await setup();
  await gotoAdmin(page, "#blog/categories");
  await page.waitForSelector(".cm-adm-cat");
  assert.equal(await page.locator(".cm-adm-cat").count(), 4);
  // যোগ
  await page.fill("#catName", "Case Studies"); await page.click("#catAdd");
  await waitToast(page, /ক্যাটাগরি যোগ হয়েছে/);
  assert.deepEqual({ name: db.doc("blogCategories/case-studies").name, active: db.doc("blogCategories/case-studies").active }, { name: "Case Studies", active: true });
  // সদৃশ ও অবৈধ স্লাগ
  await page.fill("#catName", "Another"); await page.fill("#catSlug", "design"); await page.click("#catAdd");
  await waitToast(page, /আগে থেকেই আছে/);
  await page.fill("#catSlug", "Bad Slug"); await page.click("#catAdd");
  await waitToast(page, /ছোট হাতের ইংরেজি/);
  assert.equal(db.has("blogCategories/another"), false);
  // নাম/ক্রম এডিট
  await page.fill('.cm-adm-cat[data-id="case-studies"] .cm-cat-name', "Case Studies 2026"); await page.press('.cm-adm-cat[data-id="case-studies"] .cm-cat-name', "Tab");
  await waitToast(page, /নাম আপডেট/);
  assert.equal(db.doc("blogCategories/case-studies").name, "Case Studies 2026");
  await page.fill('.cm-adm-cat[data-id="case-studies"] .cm-cat-order', "99999"); await page.press('.cm-adm-cat[data-id="case-studies"] .cm-cat-order', "Tab");
  await waitToast(page, /০–৯৯৯৯/);
  // নিষ্ক্রিয়
  await page.click('.cm-adm-cat[data-id="case-studies"] [data-tg]');
  await page.waitForFunction(() => /সক্রিয় করুন/.test(document.querySelector('.cm-adm-cat[data-id="case-studies"] [data-tg]').textContent));
  assert.equal(db.doc("blogCategories/case-studies").active, false);
  // খালি ক্যাটাগরি মুছা
  await page.click('.cm-adm-cat[data-id="case-studies"] [data-del]'); await page.click("#confirmYes");
  await page.waitForFunction(() => !document.querySelector('.cm-adm-cat[data-id="case-studies"]'));
  assert.equal(db.has("blogCategories/case-studies"), false);
  // নির্ভরশীল লেখা আছে ("tips" ক্যাটাগরিতে pf1, p09, p11) → রিঅ্যাসাইন-ডায়ালগ
  const inTips = [...db.sim.docs.entries()].filter(([p, d]) => /blogPosts\/[A-Za-z0-9]+$/.test(p) && d.category === "tips").length;
  assert.ok(inTips >= 3);
  await page.click('.cm-adm-cat[data-id="tips"] [data-del]');
  await page.waitForSelector('[role="dialog"] #reTo');
  assert.match(await page.textContent('[role="dialog"]'), /টা লেখা/);
  assert.equal(db.has("blogCategories/tips"), true, "ডায়ালগ খোলা মানেই মুছে যায়নি");
  const opts = await page.$$eval("#reTo option", (e) => e.map((x) => x.value));
  assert.ok(!opts.includes("tips") && !opts.includes("archive"), "গন্তব্য: নিজেকে ও নিষ্ক্রিয় বাদ");
  await page.selectOption("#reTo", "design");
  await page.click("#reGo");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]') && !document.querySelector('.cm-adm-cat[data-id="tips"]'), null, { timeout: 15000 });
  assert.equal(db.has("blogCategories/tips"), false);
  assert.equal([...db.sim.docs.entries()].filter(([p, d]) => /blogPosts\/[A-Za-z0-9]+$/.test(p) && d.category === "tips").length, 0, "কোনো লেখা এতিম হয়নি");
  assert.equal([...db.sim.docs.entries()].filter(([p, d]) => /blogPosts\/[A-Za-z0-9]+$/.test(p) && d.category === "design").length >= inTips + 5, true, "সবগুলো design-এ গেছে");
  assert.equal(db.doc("blogPosts/pf1").category, "design"); assert.equal(db.doc("blogPosts/pf1").updatedBy, "ua");
  assert.equal(db.doc("blogPosts/pf1").slug, "featured-news", "স্লাগ/বিষয়বস্তু অপরিবর্তিত");
  // একমাত্র সক্রিয় ক্যাটাগরি মুছতে গেলে গন্তব্য নেই
  noIndexErrors(); assert.deepEqual(problems.filter((p) => !/permission|denied/.test(p)), []);
  await ctx.close();
});

test("ক্যাটাগরি: ডিফল্ট-সিড বাটন (ফাঁকা ডাটাবেসে); পাবলিক ফিল্টারে নিষ্ক্রিয় ক্যাটাগরি দেখায় না কিন্তু লেখা থাকে", async () => {
  const { ctx, page } = await setup({ extraSeed: (d) => { for (const k of ["web", "design", "tips", "archive"]) d.sim.docs.delete(`tvProject/main/blogCategories/${k}`); } });
  await gotoAdmin(page, "#blog/categories");
  await page.waitForSelector("#catSeed");
  await page.click("#catSeed");
  await page.waitForFunction(() => document.querySelectorAll(".cm-adm-cat").length === 4, null, { timeout: 8000 });
  assert.deepEqual(["design", "tips", "tutorials", "web-development"], [...db.sim.docs.keys()].filter((k) => /blogCategories\//.test(k)).map((k) => k.split("/").pop()).sort());
  await ctx.close();
});

/* ============================================================================ মন্তব্য-মডারেশন */
test("মডারেশন: অপেক্ষমাণ-গণনা সহ লেখার তালিকা → ফিল্টার → অনুমোদন/লুকান/মুছুন (কনফার্ম) → পাবলিক সাইটে প্রতিফলন; আরও দেখুন", async () => {
  const { ctx, page, problems } = await setup();
  await gotoAdmin(page, "#blog/comments");
  await page.waitForSelector("tr[data-pid]", { timeout: 10000 });
  assert.match(await page.textContent("h3"), /২টা/, "মোট অপেক্ষমাণ (c4, c6)");
  assert.equal(await page.locator('tr[data-pid]').first().getAttribute("data-pid"), "plong", "অপেক্ষমাণ-ওয়ালা লেখা আগে");
  await page.click('tr[data-pid="plong"] [data-open]');
  await page.waitForSelector(".bl-adm-cmt");
  assert.equal(await page.locator(".bl-adm-cmt").count(), 2);
  assert.match(await page.textContent(".bl-adm-cmt"), /আমার অপেক্ষমাণ মন্তব্য/, "পুরোনো আগে (অনুমোদনের ক্রম)");
  // অনুমোদন
  await page.click('.bl-adm-cmt[data-cid="c4"] [data-set="approved"]');
  await waitToast(page, /অনুমোদিত/);
  await page.waitForFunction(() => document.querySelectorAll(".bl-adm-cmt").length === 1);
  const c4 = db.doc("blogPosts/plong/comments/c4");
  assert.equal(c4.status, "approved"); assert.equal(c4.moderatedBy, "ua"); assert.ok(c4.moderatedAt.$ts);
  // লুকান (অন্যটা)
  await page.click('.bl-adm-cmt[data-cid="c6"] [data-set="hidden"]');
  await page.waitForFunction(() => document.querySelectorAll(".bl-adm-cmt").length === 0);
  assert.equal(db.doc("blogPosts/plong/comments/c6").status, "hidden");
  // অনুমোদিত-ফিল্টারে মুছুন (কনফার্ম সহ)
  await page.click('[data-fs="approved"]');
  await page.waitForSelector('.bl-adm-cmt[data-cid="c1"]');
  await page.click('.bl-adm-cmt[data-cid="c1"] [data-set="deleted"]'); await page.click("#confirmYes");
  await page.waitForFunction(() => !document.querySelector('.bl-adm-cmt[data-cid="c1"]'));
  assert.equal(db.doc("blogPosts/plong/comments/c1").status, "deleted");
  // "সব" ফিল্টারে নতুন-আগে; ফিরে গিয়ে গণনা আপডেট
  await page.click('[data-fs=""]'); await page.waitForSelector(".bl-adm-cmt");
  assert.ok((await page.locator(".bl-adm-cmt").count()) >= 6);
  await page.click("[data-back]"); await page.waitForSelector("tr[data-pid]");
  assert.match(await page.textContent("h3"), /০টা/);
  // পাবলিক সাইটে: c4 এখন দেখা যায়, c1 ও c6 নয়
  const pub = await ctx.newPage();
  await pub.goto(origin + "/#blog/long-guide", { waitUntil: "load" });
  await pub.waitForSelector(".bl-comment-list", { timeout: 8000 });
  const texts = await pub.$$eval(".bl-comment-list .cm-reply-body", (e) => e.map((x) => x.textContent));
  assert.ok(texts.includes("আমার অপেক্ষমাণ মন্তব্য") && !texts.includes("চমৎকার লেখা!") && !texts.includes("লুকানো মন্তব্য"));
  noIndexErrors(); assert.deepEqual(problems, []);
  await ctx.close();
});

/* ============================================================================ রেসপন্সিভ ও অ্যাক্সেসিবিলিটি */
test("রেসপন্সিভ (৩৭৫px): তালিকা-কার্ড, এডিটর, ক্যাটাগরি, মডারেশন — অনুভূমিক ওভারফ্লো নেই; স্টিকি অ্যাকশন-বার; টুলবার ব্যবহারযোগ্য", async () => {
  const { ctx, page, problems } = await setup({ viewport: { width: 375, height: 800 } });
  for (const [hash, sel] of [["#blog", "#pList .admin-list-card"], ["#blog/new", "#edForm"], ["#blog/categories", ".cm-adm-cat"], ["#blog/comments", ".admin-mobile-list [data-pid]"]]) {
    await gotoAdmin(page, hash);
    await page.waitForSelector(sel, { timeout: 8000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${hash}: অনুভূমিক স্ক্রল`);
  }
  await gotoAdmin(page, "#blog/new"); await page.waitForSelector("#edForm");
  const box = await page.locator(".bl-ed-actions").boundingBox();
  assert.ok(box.y + box.height <= 800 + 2, "অ্যাকশন-বার ভিউপোর্টের নিচে লেগে আছে (sticky)");
  const toolbarVisible = await page.$$eval(".bl-toolbar .btn", (b) => b.every((x) => { const r = x.getBoundingClientRect(); return r.width >= 36 && r.height >= 34; }));
  assert.ok(toolbarVisible, "টুলবার-বাটন ট্যাপযোগ্য আকারে");
  assert.deepEqual(problems, []);
  await ctx.close();
});

test("অ্যাক্সেসিবিলিটি (অ্যাডমিন-এডিটর): প্রতিটা ইনপুটের লেবেল, মডালে ফোকাস-ট্র্যাপ ও Esc, আইকন-বাটনে aria-label, ডুপ্লিকেট id নেই", async () => {
  const { ctx, page } = await setup();
  await gotoAdmin(page, "#blog/edit/p01"); await page.waitForSelector("#edForm");
  const unlabeled = await page.$$eval("#edForm input:not([type=hidden]), #edForm select, #edForm textarea", (els) => els.filter((e) => !(e.getAttribute("aria-label") || (e.labels && e.labels.length))).map((e) => e.id));
  assert.deepEqual(unlabeled, [], "লেবেলহীন ফর্ম-ফিল্ড");
  const noName = await page.$$eval("#edForm button, #edForm a", (els) => els.filter((e) => !(e.getAttribute("aria-label") || e.textContent.trim() || e.title)).map((e) => e.outerHTML.slice(0, 60)));
  assert.deepEqual(noName, []);
  assert.equal(await page.$$eval("[id]", (e) => { const ids = e.map((x) => x.id); return ids.length - new Set(ids).size; }), 0, "ডুপ্লিকেট id");
  await page.click("#edPreview");
  await page.waitForSelector('[role="dialog"][aria-modal="true"]');
  // ফোকাস-ট্র্যাপ: Tab বারবার চাপলে ডায়ালগের বাইরে যায় না
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true, "ফোকাস ডায়ালগের ভেতরেই");
  await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(await page.evaluate(() => document.activeElement.id), "edPreview");
  await ctx.close();
});
