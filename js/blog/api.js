// js/blog/api.js
// ব্লগের পাবলিক Firestore অপারেশন — UI-র সাথে সম্পর্কহীন। পাথ (সব tvProject/main/ এর নিচে):
//   blogPosts/{postId}                      — লেখা (শুধু status == "published" পাবলিক পড়তে পারে; খসড়া শুধু অ্যাডমিন)
//   blogPosts/{postId}/comments/{commentId} — মন্তব্য (পাবলিক শুধু "approved"; নিজের মন্তব্য নিজে দেখে)
//   blogCategories/{slug}                   — ক্যাটাগরি
//   blogCommentThrottle/{uid}               — মন্তব্যের ২০ সেকেন্ড ব্যবধান (শুধু লেখা)
// ক্লায়েন্ট-সাইড চেক শুধু ভালো UX-এর জন্য; আসল নিরাপত্তা firestore.rules-এ (tests/scenarios.mjs-এ ১০০+ নেগেটিভ টেস্টসহ)।
// অ্যাডমিন-লেখার অপারেশন আলাদা ফাইলে (admin-api.js) — পাবলিক পাতায় লোড হয় না।

import { db } from "../firebase-config.js";
import { tvCol, tvDoc } from "../tv-db.js";
import { loadAuthor as loadCommunityAuthor, explain, CommunityError, toDate } from "../community/api.js";
import {
  doc, getDocs, updateDoc, writeBatch, query, where, orderBy, limit, startAfter, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { LIMITS, STATUS, COMMENT_STATUS, COMMENT_START_STATUS, PAGE_SIZE, COMMENT_PAGE, parseSearch, matchesRest } from "./model.js";

export { toDate, explain, CommunityError, PAGE_SIZE, COMMENT_PAGE };

/** অফলাইনে সাথে সাথে ব্যর্থ + ১৪ সেকেন্ডের বেশি ঝুলে থাকলে টাইমআউট (অন্তহীন স্পিনার এড়াতে) — community/api.js-এর মতোই */
export function guarded(promise, ms = 14000) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    promise.catch(() => {});
    return Promise.reject(new CommunityError("offline", "আপনি অফলাইনে আছেন — সংযোগ ফিরলে আবার চেষ্টা করুন।"));
  }
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new CommunityError("offline", "সংযোগ ধীর — একটু পরে আবার চেষ্টা করুন।")), ms); });
  return Promise.race([promise, timeout]).catch((e) => { throw explain(e); }).finally(() => clearTimeout(t));
}

const toPost = (snap) => ({ id: snap.id, ...snap.data(), _snap: snap });
/** size+1 টা আনা হয়; বাড়তিটা শুধু "আরও আছে কি?" জানার জন্য (বাদ যায়) — তাই শেষ পাতায় ফাঁকা "আরও দেখুন" ক্লিক থাকে না */
const page = (snap, size) => { const docs = snap.docs.slice(0, size); return { items: docs.map(toPost), cursor: docs[docs.length - 1] || null, done: snap.docs.length <= size }; };

/* ---------------------------------------------------------------- ক্যাটাগরি */
export async function fetchBlogCategories() {
  const snap = await guarded(getDocs(query(tvCol("blogCategories"), orderBy("order", "asc"), limit(50))));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------------------------------------------------------------- লেখা — তালিকা */
/** প্রকাশিত লেখার পাতা (নতুন আগে)। ক্যাটাগরি ও সার্চ একসাথে কাজ করে: সার্চের সবচেয়ে লম্বা শব্দ সার্ভারে (array-contains), বাকি শব্দ ক্লায়েন্টে মেলানো —
 *  তাই পুরো কালেকশন মেমোরিতে আনা হয় না। বাকি-শব্দ ফিল্টারে পাতা ছোট পড়লে সর্বোচ্চ ৬ পাতা পর্যন্ত আরও আনা হয়। */
export async function fetchPosts({ category = "", search = "", cursor = null, size = PAGE_SIZE } = {}) {
  const { primary, rest } = parseSearch(search);
  const build = (cur) => {
    const parts = [where("status", "==", STATUS.PUBLISHED)];
    if (category) parts.push(where("category", "==", category));
    if (primary) parts.push(where("searchTokens", "array-contains", primary));
    parts.push(orderBy("publishedAt", "desc"));
    if (cur) parts.push(startAfter(cur));
    parts.push(limit(size + 1));
    return query(tvCol("blogPosts"), ...parts);
  };
  const items = [];
  let cur = cursor, done = false, loops = 0;
  while (items.length < size && !done && loops++ < 6) {
    const snap = await guarded(getDocs(build(cur)));
    const p = page(snap, size);
    if (p.cursor) cur = p.cursor._snap || p.cursor;
    done = p.done;
    for (const it of p.items) if (matchesRest(it, rest)) items.push(it);
  }
  return { items, cursor: cur, done };
}

/** ফিচার্ড লেখা — featuredOrder (ছোট আগে) অনুযায়ী */
export async function fetchFeatured(n = 3) {
  const snap = await guarded(getDocs(query(tvCol("blogPosts"), where("status", "==", STATUS.PUBLISHED), where("featured", "==", true), orderBy("featuredOrder", "asc"), limit(n))));
  return snap.docs.map(toPost);
}

/** স্লাগ → প্রকাশিত লেখা। না পেলে পুরোনো-স্লাগ (slugHistory) দিয়ে খোঁজে → { redirectedFrom } দিয়ে UI নতুন URL-এ নেয়। শুধু status == "published" কোয়েরি — rules-এর পাবলিক শর্ত মেনে। */
export async function fetchPostBySlug(slug) {
  const posts = tvCol("blogPosts");
  const one = async (...filters) => {
    const snap = await guarded(getDocs(query(posts, ...filters, limit(1))));
    return snap.empty ? null : toPost(snap.docs[0]);
  };
  let p = await one(where("status", "==", STATUS.PUBLISHED), where("slug", "==", slug));
  if (p) return { post: p, redirectedFrom: "", draft: false };
  p = await one(where("status", "==", STATUS.PUBLISHED), where("slugHistory", "array-contains", slug));
  if (p) return { post: p, redirectedFrom: slug, draft: false };
  return { post: null, redirectedFrom: "", draft: false };
}

/** অ্যাডমিন-প্রিভিউ: স্লাগ দিয়ে যেকোনো স্ট্যাটাসের লেখা (খসড়াসহ)। rules শুধু অ্যাডমিনকে স্ট্যাটাস-ফিল্টার ছাড়া list করতে দেয় — অন্য কেউ চালালে permission-denied → "পাওয়া যায়নি"। */
export async function fetchDraftBySlug(slug) {
  const posts = tvCol("blogPosts");
  const one = async (...filters) => {
    const snap = await guarded(getDocs(query(posts, ...filters, limit(1))));
    return snap.empty ? null : toPost(snap.docs[0]);
  };
  try {
    const p = (await one(where("slug", "==", slug))) || (await one(where("slugHistory", "array-contains", slug)));
    if (p) return { post: p, redirectedFrom: p.slug === slug ? "" : slug, draft: p.status !== STATUS.PUBLISHED };
  } catch (e) { if (e?.code !== "denied" && e?.code !== "permission-denied") throw e; }
  return { post: null, redirectedFrom: "", draft: false };
}

/** একই ক্যাটাগরির অন্যান্য প্রকাশিত লেখা (বর্তমানটা বাদে) */
export async function fetchRelated(post, n = 3) {
  const snap = await guarded(getDocs(query(tvCol("blogPosts"), where("status", "==", STATUS.PUBLISHED), where("category", "==", post.category), orderBy("publishedAt", "desc"), limit(n + 1))));
  return snap.docs.filter((d) => d.id !== post.id).slice(0, n).map(toPost);
}

/* ---------------------------------------------------------------- মন্তব্য */
/** অনুমোদিত মন্তব্য (পুরোনো আগে) */
export async function fetchComments(pid, { cursor = null, size = COMMENT_PAGE } = {}) {
  const parts = [where("status", "==", COMMENT_STATUS.APPROVED), orderBy("createdAt", "asc")];
  if (cursor) parts.push(startAfter(cursor));
  parts.push(limit(size + 1));
  const snap = await guarded(getDocs(query(tvCol("blogPosts", pid, "comments"), ...parts)));
  return page(snap, size);
}

/** নিজের অপেক্ষমাণ মন্তব্য (rules: মালিক নিজের মন্তব্য পড়তে পারে; কোয়েরিতে uid == নিজের uid বাধ্যতামূলক) */
export async function fetchMyPendingComments(pid, uid) {
  const snap = await guarded(getDocs(query(tvCol("blogPosts", pid, "comments"), where("uid", "==", uid), limit(10))));
  return snap.docs.map(toPost).filter((c) => c.status === COMMENT_STATUS.PENDING).sort((a, b) => (toDate(a.createdAt) || 0) - (toDate(b.createdAt) || 0));
}

/** মন্তব্যকারীর পরিচয় বিশ্বাসযোগ্য users/{uid} ডকুমেন্ট থেকে (নাম/ছবি ক্লায়েন্টের হাতে বানানো হয় না — rules মিলিয়ে দেখে) */
export async function loadCommenter(user) {
  try { return await loadCommunityAuthor(user); }
  catch (e) {
    if (e?.code === "blocked") throw new CommunityError("blocked", "আপনার মন্তব্য করার অ্যাক্সেস অ্যাডমিন সীমিত করেছেন।", false);
    throw e;
  }
}

/** নতুন মন্তব্য — একই batch-এ throttle-ডক লেখা হয় (rules-এ blogCommentThrottleOk: ২০ সেকেন্ড ব্যবধান)। শুরুর স্ট্যাটাস COMMENT_START_STATUS (ডিফল্ট: pending)। */
export async function createComment(pid, author, body) {
  const text = String(body || "").trim();
  const [lo, hi] = LIMITS.comment;
  if (text.length < lo) throw new CommunityError("validation", `মন্তব্য কমপক্ষে ${lo} অক্ষরের হতে হবে।`, false);
  if (text.length > hi) throw new CommunityError("validation", `মন্তব্য সর্বোচ্চ ${hi} অক্ষরের হতে পারে।`, false);
  const ref = doc(tvCol("blogPosts", pid, "comments"));
  const batch = writeBatch(db);
  batch.set(ref, { uid: author.uid, authorName: author.name, authorAvatar: author.avatarThumb || "", body: text, status: COMMENT_START_STATUS, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(tvDoc("blogCommentThrottle", author.uid), { lastAt: serverTimestamp() });
  try { await guarded(batch.commit()); }
  catch (e) {
    if (e?.code === "permission-denied") throw new CommunityError("denied", "মন্তব্য জমা হয়নি — ২০ সেকেন্ডের মধ্যে পরপর মন্তব্য করা যায় না; অথবা এই লেখায় মন্তব্য বন্ধ বা আপনার অ্যাকাউন্টে সীমাবদ্ধতা আছে।", false);
    throw e;
  }
  return { id: ref.id, status: COMMENT_START_STATUS, body: text };
}

/** নিজের মন্তব্য মুছা (soft-delete) — হার্ড-ডিলিট নেই */
export async function deleteOwnComment(pid, cid) {
  await guarded(updateDoc(tvDoc("blogPosts", pid, "comments", cid), { status: COMMENT_STATUS.DELETED, updatedAt: serverTimestamp() }));
}
