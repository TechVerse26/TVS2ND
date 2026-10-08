// scripts/migrate-to-tvproject.mjs
// পুরোনো (root-level) Firestore ডেটা → নতুন নেমস্পেস tvProject/main/** এ কপি। ডেটা কপি হয়, পুরোনোটা মোছা হয় না
// (নিরাপদে বারবার চালানো যায়; একই id-তে আবার লিখলে একই ফল)। Admin SDK ব্যবহার করে — তাই Security Rules এড়িয়ে চলে;
// সার্ভিস-অ্যাকাউন্ট কী (JSON) কখনো রিপোতে কমিট করবেন না (.gitignore-এ serviceAccount*.json আছে)।
//
// ব্যবহার:
//   cd scripts && npm init -y >/dev/null && npm i firebase-admin
//   node migrate-to-tvproject.mjs --key ./serviceAccount.json --dry-run                (শুধু গণনা, কিছু লেখে না)
//   node migrate-to-tvproject.mjs --key ./serviceAccount.json --admin you@example.com  (আসল কপি)
//
// নিরাপত্তা-নীতি:
//  • users: শুধু Tech Verse-এর ফিল্ড কপি হয় (অন্য অ্যাপের বাড়তি ফিল্ড কপি হয় না)।
//  • isAdmin কপি হয় না — সবাই false; যাদের ইমেইল --admin দিয়ে দেবেন শুধু তারাই isAdmin=true পাবে।
//  • bookings: শুধু বুকিং ফর্মের ফিল্ড কপি হয়।
import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const all = (n) => args.flatMap((a, i) => (a === n ? [args[i + 1]] : []));
const dry = args.includes("--dry-run");
const keyPath = val("--key");
if (!keyPath) { console.error("ব্যবহার: node migrate-to-tvproject.mjs --key ./serviceAccount.json [--dry-run] [--admin email]..."); process.exit(1); }
const adminEmails = new Set(all("--admin").map((e) => String(e).toLowerCase()));

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
const db = admin.firestore();
const ROOT = db.collection("tvProject").doc("main");

const pick = (data, keys) => Object.fromEntries(keys.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
const USER_KEYS = ["name", "email", "photoURL", "phone", "createdAt", "avatarData", "bio"];
const BOOKING_KEYS = ["service", "name", "email", "phone", "budget", "timeline", "details", "uid", "status", "createdAt"];
const CONTENT = ["services", "portfolio", "caseStudies", "testimonials", "team", "stats", "pricingPlans", "faqItems"];

async function copy(name, transform = (d) => d) {
  const snap = await db.collection(name).get();
  let n = 0, batch = db.batch(), pending = 0;
  for (const d of snap.docs) {
    const data = transform(d.data(), d);
    if (!data) continue;
    if (!dry) { batch.set(ROOT.collection(name).doc(d.id), data); pending++; }
    n++;
    if (pending === 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
  if (pending) await batch.commit();
  console.log(`${dry ? "[dry-run] " : ""}${name}: ${n} টা ডকুমেন্ট ${dry ? "কপি হতো" : "কপি হয়েছে"}`);
}

await copy("users", (d) => ({
  ...pick(d, USER_KEYS),
  name: typeof d.name === "string" ? d.name : "",
  email: typeof d.email === "string" ? d.email : "",
  isAdmin: adminEmails.has(String(d.email || "").toLowerCase())
}));
await copy("bookings", (d) => pick(d, BOOKING_KEYS));
for (const c of CONTENT) await copy(c);
const site = await db.collection("settings").doc("site").get();
if (site.exists) { if (!dry) await ROOT.collection("settings").doc("site").set(site.data()); console.log(`${dry ? "[dry-run] " : ""}settings/site: কপি ${dry ? "হতো" : "হয়েছে"}`); }
console.log(dry ? "\nড্রাই-রান শেষ — কিছু লেখা হয়নি।" : "\nশেষ। এখন নতুন firestore.rules ডিপ্লয় করুন, তারপর সাইট/অ্যাডমিন প্যানেল চেক করুন।");
process.exit(0);
