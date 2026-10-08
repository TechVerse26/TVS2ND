// tests/scenarios.mjs — Firestore Security Rules টেস্ট-সিনারিও (ডেটা-ড্রিভেন)
// একই তালিকা দুই জায়গায় চলে: (১) tests/firestore.rules.test.mjs — অফিশিয়াল Firebase Emulator-এ,
// (২) অফলাইন যাচাইয়ের জন্য একটা ছোট rules-interpreter-এ। ok: true = অনুমোদিত হওয়া উচিত, false = বাতিল হওয়া উচিত।
//
// ডেটা-মার্কার: {$:'server'} = serverTimestamp(), {$:'inc',n}, {$:'union',v:[..]}, {$:'remove',v:[..]},
//              {$:'ts',ms} = নির্দিষ্ট Timestamp (জাল টাইমস্ট্যাম্প টেস্ট)

const P = "tvProject/main/";
const S = { $: "server" };
const ts = (ms) => ({ $: "ts", ms });
const OLD = ts(1_000_000_000_000);
const base = ts(1_700_000_000_000);
const inc = (n) => ({ $: "inc", n });
const union = (...v) => ({ $: "union", v });
const remove = (...v) => ({ $: "remove", v });
const omit = (o, ...ks) => Object.fromEntries(Object.entries(o).filter(([k]) => !ks.includes(k)));
const rep = (ch, n) => ch.repeat(n);

/* ---------------------------------------------------------------- সিড ডেটা */
const disc = (o) => ({ uid: "u2", authorName: "Karim", authorAvatar: "", title: "Seed title", body: "Seed body text", category: "general", status: "active", createdAt: base, updatedAt: base, editedAt: null, likedBy: [], likeCount: 0, replyCount: 0, ...o });
const rply = (o) => ({ uid: "u2", authorName: "Karim", authorAvatar: "", body: "seed reply", status: "active", createdAt: base, updatedAt: base, editedAt: null, likedBy: [], likeCount: 0, ...o });
const user = (n, o = {}) => ({ name: n, email: `${n}@x.com`, isAdmin: false, phone: "", createdAt: base, ...o });

export const SEED = {
  [P + "users/u1"]: user("Rahim"),
  [P + "users/u2"]: user("Karim"),
  [P + "users/ua"]: user("Admin", { isAdmin: true }),
  [P + "users/ub"]: user("Blocked", { communityBlocked: true }),
  // 'unp' = লগইন করা কিন্তু প্রোফাইল ডকুমেন্ট নেই
  [P + "categories/general"]: { name: "General", order: 1, active: true, createdAt: base },
  [P + "categories/firebase"]: { name: "Firebase", order: 2, active: true, createdAt: base },
  [P + "categories/old"]: { name: "Old", order: 3, active: false, createdAt: base },
  [P + "discussions/d1"]: disc({ uid: "u1", authorName: "Rahim", title: "Hello world", replyCount: 2 }),
  [P + "discussions/d2"]: disc({ likedBy: ["u2"], likeCount: 1 }),
  [P + "discussions/d3"]: disc({ likedBy: ["u1"], likeCount: 1 }),
  [P + "discussions/d4"]: disc({ likedBy: ["u1", "u2"], likeCount: 2 }),
  [P + "discussions/dh"]: disc({ status: "hidden" }),
  [P + "discussions/dd"]: disc({ uid: "u1", authorName: "Rahim", status: "deleted" }),
  [P + "discussions/db"]: disc({ uid: "ub", authorName: "Blocked" }),
  [P + "discussions/d1/replies/r1"]: rply({}),
  [P + "discussions/d1/replies/r2"]: rply({ uid: "u1", authorName: "Rahim", status: "hidden" }),
  [P + "discussions/d1/replies/r3"]: rply({ uid: "u1", authorName: "Rahim" }),
  [P + "discussions/dh/replies/rh1"]: rply({}),
  [P + "reports/u2_discussion_d1"]: { reporterUid: "u2", targetType: "discussion", targetId: "d1", discussionId: "d1", reason: "spam", status: "open", createdAt: base },
  [P + "reports/u1_discussion_d3"]: { reporterUid: "u1", targetType: "discussion", targetId: "d3", discussionId: "d3", reason: "abuse", status: "open", createdAt: base },
  [P + "bookings/b1"]: { service: "Web", name: "Rahim", email: "u1@x.com", uid: "u1", status: "নতুন", createdAt: base },
  [P + "bookings/b2"]: { service: "Web", name: "Guest", email: "g@x.com", uid: null, status: "নতুন", createdAt: base },
  [P + "settings/site"]: { heroTitle: "x" },
  [P + "services/s1"]: { title: "S", order: 1 }
};

/* ---------------------------------------------------------------- ডেটা-বিল্ডার */
const newDisc = (o = {}) => ({ uid: "u1", authorName: "Rahim", authorAvatar: "", title: "New question", body: "Body text here", category: "firebase", status: "active", createdAt: S, updatedAt: S, editedAt: null, likedBy: [], likeCount: 0, replyCount: 0, ...o });
const newReply = (o = {}) => ({ uid: "u1", authorName: "Rahim", authorAvatar: "", body: "My reply", status: "active", createdAt: S, updatedAt: S, editedAt: null, likedBy: [], likeCount: 0, ...o });
const replyBatch = (did, rid, over = {}, parent = { replyCount: inc(1), replySyncId: rid }) => ({
  op: "batch", ops: [{ op: "create", path: `${P}discussions/${did}/replies/${rid}`, data: newReply(over) }, { op: "update", path: `${P}discussions/${did}`, data: parent }]
});
const delReplyBatch = (rid, parent = { replyCount: inc(-1), replySyncId: rid }, rdata = { status: "deleted", updatedAt: S }) => ({
  op: "batch", ops: [{ op: "update", path: `${P}discussions/d1/replies/${rid}`, data: rdata }, ...(parent ? [{ op: "update", path: `${P}discussions/d1`, data: parent }] : [])]
});
const mod = (o = {}) => ({ status: "hidden", updatedAt: S, moderatedBy: "ua", moderatedAt: S, ...o });
const rep1 = (id, o = {}) => ({ reporterUid: "u1", targetType: "discussion", targetId: id, discussionId: id, reason: "spam", status: "open", createdAt: S, ...o });
const booking = (o = {}) => ({ service: "Web App", name: "Guest User", email: "guest@example.com", phone: "01700000000", budget: "50k", timeline: "1 month", details: "details", uid: null, status: "নতুন", createdAt: S, ...o });
const newProfile = (o = {}) => ({ name: "New", email: "n@x.com", isAdmin: false, phone: "", createdAt: S, ...o });

const T = (group, name, as, op, ok) => ({ group, name, as, ...op, ok });
const get = (path) => ({ op: "get", path: P + path });
const list = (path, where = {}, limit = 20) => ({ op: "list", path: P + path, where, limit });
const create = (path, data) => ({ op: "create", path: P + path, data });
const update = (path, data) => ({ op: "update", path: P + path, data });
const set = (path, data) => ({ op: "set", path: P + path, data });
const del = (path) => ({ op: "delete", path: P + path });

export const scenarios = [
  /* ============================ ১) লগইন-ছাড়া (anonymous) ============================ */
  T("anon", "can read an active discussion", null, get("discussions/d1"), true),
  T("anon", "cannot read a hidden discussion", null, get("discussions/dh"), false),
  T("anon", "cannot read a deleted discussion", null, get("discussions/dd"), false),
  T("anon", "can list active feed with limit(20)", null, list("discussions", { status: "active" }, 20), true),
  T("anon", "can list active feed by category", null, list("discussions", { status: "active", category: "firebase" }, 20), true),
  T("anon", "limit(50) is the allowed maximum", null, list("discussions", { status: "active" }, 50), true),
  T("anon", "cannot list without status filter (would expose hidden/deleted)", null, list("discussions", {}, 20), false),
  T("anon", "cannot list without limit (no unbounded dump)", null, list("discussions", { status: "active" }, null), false),
  T("anon", "cannot list with limit(51)", null, list("discussions", { status: "active" }, 51), false),
  T("anon", "can list replies of an active discussion", null, list("discussions/d1/replies", { status: "active" }, 30), true),
  T("anon", "cannot list replies of a hidden discussion", null, list("discussions/dh/replies", { status: "active" }, 30), false),
  T("anon", "cannot read a reply under a hidden discussion", null, get("discussions/dh/replies/rh1"), false),
  T("anon", "cannot read a hidden reply", null, get("discussions/d1/replies/r2"), false),
  T("anon", "cannot create a discussion", null, create("discussions/x1", newDisc()), false),
  T("anon", "cannot create a reply", null, replyBatch("d1", "rx1"), false),
  T("anon", "cannot like (arrayUnion) a discussion", null, update("discussions/d2", { likedBy: union("u1"), likeCount: inc(1) }), false),
  T("anon", "cannot create a report", null, create("reports/u1_discussion_d2", rep1("d2")), false),
  T("anon", "cannot read a user profile", null, get("users/u1"), false),
  T("anon", "cannot list users", null, list("users", {}, 20), false),
  T("anon", "can read settings/site", null, get("settings/site"), true),
  T("anon", "cannot read any other settings doc", null, get("settings/payment"), false),
  T("anon", "can read site content (services)", null, get("services/s1"), true),
  T("anon", "cannot write site content", null, update("services/s1", { title: "hack" }), false),
  T("anon", "can read categories", null, list("categories", {}, 50), true),
  T("anon", "cannot create a category", null, create("categories/spam", { name: "Spam", order: 1, active: true, createdAt: S }), false),
  T("anon", "can submit a valid booking request", null, create("bookings/nb1", booking()), true),
  T("anon", "cannot read bookings", null, get("bookings/b1"), false),
  T("anon", "cannot list bookings", null, list("bookings", {}, 20), false),
  T("anon", "cannot update a booking", null, update("bookings/b1", { status: "সম্পন্ন" }), false),
  T("anon", "default-deny: unknown root collection write (counters)", null, { op: "create", path: "counters/c1", data: { n: 1 } }, false),
  T("anon", "default-deny: legacy root users doc", null, { op: "get", path: "users/u1" }, false),
  T("anon", "default-deny: other app's courses", null, { op: "get", path: "courses/c1" }, false),
  T("anon", "default-deny: unknown collection inside namespace", null, create("admins/x", { a: 1 }), false),
  T("anon", "default-deny: other namespace", null, { op: "get", path: "tvProject/other/users/u1" }, false),

  /* ============================ ২) সাধারণ ইউজার — প্রোফাইল ============================ */
  T("profile", "create own profile (isAdmin=false, server createdAt)", "unew", create("users/unew", newProfile()), true),
  T("profile", "create profile with isAdmin=true is denied", "unew", create("users/unew", newProfile({ isAdmin: true })), false),
  T("profile", "create profile with extra role field is denied", "unew", create("users/unew", newProfile({ role: "admin" })), false),
  T("profile", "create profile for another uid is denied", "unew", create("users/ux", newProfile()), false),
  T("profile", "create profile with forged createdAt is denied", "unew", create("users/unew", newProfile({ createdAt: OLD })), false),
  T("profile", "create profile with communityBlocked field is denied", "unew", create("users/unew", newProfile({ communityBlocked: false })), false),
  T("profile", "update own name", "u1", update("users/u1", { name: "Rahim R" }), true),
  T("profile", "update own bio (500 chars ok)", "u1", update("users/u1", { bio: rep("a", 500) }), true),
  T("profile", "update own bio (501 chars denied)", "u1", update("users/u1", { bio: rep("a", 501) }), false),
  T("profile", "update own isAdmin → privilege escalation denied", "u1", update("users/u1", { isAdmin: true }), false),
  T("profile", "replace own doc via set with isAdmin=true denied", "u1", set("users/u1", { ...user("Rahim"), isAdmin: true, createdAt: base }), false),
  T("profile", "update own communityBlocked denied", "u1", update("users/u1", { communityBlocked: false }), false),
  T("profile", "blocked user cannot unblock self", "ub", update("users/ub", { communityBlocked: false }), false),
  T("profile", "update own email denied", "u1", update("users/u1", { email: "evil@x.com" }), false),
  T("profile", "update own createdAt denied", "u1", update("users/u1", { createdAt: S }), false),
  T("profile", "avatarThumb: external URL denied", "u1", update("users/u1", { avatarThumb: "https://evil.example/pixel.png" }), false),
  T("profile", "avatarThumb: javascript: URL denied", "u1", update("users/u1", { avatarThumb: "javascript:alert(1)" }), false),
  T("profile", "avatarThumb: Google avatar URL allowed", "u1", update("users/u1", { avatarThumb: "https://lh3.googleusercontent.com/a/abc123" }), true),
  T("profile", "avatarThumb: small jpeg data URL allowed", "u1", update("users/u1", { avatarThumb: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" }), true),
  T("profile", "avatarThumb: oversized denied", "u1", update("users/u1", { avatarThumb: "data:image/jpeg;base64," + rep("A", 12000) }), false),
  T("profile", "read own profile", "u1", get("users/u1"), true),
  T("profile", "cannot read another user's profile", "u1", get("users/u2"), false),
  T("profile", "cannot update another user's profile", "u1", update("users/u2", { name: "Hacked" }), false),
  T("profile", "cannot list users", "u1", list("users", {}, 20), false),
  T("profile", "cannot delete own profile", "u1", del("users/u1"), false),

  /* ============================ ৩) আলোচনা তৈরি ============================ */
  T("create", "valid discussion", "u1", create("discussions/n1", newDisc()), true),
  T("create", "uid spoofing denied", "u1", create("discussions/n1", newDisc({ uid: "u2" })), false),
  T("create", "authorName spoofing denied", "u1", create("discussions/n1", newDisc({ authorName: "Admin" })), false),
  T("create", "authorAvatar spoofing denied", "u1", create("discussions/n1", newDisc({ authorAvatar: "data:image/jpeg;base64,AAAA" })), false),
  T("create", "inactive category denied", "u1", create("discussions/n1", newDisc({ category: "old" })), false),
  T("create", "unknown category denied", "u1", create("discussions/n1", newDisc({ category: "nope" })), false),
  T("create", "category with path separator denied", "u1", create("discussions/n1", newDisc({ category: "a/b" })), false),
  T("create", "title 2 chars denied", "u1", create("discussions/n1", newDisc({ title: "ab" })), false),
  T("create", "title 120 chars ok", "u1", create("discussions/n1", newDisc({ title: rep("a", 120) })), true),
  T("create", "title 121 chars denied", "u1", create("discussions/n1", newDisc({ title: rep("a", 121) })), false),
  T("create", "body 2 chars denied", "u1", create("discussions/n1", newDisc({ body: "ab" })), false),
  T("create", "body 5000 chars ok", "u1", create("discussions/n1", newDisc({ body: rep("a", 5000) })), true),
  T("create", "body 5001 chars denied", "u1", create("discussions/n1", newDisc({ body: rep("a", 5001) })), false),
  T("create", "non-string title denied", "u1", create("discussions/n1", newDisc({ title: 12345 })), false),
  T("create", "status=hidden on create denied", "u1", create("discussions/n1", newDisc({ status: "hidden" })), false),
  T("create", "fake likeCount denied", "u1", create("discussions/n1", newDisc({ likeCount: 5 })), false),
  T("create", "pre-filled likedBy denied", "u1", create("discussions/n1", newDisc({ likedBy: ["u1"], likeCount: 1 })), false),
  T("create", "fake replyCount denied", "u1", create("discussions/n1", newDisc({ replyCount: 3 })), false),
  T("create", "forged createdAt denied", "u1", create("discussions/n1", newDisc({ createdAt: OLD })), false),
  T("create", "forged updatedAt denied", "u1", create("discussions/n1", newDisc({ updatedAt: OLD })), false),
  T("create", "missing createdAt denied", "u1", create("discussions/n1", omit(newDisc(), "createdAt")), false),
  T("create", "editedAt must be null on create", "u1", create("discussions/n1", newDisc({ editedAt: S })), false),
  T("create", "extra field (isPinned) denied", "u1", create("discussions/n1", newDisc({ isPinned: true })), false),
  T("create", "community-blocked user denied", "ub", create("discussions/n1", newDisc({ uid: "ub", authorName: "Blocked" })), false),
  T("create", "signed-in user without profile doc denied", "unp", create("discussions/n1", newDisc({ uid: "unp", authorName: "" })), false),

  /* ============================ ৪) আলোচনা এডিট / ডিলিট ============================ */
  T("edit", "owner edits title/body (+editedAt, updatedAt)", "u1", update("discussions/d1", { title: "Edited title", body: "Edited body text", editedAt: S, updatedAt: S }), true),
  T("edit", "edit without editedAt denied", "u1", update("discussions/d1", { title: "Edited title", updatedAt: S }), false),
  T("edit", "edit with forged editedAt denied", "u1", update("discussions/d1", { title: "Edited title", editedAt: OLD, updatedAt: S }), false),
  T("edit", "edit + change uid denied", "u1", update("discussions/d1", { title: "Edited title", editedAt: S, updatedAt: S, uid: "u2" }), false),
  T("edit", "edit + change category denied", "u1", update("discussions/d1", { title: "Edited title", editedAt: S, updatedAt: S, category: "firebase" }), false),
  T("edit", "edit + fake likeCount denied", "u1", update("discussions/d1", { title: "Edited title", editedAt: S, updatedAt: S, likeCount: 99 }), false),
  T("edit", "edit + fake replyCount denied", "u1", update("discussions/d1", { title: "Edited title", editedAt: S, updatedAt: S, replyCount: 99 }), false),
  T("edit", "edit + change status denied", "u1", update("discussions/d1", { title: "Edited title", editedAt: S, updatedAt: S, status: "deleted" }), false),
  T("edit", "edit + change authorName denied", "u1", update("discussions/d1", { title: "Edited title", editedAt: S, updatedAt: S, authorName: "Admin" }), false),
  T("edit", "edit + change createdAt denied", "u1", update("discussions/d1", { title: "Edited title", editedAt: S, updatedAt: S, createdAt: S }), false),
  T("edit", "edit + inject moderation fields denied", "u1", update("discussions/d1", { title: "Edited title", editedAt: S, updatedAt: S, moderatedBy: "ua" }), false),
  T("edit", "edit title too short denied", "u1", update("discussions/d1", { title: "ab", editedAt: S, updatedAt: S }), false),
  T("edit", "owner soft-deletes own post", "u1", update("discussions/d1", { status: "deleted", updatedAt: S }), true),
  T("edit", "soft-delete + title change denied", "u1", update("discussions/d1", { status: "deleted", updatedAt: S, title: "sneaky" }), false),
  T("edit", "owner cannot un-delete (status→active)", "u1", update("discussions/dd", { status: "active", updatedAt: S }), false),
  T("edit", "owner cannot edit a deleted post", "u1", update("discussions/dd", { title: "Edited title", editedAt: S, updatedAt: S }), false),
  T("edit", "another user cannot edit post", "u1", update("discussions/d2", { title: "Hijack title", editedAt: S, updatedAt: S }), false),
  T("edit", "another user cannot delete post", "u1", update("discussions/d2", { status: "deleted", updatedAt: S }), false),
  T("edit", "hard delete own post denied", "u1", del("discussions/d1"), false),
  T("edit", "blocked user cannot edit own post", "ub", update("discussions/db", { title: "Edited title", editedAt: S, updatedAt: S }), false),
  T("edit", "blocked user can still delete own post", "ub", update("discussions/db", { status: "deleted", updatedAt: S }), true),

  /* ============================ ৫) লাইক ============================ */
  T("like", "like a discussion", "u1", update("discussions/d2", { likedBy: union("u1"), likeCount: inc(1) }), true),
  T("like", "like with mismatching explicit count denied", "u1", update("discussions/d2", { likedBy: ["u2", "u1"], likeCount: 5 }), false),
  T("like", "adding someone else's uid denied", "u1", update("discussions/d2", { likedBy: union("u9"), likeCount: inc(1) }), false),
  T("like", "adding two uids at once denied", "u1", update("discussions/d2", { likedBy: union("u1", "u9"), likeCount: inc(2) }), false),
  T("like", "removing another user's like denied", "u1", update("discussions/d2", { likedBy: remove("u2"), likeCount: inc(-1) }), false),
  T("like", "replacing the whole likedBy list denied", "u1", update("discussions/d2", { likedBy: ["u1"], likeCount: 1 }), false),
  T("like", "duplicate like denied", "u1", update("discussions/d3", { likedBy: union("u1"), likeCount: inc(1) }), false),
  T("like", "swapping another user's like for a forged uid (size stays +1) denied", "u1", update("discussions/d2", { likedBy: ["u1", "u9"], likeCount: 2 }), false),
  T("like", "unlike that also replaces others' likes with a forged uid denied", "u1", update("discussions/d4", { likedBy: ["u9"], likeCount: 1 }), false),
  T("like", "no-op like update denied", "u1", update("discussions/d3", { likedBy: ["u1"], likeCount: 1 }), false),
  T("like", "unlike own like", "u1", update("discussions/d3", { likedBy: remove("u1"), likeCount: inc(-1) }), true),
  T("like", "like on hidden discussion denied", "u1", update("discussions/dh", { likedBy: union("u1"), likeCount: inc(1) }), false),
  T("like", "like + change title denied", "u1", update("discussions/d2", { likedBy: union("u1"), likeCount: inc(1), title: "Hijack title" }), false),
  T("like", "blocked user cannot like", "ub", update("discussions/d2", { likedBy: union("ub"), likeCount: inc(1) }), false),
  T("like", "like a reply", "u1", update("discussions/d1/replies/r1", { likedBy: union("u1"), likeCount: inc(1) }), true),
  T("like", "fake reply like count denied", "u1", update("discussions/d1/replies/r1", { likedBy: union("u1"), likeCount: inc(7) }), false),
  T("like", "like a hidden reply denied", "u1", update("discussions/d1/replies/r2", { likedBy: union("u1"), likeCount: inc(1) }), false),
  T("like", "like a reply under hidden discussion denied", "u1", update("discussions/dh/replies/rh1", { likedBy: union("u1"), likeCount: inc(1) }), false),

  /* ============================ ৬) রিপ্লাই ============================ */
  T("reply", "create reply + parent replyCount+1 (batch)", "u1", replyBatch("d1", "rn1"), true),
  T("reply", "create reply without parent update denied", "u1", create("discussions/d1/replies/rn1", newReply()), false),
  T("reply", "parent count +2 for one reply denied", "u1", replyBatch("d1", "rn1", {}, { replyCount: inc(2), replySyncId: "rn1" }), false),
  T("reply", "replySyncId not matching new reply denied", "u1", replyBatch("d1", "rn1", {}, { replyCount: inc(1), replySyncId: "other" }), false),
  T("reply", "fake replyCount bump alone (no reply) denied", "u1", update("discussions/d1", { replyCount: inc(1), replySyncId: "fake" }), false),
  T("reply", "fake replyCount decrement alone denied", "u1", update("discussions/d1", { replyCount: inc(-1), replySyncId: "r1" }), false),
  T("reply", "replyCount set to huge value denied", "u1", update("discussions/d1", { replyCount: 9999, replySyncId: "r1" }), false),
  T("reply", "reply uid spoofing denied", "u1", replyBatch("d1", "rn1", { uid: "u2" }), false),
  T("reply", "reply authorName spoofing denied", "u1", replyBatch("d1", "rn1", { authorName: "Admin" }), false),
  T("reply", "reply authorAvatar spoofing denied", "u1", replyBatch("d1", "rn1", { authorAvatar: "data:image/jpeg;base64,AAAA" }), false),
  T("reply", "empty body denied", "u1", replyBatch("d1", "rn1", { body: "" }), false),
  T("reply", "body 2000 ok", "u1", replyBatch("d1", "rn1", { body: rep("a", 2000) }), true),
  T("reply", "body 2001 denied", "u1", replyBatch("d1", "rn1", { body: rep("a", 2001) }), false),
  T("reply", "status=hidden on create denied", "u1", replyBatch("d1", "rn1", { status: "hidden" }), false),
  T("reply", "fake likeCount on create denied", "u1", replyBatch("d1", "rn1", { likeCount: 1 }), false),
  T("reply", "forged createdAt denied", "u1", replyBatch("d1", "rn1", { createdAt: OLD }), false),
  T("reply", "editedAt must be null on create", "u1", replyBatch("d1", "rn1", { editedAt: S }), false),
  T("reply", "extra field denied", "u1", replyBatch("d1", "rn1", { isPinned: true }), false),
  T("reply", "valid replyTo (id + matching name)", "u1", replyBatch("d1", "rn1", { replyToId: "r1", replyToName: "Karim" }), true),
  T("reply", "replyToName not matching target author denied", "u1", replyBatch("d1", "rn1", { replyToId: "r1", replyToName: "Bob" }), false),
  T("reply", "replyTo non-existent reply denied", "u1", replyBatch("d1", "rn1", { replyToId: "zzz", replyToName: "Karim" }), false),
  T("reply", "replyTo with path separator denied", "u1", replyBatch("d1", "rn1", { replyToId: "a/b", replyToName: "Karim" }), false),
  T("reply", "reply to a hidden discussion denied", "u1", replyBatch("dh", "rn1", {}), false),
  T("reply", "status-flip trick: un-hide parent and reply in one batch (non-admin) denied", "u1", { op: "batch", ops: [
    { op: "create", path: P + "discussions/dh/replies/rn1", data: newReply() },
    { op: "update", path: P + "discussions/dh", data: { status: "active", replyCount: inc(1), replySyncId: "rn1" } }] }, false),
  T("reply", "blocked user cannot reply", "ub", replyBatch("d1", "rn1", { uid: "ub", authorName: "Blocked" }), false),
  T("reply", "owner edits own reply", "u1", update("discussions/d1/replies/r3", { body: "edited reply", editedAt: S, updatedAt: S }), true),
  T("reply", "edit without editedAt denied", "u1", update("discussions/d1/replies/r3", { body: "edited reply", updatedAt: S }), false),
  T("reply", "cannot edit another user's reply", "u1", update("discussions/d1/replies/r1", { body: "hijack", editedAt: S, updatedAt: S }), false),
  T("reply", "cannot edit own hidden reply", "u1", update("discussions/d1/replies/r2", { body: "edited reply", editedAt: S, updatedAt: S }), false),
  T("reply", "edit + change uid denied", "u1", update("discussions/d1/replies/r3", { body: "edited reply", editedAt: S, updatedAt: S, uid: "u2" }), false),
  T("reply", "edit + change status denied", "u1", update("discussions/d1/replies/r3", { body: "edited reply", editedAt: S, updatedAt: S, status: "deleted" }), false),
  T("reply", "owner soft-deletes own reply (+ parent count −1)", "u1", delReplyBatch("r3"), true),
  T("reply", "soft-delete without parent decrement denied", "u1", delReplyBatch("r3", null), false),
  T("reply", "soft-delete with wrong parent delta denied", "u1", delReplyBatch("r3", { replyCount: inc(-2), replySyncId: "r3" }), false),
  T("reply", "cannot delete another user's reply (even with proper batch)", "u1", delReplyBatch("r1"), false),
  T("reply", "owner cannot restore own hidden reply", "u1", { op: "batch", ops: [{ op: "update", path: P + "discussions/d1/replies/r2", data: { status: "active", updatedAt: S } }, { op: "update", path: P + "discussions/d1", data: { replyCount: inc(1), replySyncId: "r2" } }] }, false),
  T("reply", "hard delete reply denied", "u1", del("discussions/d1/replies/r3"), false),

  /* ============================ ৭) রিপোর্ট ============================ */
  T("report", "valid discussion report (deterministic id)", "u1", create("reports/u1_discussion_d2", rep1("d2")), true),
  T("report", "valid reply report", "u1", create("reports/u1_reply_r1", rep1("r1", { targetType: "reply", discussionId: "d1" })), true),
  T("report", "random document id denied", "u1", create("reports/random123", rep1("d2")), false),
  T("report", "reporterUid spoofing denied", "u1", create("reports/u1_discussion_d2", rep1("d2", { reporterUid: "u2" })), false),
  T("report", "id of another user denied", "u1", create("reports/u2_discussion_d2", rep1("d2")), false),
  T("report", "duplicate report on same content denied", "u2", create("reports/u2_discussion_d1", { reporterUid: "u2", targetType: "discussion", targetId: "d1", discussionId: "d1", reason: "abuse", status: "open", createdAt: S }), false),
  T("report", "invalid reason denied", "u1", create("reports/u1_discussion_d2", rep1("d2", { reason: "boredom" })), false),
  T("report", "non-existent target denied", "u1", create("reports/u1_discussion_zzz", rep1("zzz")), false),
  T("report", "reply target with wrong discussionId denied", "u1", create("reports/u1_reply_r1", rep1("r1", { targetType: "reply", discussionId: "d2" })), false),
  T("report", "discussion report with mismatching discussionId denied", "u1", create("reports/u1_discussion_d2", rep1("d2", { discussionId: "d1" })), false),
  T("report", "status=resolved on create denied", "u1", create("reports/u1_discussion_d2", rep1("d2", { status: "resolved" })), false),
  T("report", "forged createdAt denied", "u1", create("reports/u1_discussion_d2", rep1("d2", { createdAt: OLD })), false),
  T("report", "details 500 chars ok", "u1", create("reports/u1_discussion_d2", rep1("d2", { details: rep("a", 500) })), true),
  T("report", "details 501 chars denied", "u1", create("reports/u1_discussion_d2", rep1("d2", { details: rep("a", 501) })), false),
  T("report", "extra field denied", "u1", create("reports/u1_discussion_d2", rep1("d2", { priority: "high" })), false),
  T("report", "blocked user cannot report", "ub", create("reports/ub_discussion_d2", rep1("d2", { reporterUid: "ub" })), false),
  T("report", "reporter can read own report", "u1", get("reports/u1_discussion_d3"), true),
  T("report", "reporter can check own (missing) report id", "u1", get("reports/u1_discussion_zzz"), true),
  T("report", "cannot read another user's report", "u1", get("reports/u2_discussion_d1"), false),
  T("report", "user cannot list reports", "u1", list("reports", {}, 20), false),
  T("report", "user cannot update own report status", "u1", update("reports/u1_discussion_d3", { status: "resolved", reviewedBy: "u1", reviewedAt: S }), false),
  T("report", "user cannot delete own report", "u1", del("reports/u1_discussion_d3"), false),

  /* ============================ ৮) বুকিং ============================ */
  T("booking", "owner reads own booking", "u1", get("bookings/b1"), true),
  T("booking", "cannot read anonymous/other booking", "u1", get("bookings/b2"), false),
  T("booking", "list own bookings (uid filter)", "u1", list("bookings", { uid: "u1" }, null), true),
  T("booking", "cannot list all bookings", "u1", list("bookings", {}, 20), false),
  T("booking", "create booking with own uid", "u1", create("bookings/nb1", booking({ uid: "u1" })), true),
  T("booking", "create booking with another user's uid denied", "u1", create("bookings/nb1", booking({ uid: "u2" })), false),
  T("booking", "create booking with status=সম্পন্ন denied", "u1", create("bookings/nb1", booking({ status: "সম্পন্ন" })), false),
  T("booking", "create booking with forged createdAt denied", "u1", create("bookings/nb1", booking({ createdAt: OLD })), false),
  T("booking", "create booking with invalid email denied", "u1", create("bookings/nb1", booking({ email: "not-an-email" })), false),
  T("booking", "create booking with extra field denied", "u1", create("bookings/nb1", booking({ isPaid: true })), false),
  T("booking", "create booking with empty name denied", "u1", create("bookings/nb1", booking({ name: "" })), false),
  T("booking", "user cannot update booking status", "u1", update("bookings/b1", { status: "সম্পন্ন" }), false),
  T("booking", "user cannot delete booking", "u1", del("bookings/b1"), false),

  /* ============================ ৯) অ্যাডমিন ============================ */
  T("admin", "reads hidden discussion", "ua", get("discussions/dh"), true),
  T("admin", "reads deleted discussion", "ua", get("discussions/dd"), true),
  T("admin", "lists all discussions (no filter, no limit — counts/management)", "ua", list("discussions", {}, null), true),
  T("admin", "lists hidden discussions", "ua", list("discussions", { status: "hidden" }, 25), true),
  T("admin", "lists all replies of a hidden discussion", "ua", list("discussions/dh/replies", {}, 50), true),
  T("admin", "hides a discussion", "ua", update("discussions/d2", mod()), true),
  T("admin", "deletes (soft) a discussion", "ua", update("discussions/d2", mod({ status: "deleted" })), true),
  T("admin", "restores a hidden discussion", "ua", update("discussions/dh", mod({ status: "active" })), true),
  T("admin", "moderation with moderatedBy of someone else denied", "ua", update("discussions/d2", mod({ moderatedBy: "u1" })), false),
  T("admin", "moderation with forged moderatedAt denied", "ua", update("discussions/d2", mod({ moderatedAt: OLD })), false),
  T("admin", "moderation + edit title denied (admin cannot rewrite content)", "ua", update("discussions/d2", mod({ title: "Rewritten" })), false),
  T("admin", "moderation with invalid status denied", "ua", update("discussions/d2", mod({ status: "banned" })), false),
  T("admin", "hard delete discussion denied", "ua", del("discussions/d2"), false),
  T("admin", "hides a reply (+ parent count −1)", "ua", { op: "batch", ops: [{ op: "update", path: P + "discussions/d1/replies/r1", data: mod() }, { op: "update", path: P + "discussions/d1", data: { replyCount: inc(-1), replySyncId: "r1" } }] }, true),
  T("admin", "hides a reply without parent decrement denied", "ua", update("discussions/d1/replies/r1", mod()), false),
  T("admin", "hides a reply with wrong parent delta denied", "ua", { op: "batch", ops: [{ op: "update", path: P + "discussions/d1/replies/r1", data: mod() }, { op: "update", path: P + "discussions/d1", data: { replyCount: inc(-2), replySyncId: "r1" } }] }, false),
  T("admin", "restores a hidden reply (+ parent count +1)", "ua", { op: "batch", ops: [{ op: "update", path: P + "discussions/d1/replies/r2", data: mod({ status: "active" }) }, { op: "update", path: P + "discussions/d1", data: { replyCount: inc(1), replySyncId: "r2" } }] }, true),
  T("admin", "restores a reply without parent increment denied", "ua", update("discussions/d1/replies/r2", mod({ status: "active" })), false),
  T("admin", "hidden→deleted reply needs no count change", "ua", update("discussions/d1/replies/r2", mod({ status: "deleted" })), true),
  T("admin", "hard delete reply denied", "ua", del("discussions/d1/replies/r1"), false),
  T("admin", "lists reports", "ua", list("reports", { status: "open" }, 25), true),
  T("admin", "reads any report", "ua", get("reports/u2_discussion_d1"), true),
  T("admin", "resolves a report", "ua", update("reports/u2_discussion_d1", { status: "resolved", reviewedBy: "ua", reviewedAt: S }), true),
  T("admin", "resolves with reviewedBy of someone else denied", "ua", update("reports/u2_discussion_d1", { status: "resolved", reviewedBy: "u1", reviewedAt: S }), false),
  T("admin", "cannot rewrite report reason", "ua", update("reports/u2_discussion_d1", { reason: "other", status: "resolved", reviewedBy: "ua", reviewedAt: S }), false),
  T("admin", "invalid report status denied", "ua", update("reports/u2_discussion_d1", { status: "banned", reviewedBy: "ua", reviewedAt: S }), false),
  T("admin", "deletes a report", "ua", del("reports/u2_discussion_d1"), true),
  T("admin", "creates a category", "ua", create("categories/design", { name: "Design", order: 10, active: true, createdAt: S }), true),
  T("admin", "category with invalid slug denied", "ua", create("categories/Bad Slug", { name: "Bad", order: 10, active: true, createdAt: S }), false),
  T("admin", "category with empty name denied", "ua", create("categories/design", { name: "", order: 10, active: true, createdAt: S }), false),
  T("admin", "category order 10000 denied", "ua", create("categories/design", { name: "Design", order: 10000, active: true, createdAt: S }), false),
  T("admin", "updates category name", "ua", update("categories/general", { name: "Main" }), true),
  T("admin", "cannot rewrite category createdAt", "ua", update("categories/general", { createdAt: S }), false),
  T("admin", "deletes a category", "ua", del("categories/old"), true),
  T("admin", "non-admin cannot create category", "u1", create("categories/design", { name: "Design", order: 10, active: true, createdAt: S }), false),
  T("admin", "non-admin cannot update category", "u1", update("categories/general", { active: false }), false),
  T("admin", "non-admin cannot delete category", "u1", del("categories/general"), false),
  T("admin", "writes site content", "ua", update("services/s1", { title: "New title" }), true),
  T("admin", "non-admin cannot write site content", "u1", update("services/s1", { title: "New title" }), false),
  T("admin", "writes settings/site", "ua", update("settings/site", { heroTitle: "y" }), true),
  T("admin", "cannot write other settings docs", "ua", create("settings/payment", { key: "v" }), false),
  T("admin", "lists and reads users", "ua", list("users", {}, 20), true),
  T("admin", "reads another user's profile", "ua", get("users/u2"), true),
  T("admin", "promotes a user to admin", "ua", update("users/u2", { isAdmin: true }), true),
  T("admin", "blocks a user from the community", "ua", update("users/u2", { communityBlocked: true }), true),
  T("admin", "cannot edit a user's name", "ua", update("users/u2", { name: "Renamed" }), false),
  T("admin", "isAdmin must be boolean", "ua", update("users/u2", { isAdmin: "yes" }), false),
  T("admin", "lists all bookings", "ua", list("bookings", {}, 20), true),
  T("admin", "updates booking status", "ua", update("bookings/b1", { status: "চলমান" }), true),
  T("admin", "invalid booking status denied", "ua", update("bookings/b1", { status: "bogus" }), false),
  T("admin", "cannot rewrite booking fields", "ua", update("bookings/b1", { name: "Renamed" }), false),
  T("admin", "deletes a booking", "ua", del("bookings/b1"), true)
];
