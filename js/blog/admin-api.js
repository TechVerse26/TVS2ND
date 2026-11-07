// js/blog/admin-api.js
// ব্লগের অ্যাডমিন-লেখার অপারেশন (শুধু admin.html-এ লোড হয়; পাবলিক পাতায় নয়)।
// আসল প্রহরী firestore.rules — এখানকার চেক শুধু ভালো ত্রুটি-বার্তার জন্য। নিয়ম-সারাংশ:
//   • পোস্ট তৈরি = একই batch-এ blogPosts/{id} + blogSlugs/{slug} ক্লেইম (স্লাগ-ইউনিকনেস rules নিজে বাধ্য করে)
//   • স্লাগ বদল = পুরোনো স্লাগ slugHistory-তে (রিডাইরেক্টের জন্য) + নতুন স্লাগের ক্লেইম; ১০টার বেশি হলে সবচেয়ে পুরোনোর ক্লেইম ছাড়া হয়
//   • প্রকাশ: publishedAt শুধু প্রথম প্রকাশে (সার্ভার-সময়); আনপাবলিশ/রিপাবলিশে আগের তারিখ থাকে
//   • মুছা: শুধু খসড়া (প্রকাশিত আগে আনপাবলিশ) — পোস্ট + স্লাগ-ক্লেইম, তারপর অনাথ মন্তব্য পরিষ্কার

import { db } from "../firebase-config.js";
import { tvCol, tvDoc } from "../tv-db.js";
import { loadAuthor, explain, CommunityError, toDate } from "../community/api.js";
import {
  doc, getDoc, getDocs, writeBatch, query, where, orderBy, limit, startAfter, serverTimestamp, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { guarded } from "./api.js";
import {
  LIMITS, STATUS, COMMENT_STATUS, SLUG_RE, CATEGORY_RE, isValidSlug, readingTimeMinutes, buildSearchTokens, normalizeTags, validatePostInput, slugify
} from "./model.js";

export { toDate, explain, CommunityError, slugify };

const fail = (code, msg) => new CommunityError(code, msg, false);
const toItem = (d) => ({ id: d.id, ...d.data(), _snap: d });

/* ============================================================ লেখা — পড়া */
/** অ্যাডমিন-তালিকা: সব স্ট্যাটাস, সর্বশেষ আপডেট আগে। status দিলে ফিল্টার (ইনডেক্স: status + updatedAt desc) */
export async function fetchAdminPosts({ status = "", cursor = null, size = 20 } = {}) {
  const parts = [];
  if (status) parts.push(where("status", "==", status));
  parts.push(orderBy("updatedAt", "desc"));
  if (cursor) parts.push(startAfter(cursor));
  parts.push(limit(size + 1));
  const snap = await guarded(getDocs(query(tvCol("blogPosts"), ...parts)));
  const docs = snap.docs.slice(0, size);
  return { items: docs.map(toItem), cursor: docs[docs.length - 1] || null, done: snap.docs.length <= size };
}
export async function fetchPostById(id) {
  const s = await guarded(getDoc(tvDoc("blogPosts", id)));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
/** স্লাগ কি ফাঁকা? (ক্লেইম-রেজিস্ট্রি দেখে — খসড়া ও পুরোনো স্লাগসহ সবকিছুর বিরুদ্ধে) */
export async function slugOwner(slug) {
  const s = await guarded(getDoc(tvDoc("blogSlugs", slug)));
  return s.exists() ? s.data().postId : null;
}

/* ============================================================ লেখা — তৈরি/এডিট */
/** ফর্মের মান (input) → সার্ভারে যাওয়া ক্ষেত্র; readingTime/searchTokens এখানে হিসাব হয় */
function derived(input) {
  const tags = normalizeTags(input.tags);
  return {
    title: String(input.title || "").trim(),
    excerpt: String(input.excerpt || "").trim(),
    content: String(input.content || "").replace(/\r\n?/g, "\n"),
    coverImage: String(input.coverImage || "").trim(),
    coverAlt: String(input.coverAlt || "").trim(),
    category: String(input.category || "").trim(),
    tags,
    language: input.language === "en" ? "en" : "bn",
    featured: input.featured === true,
    featuredOrder: Math.max(0, Math.min(9999, Math.round(Number(input.featuredOrder) || 0))),
    commentsOpen: input.commentsOpen !== false,
    seoTitle: String(input.seoTitle || "").trim(),
    seoDescription: String(input.seoDescription || "").trim(),
    readingTime: readingTimeMinutes(input.content),
    searchTokens: buildSearchTokens({ title: String(input.title || ""), tags })
  };
}
function assertValid(input) {
  const errs = validatePostInput({ ...input, slug: String(input.slug || "").trim() });
  const first = Object.values(errs)[0];
  if (first) throw fail("validation", first);
}

/** নতুন লেখা — লেখকের নাম/ছবি অ্যাডমিনের নিজের users/{uid} প্রোফাইল থেকে (rules মিলিয়ে দেখে; ক্লায়েন্টের মান ভরসা নয়) */
export async function createPost(user, input) {
  const slug = String(input.slug || "").trim();
  assertValid(input);
  const author = await loadAuthor(user);
  if ((await slugOwner(slug))) throw fail("slug-taken", "এই স্লাগ আগে থেকেই অন্য একটা লেখার (বা তার পুরোনো লিংকের) দখলে — অন্য স্লাগ বেছে নিন।");
  const status = input.status === STATUS.PUBLISHED ? STATUS.PUBLISHED : STATUS.DRAFT;
  const ref = doc(tvCol("blogPosts"));
  const d = derived(input);
  const data = {
    title: d.title, slug, slugHistory: [], excerpt: d.excerpt, content: d.content, contentFormat: "markdown", coverImage: d.coverImage, coverAlt: d.coverAlt,
    category: d.category, tags: d.tags, status, language: d.language,
    author: author.name, authorAvatar: author.avatarThumb || "", createdBy: user.uid, updatedBy: user.uid,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), publishedAt: status === STATUS.PUBLISHED ? serverTimestamp() : null,
    featured: d.featured, featuredOrder: d.featuredOrder, commentsOpen: d.commentsOpen, readingTime: d.readingTime,
    seoTitle: d.seoTitle, seoDescription: d.seoDescription, searchTokens: d.searchTokens
  };
  const batch = writeBatch(db);
  batch.set(ref, data);
  batch.set(tvDoc("blogSlugs", slug), { postId: ref.id, createdAt: serverTimestamp() });
  await commitPost(batch);
  return ref.id;
}

/** এডিট — শুধু বদলানো ক্ষেত্র লেখা হয় (rules diff-ভিত্তিক)। স্লাগ বদলালে history + ক্লেইম একই batch-এ। */
export async function updatePost(user, before, input, { status } = {}) {
  assertValid(input);
  const slug = String(input.slug || "").trim();
  const d = derived(input);
  const patch = {};
  for (const k of ["title", "excerpt", "content", "coverImage", "coverAlt", "category", "language", "featured", "featuredOrder", "commentsOpen", "seoTitle", "seoDescription", "readingTime"]) {
    if (d[k] !== before[k]) patch[k] = d[k];
  }
  if (JSON.stringify(d.tags) !== JSON.stringify(before.tags || [])) patch.tags = d.tags;
  if (patch.title !== undefined || patch.tags !== undefined) patch.searchTokens = d.searchTokens;
  const batch = writeBatch(db);
  const ref = tvDoc("blogPosts", before.id);

  if (slug !== before.slug) {
    const owner = await slugOwner(slug);
    if (owner && owner !== before.id) throw fail("slug-taken", "এই স্লাগ অন্য একটা লেখার (বা তার পুরোনো লিংকের) দখলে — অন্য স্লাগ বেছে নিন।");
    const hist = [...(before.slugHistory || []).filter((s) => s !== slug), before.slug];
    const dropped = hist.length > LIMITS.slugHistory ? hist.splice(0, hist.length - LIMITS.slugHistory) : [];
    patch.slug = slug; patch.slugHistory = hist;
    if (!owner) batch.set(tvDoc("blogSlugs", slug), { postId: before.id, createdAt: serverTimestamp() });
    for (const s of dropped) batch.delete(tvDoc("blogSlugs", s));      // ইতিহাস থেকে বাদ পড়া স্লাগের ক্লেইম ছাড়া (rules: পোস্ট আর ব্যবহার করে না)
  }
  const next = status || before.status;
  if (next !== before.status) {
    patch.status = next;
    if (next === STATUS.PUBLISHED && !before.publishedAt) patch.publishedAt = serverTimestamp();     // প্রথম প্রকাশে সার্ভার-সময়; পরে আগেরটাই থাকে
  }
  if (!Object.keys(patch).length) return false;                          // কিছু বদলায়নি
  patch.updatedBy = user.uid; patch.updatedAt = serverTimestamp();
  batch.update(ref, patch);
  await commitPost(batch);
  return true;
}

/** প্রকাশ / আনপাবলিশ (ফর্ম না খুলে তালিকা থেকে) */
export async function setPostStatus(user, post, publish) {
  const next = publish ? STATUS.PUBLISHED : STATUS.DRAFT;
  if (post.status === next) return;
  const patch = { status: next, updatedBy: user.uid, updatedAt: serverTimestamp() };
  if (publish && !post.publishedAt) patch.publishedAt = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(tvDoc("blogPosts", post.id), patch);
  await commitPost(batch);
}

async function commitPost(batch) {
  try { await guarded(batch.commit()); }
  catch (e) {
    if (e?.code === "permission-denied") throw fail("denied", "সংরক্ষণ হয়নি — অনুমতি/নিয়ম মেলেনি (যেমন: ক্যাটাগরি নেই/নিষ্ক্রিয়, স্লাগ অন্য কেউ নিয়ে নিয়েছে, বা আপনি অ্যাডমিন নন)। পেজ রিলোড করে আবার চেষ্টা করুন।");
    throw e;
  }
}

/** মুছা: শুধু খসড়া। ধাপ: (১) পোস্ট + স্লাগ-ক্লেইম, (২) অনাথ মন্তব্য (১০টা করে batch; rules: পোস্ট না থাকলে তবেই মুছতে দেয়) */
export async function deletePost(post) {
  if (post.status !== STATUS.DRAFT) throw fail("not-draft", "প্রকাশিত লেখা সরাসরি মোছা যায় না — আগে আনপাবলিশ করে খসড়া বানান।");
  const batch = writeBatch(db);
  batch.delete(tvDoc("blogPosts", post.id));
  for (const s of new Set([post.slug, ...(post.slugHistory || [])])) batch.delete(tvDoc("blogSlugs", s));
  await commitPost(batch);
  let left = 0;
  try {
    for (let i = 0; i < 100; i++) {                                      // ≤ ১০০০ মন্তব্য
      const snap = await guarded(getDocs(query(tvCol("blogPosts", post.id, "comments"), limit(10))));
      if (snap.empty) break;
      const b = writeBatch(db);
      snap.docs.forEach((c) => b.delete(c.ref));
      await guarded(b.commit());
    }
  } catch (_) { left = 1; }
  return { orphanCommentsLeft: left > 0 };
}

/* ============================================================ ক্যাটাগরি */
export async function fetchAllCategories() {
  const snap = await guarded(getDocs(query(tvCol("blogCategories"), orderBy("order", "asc"), limit(50))));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function addCategory({ name, slug, order }) {
  const id = String(slug || "").trim() || slugify(name);
  const nm = String(name || "").trim();
  if (!CATEGORY_RE.test(id)) throw fail("validation", "ক্যাটাগরি-স্লাগে শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও হাইফেন চলবে (১–৪০ অক্ষর)।");
  if (!nm || nm.length > 40) throw fail("validation", "ক্যাটাগরির নাম ১–৪০ অক্ষরের হতে হবে।");
  const exist = await guarded(getDoc(tvDoc("blogCategories", id)));
  if (exist.exists()) throw fail("slug-taken", "এই স্লাগের ক্যাটাগরি আগে থেকেই আছে।");       // নইলে set() নীরবে 'আপডেট' হয়ে যেত
  const b = writeBatch(db);
  b.set(tvDoc("blogCategories", id), { name: nm, order: Number(order) || 0, active: true, createdAt: serverTimestamp() });
  await guarded(b.commit());
  return id;
}
export async function updateCategory(id, patch) {
  const clean = {};
  if (patch.name !== undefined) { const n = String(patch.name).trim(); if (!n || n.length > 40) throw fail("validation", "ক্যাটাগরির নাম ১–৪০ অক্ষরের হতে হবে।"); clean.name = n; }
  if (patch.order !== undefined) clean.order = Number(patch.order) || 0;
  if (patch.active !== undefined) clean.active = !!patch.active;
  const b = writeBatch(db);
  b.update(tvDoc("blogCategories", id), clean);
  await guarded(b.commit());
}
/** এই ক্যাটাগরির কতগুলো লেখা আছে (যেকোনো স্ট্যাটাস) */
export async function countPostsIn(categoryId) {
  const r = await guarded(getCountFromServer(query(tvCol("blogPosts"), where("category", "==", categoryId))));
  return r.data().count;
}
/** নিরাপদ মুছা: নির্ভরশীল লেখা থাকলে মোছা যায় না (rules নিজে নির্ভরশীলতা দেখতে পারে না — তাই UI এই চেক করে + rules শুধু নিষ্ক্রিয় ক্যাটাগরি মুছতে দেয়) */
export async function deleteCategory(id) {
  const n = await countPostsIn(id);
  if (n > 0) throw Object.assign(fail("in-use", `এই ক্যাটাগরিতে ${n}টা লেখা আছে — আগে সেগুলো অন্য ক্যাটাগরিতে সরান।`), { count: n });
  const cur = await guarded(getDoc(tvDoc("blogCategories", id)));
  if (!cur.exists()) return;
  if (cur.data().active !== false) {                                   // rules: মুছতে হলে আগে নিষ্ক্রিয় হতে হয়
    const b = writeBatch(db);
    b.update(tvDoc("blogCategories", id), { active: false });
    await guarded(b.commit());
  }
  const b2 = writeBatch(db);
  b2.delete(tvDoc("blogCategories", id));
  await guarded(b2.commit());
}
/** সব লেখা from → to ক্যাটাগরিতে সরানো (৮টা করে batch — rules-এর প্রতি-batch ডকুমেন্ট-অ্যাক্সেস সীমার ভেতরে)। onProgress(done,total) */
export async function reassignCategory(user, from, to, onProgress) {
  if (from === to) throw fail("validation", "একই ক্যাটাগরিতে সরানো যায় না।");
  const target = await guarded(getDoc(tvDoc("blogCategories", to)));
  if (!target.exists() || target.data().active === false) throw fail("validation", "গন্তব্য ক্যাটাগরি নেই বা নিষ্ক্রিয়।");
  const total = await countPostsIn(from);
  let done = 0;
  for (let guard = 0; guard < 500; guard++) {
    const snap = await guarded(getDocs(query(tvCol("blogPosts"), where("category", "==", from), limit(8))));
    if (snap.empty) break;
    const b = writeBatch(db);
    snap.docs.forEach((d) => b.update(d.ref, { category: to, updatedBy: user.uid, updatedAt: serverTimestamp() }));
    await commitPost(b);
    done += snap.size; onProgress?.(done, total);
  }
  return done;
}

/* ============================================================ মন্তব্য-মডারেশন */
/** সাম্প্রতিক লেখাগুলো + প্রতিটায় অপেক্ষমাণ মন্তব্যের সংখ্যা (aggregate count; ৩০টা লেখা, ৫টা করে সমান্তরালে) */
export async function postsWithPending(max = 30) {
  const snap = await guarded(getDocs(query(tvCol("blogPosts"), orderBy("updatedAt", "desc"), limit(max))));
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data(), pending: 0 }));
  let i = 0;
  const worker = async () => {
    while (i < posts.length) {
      const p = posts[i++];
      try { p.pending = (await guarded(getCountFromServer(query(tvCol("blogPosts", p.id, "comments"), where("status", "==", COMMENT_STATUS.PENDING))))).data().count; }
      catch (_) { p.pending = null; }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  return posts.sort((a, b) => (b.pending || 0) - (a.pending || 0) || (toDate(b.updatedAt) || 0) - (toDate(a.updatedAt) || 0));
}
/** একটা লেখার মন্তব্য — status দিলে ফিল্টার (পুরোনো আগে: ইনডেক্স status+createdAt asc), না দিলে সব (নতুন আগে) */
export async function fetchPostComments(pid, { status = "", cursor = null, size = 20 } = {}) {
  const parts = [];
  if (status) parts.push(where("status", "==", status), orderBy("createdAt", "asc"));
  else parts.push(orderBy("createdAt", "desc"));
  if (cursor) parts.push(startAfter(cursor));
  parts.push(limit(size + 1));
  const snap = await guarded(getDocs(query(tvCol("blogPosts", pid, "comments"), ...parts)));
  const docs = snap.docs.slice(0, size);
  return { items: docs.map(toItem), cursor: docs[docs.length - 1] || null, done: snap.docs.length <= size };
}
export async function moderateComment(user, pid, cid, status) {
  if (!Object.values(COMMENT_STATUS).includes(status)) throw fail("validation", "অবৈধ স্ট্যাটাস।");
  const b = writeBatch(db);
  b.update(tvDoc("blogPosts", pid, "comments", cid), { status, updatedAt: serverTimestamp(), moderatedBy: user.uid, moderatedAt: serverTimestamp() });
  await guarded(b.commit());
}

/* ============================================================ কভার-ছবি আপলোড (Firebase Storage — ঐচ্ছিক; ডিপ্লয়-নোট: storage.rules) */
export const COVER_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const COVER_MAX = 2 * 1024 * 1024;

/** বড় ছবি আপলোডের আগে ক্যানভাসে ছোট (≤১৬০০px, WebP) — ২ MB সীমার ভেতরে আনে; GIF/SVG নয় */
export async function prepareCover(file) {
  if (!COVER_TYPES.includes(file.type)) throw fail("validation", "শুধু JPG, PNG বা WebP ছবি চলবে।");
  if (file.size <= COVER_MAX && file.size < 700 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const blob = await new Promise((res) => c.toBlob(res, "image/webp", 0.85));
    if (blob && blob.size < file.size) return new File([blob], "cover.webp", { type: "image/webp" });
  } catch (_) { /* আসল ফাইলই */ }
  return file;
}
/** Storage-এ blog/covers/{unique}.{ext} — rules: শুধু অ্যাডমিন, jpeg/png/webp, ≤২ MB। রিটার্ন: ডাউনলোড URL (পাবলিক ছবি) */
export async function uploadCover(file, onProgress) {
  const f = await prepareCover(file);
  if (f.size > COVER_MAX) throw fail("validation", "ছবি ২ MB-এর বেশি — ছোট ছবি বেছে নিন।");
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[f.type];
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  let st;
  try {
    const [{ app }, storage] = await Promise.all([import("../firebase-config.js"), import("https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js")]);
    st = { app, ...storage };
  } catch (_) { throw fail("storage-unavailable", "আপলোড-সার্ভিস লোড হয়নি — ইন্টারনেট দেখুন, অথবা ছবির লিংক পেস্ট করুন।"); }
  const ref = st.ref(st.getStorage(st.app), `blog/covers/${name}`);
  try {
    await new Promise((res, rej) => {
      const task = st.uploadBytesResumable(ref, f, { contentType: f.type, cacheControl: "public,max-age=31536000,immutable" });
      task.on("state_changed", (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), rej, res);
    });
    return await st.getDownloadURL(ref);
  } catch (e) {
    const c = e?.code || "";
    if (c === "storage/unauthorized") throw fail("denied", "আপলোডের অনুমতি নেই — storage.rules ডিপ্লয় হয়েছে কি? (অ্যাডমিন অ্যাকাউন্টে isAdmin == true লাগে)। আপাতত ছবির লিংক পেস্ট করুন।");
    if (/bucket-not-found|project-not-found|unknown|no-default-bucket/.test(c) || e?.status_ === 404) throw fail("storage-unavailable", "Firebase Storage এখনো চালু করা হয়নি — Console → Storage → Get started। আপাতত ছবির লিংক পেস্ট করুন।");
    if (c === "storage/retry-limit-exceeded" || c === "storage/canceled") throw new CommunityError("offline", "আপলোড সম্পূর্ণ হয়নি — সংযোগ দেখে আবার চেষ্টা করুন।");
    throw e;
  }
}
