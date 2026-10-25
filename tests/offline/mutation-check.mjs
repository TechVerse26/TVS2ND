// tests/offline/mutation-check.mjs — "টেস্ট কি সত্যিই ধরে?" যাচাই (mutation testing)
// firestore.rules-এর নিরাপত্তা-শর্ত একটা একটা করে ইচ্ছাকৃতভাবে ভেঙে (mutant) পুরো সিনারিও-তালিকা চালায়।
// কোনো সিনারিও ফেল করলে mutant "killed" (টেস্ট ভাঙনটা ধরেছে); কেউ ফেল না করলে "survived" (টেস্টে ফাঁক বা সমতুল্য পরিবর্তন)।
// চালান:  cd tests && node offline/mutation-check.mjs        (অ-অফিশিয়াল সিমুলেটরে; Java লাগে না)
import { register } from "node:module";
import { readFileSync } from "node:fs";
register("./hooks.mjs", import.meta.url);
const { initializeTestEnvironment } = await import("./mock-rules-unit-testing.mjs");
const { scenarios } = await import("../scenarios.mjs");
const { resetAndSeed, executeScenario } = await import("../harness.mjs");

const RULES = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");

// [নাম, খুঁজব, বদলাব, (ঐচ্ছিক) সব-জায়গায়]
const M = [
  // --- রোল / অথ ---
  ["isAdmin: default false→true", "get('isAdmin', false) == true", "get('isAdmin', true) == true"],
  ["isAdmin: drop ==true (any truthy)", "get('isAdmin', false) == true", "get('isAdmin', false) != false"],
  ["isAdmin: drop isSignedIn()", "function isAdmin() {\n      return isSignedIn()\n          && get(", "function isAdmin() {\n      return true\n          && get("],
  ["isSignedIn: allow anonymous provider", "&& request.auth.token.firebase.sign_in_provider != 'anonymous'", ""],
  ["isOwner: always true when signed in", "return isSignedIn() && request.auth.uid == uid;", "return isSignedIn();"],
  ["isCommunityMember: ignore communityBlocked", "get('communityBlocked', false) == false;\n    }\n\n    // ----", "get('communityBlocked', false) == false || true;\n    }\n\n    // ----"],
  // --- users ---
  ["profile create: allow isAdmin=true", "&& d.isAdmin == false", "&& d.isAdmin is bool"],
  ["profile create: drop email-token binding", "&& email.lower() == request.auth.token.get('email', '').lower();", "&& true;"],
  ["profile create: drop createdAt check", "&& d.isAdmin == false\n          && d.createdAt == request.time;", "&& d.isAdmin == false;"],
  ["profile create: drop https photoURL check", "&& (d.photoURL == '' || d.photoURL.matches('https://[^ ]+'))", ""],
  ["profile create: allow any uid", "allow create: if isOwner(uid) && validNewProfile();", "allow create: if isSignedIn() && validNewProfile();"],
  ["profile edit: allow isAdmin", "changed.hasOnly(['name', 'phone', 'bio', 'avatarData', 'avatarThumb'])", "changed.hasOnly(['name', 'phone', 'bio', 'avatarData', 'avatarThumb', 'isAdmin'])"],
  ["profile edit: allow communityBlocked", "changed.hasOnly(['name', 'phone', 'bio', 'avatarData', 'avatarThumb'])", "changed.hasOnly(['name', 'phone', 'bio', 'avatarData', 'avatarThumb', 'communityBlocked'])"],
  ["profile edit: allow email", "changed.hasOnly(['name', 'phone', 'bio', 'avatarData', 'avatarThumb'])", "changed.hasOnly(['name', 'phone', 'bio', 'avatarData', 'avatarThumb', 'email'])"],
  ["profile edit: allow anyone to edit any profile", "allow update: if isOwner(uid) && validSelfProfileEdit();", "allow update: if isSignedIn() && validSelfProfileEdit();"],
  ["profile edit: bio limit removed", "isText(d.bio, 0, 500)", "d.bio is string"],
  ["profile edit: avatarData validation removed", "|| isAvatarData(d.avatarData))", "|| true)"],
  ["profile edit: avatarThumb validation removed", "|| isAvatarThumb(d.avatarThumb));", "|| true);"],
  ["avatarThumb: allow any https host", "'https://(lh[0-9]+[.]googleusercontent[.]com|avatars[.]githubusercontent[.]com)/[^ ]*'", "'https://[^ ]+'"],
  ["admin user edit: allow name change", "changed.hasOnly(['isAdmin', 'communityBlocked'])", "changed.hasOnly(['isAdmin', 'communityBlocked', 'name'])"],
  ["admin user edit: non-bool isAdmin allowed", "(!changed.hasAny(['isAdmin'])          || d.isAdmin is bool)", "(!changed.hasAny(['isAdmin'])          || true)"],
  ["users: anyone signed-in can read any profile", "allow get: if isOwner(uid);", "allow get: if isSignedIn();"],
  ["users: anyone signed-in can list", "allow get, list: if isAdmin();\n        allow create: if isOwner(uid)", "allow get, list: if isSignedIn();\n        allow create: if isOwner(uid)"],
  ["users: delete allowed for owner", "// delete: কারো জন্যই নয়\n      }\n\n      // ---------------------------------------------------------------- bookings", "allow delete: if isOwner(uid);\n      }\n\n      // ---------------------------------------------------------------- bookings"],
  // --- bookings ---
  ["booking: drop status check", "&& d.status == statuses[0]", ""],
  ["booking: any uid accepted", "&& ((!isSignedIn() && d.uid == null) || (isSignedIn() && d.uid == request.auth.uid))", ""],
  ["booking: signed-in may forge other uid", "|| (isSignedIn() && d.uid == request.auth.uid))", "|| (isSignedIn()))"],
  ["booking: drop createdAt check", "&& d.status == statuses[0]\n          && d.createdAt == request.time;", "&& d.status == statuses[0];"],
  ["booking: drop email pattern", "&& d.email.matches('[^@ ]+@[^@ ]+')", ""],
  ["booking: details unlimited", "isText(d.details, 0, 5000)", "d.details is string"],
  ["booking: owner read filter removed", "allow get, list: if isSignedIn() && resource.data.uid == request.auth.uid;", "allow get, list: if isSignedIn();"],
  ["booking: status update for everyone", "allow update: if isAdmin() && validBookingStatusChange();", "allow update: if validBookingStatusChange();"],
  ["booking: any status value", "&& d.status in bookingStatuses();", "&& true;"],
  ["booking: delete for everyone", "allow delete: if isAdmin();\n      }\n\n      // ---------------------------------------------------------------- settings/site", "allow delete: if true;\n      }\n\n      // ---------------------------------------------------------------- settings/site"],
  ["booking: admin-only read dropped", "allow get, list: if isAdmin();\n        allow get, list: if isSignedIn() && resource.data.uid", "allow get, list: if true;\n        allow get, list: if isSignedIn() && resource.data.uid"],
  // --- settings / content ---
  ["settings: write for any signed-in", "allow create: if isAdmin() && settingsFieldsOk(", "allow create: if isSignedIn() && settingsFieldsOk("],
  ["settings: update for any signed-in", "allow update: if isAdmin() && settingsFieldsOk(", "allow update: if isSignedIn() && settingsFieldsOk("],
  ["settings: all docs readable", "match /settings/site {", "match /settings/{anyDoc} {"],
  ["settings: URL validation removed", "(v == '' || v.matches('https?://[^ ]+'))", "true"],
  ["settings: unknown keys accepted", "ks.hasOnly(['siteName', 'heroEyebrow', 'heroTitle', 'heroSubtitle', 'heroCtaPrimary', 'heroCtaSecondary', 'seoDescription', 'codeUrl', 'courseUrl'])", "true"],
  ["content: services create without admin", "match /services/{id} {\n        allow get, list: if true;\n        allow create: if isAdmin() &&", "match /services/{id} {\n        allow get, list: if true;\n        allow create: if isSignedIn() &&"],
  ["content: services update without admin", "allow update: if isAdmin() && changedKeys().hasOnly(['title', 'desc', 'icon', 'order'])", "allow update: if changedKeys().hasOnly(['title', 'desc', 'icon', 'order'])"],
  ["content: services delete for any signed-in", "&& serviceFieldsOk(request.resource.data, changedKeys());\n        allow delete: if isAdmin();", "&& serviceFieldsOk(request.resource.data, changedKeys());\n        allow delete: if isSignedIn();"],
  ["content: portfolio unknown field accepted", "hasExactly(request.resource.data, ['title', 'category', 'tag', 'stack', 'desc', 'imageUrl', 'order'])", "true"],
  ["content: portfolio category any", "d.category in ['web', 'pwa', 'design']", "true"],
  ["content: stats value any type", "(!ks.hasAny(['value'])  || d.value is number)", "(!ks.hasAny(['value'])  || true)"],
  ["content: order any type (faq)", "isText(d.a, 1, 4000))\n          && (!ks.hasAny(['order']) || d.order is number);", "isText(d.a, 1, 4000))\n          && (!ks.hasAny(['order']) || true);"],
  ["content: pricing featured any type", "d.featured is bool", "true"],
  ["content: imageUrl any scheme", "function isHttpUrlOrEmpty(v) {\n      return v is string && v.size() <= 2048 && (v == '' || v.matches('https?://[^ ]+'));", "function isHttpUrlOrEmpty(v) {\n      return v is string && v.size() <= 2048;"],
  ["content: public read removed (team)", "match /team/{id} {\n        allow get, list: if true;", "match /team/{id} {\n        allow get, list: if isSignedIn();"],
  // --- categories ---
  ["category: slug check removed", "return cid.matches('[a-z0-9-]{1,40}')\n          && hasExactly", "return true\n          && hasExactly"],
  ["category: order bound removed", "&& d.order is number && d.order >= 0 && d.order <= 9999\n          && d.active is bool", "&& d.order is number\n          && d.active is bool"],
  ["category: create for any signed-in", "allow create: if isAdmin() && validNewCategory(categoryId);", "allow create: if isSignedIn() && validNewCategory(categoryId);"],
  ["category: update for any signed-in", "allow update: if isAdmin() && validCategoryEdit();", "allow update: if isSignedIn() && validCategoryEdit();"],
  ["category: delete for any signed-in", "allow update: if isAdmin() && validCategoryEdit();\n        allow delete: if isAdmin();", "allow update: if isAdmin() && validCategoryEdit();\n        allow delete: if isSignedIn();"],
  ["category: list limit removed", "allow list: if canReadContent() && request.query.limit <= 50;\n        allow list: if isAdmin();\n        allow create: if isAdmin() && validNewCategory", "allow list: if canReadContent();\n        allow list: if isAdmin();\n        allow create: if isAdmin() && validNewCategory"],
  ["category: inactive category accepted for posts", "return get(categoryPath(cid)).data.get('active', true) == true;", "return true;"],
  // --- discussions: create ---
  ["discussion create: uid not bound", "&& d.uid == request.auth.uid\n          && p.get('communityBlocked', false) == false\n          && d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.title, 3, 120)", "&& p.get('communityBlocked', false) == false\n          && d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.title, 3, 120)"],
  ["discussion create: blocked users allowed", "&& d.uid == request.auth.uid\n          && p.get('communityBlocked', false) == false\n          && d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.title, 3, 120)", "&& d.uid == request.auth.uid\n          && d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.title, 3, 120)"],
  ["discussion create: authorName not bound", "&& d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.title, 3, 120)", "&& d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.title, 3, 120)"],
  ["discussion create: authorAvatar not bound", "&& d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.title, 3, 120)", "&& isText(d.title, 3, 120)"],
  ["discussion create: title limit 120→1200", "isText(d.title, 3, 120)\n          && isText(d.body, 3, 5000)\n          && d.category is string", "isText(d.title, 3, 1200)\n          && isText(d.body, 3, 5000)\n          && d.category is string"],
  ["discussion create: body limit unlimited", "&& isText(d.body, 3, 5000)\n          && d.category is string", "&& d.body is string\n          && d.category is string"],
  ["discussion create: category slug regex dropped", "&& d.category is string && d.category.matches('[a-z0-9-]{1,40}')\n          && categoryIsActive(d.category)", "&& categoryIsActive(d.category)"],
  ["discussion create: category active check dropped", "&& categoryIsActive(d.category)\n          && d.status == 'active'", "&& d.status == 'active'"],
  ["discussion create: status any", "&& d.status == 'active'\n          && d.createdAt == request.time\n          && d.updatedAt == request.time\n          && d.editedAt == null\n          && d.likedBy is list && d.likedBy.size() == 0\n          && d.likeCount == 0\n          && d.replyCount == 0;", "&& d.createdAt == request.time\n          && d.updatedAt == request.time\n          && d.editedAt == null\n          && d.likedBy is list && d.likedBy.size() == 0\n          && d.likeCount == 0\n          && d.replyCount == 0;"],
  ["discussion create: createdAt unchecked", "&& d.createdAt == request.time\n          && d.updatedAt == request.time\n          && d.editedAt == null\n          && d.likedBy is list && d.likedBy.size() == 0\n          && d.likeCount == 0\n          && d.replyCount == 0;", "&& d.updatedAt == request.time\n          && d.editedAt == null\n          && d.likedBy is list && d.likedBy.size() == 0\n          && d.likeCount == 0\n          && d.replyCount == 0;"],
  ["discussion create: editedAt unchecked", "&& d.editedAt == null\n          && d.likedBy is list && d.likedBy.size() == 0\n          && d.likeCount == 0\n          && d.replyCount == 0;", "&& d.likedBy is list && d.likedBy.size() == 0\n          && d.likeCount == 0\n          && d.replyCount == 0;"],
  ["discussion create: likedBy unchecked", "&& d.likedBy is list && d.likedBy.size() == 0\n          && d.likeCount == 0\n          && d.replyCount == 0;", "&& d.likeCount == 0\n          && d.replyCount == 0;"],
  ["discussion create: likeCount unchecked", "&& d.likeCount == 0\n          && d.replyCount == 0;", "&& d.replyCount == 0;"],
  ["discussion create: replyCount unchecked", "&& d.likeCount == 0\n          && d.replyCount == 0;", "&& d.likeCount == 0;"],
  ["discussion create: extra fields accepted", "return isSignedIn()\n          && hasExactly(d, ['uid', 'authorName', 'authorAvatar', 'title', 'body', 'category', 'status', 'createdAt', 'updatedAt', 'editedAt', 'likedBy', 'likeCount', 'replyCount'])", "return isSignedIn()"],
  ["discussion create: id format unchecked", "allow create: if isId(did) && validNewDiscussion();", "allow create: if validNewDiscussion();"],
  // --- discussions: read ---
  ["discussion get: all statuses public", "allow get: if canReadContent() && resource.data.status == 'active';", "allow get: if canReadContent();"],
  ["discussion get: owner read removed", "allow get: if isOwner(resource.data.uid);            // মালিক নিজের লুকানো/মুছে-ফেলা আলোচনাও দেখে", "allow get: if false;"],
  ["discussion list: status filter dropped", "allow list: if canReadContent() && resource.data.status == 'active' && request.query.limit <= 50;\n        allow list: if isAdmin();\n\n        allow create: if isId(did)", "allow list: if canReadContent() && request.query.limit <= 50;\n        allow list: if isAdmin();\n\n        allow create: if isId(did)"],
  ["discussion list: limit dropped", "allow list: if canReadContent() && resource.data.status == 'active' && request.query.limit <= 50;\n        allow list: if isAdmin();\n\n        allow create: if isId(did)", "allow list: if canReadContent() && resource.data.status == 'active';\n        allow list: if isAdmin();\n\n        allow create: if isId(did)"],
  ["discussion list: limit 50→500", "allow list: if canReadContent() && resource.data.status == 'active' && request.query.limit <= 50;\n        allow list: if isAdmin();\n\n        allow create: if isId(did)", "allow list: if canReadContent() && resource.data.status == 'active' && request.query.limit <= 500;\n        allow list: if isAdmin();\n\n        allow create: if isId(did)"],
  ["discussion list: any user lists everything", "allow list: if canReadContent() && resource.data.status == 'active' && request.query.limit <= 50;\n        allow list: if isAdmin();\n\n        allow create: if isId(did)", "allow list: if canReadContent() && resource.data.status == 'active' && request.query.limit <= 50;\n        allow list: if isSignedIn();\n\n        allow create: if isId(did)"],
  // --- discussions: update ---
  ["discussion edit: also status", "changed.hasOnly(['title', 'body', 'editedAt', 'updatedAt'])\n          && changed.hasAll(['editedAt', 'updatedAt'])\n          && d.editedAt == request.time\n          && d.updatedAt == request.time\n          && (!changed.hasAny(['title']) || isText(d.title, 3, 120))", "changed.hasOnly(['title', 'body', 'editedAt', 'updatedAt', 'status'])\n          && changed.hasAll(['editedAt', 'updatedAt'])\n          && d.editedAt == request.time\n          && d.updatedAt == request.time\n          && (!changed.hasAny(['title']) || isText(d.title, 3, 120))"],
  ["discussion edit: editedAt not required", "changed.hasAll(['editedAt', 'updatedAt'])\n          && d.editedAt == request.time\n          && d.updatedAt == request.time\n          && (!changed.hasAny(['title'])", "d.updatedAt == request.time\n          && (!changed.hasAny(['title'])"],
  ["discussion edit: forged editedAt", "changed.hasAll(['editedAt', 'updatedAt'])\n          && d.editedAt == request.time\n          && d.updatedAt == request.time\n          && (!changed.hasAny(['title'])", "changed.hasAll(['editedAt', 'updatedAt'])\n          && d.updatedAt == request.time\n          && (!changed.hasAny(['title'])"],
  ["discussion edit: title limit removed", "(!changed.hasAny(['title']) || isText(d.title, 3, 120))\n          && (!changed.hasAny(['body'])  || isText(d.body, 3, 5000));", "(!changed.hasAny(['title']) || true)\n          && (!changed.hasAny(['body'])  || isText(d.body, 3, 5000));"],
  ["discussion edit: status active not required", "allow update: if isOwner(resource.data.uid) && resource.data.status == 'active'\n                      && validDiscussionEdit() && isCommunityMember();", "allow update: if isOwner(resource.data.uid)\n                      && validDiscussionEdit() && isCommunityMember();"],
  ["discussion edit: blocked can edit", "&& validDiscussionEdit() && isCommunityMember();", "&& validDiscussionEdit();"],
  ["discussion edit: not owner-bound", "allow update: if isOwner(resource.data.uid) && resource.data.status == 'active'\n                      && validDiscussionEdit() && isCommunityMember();", "allow update: if isSignedIn() && resource.data.status == 'active'\n                      && validDiscussionEdit() && isCommunityMember();"],
  ["soft-delete: allow hidden", "&& d.status == 'deleted'\n          && d.updatedAt == request.time;\n    }\n\n    // লাইক", "&& d.status in ['deleted', 'hidden']\n          && d.updatedAt == request.time;\n    }\n\n    // লাইক"],
  ["soft-delete: not owner-bound", "allow update: if isOwner(resource.data.uid) && resource.data.status == 'active'\n                      && validOwnerSoftDelete();", "allow update: if isSignedIn() && resource.data.status == 'active'\n                      && validOwnerSoftDelete();"],
  ["soft-delete: works on non-active (undelete/hide)", "allow update: if isOwner(resource.data.uid) && resource.data.status == 'active'\n                      && validOwnerSoftDelete();", "allow update: if isOwner(resource.data.uid)\n                      && validOwnerSoftDelete();"],
  ["soft-delete: updatedAt unchecked", "&& d.status == 'deleted'\n          && d.updatedAt == request.time;\n    }\n\n    // লাইক", "&& d.status == 'deleted';\n    }\n\n    // লাইক"],
  // --- likes ---
  ["like: count consistency dropped", "&& d.likeCount == d.likedBy.size()\n", "\n"],
  ["like: uid-in-list required dropped (like)", "((!(me in b.likedBy) && me in d.likedBy\n                && d.likedBy.size() == b.likedBy.size() + 1", "((!(me in b.likedBy)\n                && d.likedBy.size() == b.likedBy.size() + 1"],
  ["like: +1 size dropped", "&& d.likedBy.size() == b.likedBy.size() + 1\n                && b.likedBy.hasOnly(d.likedBy))", "&& b.likedBy.hasOnly(d.likedBy))"],
  ["like: subset check dropped (replace others' likes)", "&& d.likedBy.size() == b.likedBy.size() + 1\n                && b.likedBy.hasOnly(d.likedBy))", "&& d.likedBy.size() == b.likedBy.size() + 1)"],
  ["unlike: subset check dropped", "&& d.likedBy.size() == b.likedBy.size() - 1\n                && d.likedBy.hasOnly(b.likedBy)));", "&& d.likedBy.size() == b.likedBy.size() - 1));"],
  ["unlike: size check dropped", "&& d.likedBy.size() == b.likedBy.size() - 1\n                && d.likedBy.hasOnly(b.likedBy)));", "&& d.likedBy.hasOnly(b.likedBy)));"],
  ["like: duplicate allowed", "((!(me in b.likedBy) && me in d.likedBy", "((me in d.likedBy"],
  ["like: cap removed", "&& d.likedBy.size() <= 5000\n", "\n"],
  ["like: non-list likedBy", "&& d.likedBy is list\n          && d.likeCount is int", "&& d.likeCount is int"],
  ["like: extra fields allowed", "return d.diff(b).affectedKeys().hasOnly(['likedBy', 'likeCount'])\n          && d.likedBy is list", "return d.likedBy is list"],
  ["like: hidden content likeable (discussion)", "allow update: if resource.data.status == 'active' && validLikeChange() && isCommunityMember();", "allow update: if validLikeChange() && isCommunityMember();"],
  ["like: blocked users may like (discussion)", "allow update: if resource.data.status == 'active' && validLikeChange() && isCommunityMember();", "allow update: if resource.data.status == 'active' && validLikeChange() && isSignedIn();"],
  ["like: reply under hidden parent likeable", "allow update: if resource.data.status == 'active' && validLikeChange()\n                        && isCommunityMember() && parentIsActive(did);", "allow update: if resource.data.status == 'active' && validLikeChange()\n                        && isCommunityMember();"],
  ["like: hidden reply likeable", "allow update: if resource.data.status == 'active' && validLikeChange()\n                        && isCommunityMember() && parentIsActive(did);", "allow update: if validLikeChange()\n                        && isCommunityMember() && parentIsActive(did);"],
  ["like: blocked users may like (reply)", "allow update: if resource.data.status == 'active' && validLikeChange()\n                        && isCommunityMember() && parentIsActive(did);", "allow update: if resource.data.status == 'active' && validLikeChange()\n                        && isSignedIn() && parentIsActive(did);"],
  // --- moderation ---
  ["moderation: any moderatedBy", "&& d.moderatedBy == request.auth.uid\n          && d.moderatedAt == request.time;\n    }\n\n    // ---- replyCount", "&& d.moderatedAt == request.time;\n    }\n\n    // ---- replyCount"],
  ["moderation: forged moderatedAt", "&& d.moderatedBy == request.auth.uid\n          && d.moderatedAt == request.time;\n    }\n\n    // ---- replyCount", "&& d.moderatedBy == request.auth.uid;\n    }\n\n    // ---- replyCount"],
  ["moderation: forged updatedAt", "&& d.status in ['active', 'hidden', 'deleted']\n          && d.updatedAt == request.time\n          && d.moderatedBy", "&& d.status in ['active', 'hidden', 'deleted']\n          && d.moderatedBy"],
  ["moderation: arbitrary status", "&& d.status in ['active', 'hidden', 'deleted']\n          && d.updatedAt == request.time\n          && d.moderatedBy", "&& d.updatedAt == request.time\n          && d.moderatedBy"],
  ["moderation: content rewrite allowed", "changed.hasOnly(['status', 'updatedAt', 'moderatedBy', 'moderatedAt'])", "changed.hasOnly(['status', 'updatedAt', 'moderatedBy', 'moderatedAt', 'title', 'body'])"],
  ["moderation: discussion moderation w/o admin", "allow update: if validModeration() && isAdmin();", "allow update: if validModeration() && isSignedIn();"],
  ["moderation: reply moderation w/o admin", "allow update: if validReplyModeration(did, rid) && isAdmin();", "allow update: if validReplyModeration(did, rid) && isSignedIn();"],
  // --- replies ---
  ["reply create: parent counter not checked", "&& parentAfter.replyCount == parentBefore.replyCount + 1\n          && parentAfter.replySyncId == rid;\n    }\n\n    // মালিকের এডিট — editReply()", "&& parentAfter.replySyncId == rid;\n    }\n\n    // মালিকের এডিট — editReply()"],
  ["reply create: replySyncId not checked", "&& parentAfter.replyCount == parentBefore.replyCount + 1\n          && parentAfter.replySyncId == rid;\n    }\n\n    // মালিকের এডিট — editReply()", "&& parentAfter.replyCount == parentBefore.replyCount + 1;\n    }\n\n    // মালিকের এডিট — editReply()"],
  ["reply create: parent need not be active", "&& parentBefore.status == 'active'\n", "\n"],
  ["reply create: blocked users allowed", "&& d.uid == request.auth.uid\n          && p.get('communityBlocked', false) == false\n          && d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.body, 1, 2000)", "&& d.uid == request.auth.uid\n          && d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.body, 1, 2000)"],
  ["reply create: uid unbound", "&& d.uid == request.auth.uid\n          && p.get('communityBlocked', false) == false\n          && d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.body, 1, 2000)", "&& p.get('communityBlocked', false) == false\n          && d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.body, 1, 2000)"],
  ["reply create: authorName unbound", "&& d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.body, 1, 2000)", "&& d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.body, 1, 2000)"],
  ["reply create: body limit removed", "isText(d.body, 1, 2000)\n          && d.status == 'active'", "d.body is string\n          && d.status == 'active'"],
  ["reply create: likeCount unchecked", "&& d.likedBy is list && d.likedBy.size() == 0\n          && d.likeCount == 0\n          && replyToOk(d, did)", "&& d.likedBy is list && d.likedBy.size() == 0\n          && replyToOk(d, did)"],
  ["reply create: replyTo unchecked", "&& replyToOk(d, did)\n", "\n"],
  ["reply create: id format unchecked", "allow create: if isId(rid) && validNewReply(did, rid);", "allow create: if validNewReply(did, rid);"],
  ["replyTo: name mismatch allowed", "return t.status == 'active' && t.authorName == targetAuthor;", "return t.status == 'active';"],
  ["replyTo: hidden target allowed", "return t.status == 'active' && t.authorName == targetAuthor;", "return t.authorName == targetAuthor;"],
  ["replyTo: half-specified allowed", "|| (d.keys().hasAll(['replyToId', 'replyToName'])\n              && isId(d.replyToId)", "|| (d.keys().hasAny(['replyToId', 'replyToName'])\n              && isId(d.replyToId)"],
  ["sync(create): replyCount +N allowed", "&& d.replyCount == b.replyCount + 1\n          && newReplyCreatedByCaller", "&& d.replyCount > b.replyCount\n          && newReplyCreatedByCaller"],
  ["sync(create): existing reply allowed (double count)", "return !exists(replyPath(did, rid))\n          && created.uid", "return created.uid"],
  ["sync(create): not caller's reply", "&& created.uid == request.auth.uid\n          && created.status == 'active'\n          && isCommunityMember();", "&& created.status == 'active'\n          && isCommunityMember();"],
  ["sync(create): blocked users allowed", "&& created.status == 'active'\n          && isCommunityMember();", "&& created.status == 'active';"],
  ["sync(create): parent need not be active", "return b.status == 'active'\n          && d.replyCount is int\n          && d.replyCount == b.replyCount + 1", "return d.replyCount is int\n          && d.replyCount == b.replyCount + 1"],
  ["sync: extra keys allowed", "return changedKeys().hasOnly(['replyCount', 'replySyncId'])\n          && isId(", "return isId("],
  ["sync(owner delete): not own reply", "&& replyNow.uid == request.auth.uid\n          && replyNext.status == 'deleted';", "&& replyNext.status == 'deleted';"],
  ["sync(owner delete): reply need not be deleted", "&& replyNow.uid == request.auth.uid\n          && replyNext.status == 'deleted';", "&& replyNow.uid == request.auth.uid;"],
  ["sync(owner delete): wrong delta allowed", "&& d.replyCount == b.replyCount - 1\n          && ownReplyDeletedInBatch", "&& d.replyCount < b.replyCount\n          && ownReplyDeletedInBatch"],
  ["sync(moderation): delta unchecked", "&& (d.replyCount == b.replyCount - 1 || d.replyCount == b.replyCount + 1)\n          && replyActivenessChanged", "&& replyActivenessChanged"],
  ["sync(moderation): wrong direction allowed", "return (delta == -1 && replyNow.status == 'active' && replyNext.status in ['hidden', 'deleted'])\n          || (delta == 1 && replyNow.status in ['hidden', 'deleted'] && replyNext.status == 'active');", "return (replyNow.status == 'active' && replyNext.status in ['hidden', 'deleted'])\n          || (replyNow.status in ['hidden', 'deleted'] && replyNext.status == 'active');"],
  ["sync(moderation): non-admin", "allow update: if isReplySyncUpdate() && isAdmin() && validReplyCountOnModeration(did);", "allow update: if isReplySyncUpdate() && isSignedIn() && validReplyCountOnModeration(did);"],
  ["reply moderation: count unchecked", "return (wasActive == nowActive && parentAfter.replyCount == parentBefore.replyCount)\n          || (wasActive && !nowActive\n              && parentAfter.replyCount == parentBefore.replyCount - 1\n              && parentAfter.replySyncId == rid)\n          || (!wasActive && nowActive\n              && parentAfter.replyCount == parentBefore.replyCount + 1\n              && parentAfter.replySyncId == rid);", "return true;"],
  ["reply moderation: unchanged-activeness count not frozen", "return (wasActive == nowActive && parentAfter.replyCount == parentBefore.replyCount)", "return (wasActive == nowActive)"],
  ["reply moderation: replySyncId unchecked", "&& parentAfter.replyCount == parentBefore.replyCount - 1\n              && parentAfter.replySyncId == rid)\n          || (!wasActive && nowActive\n              && parentAfter.replyCount == parentBefore.replyCount + 1\n              && parentAfter.replySyncId == rid);", "&& parentAfter.replyCount == parentBefore.replyCount - 1)\n          || (!wasActive && nowActive\n              && parentAfter.replyCount == parentBefore.replyCount + 1);"],
  ["reply delete: parent decrement unchecked", "return validOwnerSoftDelete() && parentCountDropsByOne(did, rid);", "return validOwnerSoftDelete();"],
  ["reply delete: replySyncId unchecked", "&& parentAfter.replyCount == parentBefore.replyCount - 1\n          && parentAfter.replySyncId == rid;\n    }\n\n    // অ্যাডমিন রিপ্লাই-মডারেশন", "&& parentAfter.replyCount == parentBefore.replyCount - 1;\n    }\n\n    // অ্যাডমিন রিপ্লাই-মডারেশন"],
  ["reply delete: not owner-bound", "allow update: if isOwner(resource.data.uid) && resource.data.status == 'active'\n                        && validOwnerReplyDelete(did, rid);", "allow update: if isSignedIn() && resource.data.status == 'active'\n                        && validOwnerReplyDelete(did, rid);"],
  ["reply delete: works on hidden reply", "allow update: if isOwner(resource.data.uid) && resource.data.status == 'active'\n                        && validOwnerReplyDelete(did, rid);", "allow update: if isOwner(resource.data.uid)\n                        && validOwnerReplyDelete(did, rid);"],
  ["reply edit: not owner-bound", "allow update: if isOwner(resource.data.uid) && resource.data.status == 'active'\n                        && validReplyEdit() && isCommunityMember() && parentIsActive(did);", "allow update: if isSignedIn() && resource.data.status == 'active'\n                        && validReplyEdit() && isCommunityMember() && parentIsActive(did);"],
  ["reply edit: blocked allowed", "&& validReplyEdit() && isCommunityMember() && parentIsActive(did);", "&& validReplyEdit() && parentIsActive(did);"],
  ["reply edit: editedAt forged", "changed.hasAll(['editedAt', 'updatedAt'])\n          && d.editedAt == request.time\n          && d.updatedAt == request.time\n          && (!changed.hasAny(['body']) || isText(d.body, 1, 2000));", "changed.hasAll(['editedAt', 'updatedAt'])\n          && d.updatedAt == request.time\n          && (!changed.hasAny(['body']) || isText(d.body, 1, 2000));"],
  ["reply edit: extra fields", "changed.hasOnly(['body', 'editedAt', 'updatedAt'])", "changed.hasOnly(['body', 'editedAt', 'updatedAt', 'status', 'uid'])"],
  ["reply edit: hidden reply editable", "allow update: if isOwner(resource.data.uid) && resource.data.status == 'active'\n                        && validReplyEdit()", "allow update: if isOwner(resource.data.uid)\n                        && validReplyEdit()"],
  ["reply read: parent state ignored (get)", "allow get: if canReadContent() && resource.data.status == 'active' && parentIsActive(did);", "allow get: if canReadContent() && resource.data.status == 'active';"],
  ["reply read: hidden replies public (get)", "allow get: if canReadContent() && resource.data.status == 'active' && parentIsActive(did);", "allow get: if canReadContent() && parentIsActive(did);"],
  ["reply read: parent state ignored (list)", "allow list: if canReadContent() && resource.data.status == 'active' && request.query.limit <= 50 && parentIsActive(did);", "allow list: if canReadContent() && resource.data.status == 'active' && request.query.limit <= 50;"],
  ["reply read: status filter dropped (list)", "allow list: if canReadContent() && resource.data.status == 'active' && request.query.limit <= 50 && parentIsActive(did);", "allow list: if canReadContent() && request.query.limit <= 50 && parentIsActive(did);"],
  ["reply read: limit dropped (list)", "allow list: if canReadContent() && resource.data.status == 'active' && request.query.limit <= 50 && parentIsActive(did);", "allow list: if canReadContent() && resource.data.status == 'active' && parentIsActive(did);"],
  // --- reports ---
  ["report create: id binding dropped", "&& reportId == d.reporterUid + '_' + d.targetType + '_' + d.targetId\n", "\n"],
  ["report create: reporterUid unbound", "&& d.reporterUid == request.auth.uid\n          && d.targetType in", "&& d.targetType in"],
  ["report create: any reason", "&& d.reason in ['spam', 'abuse', 'harassment', 'misinformation', 'inappropriate', 'other']\n", "\n"],
  ["report create: target existence dropped", "&& reportTargetExists(d)\n", "\n"],
  ["report create: reply discussionId unchecked", "|| (d.targetType == 'reply' && exists(replyPath(d.discussionId, d.targetId)));", "|| (d.targetType == 'reply');"],
  ["report create: discussion discussionId unchecked", "(d.targetType == 'discussion' && d.discussionId == d.targetId && exists(discussionPath(d.targetId)))", "(d.targetType == 'discussion' && exists(discussionPath(d.targetId)))"],
  ["report create: status any", "&& d.status == 'open'\n          && d.createdAt == request.time\n          && reportTargetExists(d)", "&& d.createdAt == request.time\n          && reportTargetExists(d)"],
  ["report create: createdAt forged", "&& d.status == 'open'\n          && d.createdAt == request.time\n          && reportTargetExists(d)", "&& d.status == 'open'\n          && reportTargetExists(d)"],
  ["report create: details unlimited", "(!d.keys().hasAny(['details']) || isText(d.details, 0, 500))", "(!d.keys().hasAny(['details']) || true)"],
  ["report create: extra fields", "d.keys().hasOnly(['reporterUid', 'targetType', 'targetId', 'discussionId', 'reason', 'status', 'createdAt', 'details'])", "true"],
  ["report create: blocked allowed", "&& reportTargetExists(d)\n          && get(userPath(request.auth.uid)).data.get('communityBlocked', false) == false;", "&& reportTargetExists(d);"],
  ["report create: targetType any", "&& d.targetType in ['discussion', 'reply']\n          && isId(d.targetId)", "&& isId(d.targetId)"],
  ["report get: any signed-in", "allow get: if isSignedIn() && reportId.split('_')[0] == request.auth.uid;", "allow get: if isSignedIn();"],
  ["report get: prefix check dropped to public", "allow get: if isSignedIn() && reportId.split('_')[0] == request.auth.uid;", "allow get: if true;"],
  ["report list: any signed-in", "allow get, list: if isAdmin();\n        allow create: if validNewReport(reportId);", "allow get, list: if isSignedIn();\n        allow create: if validNewReport(reportId);"],
  ["report update: any signed-in", "allow update: if isAdmin() && validReportReview();", "allow update: if isSignedIn() && validReportReview();"],
  ["report review: reviewedBy unbound", "&& d.reviewedBy == request.auth.uid\n          && d.reviewedAt == request.time", "&& d.reviewedAt == request.time"],
  ["report review: reviewedAt forged", "&& d.reviewedBy == request.auth.uid\n          && d.reviewedAt == request.time", "&& d.reviewedBy == request.auth.uid"],
  ["report review: any status", "&& d.status in ['open', 'reviewing', 'resolved', 'dismissed']", ""],
  ["report review: reason rewritable", "changed.hasOnly(['status', 'reviewedBy', 'reviewedAt', 'resolutionNote'])", "changed.hasOnly(['status', 'reviewedBy', 'reviewedAt', 'resolutionNote', 'reason'])"],
  ["report review: note unlimited", "(!changed.hasAny(['resolutionNote']) || isText(d.resolutionNote, 0, 500))", "(!changed.hasAny(['resolutionNote']) || true)"],
  ["report: delete allowed", "// delete: কারো জন্যই নয় (অডিট-ট্রেইল)", "allow delete: if isAdmin();"],
  // --- পারস্পরিক-নির্ভর (দুই-দিক থেকে যাচাই) শর্ত: একটা সরালে অন্যটা ঠেকায়, তাই দুটো একসাথে সরিয়ে দেখা হয় ---
  ["PAIR reply-create+sync: parent state unchecked on both sides", ["&& parentBefore.status == 'active'\n", "\n", "return b.status == 'active'\n          && d.replyCount is int\n          && d.replyCount == b.replyCount + 1", "return d.replyCount is int\n          && d.replyCount == b.replyCount + 1"]],
  ["PAIR reply-create+sync: blocked check unchecked on both sides", ["&& d.uid == request.auth.uid\n          && p.get('communityBlocked', false) == false\n          && d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.body, 1, 2000)", "&& d.uid == request.auth.uid\n          && d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.body, 1, 2000)", "&& created.status == 'active'\n          && isCommunityMember();", "&& created.status == 'active';"]],
  ["PAIR reply-create+sync: uid binding unchecked on both sides", ["&& d.uid == request.auth.uid\n          && p.get('communityBlocked', false) == false\n          && d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.body, 1, 2000)", "&& p.get('communityBlocked', false) == false\n          && d.authorName is string && d.authorName == p.get('name', '')\n          && d.authorAvatar is string && d.authorAvatar == p.get('avatarThumb', '')\n          && isText(d.body, 1, 2000)", "&& created.uid == request.auth.uid\n          && created.status == 'active'\n          && isCommunityMember();", "&& created.status == 'active'\n          && isCommunityMember();"]],
  ["PAIR reply-create+sync: +1 delta unchecked on both sides", ["&& parentAfter.replyCount == parentBefore.replyCount + 1\n          && parentAfter.replySyncId == rid;\n    }\n\n    // মালিকের এডিট — editReply()", "&& parentAfter.replySyncId == rid;\n    }\n\n    // মালিকের এডিট — editReply()", "&& d.replyCount == b.replyCount + 1\n          && newReplyCreatedByCaller", "&& newReplyCreatedByCaller"]],
  ["PAIR reply-delete+sync: owner binding unchecked on both sides", ["allow update: if isOwner(resource.data.uid) && resource.data.status == 'active'\n                        && validOwnerReplyDelete(did, rid);", "allow update: if isSignedIn() && resource.data.status == 'active'\n                        && validOwnerReplyDelete(did, rid);", "&& replyNow.uid == request.auth.uid\n          && replyNext.status == 'deleted';", "&& replyNext.status == 'deleted';"]],
  ["PAIR reply-delete+sync: active-only unchecked on both sides", ["allow update: if isOwner(resource.data.uid) && resource.data.status == 'active'\n                        && validOwnerReplyDelete(did, rid);", "allow update: if isOwner(resource.data.uid)\n                        && validOwnerReplyDelete(did, rid);", "return replyNow.status == 'active'\n          && replyNow.uid == request.auth.uid", "return replyNow.uid == request.auth.uid"]],
  ["PAIR reply-delete+sync: -1 delta unchecked on both sides", ["&& parentAfter.replyCount == parentBefore.replyCount - 1\n          && parentAfter.replySyncId == rid;\n    }\n\n    // অ্যাডমিন রিপ্লাই-মডারেশন", "&& parentAfter.replySyncId == rid;\n    }\n\n    // অ্যাডমিন রিপ্লাই-মডারেশন", "&& d.replyCount == b.replyCount - 1\n          && ownReplyDeletedInBatch", "&& ownReplyDeletedInBatch"]],
  ["PAIR reply-moderation+sync: delta unchecked on both sides", ["return (wasActive == nowActive && parentAfter.replyCount == parentBefore.replyCount)\n          || (wasActive && !nowActive\n              && parentAfter.replyCount == parentBefore.replyCount - 1\n              && parentAfter.replySyncId == rid)\n          || (!wasActive && nowActive\n              && parentAfter.replyCount == parentBefore.replyCount + 1\n              && parentAfter.replySyncId == rid);", "return true;", "&& (d.replyCount == b.replyCount - 1 || d.replyCount == b.replyCount + 1)\n          && replyActivenessChanged", "&& replyActivenessChanged"]],
  ["PAIR reply-moderation+sync: admin unchecked on both sides", ["allow update: if validReplyModeration(did, rid) && isAdmin();", "allow update: if validReplyModeration(did, rid) && isSignedIn();", "allow update: if isReplySyncUpdate() && isAdmin() && validReplyCountOnModeration(did);", "allow update: if isReplySyncUpdate() && isSignedIn() && validReplyCountOnModeration(did);"]],
  ["PAIR reply-create: rid format unchecked on both sides", ["allow create: if isId(rid) && validNewReply(did, rid);", "allow create: if validNewReply(did, rid);", "function isReplySyncUpdate() {\n      return changedKeys().hasOnly(['replyCount', 'replySyncId'])\n          && isId(request.resource.data.get('replySyncId', ''));", "function isReplySyncUpdate() {\n      return changedKeys().hasOnly(['replyCount', 'replySyncId']);"]],
  // --- default deny ---
  ["default-deny: opened", "match /{document=**} {\n      allow read, write: if false;", "match /{document=**} {\n      allow read, write: if true;"],
  ["namespace: tvProject/{any} instead of main", "match /tvProject/main {", "match /tvProject/{anyProject} {"],
  ["root-level users match (legacy open)", "    // ------------------------------------------------------------------ বাকি সবকিছু — default-deny", "    match /users/{u} { allow read, write: if isSignedIn(); }\n    // ------------------------------------------------------------------ বাকি সবকিছু — default-deny"],
  ["comment-only: default-deny block removed (equivalent: Firestore denies by default)", "match /{document=**} {\n      allow read, write: if false;\n    }", ""]
];

const equivalentOK = new Set(["comment-only: default-deny block removed (equivalent: Firestore denies by default)"]);
// যে mutant টিকে যায় কিন্তু কারণ জানা: একই নিরাপত্তা-শর্ত দুই জায়গায় (reply-doc ↔ parent-counter) বা দুই স্তরে যাচাই হয়,
// তাই একটা সরালে অন্যটা ঠেকায়। ওপরের "PAIR …" mutant-গুলো দুটো একসাথে সরায় — সেগুলো সবই killed হওয়া চাই।
const REDUNDANT = new Set([
  "discussion create: category slug regex dropped",           // get(categories/$(slug)) অবৈধ/অনুপস্থিত পাথে এমনিতেই ব্যর্থ হয়
  "like: non-list likedBy",                                    // `in`/size() non-list-এ এরর ⇒ বাতিল
  "replyTo: half-specified allowed",                           // d.replyToName is string — ফিল্ড না থাকলে এরর
  "report create: targetType any",                             // reportTargetExists-এর দুই শাখা শুধু discussion/reply ধরে
  "reply moderation: unchanged-activeness count not frozen",   // parent-সিঙ্ক শাখা active-ness বদল ছাড়া count বদলাতে দেয় না
  "sync(moderation): wrong direction allowed",                 // reply-দিকের moderationCountOk দিক যাচাই করে
  "reply create: parent counter not checked", "reply create: parent need not be active", "reply create: blocked users allowed", "reply create: uid unbound", "reply create: id format unchecked",
  "sync(create): replyCount +N allowed", "sync(create): not caller's reply", "sync(create): blocked users allowed", "sync(create): parent need not be active",
  "sync(owner delete): not own reply", "sync(owner delete): wrong delta allowed", "sync(moderation): delta unchecked", "sync(moderation): non-admin",
  "reply delete: not owner-bound", "reply delete: works on hidden reply"
]);
async function suite(rulesText) {
  const env = await initializeTestEnvironment({ projectId: "mut", firestore: { rules: rulesText } });
  const origLog = console.log; console.log = () => {};
  try {
    for (const sc of scenarios) {
      try { await resetAndSeed(env); await executeScenario(env, sc); }
      catch (e) { return { killedBy: `${sc.group}: ${sc.name}`, err: String(e.message || e).slice(0, 80) }; }
    }
    return { killedBy: null };
  } finally { console.log = origLog; try { await env.cleanup(); } catch { /* */ } }
}

process.env.TV_SIM_QUIET = "1";
const only = process.argv[2];
let killed = 0, survived = [], redundant = [], invalid = [], missing = [];
const base = await suite(RULES);
if (base.killedBy) { console.error("বেস rules-এই সিনারিও ফেল:", base); process.exit(2); }
for (const [name, find, rep, all] of M) {
  if (only && !name.includes(only)) continue;
  let mutated = RULES;
  if (Array.isArray(find)) { // PAIR: [find1, rep1, find2, rep2, ...]
    let bad = false;
    for (let i = 0; i < find.length; i += 2) { if (mutated.split(find[i]).length - 1 !== 1) { bad = true; break; } mutated = mutated.replace(find[i], find[i + 1]); }
    if (bad) { missing.push(name); continue; }
  } else {
    const n = RULES.split(find).length - 1;
    if (n === 0) { missing.push(name); continue; }
    if (n > 1 && !all) { missing.push(name + ` (match ${n}×)`); continue; }
    mutated = all ? RULES.split(find).join(rep) : RULES.replace(find, rep);
  }
  let res;
  try { res = await suite(mutated); } catch (e) { invalid.push(name + " — " + e.message.slice(0, 60)); continue; }
  if (res.killedBy) { killed++; if (only) console.log(`killed: ${name}\n   ← ${res.killedBy}`); }
  else if (equivalentOK.has(name)) { console.log(`≈ equivalent (ঠিকই টিকে গেছে): ${name}`); }
  else if (REDUNDANT.has(name)) redundant.push(name);
  else survived.push(name);
}
console.log(`\n[mutation] mutants: ${killed + redundant.length + survived.length + invalid.length} চালানো — killed ${killed}, টিকেছে-কিন্তু-দুই-স্তরে-সুরক্ষিত ${redundant.length}, অব্যাখ্যাত-survived ${survived.length}, invalid(compile) ${invalid.length}${missing.length ? `, not-applied ${missing.length}` : ""}`);
if (redundant.length) console.log("  (দুই-স্তরে সুরক্ষিত — জোড়া-mutant 'PAIR …' সব killed হলে ঠিক আছে)");
if (survived.length) { console.log("SURVIVED (টেস্টে ফাঁক বা সমতুল্য):"); survived.forEach((n) => console.log("  - " + n)); }
if (invalid.length) { console.log("INVALID:"); invalid.forEach((n) => console.log("  - " + n)); }
if (missing.length) { console.log("NOT APPLIED (find স্ট্রিং মেলেনি/একাধিক):"); missing.forEach((n) => console.log("  - " + n)); }
process.exit(survived.length ? 1 : 0);
