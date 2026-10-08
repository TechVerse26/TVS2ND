# Tech Verse — Community + Isolated Firestore: চূড়ান্ত রিপোর্ট

সংস্করণ: `v01.00.03` · সব Firestore ডেটা এখন একটাই নেমস্পেসে: **`tvProject/main/**`**

> ⚠️ **ডিপ্লয়ের আগে (সংক্ষেপে):** (১) পুরোনো ডেটা মাইগ্রেট করুন (`scripts/migrate-to-tvproject.mjs`), (২) নতুন `firestore.rules` একটা Firebase
> প্রজেক্টের **পুরো** Firestore rules বদলে দেয় — তাই শুধু Tech Verse-এর নিজস্ব প্রজেক্টে (`tvsitesofficial`) ডিপ্লয় করুন; এই প্রজেক্টে এখনো অন্য কোনো অ্যাপ চললে সেটা বন্ধ হয়ে যাবে,
> (৩) `firebase deploy --only firestore:rules,firestore:indexes`, (৪) নিজেকে অ্যাডমিন করুন (নতুন `users` পাথে `isAdmin: true`), (৫) অ্যাডমিন → কমিউনিটি মডারেশন → "ডিফল্ট ক্যাটাগরি বসান"।

---

## ১) Final Firestore collection structure

```
tvProject/main/                                   ← একমাত্র নেমস্পেস (বাইরে সব default-deny)
├── users/{uid}                                   name, email, photoURL, phone, bio, avatarData, avatarThumb, createdAt,
│                                                 isAdmin (শুধু অ্যাডমিন বদলায়), communityBlocked (শুধু অ্যাডমিন বদলায়)
├── bookings/{bookingId}                          service, name, email, phone, budget, timeline, details, uid|null, status, createdAt
├── settings/site                                 সাইট সেটিংস (একটামাত্র ডকুমেন্ট)
├── services | portfolio | caseStudies | testimonials | team | stats | pricingPlans | faqItems   /{id}   সাইটের কন্টেন্ট (+ order)
├── categories/{slug}                             name, order, active, createdAt              ← অ্যাডমিন নতুন ক্যাটাগরি যোগ করে
├── discussions/{discussionId}                    uid, authorName, authorAvatar, title, body, category, status,
│   │                                             createdAt, updatedAt, editedAt, likedBy[], likeCount, replyCount,
│   │                                             (+ replySyncId, moderatedBy, moderatedAt — শুধু rules-নিয়ন্ত্রিত পথে)
│   └── replies/{replyId}                         uid, authorName, authorAvatar, body, status, createdAt, updatedAt, editedAt,
│                                                 likedBy[], likeCount, (ঐচ্ছিক) replyToId, replyToName
└── reports/{reporterUid_targetType_targetId}     reporterUid, targetType (discussion|reply), targetId, discussionId, reason,
                                                  details?, status (open|reviewing|resolved|dismissed), createdAt
                                                  (+ reviewedBy, reviewedAt, resolutionNote — অ্যাডমিন)
```

**সিদ্ধান্ত (আপনার উদাহরণ থেকে যা আলাদা):** Firestore-এ `tvProject/users/{uid}` বৈধ পাথ নয় (কালেকশন/ডকুমেন্ট পর্যায়ক্রমে আসে), তাই রুট-ডকুমেন্ট `main` রাখা হয়েছে
(`tvProject/main/users/{uid}`)। `content` একটা কালেকশনের বদলে বিদ্যমান ৮টা কন্টেন্ট-কালেকশনই রাখা হয়েছে (অ্যাডমিন প্যানেলের CRUD অক্ষত রাখতে)। `notifications` লাগছে না বলে কোনো rule লেখা হয়নি
(নির্দেশ ৩: প্রয়োজন ছাড়া কালেকশনের rule নয়)। অন্য-অ্যাপের কিছুই (courses, exams, examRoutine, results, flashcards, purchaseRequests, accessCodes, coupons, counters, notifications,
বাইরের discussion সিস্টেম) নতুন rules-এ নেই — যাচাই: rules-এ এই নামগুলোর কোনোটাই নেই।

## ২) Final `firestore.rules`
ফাইল: `firestore.rules` (৪৩৮ লাইন, ৫৬টা `allow`)। কাঠামো: হেল্পার → `users` → `bookings` → `settings` → ৮ কন্টেন্ট → `categories` → `discussions` (+`replies`) → `reports` → **`match /{document=**} { allow read, write: if false; }`**।
- কোনো `if true` / `request.auth != null`-মাত্র write নেই (স্ক্রিপ্ট দিয়ে যাচাই: ০টা)। একমাত্র লগইন-ছাড়া write = বুকিং ফর্ম (বিদ্যমান ফিচার) — ফিল্ড-whitelist, দৈর্ঘ্য, ইমেইল-প্যাটার্ন, `status == "নতুন"`, সার্ভার-টাইম সহ কঠোর ভ্যালিডেশনে।
- অ্যাডমিন = `get(users/{auth.uid}).data.isAdmin == true` (শুধু এই নেমস্পেসের `users`); ক্লায়েন্ট-চেক কখনো নিরাপত্তার ভিত্তি নয়।

## ৩) `firestore.indexes.json` (শুধু বাস্তবে ব্যবহৃত ৫টা কোয়েরির জন্য)
| ইনডেক্স | কোন কোয়েরি | কোথায় |
|---|---|---|
| `bookings`: uid ↑, createdAt ↓ | আমার অনুরোধসমূহ | drawer.js (বিদ্যমান) |
| `discussions`: status ↑, createdAt ↓ | ফিড; অ্যাডমিনের স্ট্যাটাস-ফিল্টার | community/api.js, admin-community.js |
| `discussions`: status ↑, category ↑, createdAt ↓ | ক্যাটাগরি-ফিড | community/api.js |
| `replies`: status ↑, createdAt ↑ | রিপ্লাই-তালিকা | community/api.js |
| `reports`: status ↑, createdAt ↓ | খোলা রিপোর্ট | admin-community.js |

আপনার উদাহরণের `uid + createdAt` ইনডেক্স তৈরি করা হয়নি — কোনো কোয়েরি সেটা ব্যবহার করে না ("আমার পোস্ট" ফিল্টার বানানো হয়নি)।

## ৪) Community UI implementation
| অংশ | ফাইল |
|---|---|
| হালকা রাউটার (Firebase-মুক্ত; `#community`, `#community/{id}`; Firebase না এলে "অফলাইন + আবার চেষ্টা") | `js/community-entry.js` |
| UI (ফিড, থ্রেড, রিপ্লাই, লাইক, শেয়ার, মেনু, কম্পোজার, রিপোর্ট, কনফার্ম) | `js/community/app.js` |
| Firestore অপারেশন (ফিড/থ্রেড পড়া, CRUD, লাইক, রিপোর্ট, মডারেশন, ক্যাটাগরি) | `js/community/api.js` |
| স্টাইল (বিদ্যমান টোকেন; লাইট/ডার্ক; কোনো গ্লো/ভারী ইফেক্ট নেই) | `css/community.css` |
| অ্যাডমিন মডারেশন পেজ | `js/admin-community.js` (+ `admin.js`, `admin.css`) |

- **মোবাইল-ফার্স্ট:** কম্পোজার/মেনু/রিপোর্ট = বিদ্যমান `.modal`-এর বটম-শিট; ৪৪px টাচ-টার্গেট; রিপ্লাই-বার নিচে sticky; কীবোর্ড খুললে `visualViewport` দিয়ে শিট/বার কীবোর্ডের ওপরে ওঠে (`--cm-kb`); পেজে অনুভূমিক স্ক্রল নেই (৩৯০px-এ যাচাই)।
- **পারফরম্যান্স:** কোনো লাইব্রেরি নেই; কমিউনিটি কোড lazy-load; ফিড `limit(20)` + `startAfter` + "আরও দেখুন"/IntersectionObserver; রিপ্লাই ৩০টা করে; rules-এ পাবলিক লিস্ট `limit ≤ 50` বাধ্যতামূলক।
- **অফলাইন/PWA:** `navigator.onLine` + ১৪s টাইমআউট ⇒ অন্তহীন স্পিনার নেই; এরর/অফলাইন কার্ডে retry; মডিউল-লোড ব্যর্থ হলে বাকি সাইট চলে। Firestore offline-persistence ও SW-ক্যাশে কমিউনিটি ডেটা **রাখা হয় না** (শেয়ারড ডিভাইসে প্রাইভেসি)।
- **অ্যাক্সেসিবিলিটি:** `aria-pressed` লাইক, `aria-label`, ফোকাস-ট্র্যাপ + Esc, `aria-live` তালিকা, শিরোনামে ফোকাস।

## ৫) Discussion CRUD — ক্লায়েন্ট কী লেখে ↔ rules কী মানে
| কাজ | ক্লায়েন্ট | rules-এর শর্ত |
|---|---|---|
| তৈরি | `setDoc` (সব ফিল্ড) | লগইন + প্রোফাইল আছে + ব্লকড নয়; ঠিক ১৩টা ফিল্ড; `uid == auth.uid`; `authorName/authorAvatar == users/{uid}`; title ৩–১২০, body ৩–৫০০০; `category` বিদ্যমান ও active; `status=="active"`; `likedBy==[]`, `likeCount==0`, `replyCount==0`; `createdAt/updatedAt == request.time`; `editedAt==null` |
| এডিট | `updateDoc` | মালিক + active; শুধু `title, body, editedAt, updatedAt`; `editedAt/updatedAt == request.time` |
| মুছা | `updateDoc(status:"deleted")` | মালিক + active; শুধু `status, updatedAt` (soft-delete; হার্ড ডিলিট কারো জন্য নয়) |
| পড়া | `getDoc`/`getDocs(where status==active, limit)` | active সবাই; লুকানো/মুছে-ফেলা শুধু মালিক+অ্যাডমিন |

## ৬) Reply system
`discussions/{id}/replies/{rid}`; ফ্ল্যাট থ্রেড + "কাউকে উত্তর" (`replyToId`/`replyToName` — rules টার্গেট রিপ্লাইয়ের লেখকের নামের সাথে মেলায়)। এডিট/মুছা (soft)/লাইক মালিক ও সবার জন্য ঠিক আলোচনার মতোই কঠোর।
**`replyCount` জাল করা যায় না:** রিপ্লাই তৈরি/মুছা/পুনঃপ্রকাশ সবসময় **একই `writeBatch`-এ** parent-এর `replyCount ±1` ও `replySyncId = রিপ্লাই-id`-র সাথে; rules `getAfter()/existsAfter()` দিয়ে দুই দিক থেকেই মেলায় — রিপ্লাই ছাড়া কাউন্ট বদলানো, দুবার গোনা, অন্যের রিপ্লাই "মুছে" কাউন্ট কমানো — সবই বাতিল।

## ৭) Like system
`likedBy` (uid-তালিকা) + `likeCount`; ক্লায়েন্ট `arrayUnion/arrayRemove + increment(±1)`। rules: কলারের **নিজের** uid ঠিক ১টা যোগ বা বাদ, বাকি সব uid অপরিবর্তিত (`hasAll`), সাইজ ±১, এবং `likeCount == likedBy.size()` — তাই ডুপ্লিকেট লাইক, অন্যের uid, অন্যের লাইক সরানো, জাল সংখ্যা সবই বাতিল। সীমা: ৫০০০ লাইক/ডকুমেন্ট।

## ৮) Report system
কারণ: spam, abuse, harassment, misinformation, inappropriate, other (+ ঐচ্ছিক ≤৫০০ অক্ষর)। ডকুমেন্ট-id **নির্ধারিত** `{uid}_{type}_{targetId}`; rules id মেলায় ও টার্গেট বিদ্যমান কিনা দেখে। দ্বিতীয়বার একই কনটেন্টে ⇒ `setDoc` = update ⇒ শুধু অ্যাডমিন পারে ⇒ ডুপ্লিকেট-স্প্যাম অসম্ভব। রিপোর্টার শুধু নিজের id-র ডকুমেন্ট `get` করতে পারে ("আগেই রিপোর্ট করেছি কি?"); তালিকা/রিভিউ শুধু অ্যাডমিন।

## ৯) Admin moderation (`admin.html#community`)
- **রিপোর্ট:** খোলা/সব ফিল্টার; টার্গেটের প্রিভিউ; রিভিউ শুরু → সমাধান/বাতিল; রিপোর্ট থেকেই কনটেন্ট লুকান/মুছুন (কনটেন্ট + `replyCount` + রিপোর্ট — এক batch-এ)।
- **আলোচনা:** স্ট্যাটাস-ফিল্টার; লুকান/মুছুন/পুনঃপ্রকাশ; "রিপ্লাই" মডালে রিপ্লাই ধরে ধরে মডারেশন (লুকানো রিপ্লাই পুনঃপ্রকাশসহ)।
- **ক্যাটাগরি:** ডিফল্ট ৯টা বসানো, নতুন যোগ, নাম/ক্রম বদল, নিষ্ক্রিয়, মুছা।
- **ইউজার:** "কমিউনিটি ব্লক" — `communityBlocked` (শুধু অ্যাডমিন বদলায়); ব্লকড ইউজার পোস্ট/রিপ্লাই/লাইক/রিপোর্ট/এডিট করতে পারে না (নিজের কনটেন্ট মুছতে পারে)।
- অ্যাডমিন কারো লেখা **এডিট করতে পারে না**, শুধু `status` বদলাতে পারে (`moderatedBy/At` rules-এ বাধ্যতামূলক)।

## ১০) Security test results

> **খোলাখুলি সীমা:** এই পরিবেশে ইন্টারনেট ও Firebase Emulator নেই, তাই **অফিশিয়াল Emulator-এ টেস্ট চালানো যায়নি।** নিচের ফলাফল আমার লেখা একটা *ছোট rules-interpreter* (শুধু এই ফাইলে ব্যবহৃত
> ভাষা-অংশ) দিয়ে পাওয়া — Google-এর ইঞ্জিন নয়, তাই লজিক যাচাই হয়েছে, কিন্তু অফিশিয়াল কম্পাইলারের সিনট্যাক্স/ইঞ্জিন-আচরণের গ্যারান্টি নয়। **ডিপ্লয়ের আগে একবার `cd tests && npm install && npm test` চালান** —
> একই ২৪৭টা সিনারিও (`tests/scenarios.mjs`) অফিশিয়াল Emulator-এ চলবে।

**সিনারিও ফলাফল (interpreter): ২৪৭/২৪৭ প্রত্যাশা-মতো**
| গ্রুপ | সংখ্যা | কী কী |
|---|---|---|
| anonymous | ৩৪ | পড়া শুধু active; লিখতে/লাইক/রিপোর্ট বন্ধ; লিস্টে status-ফিল্টার ও limit ≤ ৫০ বাধ্যতামূলক; পুরোনো/অন্য নেমস্পেস/অন্য কালেকশন বন্ধ |
| profile | ২৫ | নিজের `isAdmin`/`communityBlocked`/`email`/`createdAt` বদল, `set` দিয়ে প্রতিস্থাপন, অন্যের প্রোফাইল, avatar-URL ইনজেকশন |
| create | ২৫ | uid/নাম/অবতার spoofing, জাল কাউন্টার/টাইমস্ট্যাম্প, বাড়তি ফিল্ড, ভুল/নিষ্ক্রিয় ক্যাটাগরি, দৈর্ঘ্য-সীমা, ব্লকড/প্রোফাইল-ছাড়া ইউজার |
| edit | ২১ | মালিকের এডিট/মুছা; এডিটের সাথে uid/category/কাউন্টার/status/মডারেশন-ফিল্ড লুকিয়ে বদল; অন্যের পোস্ট এডিট/ডিলিট; হার্ড ডিলিট |
| like | ১৮ | নিজের লাইক/আনলাইক; অন্যের uid যোগ, অন্যের লাইক সরানো, লাইক "অদলবদল", ডুপ্লিকেট, জাল কাউন্ট, লুকানো কনটেন্টে লাইক |
| reply | ৩৭ | batch-সহ বৈধ রিপ্লাই; কাউন্ট ছাড়া/বেশি/ভুল-sync রিপ্লাই; একা `replyCount` বাড়ানো-কমানো; status-flip কৌশল; replyTo জালিয়াতি; অন্যের রিপ্লাই এডিট/মুছা |
| report | ২২ | নির্ধারিত-id, ডুপ্লিকেট, id/uid জালিয়াতি, ভুল টার্গেট, বাড়তি ফিল্ড, রিপোর্ট পড়া/বদল |
| booking | ১৩ | বিদ্যমান ফিচারের ভ্যালিডেশন অপরিবর্তিত; অন্যের বুকিং পড়া/বদল বন্ধ |
| admin | ৫২ | মডারেশন (আলোচনা/রিপ্লাই + কাউন্ট-সিঙ্ক), রিপোর্ট রিভিউ, ক্যাটাগরি, কন্টেন্ট, ইউজার (isAdmin/ব্লক), বুকিং status; অ্যাডমিনও কারো লেখা এডিট/হার্ড-ডিলিট করতে পারে না; নন-অ্যাডমিন বন্ধ |

**মিউটেশন-টেস্ট (সিনারিও যথেষ্ট কড়া কিনা):** rules-এ ৩২টা ইচ্ছাকৃত দুর্বলতা বসিয়ে দেখা হয়েছে (যেমন `isAdmin==false` সরানো, লাইকের `hasAll` সরানো, `replySyncId`-যাচাই সরানো, ব্লক-চেক সরানো, default-deny ওপেন করা) —
**৩১টা ধরা পড়েছে।** বাকি ১টা ("রিপ্লাই তৈরিতে parent-active দ্বিতীয় চেক") আচরণ বদলায় না, কারণ একই কাজ parent-এর নিজস্ব rule-ও আটকায় — এটা ইচ্ছাকৃত defense-in-depth। এই পরীক্ষাতেই একটা আসল ফাঁক
ধরা পড়েছিল (লাইক "অদলবদল" — নিজের uid যোগ করে অন্যের লাইক জাল uid দিয়ে বদলানো) এবং সেটার সিনারিও যোগ করা হয়েছে।

**UI স্মোক-টেস্ট (headless Chromium + মক Firebase): ৯৯/৯৯ পাস** — ফিড (২০টা/পাতা, নতুন-আগে, ক্যাটাগরি-ফিল্টার, "আরও দেখুন"), লগইন-ছাড়া গেটিং, থ্রেড ডিপ-লিংক, লাইক টগল, আলোচনা/রিপ্লাই তৈরি-এডিট-মুছা,
রিপোর্ট ও ডুপ্লিকেট-লক, অ্যাডমিন লুকান, অফলাইন/permission-denied অবস্থা, মডিউল-লোড-ব্যর্থতা, মোবাইল ৩৯০px (ওভারফ্লো নেই, বটম-শিট, sticky বার), ডার্ক মোড, অ্যাডমিন-পেজ (রিপোর্ট/আলোচনা/ক্যাটাগরি/ইউজার-ব্লক)।
সবচেয়ে গুরুত্বপূর্ণ: প্রতিটা write-এ **ক্লায়েন্ট যে ফিল্ড-সেট পাঠায় সেটা rules-এর whitelist-এর সাথে হুবহু মেলে** — এভাবে ক্লায়েন্ট ↔ rules অসামঞ্জস্য ধরা পড়ে।

**যা rules দিয়ে ঠেকানো যায় না (অবশিষ্ট ঝুঁকি):**
১. **রেট-লিমিট নেই** — লগইন করা ইউজার অনেক পোস্ট/রিপ্লাই বানাতে পারে। প্রতিকার: App Check চালু করুন (`firebase-config.js`-এ কী বসানো যায়), দরকারে Cloud Function/কোটা।
২. **পাবলিক পড়া** — active কনটেন্ট লগইন ছাড়াও পড়া যায় (স্ক্র্যাপ সম্ভব)। চাইলে `canReadContent()`-এ `isSignedIn() &&` যোগ করুন।
৩. `likedBy` অ্যারে — খুব জনপ্রিয় পোস্টে (হাজারো লাইক) ডকুমেন্ট-হট-স্পট; তখন সাবকালেকশন-কাউন্টারে সরানো ভালো।
৪. `authorName/Avatar` পোস্টের সময়ের স্ন্যাপশট — পরে প্রোফাইল বদলালে পুরোনো পোস্ট আপডেট হয় না।
৫. soft-delete মানে কনটেন্ট ডেটাবেসে থাকে (শুধু মালিক/অ্যাডমিন পড়ে); স্থায়ী মোছার দাবি এলে Console/Admin SDK থেকে মুছুন।
৬. অ্যাডমিন-অ্যাকাউন্ট সম্পূর্ণ ক্ষমতাবান — Google/GitHub-এ 2FA রাখুন।

## ১১) পরিবর্তিত ফাইলের তালিকা
**বিদ্যমান ফাইল (১২টা):**
| ফাইল | কী বদলেছে |
|---|---|
| `firestore.rules` | সম্পূর্ণ নতুন — শুধু Tech Verse; নেমস্পেস; default-deny |
| `firestore.indexes.json` | ৫টা ইনডেক্স (১টা আগের + ৪টা নতুন) |
| `js/auth.js` | `users` ডকুমেন্ট পাথ → `tvDoc("users", uid)`; অন্য-অ্যাপের কমেন্ট মোছা |
| `js/app.js` | বুকিং পাথ → `tvCol("bookings")` (লজিক অপরিবর্তিত) |
| `js/content.js` | কন্টেন্ট/সেটিংস পাথ → `tvCol/tvDoc` |
| `js/drawer.js` | বুকিং পাথ; ছোট অবতার (`avatarThumb`) সেভ; মেনুতে কমিউনিটি আইকন; কমিউনিটি খোলা থাকলে মেনু-লিংক হ্যাশ বদলায় |
| `js/admin.js` | সব পাথ নেমস্পেসে; "কমিউনিটি মডারেশন" নেভ/রাউট; ড্যাশবোর্ডে খোলা-রিপোর্ট নোটিস; ইউজার-পেজে "কমিউনিটি ব্লক" |
| `js/icons.js` | ৮টা নতুন আইকন (chat, share, more, flag, reply, refresh, send, wifiOff) |
| `index.html` | নেভে "কমিউনিটি"; `community.css`; `<section id="community">`; `community-entry.js` |
| `css/admin.css` | কমিউনিটি-মডারেশনের ছোট ব্লক (শেষে যোগ) |
| `sw.js` | ক্যাশ ভার্সন `v01.00.03` + নতুন ফাইল |
| `README.md` | নতুন কাঠামো/সেটআপ/মাইগ্রেশন/টেস্ট |

**নতুন ফাইল:** `css/community.css`, `js/community-entry.js`, `js/community/api.js`, `js/community/app.js`, `js/admin-community.js`, `js/tv-db.js`, `js/avatar-thumb.js`,
`firebase.json`, `.firebaserc`, `.gitignore`, `scripts/migrate-to-tvproject.mjs`, `tests/scenarios.mjs`, `tests/firestore.rules.test.mjs`, `tests/package.json`, `docs/COMMUNITY_REPORT.md`।

## ১২) বিদ্যমান ফিচার ভাঙেনি — কী যাচাই হয়েছে, কী হয়নি
**যাচাই হয়েছে (headless ব্রাউজার + মক ব্যাকএন্ডে):**
- হোম পেজ কোনো JS এরর ছাড়া লোড; নেভে ৭টা লিংক ৯০১/৯৬০/১০২৪/১১০০/১২৮০px-এ এক সারিতে (ওভারফ্লো নেই); কমিউনিটি ↔ সেকশন নেভিগেশন (সাইট-মেনু ও drawer সহ) কাজ করে।
- বুকিং ফর্ম: লেখা ডেটার ফিল্ড-সেট rules-এর whitelist-এর সাথে হুবহু; নতুন নেমস্পেসে যায়।
- অ্যাডমিন: ড্যাশবোর্ড, বুকিং-পেজ, ইউজার-পেজ (`isAdmin` টগল শুধু `{isAdmin}` লেখে), "ডিফল্ট কন্টেন্ট বসান" — সব `tvProject/main/**`-এ, নেমস্পেসের বাইরে কিছু লেখে না।
- কমিউনিটি লোড ব্যর্থ হলেও বাকি সাইট ও নেভ চলে। সব `.js` ফাইল সিনট্যাক্স-চেক পাস; কোথাও পুরোনো `collection(db,…)`/`doc(db,…)` পাথ বাকি নেই (`tv-db.js` ছাড়া)।
**যাচাই হয়নি (আসল Firebase লাগে — আপনাকে দেখে নিতে হবে):** সাইন-আপ/লগইন (ইমেইল/Google/GitHub) — কেবল পাথ বদলেছে, লজিক নয়; আসল Firestore-এ ইনডেক্স-বিল্ড; অফিশিয়াল Emulator-টেস্ট; আসল ডিভাইসে কীবোর্ড-আচরণ।
**মনে রাখবেন:** পুরোনো ডেটা পুরোনো পাথেই পড়ে আছে — মাইগ্রেশন না করলে নতুন ভার্সনে সাইট খালি/অ্যাডমিন-ছাড়া দেখাবে। এটা এই আইসোলেশনের অনিবার্য মূল্য।
