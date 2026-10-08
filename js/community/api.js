// js/community/api.js
// কমিউনিটির সব Firestore অপারেশন — UI-র সাথে সম্পর্কহীন। পাথ: tvProject/main/{categories,discussions,reports}।
// ক্লায়েন্ট-সাইড চেক শুধু ভালো UX-এর জন্য; আসল নিরাপত্তা firestore.rules-এ (uid, কাউন্ট, টাইমস্ট্যাম্প,
// স্ট্যাটাস, অ্যাডমিন সবকিছু সেখানেই যাচাই হয়)।

import { db } from "../firebase-config.js";
import { tvCol, tvDoc } from "../tv-db.js";
import { makeAvatarThumb, providerAvatarUrl } from "../avatar-thumb.js";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, limit, startAfter,
  serverTimestamp, increment, arrayUnion, arrayRemove, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/* ---------------------------------------------------------------- ধ্রুবক */
export const PAGE_SIZE = 20;     // ফিডে এক পাতায় সর্বোচ্চ ২০টা (rules-এ limit ≤ ৫০ বাধ্যতামূলক)
export const REPLY_PAGE = 30;
export const LIMITS = { title: [3, 120], body: [3, 5000], reply: [1, 2000], details: 500 };
export const STATUS = { ACTIVE: "active", HIDDEN: "hidden", DELETED: "deleted" };
export const REPORT_REASONS = [
  ["spam", "স্প্যাম"], ["abuse", "গালিগালাজ / অপব্যবহার"], ["harassment", "হয়রানি"],
  ["misinformation", "ভুল তথ্য"], ["inappropriate", "অনুপযুক্ত কনটেন্ট"], ["other", "অন্যান্য"]
];
// Firestore-এ ক্যাটাগরি না থাকলে (বা লোড না হলে) UI-তে এগুলো দেখানো হয়; অ্যাডমিন একবার "ডিফল্ট ক্যাটাগরি বসান" চাপলে DB-তে যায়
export const DEFAULT_CATEGORIES = [
  { id: "general", name: "General", order: 1 },
  { id: "web-development", name: "Web Development", order: 2 },
  { id: "javascript", name: "JavaScript", order: 3 },
  { id: "firebase", name: "Firebase", order: 4 },
  { id: "ui-ux", name: "UI/UX", order: 5 },
  { id: "programming", name: "Programming", order: 6 },
  { id: "project-help", name: "Project Help", order: 7 },
  { id: "tech-verse", name: "Tech Verse", order: 8 },
  { id: "other", name: "Other", order: 9 }
];

/* ---------------------------------------------------------------- এরর ও টাইমআউট */
export class CommunityError extends Error {
  constructor(code, message, retryable = true) { super(message); this.code = code; this.retryable = retryable; }
}

/** Firebase/নেটওয়ার্ক এরর → ব্যবহারকারীর জন্য বাংলা বার্তা */
export function explain(err) {
  const code = String(err?.code || "").replace("firestore/", "");
  if (err instanceof CommunityError) return err;
  if (code === "permission-denied") return new CommunityError(code, "এই কাজের অনুমতি নেই — কনটেন্টটি সরানো হয়ে থাকতে পারে, অথবা আপনার অ্যাকাউন্টে সীমাবদ্ধতা আছে।", false);
  if (code === "unavailable" || code === "deadline-exceeded" || /network|offline|Failed to fetch/i.test(String(err?.message))) {
    return new CommunityError("offline", "ইন্টারনেট সংযোগে সমস্যা — সংযোগ দেখে আবার চেষ্টা করুন।");
  }
  if (code === "failed-precondition") return new CommunityError(code, "ডেটাবেস ইনডেক্স এখনো তৈরি হয়নি — অ্যাডমিন firestore.indexes.json ডিপ্লয় করলে ঠিক হবে।", false);
  if (code === "not-found") return new CommunityError(code, "কনটেন্টটি পাওয়া যায়নি।", false);
  if (code === "unauthenticated") return new CommunityError(code, "এই কাজের জন্য লগইন করতে হবে।", false);
  if (code === "resource-exhausted") return new CommunityError(code, "অনেকবার চেষ্টা হয়েছে — একটু পরে আবার চেষ্টা করুন।");
  return new CommunityError(code || "unknown", "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।");
}

/** অফলাইনে সাথে সাথে ব্যর্থ + ১৪ সেকেন্ডের বেশি ঝুলে থাকলে টাইমআউট (অন্তহীন স্পিনার এড়াতে) */
function guarded(promise, ms = 14000) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    promise.catch(() => {});
    return Promise.reject(new CommunityError("offline", "আপনি অফলাইনে আছেন — সংযোগ ফিরলে আবার চেষ্টা করুন।"));
  }
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new CommunityError("offline", "সংযোগ ধীর — একটু পরে আবার চেষ্টা করুন।")), ms); });
  return Promise.race([promise, timeout]).catch((e) => { throw explain(e); }).finally(() => clearTimeout(t));
}

const toItem = (snap) => ({ id: snap.id, ...snap.data(), _snap: snap });
export const toDate = (v) => (v && typeof v.toDate === "function" ? v.toDate() : v instanceof Date ? v : null);

/* ---------------------------------------------------------------- ক্যাটাগরি */
export async function fetchCategories() {
  const snap = await guarded(getDocs(query(tvCol("categories"), orderBy("order", "asc"), limit(50))));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------------------------------------------------------------- আলোচনা (ফিড) */
export async function fetchDiscussions({ category = "", cursor = null, size = PAGE_SIZE } = {}) {
  const parts = [where("status", "==", STATUS.ACTIVE)];
  if (category) parts.push(where("category", "==", category));
  parts.push(orderBy("createdAt", "desc"));
  if (cursor) parts.push(startAfter(cursor));
  parts.push(limit(size));
  const snap = await guarded(getDocs(query(tvCol("discussions"), ...parts)));
  return { items: snap.docs.map(toItem), cursor: snap.docs[snap.docs.length - 1] || null, done: snap.docs.length < size };
}

export async function fetchDiscussion(id) {
  const snap = await guarded(getDoc(tvDoc("discussions", id)));
  return snap.exists() ? toItem(snap) : null;
}

export async function fetchReplies(did, { cursor = null, size = REPLY_PAGE } = {}) {
  const parts = [where("status", "==", STATUS.ACTIVE), orderBy("createdAt", "asc")];
  if (cursor) parts.push(startAfter(cursor));
  parts.push(limit(size));
  const snap = await guarded(getDocs(query(tvCol("discussions", did, "replies"), ...parts)));
  return { items: snap.docs.map(toItem), cursor: snap.docs[snap.docs.length - 1] || null, done: snap.docs.length < size };
}

/* ---------------------------------------------------------------- লেখকের পরিচয় (বিশ্বাসযোগ্য users ডকুমেন্ট থেকে) */
/** পোস্টের authorName/authorAvatar ক্লায়েন্টের হাতে বানানো হয় না — rules এই মানকে users/{uid}-এর সাথে মেলায়। */
export async function loadAuthor(user) {
  const ref = tvDoc("users", user.uid);
  const snap = await guarded(getDoc(ref));
  if (!snap.exists()) throw new CommunityError("no-profile", "প্রোফাইল পাওয়া যায়নি — একবার লগআউট করে আবার লগইন করুন।", false);
  const p = snap.data();
  if (p.communityBlocked === true) throw new CommunityError("blocked", "আপনার কমিউনিটি অ্যাক্সেস অ্যাডমিন সীমিত করেছেন।", false);
  let thumb = p.avatarThumb || "";
  if (!thumb) { // পুরোনো ইউজারদের ছোট অবতার একবার বানিয়ে রাখা
    let t = p.avatarData ? await makeAvatarThumb(p.avatarData) : "";
    if (!t) t = providerAvatarUrl(p.photoURL || user.photoURL);
    if (t) { try { await updateDoc(ref, { avatarThumb: t }); thumb = t; } catch (_) { /* ছবি ছাড়াই চলবে */ } }
  }
  return { uid: user.uid, name: p.name || "", avatarThumb: thumb, isAdmin: p.isAdmin === true };
}

/* ---------------------------------------------------------------- আলোচনা: তৈরি / এডিট / মুছা */
export async function createDiscussion(author, { title, body, category }) {
  const ref = doc(tvCol("discussions"));
  await guarded(setDoc(ref, {
    uid: author.uid, authorName: author.name, authorAvatar: author.avatarThumb,
    title, body, category, status: STATUS.ACTIVE,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), editedAt: null,
    likedBy: [], likeCount: 0, replyCount: 0
  }));
  return ref.id;
}

export async function editDiscussion(did, { title, body }) {
  await guarded(updateDoc(tvDoc("discussions", did), { title, body, editedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
}

/** মালিকের "মুছুন" = soft delete (status: deleted) — হার্ড ডিলিট rules-এ কারো জন্যই বন্ধ */
export async function deleteDiscussion(did) {
  await guarded(updateDoc(tvDoc("discussions", did), { status: STATUS.DELETED, updatedAt: serverTimestamp() }));
}

/* ---------------------------------------------------------------- লাইক (likedBy + likeCount, rules-এ count == likedBy.size()) */
export async function setLike({ did, rid = null, uid, like }) {
  const ref = rid ? tvDoc("discussions", did, "replies", rid) : tvDoc("discussions", did);
  await guarded(updateDoc(ref, like
    ? { likedBy: arrayUnion(uid), likeCount: increment(1) }
    : { likedBy: arrayRemove(uid), likeCount: increment(-1) }));
}

/* ---------------------------------------------------------------- রিপ্লাই (batch: রিপ্লাই + parent replyCount) */
export async function createReply(did, author, { body, replyTo = null }) {
  const rref = doc(tvCol("discussions", did, "replies"));
  const data = {
    uid: author.uid, authorName: author.name, authorAvatar: author.avatarThumb, body, status: STATUS.ACTIVE,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), editedAt: null, likedBy: [], likeCount: 0
  };
  if (replyTo) { data.replyToId = replyTo.id; data.replyToName = replyTo.authorName || ""; }
  const batch = writeBatch(db);
  batch.set(rref, data);
  batch.update(tvDoc("discussions", did), { replyCount: increment(1), replySyncId: rref.id });
  await guarded(batch.commit());
  return rref.id;
}

export async function editReply(did, rid, body) {
  await guarded(updateDoc(tvDoc("discussions", did, "replies", rid), { body, editedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
}

export async function deleteReply(did, rid) {
  const batch = writeBatch(db);
  batch.update(tvDoc("discussions", did, "replies", rid), { status: STATUS.DELETED, updatedAt: serverTimestamp() });
  batch.update(tvDoc("discussions", did), { replyCount: increment(-1), replySyncId: rid });
  await guarded(batch.commit());
}

/* ---------------------------------------------------------------- রিপোর্ট (ডকুমেন্ট id নির্ধারিত ⇒ ডুপ্লিকেট অসম্ভব) */
export const reportId = (uid, targetType, targetId) => `${uid}_${targetType}_${targetId}`;

export async function hasReported(uid, targetType, targetId) {
  try { return (await guarded(getDoc(tvDoc("reports", reportId(uid, targetType, targetId))))).exists(); }
  catch (_) { return false; }
}

export async function submitReport({ uid, targetType, targetId, discussionId, reason, details = "" }) {
  const data = { reporterUid: uid, targetType, targetId, discussionId, reason, status: "open", createdAt: serverTimestamp() };
  if (details) data.details = details;
  await guarded(setDoc(tvDoc("reports", reportId(uid, targetType, targetId)), data));
}

/* ---------------------------------------------------------------- অ্যাডমিন মডারেশন */
const modFields = (status, adminUid) => ({ status, updatedAt: serverTimestamp(), moderatedBy: adminUid, moderatedAt: serverTimestamp() });

export async function moderateDiscussion(did, status, adminUid) {
  await guarded(updateDoc(tvDoc("discussions", did), modFields(status, adminUid)));
}

/** রিপ্লাইয়ের active-ness বদলালে parent-এর replyCount একই batch-এ মেলানো হয় (rules এটাই চায়) */
export async function moderateReply(did, rid, status, adminUid, { reportRef = null } = {}) {
  const rref = tvDoc("discussions", did, "replies", rid);
  const cur = await guarded(getDoc(rref));
  if (!cur.exists()) throw new CommunityError("not-found", "রিপ্লাইটি পাওয়া যায়নি।", false);
  const wasActive = cur.data().status === STATUS.ACTIVE, nowActive = status === STATUS.ACTIVE;
  const batch = writeBatch(db);
  batch.update(rref, modFields(status, adminUid));
  if (wasActive !== nowActive) batch.update(tvDoc("discussions", did), { replyCount: increment(nowActive ? 1 : -1), replySyncId: rid });
  if (reportRef) batch.update(reportRef.ref, { status: reportRef.status, reviewedBy: adminUid, reviewedAt: serverTimestamp() });
  await guarded(batch.commit());
}

/* ---------- অ্যাডমিন: রিপোর্ট ---------- */
export async function fetchReports({ onlyOpen = true, cursor = null, size = 25 } = {}) {
  const parts = [];
  if (onlyOpen) parts.push(where("status", "==", "open"));
  parts.push(orderBy("createdAt", "desc"));
  if (cursor) parts.push(startAfter(cursor));
  parts.push(limit(size));
  const snap = await guarded(getDocs(query(tvCol("reports"), ...parts)));
  return { items: snap.docs.map(toItem), cursor: snap.docs[snap.docs.length - 1] || null, done: snap.docs.length < size };
}

export async function countOpenReports() {
  const snap = await guarded(getCountFromServer(query(tvCol("reports"), where("status", "==", "open"))));
  return snap.data().count;
}

export async function fetchReportTarget(report) {
  const ref = report.targetType === "reply"
    ? tvDoc("discussions", report.discussionId, "replies", report.targetId)
    : tvDoc("discussions", report.targetId);
  const snap = await guarded(getDoc(ref));
  return snap.exists() ? toItem(snap) : null;
}

export async function setReportStatus(reportDocId, status, adminUid, note = "") {
  const data = { status, reviewedBy: adminUid, reviewedAt: serverTimestamp() };
  if (note) data.resolutionNote = note;
  await guarded(updateDoc(tvDoc("reports", reportDocId), data));
}

/** রিপোর্ট থেকে সরাসরি কনটেন্ট লুকানো/মুছে ফেলা + রিপোর্ট "resolved" — একই batch-এ */
export async function moderateFromReport(report, status, adminUid) {
  const reportRef = { ref: tvDoc("reports", report.id), status: "resolved" };
  if (report.targetType === "reply") return moderateReply(report.discussionId, report.targetId, status, adminUid, { reportRef });
  const batch = writeBatch(db);
  batch.update(tvDoc("discussions", report.targetId), modFields(status, adminUid));
  batch.update(reportRef.ref, { status: "resolved", reviewedBy: adminUid, reviewedAt: serverTimestamp() });
  await guarded(batch.commit());
}

/* ---------- অ্যাডমিন: আলোচনার তালিকা (সব স্ট্যাটাস) ---------- */
export async function fetchAllDiscussions({ status = "", cursor = null, size = 25 } = {}) {
  const parts = [];
  if (status) parts.push(where("status", "==", status));
  parts.push(orderBy("createdAt", "desc"));
  if (cursor) parts.push(startAfter(cursor));
  parts.push(limit(size));
  const snap = await guarded(getDocs(query(tvCol("discussions"), ...parts)));
  return { items: snap.docs.map(toItem), cursor: snap.docs[snap.docs.length - 1] || null, done: snap.docs.length < size };
}

/** অ্যাডমিন: একটা আলোচনার সব রিপ্লাই (লুকানো/মুছে ফেলা সহ) — মডারেশনের জন্য, সর্বোচ্চ ৫০টা */
export async function fetchAllReplies(did, { size = 50 } = {}) {
  const snap = await guarded(getDocs(query(tvCol("discussions", did, "replies"), orderBy("createdAt", "asc"), limit(size))));
  return snap.docs.map(toItem);
}

/* ---------- অ্যাডমিন: ক্যাটাগরি ---------- */
export const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export async function seedDefaultCategories() {
  const batch = writeBatch(db);
  DEFAULT_CATEGORIES.forEach((c) => batch.set(tvDoc("categories", c.id), { name: c.name, order: c.order, active: true, createdAt: serverTimestamp() }));
  await guarded(batch.commit());
}

export async function addCategory({ name, order }) {
  const id = slugify(name);
  if (!id) throw new CommunityError("bad-name", "ক্যাটাগরির নাম ইংরেজি অক্ষর/সংখ্যায় দিন (যেমন: Design)।", false);
  await guarded(setDoc(tvDoc("categories", id), { name: name.trim().slice(0, 40), order, active: true, createdAt: serverTimestamp() }));
  return id;
}

export async function updateCategory(id, patch) {
  await guarded(updateDoc(tvDoc("categories", id), patch));
}

export async function deleteCategory(id) {
  await guarded(deleteDoc(tvDoc("categories", id)));
}
