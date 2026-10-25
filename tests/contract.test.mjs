// tests/contract.test.mjs — "ক্লায়েন্ট-কোড ↔ firestore.rules" চুক্তি-যাচাই (Emulator/Java লাগে না, শুধু Node)
// js/ ফোল্ডারের আসল সোর্স পড়ে দেখে: অ্যাপ যে ফিল্ড-সেট লেখে, যে লিমিট/স্ট্যাটাস/কারণ ব্যবহার করে, যে কালেকশনে হাত দেয়
// — সবই firestore.rules-এর সাথে হুবহু মেলে কিনা। ভবিষ্যতে কেউ JS-এ নতুন ফিল্ড যোগ করলে (কিন্তু rules না বদলালে)
// এই টেস্ট ফেল করে — ডিপ্লয়ের পর "permission-denied" ধরার আগেই।
// চালান:  cd tests && npm run test:contract
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { loadEsm } from "./load-esm.mjs";
const { BOOKING_STATUSES } = await loadEsm("../js/utils.js");
const seed = await loadEsm("../js/seed-data.js");

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const RULES = read("firestore.rules");
const API = read("js/community/api.js");
const ADMIN = read("js/admin.js");
const AUTH = read("js/auth.js");
const APP = read("js/app.js");
const DRAWER = read("js/drawer.js");
const CONTENT = read("js/content.js");
const TVDB = read("js/tv-db.js");

/* ---------- ছোট পার্সার-হেল্পার ---------- */
const sorted = (a) => [...new Set(a)].sort();
const strs = (s) => [...s.matchAll(/'([^']*)'/g)].map((m) => m[1]);
function fnBody(rules, name) {                       // rules-এর "function name(...)" থেকে পরের function পর্যন্ত
  const i = rules.indexOf(`function ${name}(`); assert.ok(i >= 0, `rules-এ function ${name}() নেই`);
  const rest = rules.slice(i + 10); const j = rest.search(/\n {4}(function |\/\/ ===|\/\/ ----)/);
  return j < 0 ? rest : rest.slice(0, j);
}
const ruleList = (body, call) => { const m = new RegExp(`${call}\\(\\s*(?:\\w+,\\s*)?\\[([^\\]]*)\\]`).exec(body); assert.ok(m, `rules-এ ${call}([...]) পাইনি`); return strs(m[1]); };
const inList = (body, expr) => { const m = new RegExp(`${expr} in \\[([^\\]]*)\\]`).exec(body); assert.ok(m, `rules-এ "${expr} in [...]" পাইনি`); return strs(m[1]); };
function matchBlock(rules, path) {                   // match /services/{id} { ... }
  const hdr = `match ${path} {`; const i = rules.indexOf(hdr); assert.ok(i >= 0, `rules-এ ${hdr} নেই`);
  let d = 0, j = i + hdr.length - 1;
  for (let k = j; k < rules.length; k++) { if (rules[k] === "{") d++; else if (rules[k] === "}" && --d === 0) return rules.slice(j, k + 1); }
  throw new Error("unbalanced " + path);
}
function objKeys(src, marker, { nth = 0 } = {}) {   // marker-এর পরের প্রথম { ... } অবজেক্ট-লিটারালের টপ-লেভেল কী
  let i = -1; for (let n = 0; n <= nth; n++) { i = src.indexOf(marker, i + 1); assert.ok(i >= 0, `সোর্সে মার্কার নেই: ${marker}`); }
  const start = src.indexOf("{", i + marker.length - 1); let d = 0, k = start, q = null, cur = "", entries = [];
  for (; k < src.length; k++) {
    const c = src[k];
    if (q) { cur += c; if (c === "\\") { cur += src[++k]; } else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; cur += c; continue; }
    if ("{[(".includes(c)) { d++; if (d > 1) cur += c; continue; }
    if ("}])".includes(c)) { d--; if (d === 0) { entries.push(cur); break; } cur += c; continue; }
    if (c === "," && d === 1) { entries.push(cur); cur = ""; continue; }
    cur += c;
  }
  return sorted(entries.map((e) => e.trim()).filter(Boolean).map((e) => (/^([A-Za-z_$][\w$]*)\s*:/.exec(e) || /^([A-Za-z_$][\w$]*)$/.exec(e) || [])[1]).filter(Boolean));
}
const after = (src, marker, re) => { const i = src.indexOf(marker); assert.ok(i >= 0, marker); return [...src.slice(i).matchAll(re)].map((m) => m[1]); };

/* ---------- ১) নেমস্পেস ও পাথ ---------- */
test("পাথ: tv-db.js-এর TV_ROOT = tvProject/main = rules-এর match", () => {
  assert.match(TVDB, /TV_ROOT = Object\.freeze\(\["tvProject", "main"\]\)/);
  assert.ok(RULES.includes("match /tvProject/main {"));
});
test("rules_version 2, শেষে default-deny, কোনো পাবলিক-write নেই", () => {
  assert.match(RULES, /rules_version = '2';/);
  assert.match(RULES, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  assert.doesNotMatch(RULES, /allow\s+(create|update|delete|write)[^;]*:\s*if\s+true\s*;/);
  assert.doesNotMatch(RULES, /allow\s+(read|get|list)?,?\s*(create|update|delete|write)[^;]*:\s*if\s+true\s*;/);
  assert.doesNotMatch(RULES, /allow\s+(create|update|delete|write)[^;]*:\s*if\s+(request\.auth\s*!=\s*null|isSignedIn\(\))\s*;/, "শুধু লগইন-চেকে write খোলা");
});
test("rules শুধু প্রত্যাশিত কালেকশনে match করে (অজানা কালেকশন নেই)", () => {
  const top = [...RULES.matchAll(/\n {6}match (\/[^{\s]+(?:\/\{[^}]+\})?) \{/g)].map((m) => m[1].replace(/\/\{.*$/, ""));
  assert.deepEqual(sorted(top), sorted(["/users", "/bookings", "/settings/site", "/services", "/portfolio", "/caseStudies", "/testimonials", "/team", "/stats", "/pricingPlans", "/faqItems", "/categories", "/discussions", "/reports"]));
});
test("content.js-এর CONTENT_COLLECTIONS = rules-এর ৮টা কন্টেন্ট match", () => {
  const client = strs(CONTENT.match(/CONTENT_COLLECTIONS = \[([^\]]*)\]/)[1].replace(/"/g, "'"));
  for (const c of client) assert.ok(RULES.includes(`match /${c}/{id} {`), `${c} এর match নেই`);
  assert.equal(client.length, 8);
});

/* ---------- ২) বুকিং ---------- */
test("বুকিং: app.js-এর addDoc ফিল্ড = rules-এর ১০ ফিল্ড; প্রাথমিক স্ট্যাটাস হুবহু মেলে", () => {
  assert.deepEqual(objKeys(APP, 'await addDoc(tvCol("bookings"), {'), sorted(ruleList(fnBody(RULES, "validNewBooking"), "hasExactly")));
  const literal = /status: "([^"]+)",\s*createdAt: serverTimestamp\(\)\s*\}\);\s*showToast/.exec(APP)[1];
  const rs = strs(fnBody(RULES, "bookingStatuses").replace(/"/g, "'"));
  assert.equal(literal, BOOKING_STATUSES[0].value, "app.js-এর নতুন-বুকিং স্ট্যাটাস ≠ utils.js-এর প্রথম স্ট্যাটাস");
  assert.deepEqual(rs, BOOKING_STATUSES.map((s) => s.value), "rules-এর bookingStatuses() ≠ utils.js BOOKING_STATUSES (বাংলা অক্ষরের কম্পোজিশনসহ)");
});

/* ---------- ৩) প্রোফাইল ---------- */
test("প্রোফাইল তৈরি: auth.js ensureUserDoc-এর ফিল্ড = rules; isAdmin: false", () => {
  assert.deepEqual(objKeys(AUTH, "await setDoc(ref, {"), sorted(ruleList(fnBody(RULES, "validNewProfile"), "hasExactly")));
  assert.match(AUTH, /isAdmin: false,\s*createdAt: serverTimestamp\(\)/);
});
test("প্রোফাইল এডিট: ক্লায়েন্ট যা পাঠায় = rules-এর allowlist (বেশিও না, কমও না)", () => {
  const sent = sorted([
    ...[...DRAWER.matchAll(/saveUserProfile\(user\.uid, \{([^}]*)\}\)/g)].flatMap((m) => m[1].split(",").map((x) => x.split(":")[0].trim()).filter(Boolean)),
    ...objKeys(API, "await updateDoc(ref, {")
  ]);
  assert.deepEqual(sent, sorted(ruleList(fnBody(RULES, "validSelfProfileEdit"), "changed\\.hasOnly")));
});
test("প্রোফাইল ফিল্ড-লিমিট: drawer.js maxlength ≤ rules", () => {
  assert.match(DRAWER, /maxlength="60"/); // নাম ৬০ (rules ১২০ — Google/GitHub দীর্ঘ displayName-এর জন্য ঢিলা)
  assert.ok(fnBody(RULES, "validSelfProfileEdit").includes("isText(d.name, 1, 120)"));
  assert.ok(fnBody(RULES, "validSelfProfileEdit").includes("isText(d.bio, 0, 500)"));
});
test("অ্যাডমিন ইউজার-ম্যানেজমেন্ট: admin.js-এর দুটো আপডেট = rules-এর allowlist", () => {
  const sent = sorted([...objKeys(ADMIN, 'await updateDoc(tvDoc("users", u.id), {', { nth: 0 }), ...objKeys(ADMIN, 'await updateDoc(tvDoc("users", u.id), {', { nth: 1 })]);
  assert.deepEqual(sent, sorted(ruleList(fnBody(RULES, "validAdminUserEdit"), "changed\\.hasOnly")));
});
test("অবতার-থাম্বের নিয়ম: avatar-thumb.js-এর সীমা/হোস্ট = rules", () => {
  const thumb = read("js/avatar-thumb.js");
  assert.match(thumb, /12000/); assert.match(RULES, /v\.size\(\) <= 12000/);
  assert.match(thumb, /googleusercontent/); assert.match(thumb, /avatars\\?\.githubusercontent/);
  assert.match(RULES, /googleusercontent/); assert.match(RULES, /avatars\[\.\]githubusercontent/);
});

/* ---------- ৪) কমিউনিটি ---------- */
test("আলোচনা: createDiscussion ফিল্ড = rules (১৩টা)", () => {
  assert.deepEqual(objKeys(API, "await guarded(setDoc(ref, {"), sorted(ruleList(fnBody(RULES, "validNewDiscussion"), "hasExactly")));
});
test("আলোচনা এডিট/ডিলিট/লাইক/মডারেশন payload = rules allowlist", () => {
  assert.deepEqual(objKeys(API, 'await guarded(updateDoc(tvDoc("discussions", did), {', { nth: 0 }), sorted(ruleList(fnBody(RULES, "validDiscussionEdit"), "changed\\.hasOnly")));
  assert.deepEqual(objKeys(API, 'await guarded(updateDoc(tvDoc("discussions", did), {', { nth: 1 }), sorted(ruleList(fnBody(RULES, "validOwnerSoftDelete"), "changed\\.hasOnly")));
  assert.deepEqual(objKeys(API, "const modFields = (status, adminUid) => ({"), sorted(ruleList(fnBody(RULES, "validModeration"), "changed\\.hasOnly")));
  assert.deepEqual(sorted(["likedBy", "likeCount"]), sorted(ruleList(fnBody(RULES, "validLikeChange"), "hasOnly")));
  assert.match(API, /\{ likedBy: arrayUnion\(uid\), likeCount: increment\(1\) \}/);
  assert.match(API, /\{ likedBy: arrayRemove\(uid\), likeCount: increment\(-1\) \}/);
});
test("রিপ্লাই: createReply ফিল্ড (বাধ্যতামূলক + ঐচ্ছিক) = rules", () => {
  const body = fnBody(RULES, "validNewReply");
  const only = sorted(ruleList(body, "d\\.keys\\(\\)\\.hasOnly")), all = sorted(ruleList(body, "d\\.keys\\(\\)\\.hasAll"));
  const required = objKeys(API, "const data = {", { nth: 0 });
  const fn = API.slice(API.indexOf("export async function createReply")); const opt = sorted([...fn.slice(0, fn.indexOf("const batch")).matchAll(/data\.(\w+) = /g)].map((m) => m[1]));
  assert.deepEqual(all, required); assert.deepEqual(only, sorted([...required, ...opt]));
  assert.ok(API.includes("{ replyCount: increment(1), replySyncId: rref.id }"));
  assert.deepEqual(sorted(["replyCount", "replySyncId"]), sorted(ruleList(fnBody(RULES, "isReplySyncUpdate"), "changedKeys\\(\\)\\.hasOnly")));
});
test("রিপ্লাই এডিট payload = rules", () => {
  assert.deepEqual(objKeys(API, 'await guarded(updateDoc(tvDoc("discussions", did, "replies", rid), {'), sorted(ruleList(fnBody(RULES, "validReplyEdit"), "changed\\.hasOnly")));
});
test("রিপোর্ট: submitReport ফিল্ড + কারণ + স্ট্যাটাস + আইডি-ফরম্যাট = rules", () => {
  const body = fnBody(RULES, "validNewReport");
  const required = objKeys(API, "export async function submitReport(", { nth: 0 }).length ? null : null; // (নিচে আলাদা)
  const fnSrc = API.slice(API.indexOf("export async function submitReport"));
  const keys = objKeys(fnSrc, "const data = {"); const opt = [...fnSrc.slice(0, fnSrc.indexOf("await guarded")).matchAll(/data\.(\w+) = /g)].map((m) => m[1]);
  assert.deepEqual(sorted(ruleList(body, "d\\.keys\\(\\)\\.hasAll")), keys);
  assert.deepEqual(sorted(ruleList(body, "d\\.keys\\(\\)\\.hasOnly")), sorted([...keys, ...opt]));
  const reasons = [...API.match(/REPORT_REASONS = \[([\s\S]*?)\n\];/)[1].matchAll(/\["(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(sorted(inList(body, "d\\.reason")), sorted(reasons));
  assert.match(API, /status: "open"/); assert.ok(body.includes("d.status == 'open'"));
  assert.match(API, /const reportId = \(uid, targetType, targetId\) => `\$\{uid\}_\$\{targetType\}_\$\{targetId\}`/);
  assert.ok(body.includes("reportId == d.reporterUid + '_' + d.targetType + '_' + d.targetId"));
  assert.deepEqual(sorted(inList(body, "d\\.targetType")), ["discussion", "reply"]);
  assert.equal(required, null);
});
test("রিপোর্ট রিভিউ payload ⊆ rules allowlist", () => {
  const allowed = ruleList(fnBody(RULES, "validReportReview"), "changed\\.hasOnly");
  const fnSrc = API.slice(API.indexOf("export async function setReportStatus"));
  const keys = objKeys(fnSrc, "const data = {"); const opt = [...fnSrc.slice(0, fnSrc.indexOf("await guarded")).matchAll(/data\.(\w+) = /g)].map((m) => m[1]);
  assert.deepEqual(sorted([...keys, ...opt]), sorted(allowed));
});
test("লিমিট: api.js LIMITS = rules (title/body/reply/details)", () => {
  const L = /LIMITS = \{ title: \[(\d+), (\d+)\], body: \[(\d+), (\d+)\], reply: \[(\d+), (\d+)\], details: (\d+) \}/.exec(API);
  assert.ok(L, "LIMITS পার্স হয়নি");
  const dBody = fnBody(RULES, "validNewDiscussion"), rBody = fnBody(RULES, "validNewReply"), repBody = fnBody(RULES, "validNewReport");
  assert.ok(dBody.includes(`isText(d.title, ${L[1]}, ${L[2]})`)); assert.ok(dBody.includes(`isText(d.body, ${L[3]}, ${L[4]})`));
  assert.ok(rBody.includes(`isText(d.body, ${L[5]}, ${L[6]})`)); assert.ok(repBody.includes(`isText(d.details, 0, ${L[7]})`));
  assert.ok(fnBody(RULES, "validDiscussionEdit").includes(`isText(d.title, ${L[1]}, ${L[2]})`) && fnBody(RULES, "validReplyEdit").includes(`isText(d.body, ${L[5]}, ${L[6]})`));
});
test("স্ট্যাটাস: api.js STATUS = rules মডারেশন-তালিকা", () => {
  const st = [...API.match(/STATUS = \{([^}]*)\}/)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(sorted(st), sorted(inList(fnBody(RULES, "validModeration"), "d\\.status")));
});
test("কোয়েরি-সীমা: পাবলিক কোয়েরির limit ≤ ৫০ (rules-এর সীমা)", () => {
  const ps = Number(/PAGE_SIZE = (\d+)/.exec(API)[1]), rp = Number(/REPLY_PAGE = (\d+)/.exec(API)[1]);
  assert.ok(ps <= 50 && rp <= 50 && /limit\(50\)/.test(API));
  assert.equal((RULES.match(/request\.query\.limit <= 50/g) || []).length, 3, "পাবলিক list: categories, discussions, replies — ৩টাতেই limit ≤ ৫০");
});
test("ক্যাটাগরি: write payload = rules; ডিফল্ট আইডি/নাম rules-সম্মত", () => {
  const keys = sorted(ruleList(fnBody(RULES, "validNewCategory"), "hasExactly"));
  assert.deepEqual(objKeys(API, 'await guarded(setDoc(tvDoc("categories", id), {'), keys);
  assert.deepEqual(objKeys(API, 'batch.set(tvDoc("categories", c.id), {'), keys);
  const defs = [...API.match(/DEFAULT_CATEGORIES = \[([\s\S]*?)\];/)[1].matchAll(/\{ id: "([^"]+)", name: "([^"]+)", order: (\d+) \}/g)];
  assert.equal(defs.length, 9);
  for (const [, id, name, order] of defs) { assert.match(id, /^[a-z0-9-]{1,40}$/); assert.ok(name.length >= 1 && name.length <= 40); assert.ok(Number(order) <= 9999); }
  assert.deepEqual(sorted(ruleList(fnBody(RULES, "validCategoryEdit"), "changed\\.hasOnly")), ["active", "createdAt", "name", "order"]);
});

/* ---------- ৫) কন্টেন্ট ও সেটিংস ---------- */
const typeBlock = (name) => { const i = ADMIN.indexOf(`\n  ${name}: {\n    label:`); assert.ok(i >= 0, name); const j = ADMIN.indexOf("\n  }", i + 1); return ADMIN.slice(i, j); };
for (const col of ["services", "portfolio", "caseStudies", "testimonials", "team", "stats", "pricingPlans", "faqItems"]) {
  test(`কন্টেন্ট ${col}: admin.js ফিল্ড + order = rules create-সেট; seed-data.js ডক মেলে`, () => {
    const fields = sorted([...typeBlock(col).matchAll(/\bkey: "(\w+)"/g)].map((m) => m[1]));
    const block = matchBlock(RULES, `/${col}/{id}`);
    const createKeys = sorted(strs(/hasExactly\(request\.resource\.data, \[([^\]]*)\]/.exec(block)[1]));
    const updateKeys = sorted(strs(/changedKeys\(\)\.hasOnly\(\[([^\]]*)\]/.exec(block)[1]));
    assert.deepEqual(createKeys, sorted([...fields, "order"]));
    assert.deepEqual(updateKeys, createKeys);
    const map = { services: seed.services, portfolio: seed.portfolioItems, caseStudies: seed.caseStudies, testimonials: seed.testimonials, team: seed.team, stats: seed.stats, pricingPlans: seed.pricingPlans, faqItems: seed.faqItems };
    for (const item of map[col]) assert.deepEqual(sorted(Object.keys(item)), createKeys, `${col} সিড-আইটেমের ফিল্ড-সেট ≠ rules`);
  });
}
test("পোর্টফোলিও ক্যাটাগরি অপশন = rules", () => {
  const opts = [...typeBlock("portfolio").matchAll(/value: "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(sorted(opts), sorted(strs(/d\.category in \[([^\]]*)\]/.exec(fnBody(RULES, "portfolioFieldsOk"))[1])));
});
test("সেটিংস: admin.js ফর্ম-ফিল্ড (fields + linkFields) + seed defaultSettings = rules allowlist", () => {
  const grab = (marker) => { const i = ADMIN.indexOf(marker); assert.ok(i >= 0, marker); const end = ADMIN.indexOf("\n  ];", i); return [...ADMIN.slice(i, end).matchAll(/key: "(\w+)"/g)].map((m) => m[1]); };
  const keys = sorted([...grab("const fields = ["), ...grab("const linkFields = [")]);
  const allowed = sorted(strs(/ks\.hasOnly\(\[([^\]]*)\]/.exec(fnBody(RULES, "settingsFieldsOk"))[1]));
  assert.deepEqual(keys, allowed); assert.deepEqual(sorted(Object.keys(seed.defaultSettings)), allowed);
});
test("সিড-ব্যাচ: admin.js runSeed ≤ ১৫টা লেখা/batch (Rules-এর ২০-access-call সীমা)", () => {
  assert.match(ADMIN, /const MAX_PER_BATCH = 15;/);
  assert.match(ADMIN, /for \(const b of batches\) await b\.commit\(\);/);
});

/* ---------- ৬) কনফিগ-সামঞ্জস্য ---------- */
test("firebase.json: rules ও indexes পাথ ঠিক; ইমুলেটর পোর্ট ৮০৮০", () => {
  const cfg = JSON.parse(read("firebase.json"));
  assert.equal(cfg.firestore.rules, "firestore.rules"); assert.ok(existsSync(new URL("../" + cfg.firestore.rules, import.meta.url)));
  assert.equal(cfg.firestore.indexes, "firestore.indexes.json"); assert.equal(cfg.emulators.firestore.port, 8080);
  assert.equal(JSON.parse(read(".firebaserc")).projects.default, "tvsitesofficial");
});
test("firestore.indexes.json: ক্লায়েন্টের সব কম্পোজিট কোয়েরির ইনডেক্স আছে", () => {
  const idx = JSON.parse(read("firestore.indexes.json")).indexes.map((x) => `${x.collectionGroup}:${x.fields.map((f) => `${f.fieldPath}/${f.order[0]}`).join(",")}`);
  for (const need of ["bookings:uid/A,createdAt/D", "discussions:status/A,createdAt/D", "discussions:status/A,category/A,createdAt/D", "replies:status/A,createdAt/A", "reports:status/A,createdAt/D"])
    assert.ok(idx.includes(need), "ইনডেক্স নেই: " + need);
});
