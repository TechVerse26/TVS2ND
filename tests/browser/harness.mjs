// tests/browser/harness.mjs — আসল Chromium-এ সাইট চালানোর টেস্ট-হারনেস (লাইভ Firebase ছাড়া)
//
// কীভাবে কাজ করে:
//   • রিপোর রুট একটা ছোট স্ট্যাটিক সার্ভারে সার্ভ হয় (Vercel-এর মতোই — কোনো বিল্ড-স্টেপ নেই)।
//   • ব্রাউজারে gstatic-এর Firebase SDK (app/auth/firestore/app-check) অনুরোধ আটকে মক মডিউল দেওয়া হয়।
//   • মক-Firestore প্রতিটা read/query/write Node-এ পাঠায়, যেখানে tests/offline/firestore-sim.mjs ও আসল firestore.rules চলে:
//       - কোয়েরি: আগে rules যাচাই (equality-ফিল্টার + limit — আসল Firestore-এর list-নিয়মের মতো), তারপর ডেটা ফিল্টার/সাজানো/পেজিনেশন;
//       - composite-ইনডেক্স দরকার হলে firestore.indexes.json-এ থাকা চাই — নইলে failed-precondition (আসল Firestore-এর মতো);
//       - লেখা: rules-সহ batch/atomic।
//   তাই UI-র আসল কোয়েরি ও লেখা সরাসরি আমাদের rules + indexes-এর বিরুদ্ধে প্রমাণিত হয়।
// ⚠️ এটা অফিশিয়াল Emulator নয়; আসল Firebase-এ ডিপ্লয়ের পর README-র "ম্যানুয়াল টেস্ট" ধাপগুলো একবার চালান।
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { FirestoreSim, Sentinel } from "../offline/firestore-sim.mjs";
import { Ts } from "../offline/rules-engine.mjs";

export const ROOT = new URL("../../", import.meta.url).pathname;
const P = "tvProject/main/";
export const T0 = Date.parse("2026-06-01T10:00:00Z");

/* ---------------------------------------------------------------- Playwright লোডার (লোকাল নয়তো গ্লোবাল) */
export async function loadPlaywright() {
  try { return await import("playwright"); } catch (_) { /* গ্লোবাল */ }
  const require = createRequire(import.meta.url);
  for (const p of ["/home/claude/.npm-global/lib/node_modules/playwright", "/usr/lib/node_modules/playwright", "/usr/local/lib/node_modules/playwright"]) {
    try { return require(p); } catch (_) { /* পরেরটা */ }
  }
  throw new Error("playwright পাওয়া যায়নি — `npm i -D playwright && npx playwright install chromium`");
}

/* ---------------------------------------------------------------- model.js (সার্চ-টোকেন) Node-এ */
export async function loadModel() {
  const tmp = mkdtempSync(join(tmpdir(), "tv-model-"));
  mkdirSync(join(tmp, "js/blog"), { recursive: true });
  writeFileSync(join(tmp, "package.json"), '{"type":"module"}');
  copyFileSync(join(ROOT, "js/blog/model.js"), join(tmp, "js/blog/model.js"));
  return import(pathToFileURL(join(tmp, "js/blog/model.js")).href);
}

/* ---------------------------------------------------------------- স্ট্যাটিক সার্ভার */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".xml": "application/xml" };
export function startServer() {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url.endsWith("/")) url += "index.html";
    const file = normalize(join(ROOT, url));
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

/* ---------------------------------------------------------------- মক Firebase SDK (ব্রাউজারে চলে) */
const STUB_APP = `export const initializeApp = (cfg) => ({ cfg });`;
const STUB_APPCHECK = `export const initializeAppCheck = () => ({}); export class ReCaptchaV3Provider { constructor(k) { this.k = k; } }`;
const STUB_AUTH = `
const listeners = new Set();
const state = { user: window.__tvInitialUser || null };
window.__tvAuthUid = state.user ? state.user.uid : null;
const auth = { get currentUser() { return state.user; } };
window.__tvAuth = { set(u) { state.user = u; window.__tvAuthUid = u ? u.uid : null; listeners.forEach((cb) => cb(u)); } };
export const getAuth = () => auth;
export const onAuthStateChanged = (a, cb) => { listeners.add(cb); Promise.resolve().then(() => cb(state.user)); return () => listeners.delete(cb); };
export class GoogleAuthProvider {}
export class GithubAuthProvider { addScope() {} }
const no = async () => { throw Object.assign(new Error("stub"), { code: "auth/operation-not-allowed" }); };
export const createUserWithEmailAndPassword = no, signInWithEmailAndPassword = no, signInWithPopup = no, sendPasswordResetEmail = no, sendEmailVerification = no;
export const updateProfile = async () => {};
export const signOut = async () => window.__tvAuth.set(null);
`;
const STUB_FIRESTORE = `
const rpc = async (op, payload) => {
  const r = await window.__fs(op, { ...payload, uid: window.__tvAuthUid || null });
  if (r && r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code });
  return r;
};
export class Timestamp { constructor(ms) { this.ms = ms; } toDate() { return new Date(this.ms); } toMillis() { return this.ms; } get seconds() { return Math.floor(this.ms / 1000); }
  static fromMillis(ms) { return new Timestamp(ms); } static now() { return new Timestamp(Date.now()); } }
class Sent { constructor(kind, v) { this.kind = kind; this.v = v; } }
export const serverTimestamp = () => new Sent("server");
export const increment = (n) => new Sent("inc", n);
export const arrayUnion = (...v) => new Sent("union", v);
export const arrayRemove = (...v) => new Sent("remove", v);
const enc = (v) => v instanceof Timestamp ? { $ts: v.ms } : v instanceof Sent ? { $s: v.kind, v: enc(v.v) } : v instanceof Date ? { $ts: v.getTime() }
  : Array.isArray(v) ? v.map(enc) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)])) : v;
const dec = (v) => v && typeof v === "object" ? (v.$ts !== undefined ? new Timestamp(v.$ts) : Array.isArray(v) ? v.map(dec) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dec(x)]))) : v;
class DocRef { constructor(path) { this.path = path; this.id = path.split("/").pop(); this.type = "document"; } }
class CollRef { constructor(path) { this.path = path; this.type = "collection"; } }
const autoId = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("").slice(0, 20).replace(/^./, (c) => c.toUpperCase());
export const getFirestore = () => ({ __db: true });
export const collection = (_db, ...segs) => new CollRef(segs.join("/"));
export const doc = (a, ...segs) => a instanceof CollRef ? new DocRef(a.path + "/" + autoId()) : new DocRef(segs.join("/"));
export const where = (f, op, v) => ({ t: "where", f, op, v: enc(v) });
export const orderBy = (f, dir = "asc") => ({ t: "orderBy", f, dir });
export const limit = (n) => ({ t: "limit", n });
export const startAfter = (snap) => ({ t: "startAfter", path: snap.ref.path });
export const query = (coll, ...cons) => ({ coll, cons });
const snap = (d) => ({ id: d.id, ref: new DocRef(d.path), exists: () => true, data: () => dec(structuredClone(d.data)) });
export const getDoc = async (ref) => { const r = await rpc("get", { path: ref.path }); return { id: ref.id, ref, exists: () => r.exists, data: () => (r.exists ? dec(structuredClone(r.data)) : undefined) }; };
export const getDocs = async (q) => { const r = await rpc("query", { path: (q.coll || q).path, cons: q.cons || [] }); const docs = r.docs.map(snap); return { docs, size: docs.length, empty: docs.length === 0, forEach: (f) => docs.forEach(f) }; };
export const getCountFromServer = async (q) => { const r = await rpc("count", { path: (q.coll || q).path, cons: q.cons || [] }); return { data: () => ({ count: r.count }) }; };
const commit = (ops) => rpc("commit", { ops });
export const setDoc = (ref, data, opts) => commit([{ type: "set", path: ref.path, data: enc(data), merge: !!(opts && opts.merge) }]);
export const updateDoc = (ref, data) => commit([{ type: "update", path: ref.path, data: enc(data) }]);
export const deleteDoc = (ref) => commit([{ type: "delete", path: ref.path }]);
export const addDoc = async (col, data) => { const ref = doc(col); await setDoc(ref, data); return ref; };
export const writeBatch = () => { const ops = []; const b = {
  set: (ref, data, opts) => { ops.push({ type: "set", path: ref.path, data: enc(data), merge: !!(opts && opts.merge) }); return b; },
  update: (ref, data) => { ops.push({ type: "update", path: ref.path, data: enc(data) }); return b; },
  delete: (ref) => { ops.push({ type: "delete", path: ref.path }); return b; },
  commit: () => commit(ops) }; return b; };
`;
const STUB_STORAGE = `
export const getStorage = () => ({}); export const ref = (_s, path) => ({ path });
export const uploadBytesResumable = (r, file) => { const cbs = {}; const t = { on: (_e, prog, err, done) => { setTimeout(() => { prog({ bytesTransferred: 1, totalBytes: 2 }); prog({ bytesTransferred: 2, totalBytes: 2 }); if (window.__storageFail) err(Object.assign(new Error("fail"), { code: window.__storageFail })); else { window.__uploaded = { path: r.path, size: file.size, type: file.type }; done(); } }, 20); } }; return t; };
export const getDownloadURL = async (r) => "https://img.example.com/uploaded/" + r.path.split("/").pop();
`;

/* ---------------------------------------------------------------- Node-পাশের Firestore (rules-সহ) */
const eqv = (a, b) => JSON.stringify(a instanceof Ts ? { t: a.ms } : a) === JSON.stringify(b instanceof Ts ? { t: b.ms } : b);
const rev = (v) => v && typeof v === "object" ? (v.$ts !== undefined ? new Ts(v.$ts) : v.$s ? new Sentinel(v.$s, v.v === undefined ? undefined : rev(v.v)) : Array.isArray(v) ? v.map(rev) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rev(x)]))) : v;
const outc = (v) => v instanceof Ts ? { $ts: v.ms } : Array.isArray(v) ? v.map(outc) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, outc(x)])) : v;
const cmpVal = (v) => (v instanceof Ts ? v.ms : v);
const compare = (a, b) => { a = cmpVal(a); b = cmpVal(b); return a < b ? -1 : a > b ? 1 : 0; };

export class Db {
  constructor(rulesText, indexes) {
    this.sim = new FirestoreSim(rulesText);
    this.indexes = indexes.indexes;
    this.fail = null;               // নন-null হলে প্রতিটা অনুরোধ এই কোডে ব্যর্থ (টেস্ট-হুক)
    this.log = [];                  // { op, path, cons, uid, error? }
    this.indexErrors = [];
  }
  seed(path, data) { this.sim.seed(P + path, rev(data)); }
  doc(path) { const d = this.sim.docs.get(P + path); return d ? outc(d) : undefined; }
  has(path) { return this.sim.docs.has(P + path); }
  /** কোয়েরির জন্য composite-ইনডেক্স দরকার কিনা + আছে কিনা (আসল Firestore-এর নিয়মের কাছাকাছি, সংরক্ষণশীল) */
  checkIndex(path, cons) {
    const wheres = cons.filter((c) => c.t === "where"), orders = cons.filter((c) => c.t === "orderBy");
    const arr = wheres.filter((c) => c.op === "array-contains");
    const need = orders.length >= 2 || (orders.length >= 1 && wheres.length >= 1) || (arr.length && (wheres.length > 1 || orders.length));
    if (!need) return;
    const group = path.split("/").slice(-1)[0];
    const eqFields = wheres.map((c) => `${c.f}/${c.op === "array-contains" ? "C" : "A"}`).sort();
    const ordFields = orders.map((o) => `${o.f}/${o.dir === "desc" ? "D" : "A"}`);
    const ok = this.indexes.some((ix) => {
      if (ix.collectionGroup !== group) return false;
      const f = ix.fields.map((x) => `${x.fieldPath}/${x.arrayConfig ? "C" : x.order[0]}`);
      if (f.length !== eqFields.length + ordFields.length) return false;
      return eqFields.join("|") === f.slice(0, eqFields.length).sort().join("|") && ordFields.join("|") === f.slice(eqFields.length).join("|");
    });
    if (!ok) { const sig = `${group}: ${[...eqFields, ...ordFields].join(", ")}`; this.indexErrors.push(sig); const e = new Error("The query requires an index: " + sig); e.code = "failed-precondition"; throw e; }
  }
  query(path, cons, auth, count = false) {
    const eqs = cons.filter((c) => c.t === "where" && c.op === "==").map((c) => ({ field: c.f, op: "==", value: rev(c.v) }));
    const lim = cons.find((c) => c.t === "limit")?.n ?? null;
    this.sim.list(path, { where: eqs, limit: count ? null : lim }, auth);          // rules (permission-denied?)
    this.checkIndex(path, cons);                                                         // index (failed-precondition?)
    const depth = path.split("/").length + 1;
    let rows = [...this.sim.docs.entries()].filter(([p]) => p.startsWith(path + "/") && p.split("/").length === depth).map(([p, d]) => ({ path: p, id: p.split("/").pop(), data: d }));
    for (const c of cons.filter((x) => x.t === "where")) {
      const v = rev(c.v);
      rows = rows.filter(({ data }) => {
        const x = data[c.f];
        switch (c.op) {
          case "==": return eqv(x, v);
          case "!=": return !eqv(x, v);
          case "<": return x !== undefined && compare(x, v) < 0; case "<=": return x !== undefined && compare(x, v) <= 0;
          case ">": return x !== undefined && compare(x, v) > 0; case ">=": return x !== undefined && compare(x, v) >= 0;
          case "array-contains": return Array.isArray(x) && x.some((y) => eqv(y, v));
          case "in": return v.some((y) => eqv(x, y));
          default: throw Object.assign(new Error("unsupported op " + c.op), { code: "invalid-argument" });
        }
      });
    }
    const orders = cons.filter((c) => c.t === "orderBy");
    for (const o of orders) rows = rows.filter(({ data }) => data[o.f] !== undefined);                 // Firestore: orderBy-ফিল্ড না থাকলে বাদ
    rows.sort((a, b) => { for (const o of orders) { const c = compare(a.data[o.f], b.data[o.f]) * (o.dir === "desc" ? -1 : 1); if (c) return c; } return a.id < b.id ? -1 : 1; });
    const sa = cons.find((c) => c.t === "startAfter");
    if (sa) {
      const cur = this.sim.docs.get(sa.path);
      const idx = rows.findIndex((r) => r.path === sa.path);
      if (cur && idx >= 0) rows = rows.slice(idx + 1);
      else if (cur) rows = rows.filter((r) => { for (const o of orders) { const c = compare(r.data[o.f], cur[o.f]) * (o.dir === "desc" ? -1 : 1); if (c) return c > 0; } return r.id > sa.path.split("/").pop(); });
    }
    if (count) return rows.length;
    if (lim != null) rows = rows.slice(0, lim);
    return rows;
  }
  async rpc(op, p) {
    const auth = p.uid ? { uid: p.uid } : null;
    const rec = { op, path: p.path || (p.ops || []).map((o) => o.type + " " + o.path).join(", "), cons: p.cons, uid: p.uid };
    this.log.push(rec);
    if (this.fail) { rec.error = this.fail; return { error: { code: this.fail, message: "simulated " + this.fail } }; }      // টেস্টে সার্ভার-ত্রুটি অনুকরণ (যেমন "unavailable")
    try {
      if (op === "get") { const d = this.sim.get(p.path, auth); return { exists: d.exists(), data: d.exists() ? outc(d.data()) : null }; }
      if (op === "query") return { docs: this.query(p.path, p.cons || [], auth).map((r) => ({ id: r.id, path: r.path, data: outc(r.data) })) };
      if (op === "count") return { count: this.query(p.path, p.cons || [], auth, true) };
      if (op === "commit") {
        const ops = p.ops.map((o) => ({ type: o.type, path: o.path, data: o.data ? rev(o.data) : undefined, merge: o.merge }));
        this.sim.commit(ops, auth);
        return { ok: true };
      }
    } catch (e) { rec.error = e.code || e.message; return { error: { code: e.code || "unknown", message: e.message } }; }
    return { error: { code: "unimplemented", message: op } };
  }
}

/* ---------------------------------------------------------------- ব্রাউজার-কনটেক্সট প্রস্তুত */
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
export async function newContext(browser, { origin, db, user = null, viewport = { width: 1280, height: 900 }, offline = false } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block", locale: "bn-BD", timezoneId: "Asia/Dhaka" });
  await context.exposeBinding("__fs", (_src, op, p) => db.rpc(op, p));
  if (user) await context.addInitScript((u) => { window.__tvInitialUser = u; }, user);
  await context.addInitScript(() => { window.__errors = []; window.addEventListener("error", (e) => window.__errors.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__errors.push("unhandled: " + String(e.reason && (e.reason.message || e.reason)))); });
  const stubs = { "firebase-app.js": STUB_APP, "firebase-app-check.js": STUB_APPCHECK, "firebase-auth.js": STUB_AUTH, "firebase-firestore.js": STUB_FIRESTORE, "firebase-storage.js": STUB_STORAGE };
  await context.route("https://www.gstatic.com/firebasejs/**", (route) => {
    const name = route.request().url().split("/").pop();
    if (stubs[name]) return route.fulfill({ status: 200, contentType: "text/javascript", body: stubs[name] });
    return route.abort();
  });
  await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await context.route("https://broken.example.com/**", (route) => route.abort());
  await context.route(/https:\/\/(img|images|cdn)\.example\.com\/.*/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG_1x1 }));
  await context.route(/^https:\/\/(?!www\.gstatic\.com|fonts\.)[^/]*\.(googleapis|firebaseapp|vercel|google|googletagmanager|clarity|recaptcha)[^/]*\//, (route) => route.abort());
  if (offline) await context.setOffline(true);
  return context;
}

/** সিড: ব্লগ-ডেটা (পোস্ট/ক্যাটাগরি/মন্তব্য/ইউজার) */
export async function seedBlog(db) {
  const M = await loadModel();
  const ts = (ms) => ({ $ts: ms });
  const user = (uid, o) => db.seed(`users/${uid}`, { name: o.name, email: `${uid}@x.com`, isAdmin: !!o.isAdmin, communityBlocked: !!o.blocked, avatarThumb: o.avatar || "", photoURL: "", createdAt: ts(T0) });
  user("ua", { name: "Admin Rahman", isAdmin: true }); user("ua2", { name: "Second Admin", isAdmin: true });
  user("u1", { name: "Rahim Uddin" }); user("u2", { name: "Karim" }); user("ub", { name: "Blocked User", blocked: true });
  const cat = (id, name, order, active = true) => db.seed(`blogCategories/${id}`, { name, order, active, createdAt: ts(T0) });
  cat("web", "ওয়েব ডেভেলপমেন্ট", 1); cat("design", "ডিজাইন", 2); cat("tips", "টিপস", 3); cat("archive", "আর্কাইভ", 4, false);
  const base = (id, o) => {
    const tags = o.tags || ["web"];
    const doc = { title: o.title, slug: o.slug, slugHistory: o.slugHistory || [], excerpt: o.excerpt ?? `${o.title} — সংক্ষিপ্ত বিবরণ`, content: o.content ?? `## ভূমিকা\n\n${o.title} নিয়ে একটি লেখা।\n\n- পয়েন্ট ১\n- পয়েন্ট ২`,
      contentFormat: "markdown", coverImage: o.cover ?? "", coverAlt: o.coverAlt ?? "", category: o.category || "web", tags, status: o.status || "published", language: o.language || "bn",
      author: "Admin Rahman", authorAvatar: "", createdBy: "ua", updatedBy: "ua", createdAt: ts(o.at), updatedAt: ts(o.upd ?? o.at), publishedAt: o.status === "draft" ? null : ts(o.at),
      featured: !!o.featured, featuredOrder: o.featuredOrder ?? 0, commentsOpen: o.commentsOpen !== false, readingTime: o.readingTime ?? 3, seoTitle: o.seoTitle || "", seoDescription: o.seoDescription || "",
      searchTokens: M.buildSearchTokens({ title: o.title, tags }) };
    db.seed(`blogPosts/${id}`, doc);
    db.seed(`blogSlugs/${o.slug}`, { postId: id, createdAt: ts(T0) });
    for (const h of doc.slugHistory) db.seed(`blogSlugs/${h}`, { postId: id, createdAt: ts(T0) });
  };
  const DAY = 86400000;
  const titles = [
    ["Firebase Authentication গাইড", "web"], ["CSS Grid দিয়ে লেআউট", "design"], ["PWA অফলাইন কৌশল", "web"], ["Typography ও পাঠযোগ্যতা", "design"], ["JavaScript Modules পরিচিতি", "web"],
    ["রঙের মনস্তত্ত্ব", "design"], ["Firestore Security Rules", "web"], ["Dark Mode ডিজাইন", "design"], ["Web Performance টিপস", "tips"], ["অ্যাক্সেসিবিলিটি চেকলিস্ট", "design"],
    ["SEO বেসিকস", "tips"], ["Hash Routing বনাম History API", "web"]
  ];
  titles.forEach(([t, c], i) => base(`p${String(i + 1).padStart(2, "0")}`, { title: t, slug: `post-${String(i + 1).padStart(2, "0")}`, category: c, at: T0 - i * DAY, tags: [c, i % 2 ? "guide" : "tutorial"], readingTime: 2 + (i % 5), cover: i % 3 === 0 ? "https://img.example.com/cover.png" : "", coverAlt: i % 3 === 0 ? "কভার ছবির বর্ণনা" : "" }));
  base("pf1", { title: "ফিচার্ড: Tech Verse-এর নতুন সার্ভিস", slug: "featured-news", category: "tips", at: T0 + DAY, featured: true, featuredOrder: 1, tags: ["news"], cover: "https://broken.example.com/missing.png" });
  base("pf2", { title: "ফিচার্ড: ডিজাইন সিস্টেম কেস স্টাডি", slug: "featured-case", category: "design", at: T0 + 2 * DAY, featured: true, featuredOrder: 2, tags: ["case"] });
  base("pdraft", { title: "গোপন খসড়া লেখা", slug: "secret-draft", status: "draft", at: T0, content: "## খসড়া\n\nএটি প্রকাশিত নয়।" });
  base("pmoved", { title: "নাম বদলানো লেখা", slug: "new-name", slugHistory: ["older-name"], at: T0 - 20 * DAY });
  base("pclosed", { title: "মন্তব্য-বন্ধ লেখা", slug: "closed-comments", at: T0 - 21 * DAY, commentsOpen: false });
  const para = (n) => Array.from({ length: n }, (_, i) => `এটি দীর্ঘ লেখার ${i + 1} নম্বর বাক্য, যাতে শব্দসংখ্যা যথেষ্ট হয় এবং সূচিপত্র দেখা যায়।`).join(" ");
  const long = `## ভূমিকা\n\n${para(40)}\n\n## প্রথম ধাপ\n\n${para(35)}\n\n\`\`\`js\nconst a = "<b>safe</b>";\nconsole.log(a);\n\`\`\`\n\n### উপধাপ\n\n${para(30)}\n\n| নাম | মান |\n|:--|--:|\n| এক | ১ |\n| দুই | ২ |\n\n## দ্বিতীয় ধাপ\n\n${para(35)}\n\n![চার্ট](https://img.example.com/chart.png)\n\nদেখুন [অন্য লেখা](#blog/post-01) ও [বাইরের লিংক](https://example.com).\n\n> গুরুত্বপূর্ণ উদ্ধৃতি\n\n## উপসংহার\n\n${para(20)}`;
  base("plong", { title: "দীর্ঘ গাইড: ওয়েব অ্যাপ বানানোর ধাপ", slug: "long-guide", category: "web", at: T0 - 30 * DAY, content: long, cover: "https://img.example.com/cover.png", coverAlt: "গাইডের কভার", readingTime: 9, tags: ["guide", "web", "pwa"], seoTitle: "SEO টাইটেল: ওয়েব অ্যাপ গাইড", seoDescription: "ওয়েব অ্যাপ বানানোর ধাপে ধাপে গাইড।" });
  const evil = `## আক্রমণ-পরীক্ষা\n\n<script>window.__xss=1</script>\n\n<img src=x onerror="window.__xss=2">\n\n[click](javascript:window.__xss=3)\n\n![x](javascript:window.__xss=4)\n\n<iframe src="javascript:window.__xss=5"></iframe>\n\n**বোল্ড** \`<b>কোড</b>\`\n\n[ok](https://example.com "t")`;
  base("pevil", { title: `<img src=x onerror=window.__xss=6> শিরোনাম`, slug: "xss-demo", category: "tips", at: T0 - 40 * DAY, content: evil, excerpt: `<script>window.__xss=7</script> সারসংক্ষেপ`, tags: ["<b>x</b>"] });
  const com = (pid, id, o) => db.seed(`blogPosts/${pid}/comments/${id}`, { uid: o.uid, authorName: o.name, authorAvatar: "", body: o.body, status: o.status, createdAt: ts(o.at), updatedAt: ts(o.at) });
  com("plong", "c1", { uid: "u2", name: "Karim", body: "চমৎকার লেখা!", status: "approved", at: T0 - 5 * DAY });
  com("plong", "c2", { uid: "u2", name: "Karim", body: "<b>HTML</b> <script>window.__xss=8</script> মন্তব্য", status: "approved", at: T0 - 4 * DAY });
  com("plong", "c3", { uid: "u1", name: "Rahim Uddin", body: "আমার অনুমোদিত মন্তব্য", status: "approved", at: T0 - 3 * DAY });
  com("plong", "c4", { uid: "u1", name: "Rahim Uddin", body: "আমার অপেক্ষমাণ মন্তব্য", status: "pending", at: T0 - 2 * DAY });
  com("plong", "c5", { uid: "u2", name: "Karim", body: "লুকানো মন্তব্য", status: "hidden", at: T0 - 1 * DAY });
  com("plong", "c6", { uid: "u2", name: "Karim", body: "অন্যের অপেক্ষমাণ মন্তব্য", status: "pending", at: T0 });
}

export const USERS = {
  admin: { uid: "ua", displayName: "Admin Rahman", email: "ua@x.com", photoURL: "" },
  member: { uid: "u1", displayName: "Rahim Uddin", email: "u1@x.com", photoURL: "" },
  blocked: { uid: "ub", displayName: "Blocked User", email: "ub@x.com", photoURL: "" }
};
export const loadRules = () => ({ rules: readFileSync(join(ROOT, "firestore.rules"), "utf8"), indexes: JSON.parse(readFileSync(join(ROOT, "firestore.indexes.json"), "utf8")) });
