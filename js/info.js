// js/info.js
// ফুটারের Quick Links-এর পাতাগুলো: About Us, Privacy Policy, Terms & Conditions, Help & Support, Credits।
// প্রতিটা একটা তথ্য-শিটে খোলে (ডেস্কটপে মাঝখানে, ফোনে নিচ থেকে ওঠে) এবং URL-এ #about, #privacy, #terms,
// #help, #credits বসে — তাই সরাসরি লিংক শেয়ার করা যায় (যেমন Google/GitHub লগইনের গোপনীয়তা-নীতির লিংকে)।
//
// ব্রাউজারের Back বাটন আগে শিট বন্ধ করে (PWA-তে অ্যাপ থেকে বেরিয়ে যায় না)। লেখাগুলো কোডে — অফলাইনেও খোলে।
// ⚠️ Privacy/Terms সাধারণ ও সহজ ভাষার খসড়া — প্রকাশের আগে নিজের ব্যবসার বাস্তবতার সাথে মিলিয়ে নিন (দরকারে আইনজীবীকে দেখান)।

import { icons, icon } from "./icons.js";
import { CONTACT, whatsappUrl, telUrl, mailUrl } from "./contact.js";
import { escapeHtml as esc } from "./utils.js";
import { lockScroll, unlockScroll } from "./scrolllock.js";

export const INFO_ORDER = ["about", "privacy", "terms", "help", "credits"];

export const INFO_LABELS = {
  about: { label: "About Us", bn: "আমাদের সম্পর্কে", tone: "blue", icon: "info" },
  privacy: { label: "Privacy Policy", bn: "গোপনীয়তা নীতি", tone: "violet", icon: "shieldCheck" },
  terms: { label: "Terms & Conditions", bn: "ব্যবহারের শর্তাবলি", tone: "slate", icon: "doc" },
  help: { label: "Help & Support", bn: "সহায়তা ও সাপোর্ট", tone: "mint", icon: "help" },
  credits: { label: "Credits", bn: "কৃতজ্ঞতা", tone: "rose", icon: "heart" }
};

/* ------------------------------------------------------------------ লেখার ছোট হেল্পার */
const UPDATED = "২০ সেপ্টেম্বর ২০২৬";
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const toBn = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[d]);

/** টেক্সট → নিরাপদ HTML। **মোটা**, আর {{privacy|লেখা}} দিয়ে অন্য পাতার লিংক */
const md = (t) =>
  esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\{\{(\w+)\|([^}]+)\}\}/g, (_, k, label) =>
      INFO_LABELS[k] ? `<a class="info-link" href="#${k}" data-info-go="${k}">${label}</a>` : label
    );

const p = (t) => `<p>${md(t)}</p>`;
const ul = (items) => `<ul class="info-list">${items.map((i) => `<li>${md(i)}</li>`).join("")}</ul>`;
const note = (t) => `<div class="info-note">${md(t)}</div>`;
const sec = (title, body, n) =>
  `<section class="info-sec"><h3>${n ? `<span class="n" aria-hidden="true">${toBn(n)}</span>` : ""}<span>${esc(title)}</span></h3>${body}</section>`;
const metaLine = () => `<span class="info-meta">${icons.calendar}সর্বশেষ হালনাগাদ: ${UPDATED}</span>`;

const card = (tone, iconKey, title, desc) =>
  `<div class="info-card tone-${tone}"><span class="ico">${icon(iconKey)}</span><b>${esc(title)}</b><span>${esc(desc)}</span></div>`;

/** Call / WhatsApp / Email — তিনটা বড় ট্যাপ-অ্যাকশন */
function contactBlock() {
  const mail = CONTACT.emails[0].address;
  return `<div class="info-actions">
    <a class="info-action tone-slate" href="${esc(telUrl())}"><span class="ico">${icons.phone}</span><span class="txt"><b>Call</b><small>${esc(CONTACT.phone.local)}</small></span></a>
    <a class="info-action tone-mint" href="${esc(whatsappUrl())}" target="_blank" rel="noopener noreferrer"><span class="ico">${icons.whatsappFill}</span><span class="txt"><b>WhatsApp</b><small>মেসেজ পাঠান</small></span></a>
    <a class="info-action tone-violet" href="${esc(mailUrl(mail))}"><span class="ico">${icons.mail}</span><span class="txt"><b>Email</b><small>${esc(mail)}</small></span></a>
  </div>`;
}

function moreLinks(current) {
  const chips = INFO_ORDER.filter((k) => k !== current)
    .map((k) => `<a class="chip" href="#${k}" data-info-go="${k}"><span lang="en">${esc(INFO_LABELS[k].label)}</span></a>`)
    .join("");
  return `<div class="info-more"><span>আরও পড়ুন</span><div class="info-more-row">${chips}</div></div>`;
}

/* ------------------------------------------------------------------ পাতার লেখা */
function aboutPage() {
  return `
    <p class="info-lead">${md("Tech Verse একটি সফটওয়্যার এজেন্সি। আমরা **পিওর JavaScript ও CSS** দিয়ে ওয়েব অ্যাপ, PWA আর Firebase-ভিত্তিক সিস্টেম তৈরি করি — ভারী ফ্রেমওয়ার্কের বোঝা ছাড়াই দ্রুত, হালকা ও নির্ভরযোগ্য সফটওয়্যার।")}</p>

    ${sec("আমরা কী করি", `<div class="info-cards">
      ${card("blue", "code", "ওয়েব অ্যাপ", "আপনার প্রয়োজন অনুযায়ী কাস্টম, দ্রুত ও গোছানো ওয়েব অ্যাপ্লিকেশন।")}
      ${card("mint", "device", "PWA", "ফোনে অ্যাপের মতো ইনস্টল হয়, খোলে দ্রুত — অফলাইন সাপোর্টসহ।")}
      ${card("violet", "server", "Firebase ব্যাকএন্ড", "লগইন, ডেটাবেস ও রিয়েল-টাইম আপডেট — নিরাপদ নিয়মে।")}
      ${card("blue", "layout", "UI/UX ডিজাইন", "পরিষ্কার, মোবাইল-ফার্স্ট ইন্টারফেস, যা ব্যবহারকারী সহজে বোঝেন।")}
      ${card("mint", "link", "সিস্টেম ইন্টিগ্রেশন", "পেমেন্ট, নোটিফিকেশন ও থার্ড-পার্টি API একসাথে জুড়ে দেওয়া।")}
      ${card("violet", "shield", "মেইনটেন্যান্স ও সাপোর্ট", "লঞ্চের পরেও পাশে থাকি — বাগ ফিক্স, আপডেট ও নজরদারি।")}
    </div>`)}

    ${sec("কীভাবে কাজ করি", `<ol class="info-steps">
      <li><span>${md("**আলোচনা** — আপনার আইডিয়া, ব্যবহারকারী আর লক্ষ্য ভালো করে বুঝে নিই।")}</span></li>
      <li><span>${md("**পরিকল্পনা** — কী কী থাকবে, কত সময় লাগবে আর খরচ কত — পরিষ্কার করে জানাই।")}</span></li>
      <li><span>${md("**তৈরি** — ধাপে ধাপে কাজ করি; মাঝপথে দেখার ও মতামত দেওয়ার সুযোগ রাখি।")}</span></li>
      <li><span>${md("**লঞ্চ ও সাপোর্ট** — চালু করার পরও ঠিকঠাক চলছে কিনা দেখি, দরকারে আপডেট দিই।")}</span></li>
    </ol>`)}

    ${sec("যে নীতিতে চলি", ul([
      "**হালকা ও দ্রুত** — অকারণ লাইব্রেরি নয়; কম লোড, বেশি গতি।",
      "**মোবাইল-ফার্স্ট** — বেশিরভাগ মানুষ ফোনে ব্রাউজ করেন, তাই ডিজাইন শুরু হয় ফোন দিয়ে।",
      "**নিরাপদ ডেটা** — Firebase Authentication ও Security Rules দিয়ে তথ্যের সুরক্ষা।",
      "**খোলামেলা যোগাযোগ** — কাজের অগ্রগতি আর খরচ নিয়ে সবসময় স্পষ্ট কথা।"
    ]))}

    ${sec("আপনার প্রজেক্ট নিয়ে কথা বলতে চান?", `
      ${p("ফর্ম পূরণ করুন, অথবা সরাসরি যোগাযোগ করুন — আমরা আপনার আইডিয়া শুনতে আগ্রহী।")}
      <div style="margin:14px 0 16px"><button type="button" class="btn btn-primary" data-info-action="start">প্রজেক্ট শুরু করুন</button></div>
      ${contactBlock()}`)}

    ${moreLinks("about")}`;
}

function privacyPage() {
  return `
    <p class="info-lead">${md("আপনার তথ্য আপনার আমানত। এই পাতায় সহজ ভাষায় লেখা আছে — আমরা কোন তথ্য নিই, কেন নিই, কোথায় থাকে এবং আপনি কী করতে পারেন।")}</p>
    ${metaLine()}

    ${sec("আমরা কোন তথ্য সংগ্রহ করি", ul([
      "**অ্যাকাউন্টের তথ্য:** নাম ও ইমেইল; ইচ্ছা করলে ফোন নম্বর, নিজের সম্পর্কে দু-এক লাইন এবং প্রোফাইল ছবি। Google বা GitHub দিয়ে লগইন করলে সেই সেবা থেকে আপনার নাম, ইমেইল ও প্রোফাইল ছবি পাওয়া যায়।",
      "**প্রজেক্ট অনুরোধ:** বুকিং ফর্মে আপনার দেওয়া নাম, ইমেইল, ফোন/WhatsApp, বাজেট, সময়সীমা ও প্রজেক্টের বিবরণ।",
      "**ডিভাইসে রাখা ছোট তথ্য:** লগইন সেশন, আপনার বেছে নেওয়া থিম (লাইট/ডার্ক) এবং অফলাইনে দ্রুত খোলার জন্য সাইটের ফাইলের ক্যাশ।"
    ]) + p("আপনার পাসওয়ার্ড আমরা দেখতে পাই না — সেটি Firebase Authentication সুরক্ষিতভাবে সামলায়।"), 1)}

    ${sec("কেন এই তথ্য ব্যবহার করি", ul([
      "অ্যাকাউন্ট চালু ও নিরাপদ রাখতে;",
      "আপনার প্রজেক্ট অনুরোধের উত্তর দিতে ও কাজের অবস্থা জানাতে;",
      "সাইটের ত্রুটি ঠিক করতে ও সেবার মান বাড়াতে;",
      "আপনি যোগাযোগ করলে সহায়তা দিতে।"
    ]) + note("**আমরা আপনার তথ্য বিক্রি করি না**, বিজ্ঞাপনদাতাদের সাথেও ভাগ করি না।"), 2)}

    ${sec("তথ্য কোথায় থাকে ও কার সাথে ভাগ হয়", ul([
      "**Google Firebase** (Authentication, Firestore ডেটাবেস, হোস্টিং): অ্যাকাউন্ট ও অনুরোধের তথ্য এখানে সংরক্ষিত থাকে। এর সার্ভার বাংলাদেশের বাইরে হতে পারে।",
      "**Google Fonts:** সাইটের ফন্ট Google-এর সার্ভার থেকে আসে; ফন্ট লোডের সময় আপনার আইপি অ্যাড্রেস Google-এ পৌঁছায়।",
      "**Google ও GitHub লগইন:** এগুলো বেছে নিলে ওই সেবার নিজস্ব গোপনীয়তা নীতি প্রযোজ্য হবে।",
      "**WhatsApp, Facebook, YouTube, ফোন ও ইমেইল লিংক:** ট্যাপ করলে আপনি আমাদের সাইট ছেড়ে ওই অ্যাপ বা সেবায় যান — সেখানে তাদের নীতি চলে।"
    ]) + p("আইন বা বৈধ আদেশে বাধ্য হলে, অথবা প্রতারণা ও নিরাপত্তা-ঝুঁকি ঠেকাতে যতটুকু জরুরি ততটুকু তথ্য প্রকাশ করতে পারি।"), 3)}

    ${sec("কুকি, লোকাল স্টোরেজ ও ট্র্যাকিং", p("আমরা বিজ্ঞাপনের কুকি বা অ্যানালিটিক্স ট্র্যাকার ব্যবহার করি না। লগইন ধরে রাখতে Firebase ব্রাউজারের স্টোরেজ ব্যবহার করে, আর থিমের পছন্দ লোকাল স্টোরেজে থাকে। ব্রাউজারের সাইট-ডেটা মুছলে এগুলোও মুছে যায় (তখন আবার লগইন করতে হবে)।") + p("ভবিষ্যতে এ ধরনের কিছু যোগ করলে এই নীতি হালনাগাদ করা হবে।"), 4)}

    ${sec("আপনার অধিকার", ul([
      "**দেখা ও সংশোধন:** Profile → Edit profile থেকে নাম, ফোন, নিজের সম্পর্কে ও ছবি নিজেই বদলাতে পারেন।",
      "**মুছে ফেলার অনুরোধ:** নিচের যেকোনো মাধ্যমে জানালে আপনার অ্যাকাউন্ট ও সংশ্লিষ্ট তথ্য মুছে ফেলার ব্যবস্থা করব (আইনে যা রাখা বাধ্যতামূলক, তা ছাড়া)।",
      "**প্রশ্ন বা আপত্তি:** আপনার তথ্য কীভাবে ব্যবহার হচ্ছে তা নিয়ে যেকোনো সময় প্রশ্ন করতে পারেন।"
    ]), 5)}

    ${sec("কতদিন সংরক্ষণ করি", p("অ্যাকাউন্ট সক্রিয় থাকা পর্যন্ত, আর প্রজেক্ট সংক্রান্ত রেকর্ড কাজ ও সাপোর্টের প্রয়োজনে যতদিন লাগে। মুছে ফেলার অনুরোধ পেলে যুক্তিসঙ্গত সময়ের মধ্যে ব্যবস্থা নেওয়া হয়।"), 6)}

    ${sec("নিরাপত্তা", p("Firebase Authentication, HTTPS এবং Firestore Security Rules ব্যবহার করা হয়, যাতে প্রত্যেক ব্যবহারকারী শুধু নিজের তথ্য দেখতে পান (অ্যাডমিন ছাড়া)। তবে ইন্টারনেটে শতভাগ নিরাপত্তার নিশ্চয়তা কেউ দিতে পারে না — তাই শক্ত পাসওয়ার্ড ব্যবহার করুন এবং অন্য কাউকে দেবেন না।"), 7)}

    ${sec("শিশুদের গোপনীয়তা", p("সাইটটি শিশুদের জন্য তৈরি নয়। ১৮ বছরের কম বয়সীরা অভিভাবকের অনুমতি ও তত্ত্বাবধানে ব্যবহার করবেন।"), 8)}

    ${sec("নীতিতে পরিবর্তন", p("নীতিতে গুরুত্বপূর্ণ কোনো পরিবর্তন হলে নতুন তারিখসহ এই পাতাতেই জানানো হবে।"), 9)}

    ${sec("যোগাযোগ", p("গোপনীয়তা নিয়ে যেকোনো প্রশ্ন বা অনুরোধ জানান:") + contactBlock(), 10)}

    ${moreLinks("privacy")}`;
}

function termsPage() {
  return `
    <p class="info-lead">${md("Tech Verse-এর সাইট ও সেবা ব্যবহার করলে আপনি নিচের শর্তগুলো মেনে নিচ্ছেন বলে ধরা হবে। শর্তগুলো সহজ ভাষায় লেখা।")}</p>
    ${metaLine()}

    ${sec("সেবার পরিচয়", p("Tech Verse ওয়েব অ্যাপ, PWA, Firebase-ভিত্তিক সিস্টেম ও UI/UX ডিজাইনের মতো সফটওয়্যার সেবা দেয়। এই সাইট সেই সেবা সম্পর্কে জানার এবং প্রজেক্টের অনুরোধ পাঠানোর মাধ্যম।"), 1)}

    ${sec("অ্যাকাউন্ট", ul([
      "সঠিক তথ্য দিয়ে অ্যাকাউন্ট খুলবেন।",
      "পাসওয়ার্ড গোপন রাখা আপনার দায়িত্ব; আপনার অ্যাকাউন্ট থেকে যা ঘটে তার দায় আপনার।",
      "সন্দেহজনক বা অপব্যবহারমূলক কার্যকলাপ ধরা পড়লে অ্যাকাউন্ট সাময়িক বা স্থায়ীভাবে বন্ধ করার অধিকার আমাদের থাকবে।"
    ]), 2)}

    ${sec("প্রজেক্ট অনুরোধ ও চুক্তি", ul([
      "বুকিং ফর্ম জমা দেওয়া মানে আলোচনার আবেদন — এতে কাজ নিশ্চিত হয় না।",
      "কাজের পরিধি, সময়, দাম ও পেমেন্টের ধাপ আলাদা লিখিত প্রস্তাবনা বা চুক্তিতে ঠিক হবে; দুই পক্ষ সম্মত হলেই কাজ শুরু হবে।",
      "সাইটে দেখানো প্যাকেজগুলো শুধু ধারণা দেওয়ার জন্য; চূড়ান্ত দাম কনসালটেশনের পর নির্ধারিত হয়।"
    ]), 3)}

    ${sec("পেমেন্ট, পরিবর্তন ও বাতিল", p("পেমেন্টের সময়সূচি, কাজের পরিধি বদলানো, বাতিল ও রিফান্ডের নিয়ম প্রতিটি প্রজেক্টের লিখিত প্রস্তাবনায় উল্লেখ থাকবে — সেটিই চূড়ান্ত বলে গণ্য হবে।"), 4)}

    ${sec("মেধাস্বত্ব", ul([
      "এই সাইটের ডিজাইন, লেখা, কোড ও লোগো Tech Verse-এর; অনুমতি ছাড়া কপি, বিক্রি বা পুনর্বিতরণ করা যাবে না।",
      "ক্লায়েন্ট প্রজেক্টের মালিকানা ও ব্যবহারের অধিকার চুক্তিতে যেভাবে লেখা থাকবে সেভাবে কার্যকর হবে।",
      "ওপেন-সোর্স টুল ও ফন্টের স্বত্ব তাদের নিজ নিজ নির্মাতার — বিস্তারিত {{credits|Credits}} পাতায়।"
    ]), 5)}

    ${sec("গ্রহণযোগ্য ব্যবহার", p("নিচের কাজগুলো করা যাবে না:") + ul([
      "আইনবিরুদ্ধ কাজে সাইট ব্যবহার;",
      "অন্যের অ্যাকাউন্ট বা তথ্যে অনুমতি ছাড়া ঢোকার চেষ্টা;",
      "সাইটের নিরাপত্তা বা কার্যক্ষমতা নষ্ট করার চেষ্টা (স্প্যাম, ভুয়া অনুরোধ, স্বয়ংক্রিয় আক্রমণ);",
      "অপমানজনক, বিভ্রান্তিকর বা ক্ষতিকর কনটেন্ট পাঠানো।"
    ]), 6)}

    ${sec("তৃতীয় পক্ষের সেবা ও লিংক", p("Firebase, Google, GitHub, WhatsApp, Facebook ও YouTube-এর মতো বাইরের সেবা তাদের নিজস্ব শর্তে চলে। তাদের কনটেন্ট, প্রাপ্যতা বা নীতির দায় আমাদের নয়।"), 7)}

    ${sec("সেবার প্রাপ্যতা ও দায়ের সীমা", ul([
      "সাইটটি “যেমন আছে” ভিত্তিতে দেওয়া হয়; ইন্টারনেট বা তৃতীয় পক্ষের সমস্যায় সাময়িক বিঘ্ন ঘটতে পারে — নিরবচ্ছিন্ন চলার নিশ্চয়তা দেওয়া যায় না।",
      "আইন যতটুকু অনুমতি দেয়, পরোক্ষ বা আনুষঙ্গিক ক্ষতির দায় আমরা নিই না; কোনো ক্ষেত্রে আমাদের দায় সংশ্লিষ্ট সেবার জন্য আপনার পরিশোধিত অর্থের বেশি হবে না।"
    ]), 8)}

    ${sec("শর্তের পরিবর্তন", p("প্রয়োজনে শর্ত বদলাতে পারি; বদলালে নতুন তারিখসহ এই পাতায় প্রকাশ করা হবে। পরিবর্তনের পরও সাইট ব্যবহার করলে নতুন শর্ত মেনে নেওয়া হয়েছে বলে ধরা হবে। আপনি চাইলে যেকোনো সময় ব্যবহার বন্ধ করতে পারেন।"), 9)}

    ${sec("প্রযোজ্য আইন ও বিরোধ নিষ্পত্তি", p("এই শর্তাবলি বাংলাদেশের প্রচলিত আইন অনুযায়ী ব্যাখ্যা ও প্রযোজ্য হবে। কোনো বিরোধ হলে আগে আলাপ-আলোচনার মাধ্যমে মেটানোর চেষ্টা করা হবে।"), 10)}

    ${sec("যোগাযোগ", p("শর্ত নিয়ে প্রশ্ন থাকলে জানান:") + contactBlock(), 11)}

    ${moreLinks("terms")}`;
}

const HELP_QA = [
  {
    q: "কীভাবে নতুন প্রজেক্ট শুরু করব?",
    a: "হোম পেজের নিচে **“আপনার প্রজেক্টের কথা বলুন”** ফর্মটি দুই ধাপে পূরণ করুন — প্রথমে সার্ভিস বেছে নাম-ইমেইল দিন, তারপর বাজেট, সময় ও বিবরণ লিখে জমা দিন। আমরা যোগাযোগ করব।",
    action: { key: "start", label: "প্রজেক্ট ফর্মে যান" }
  },
  {
    q: "আমার অনুরোধের অবস্থা কোথায় দেখব?",
    a: "লগইন করে হেডারের প্রোফাইল ছবিতে ট্যাপ করুন, তারপর **My Project**-এ যান। সেখানে প্রতিটি অনুরোধের অবস্থা দেখা যায় — নতুন, যোগাযোগ করা হয়েছে, চলমান, সম্পন্ন বা বাতিল।"
  },
  {
    q: "পাসওয়ার্ড ভুলে গেছি, কী করব?",
    a: "লগইন ফর্মে **“পাসওয়ার্ড ভুলে গেছেন?”** চাপুন এবং ইমেইল দিন — রিসেট লিংক চলে আসবে। ইনবক্সে না পেলে স্প্যাম বা প্রোমোশন ফোল্ডার দেখুন। লগইন করা থাকলে **Account Setting** থেকেও রিসেট লিংক পাঠানো যায়।",
    action: { key: "login", label: "লগইন খুলুন" }
  },
  {
    q: "লগইন করতে পারছি না",
    a: "ইমেইল ও পাসওয়ার্ড আবার মিলিয়ে দেখুন। আগে Google বা GitHub দিয়ে সাইন আপ করে থাকলে সেই পদ্ধতিতেই লগইন করুন। তবুও না হলে নিচের যেকোনো মাধ্যমে জানান — কোন ইমেইল দিয়ে চেষ্টা করছেন সেটা লিখলে দ্রুত সাহায্য করতে পারব।"
  },
  {
    q: "প্রোফাইল ছবি বা তথ্য বদলাব কীভাবে?",
    a: "প্রোফাইল ছবিতে ট্যাপ করে **Edit profile**-এ যান। নাম, ফোন, নিজের সম্পর্কে লেখা ও ছবি বদলানো যায়। ছবি বেছে নিলে সেটা নিজে থেকেই ছোট করে সংরক্ষণ হয়।"
  },
  {
    q: "ফোনে অ্যাপের মতো ইনস্টল করা যায়?",
    a: "হ্যাঁ। Chrome-এ ⋮ মেনু থেকে **Install app / Add to Home screen**, আর iPhone-এর Safari-তে **Share → Add to Home Screen** বেছে নিন। ইনস্টল করলে সাইট দ্রুত খোলে, আর ইন্টারনেট না থাকলেও যোগাযোগের তথ্যসহ ফুটার দেখা যায়।"
  },
  {
    q: "সাইট ঠিকমতো দেখাচ্ছে না বা পুরোনো লাগছে",
    a: "পেজটি একবার রিফ্রেশ করুন। তাতে না হলে ব্রাউজারের সেটিংস থেকে এই সাইটের ডেটা/ক্যাশ মুছে আবার খুলুন।"
  }
];

function helpPage() {
  const qa = HELP_QA.map(
    (item) => `<details class="info-q">
      <summary><span>${esc(item.q)}</span>${icons.chevronRight}</summary>
      <div class="ans">${p(item.a)}${item.action ? `<button type="button" class="btn btn-soft btn-sm" data-info-action="${item.action.key}">${esc(item.action.label)}</button>` : ""}</div>
    </details>`
  ).join("");
  return `
    <p class="info-lead">${md("কোনো সমস্যা বা প্রশ্ন? আগে নিচের সমাধানগুলো দেখুন — না মিললে সরাসরি আমাদের জানান।")}</p>

    ${sec("সরাসরি যোগাযোগ", contactBlock() + note("আমরা যত দ্রুত সম্ভব উত্তর দিই। **জরুরি হলে** WhatsApp বা কলে যোগাযোগ করুন।"))}

    ${sec("সাধারণ প্রশ্ন ও সমাধান", qa)}

    ${moreLinks("help")}`;
}

function creditRow(tone, iconKey, title, desc, pills = []) {
  return `<div class="info-credit tone-${tone}">
    <span class="ico">${icon(iconKey)}</span>
    <div class="txt"><b>${esc(title)}</b><span class="d">${md(desc)}</span>
      ${pills.length ? `<div class="info-pills">${pills.map((x) => `<span class="info-pill">${esc(x)}</span>`).join("")}</div>` : ""}
    </div>
  </div>`;
}

function creditsPage() {
  return `
    <p class="info-lead">${md("এই সাইট দাঁড়িয়ে আছে কিছু চমৎকার ওপেন টুল আর সেবার ওপর। তাদের প্রতি কৃতজ্ঞতা।")}</p>

    ${sec("যাদের ধন্যবাদ", [
      creditRow("blue", "code", "Tech Verse — ডিজাইন ও ডেভেলপমেন্ট", "এই সাইটের ডিজাইন ও কোড: পিওর HTML, CSS ও JavaScript — কোনো UI ফ্রেমওয়ার্ক বা বান্ডলার ছাড়া।", ["Pure JS", "Pure CSS"]),
      creditRow("violet", "server", "Firebase (Google)", "লগইন (Authentication) ও ডেটাবেস (Cloud Firestore) — নিরাপদ ও রিয়েল-টাইম ব্যাকএন্ড।", ["Apache-2.0 (SDK)"]),
      creditRow("mint", "book", "Google Fonts", "**Plus Jakarta Sans**, **Hind Siliguri** (বাংলা) ও **JetBrains Mono** ফন্ট।", ["SIL OFL 1.1"]),
      creditRow("rose", "sparkle", "Feather Icons", "আইকনের একটি অংশ Feather Icons থেকে নেওয়া বা অনুপ্রাণিত; বাকিগুলো একই স্টাইলে এই প্রজেক্টের জন্য আঁকা।", ["MIT"]),
      creditRow("slate", "shield", "নাম ও লোগো", "Google, GitHub, WhatsApp, Facebook, YouTube ও Yahoo-র নাম ও লোগো তাদের নিজ নিজ মালিকের ট্রেডমার্ক — শুধু পরিচয় বোঝানোর জন্য ব্যবহার করা হয়েছে।", ["ট্রেডমার্ক"]),
      creditRow("rose", "heart", "আপনি", "এই সাইট ব্যবহার করার জন্য এবং আমাদের ওপর ভরসা রাখার জন্য — ধন্যবাদ।")
    ].join(""))}

    ${moreLinks("credits")}`;
}

const PAGES = { about: aboutPage, privacy: privacyPage, terms: termsPage, help: helpPage, credits: creditsPage };

/* ------------------------------------------------------------------ শিট (খোলা/বন্ধ, হিস্ট্রি, ফোকাস) */
let api = null;

export function openInfo(key) {
  if (api) api.open(key);
}

export function initInfo(opts = {}) {
  if (api) return api;

  const overlay = document.createElement("div");
  overlay.className = "info-overlay";
  overlay.id = "infoOverlay";
  overlay.innerHTML = `
    <div class="info-sheet" role="dialog" aria-modal="true" aria-labelledby="infoTitle">
      <header class="info-head">
        <span class="info-ico" id="infoIco"></span>
        <div class="info-titles"><h2 id="infoTitle" tabindex="-1" lang="en"></h2><p id="infoSub"></p></div>
        <button type="button" class="info-close" aria-label="বন্ধ করুন">${icons.close}</button>
      </header>
      <div class="info-body" id="infoBody"></div>
    </div>`;
  document.body.appendChild(overlay);

  const sheet = overlay.querySelector(".info-sheet");
  const ico = overlay.querySelector("#infoIco");
  const title = overlay.querySelector("#infoTitle");
  const sub = overlay.querySelector("#infoSub");
  const body = overlay.querySelector("#infoBody");
  const originalTitle = document.title;

  const state = {
    open: false,
    key: null,
    depth: 0,          // এই শিট থেকে আমরা যতগুলো history এন্ট্রি যোগ করেছি
    deepLoaded: false, // শিটের নিচের এন্ট্রিটার URL-এ নিজেই #key আছে (সরাসরি লিংক/টাইপ করা)
    expectClean: false,
    navigating: false,
    pending: [],
    lastFocus: null
  };

  const cleanUrl = () => window.location.pathname + window.location.search;
  const keyFromHash = () => {
    const k = window.location.hash.replace("#", "");
    return PAGES[k] ? k : null;
  };

  function afterNav(fn) {
    if (state.navigating) state.pending.push(fn);
    else fn();
  }
  function flushPending() {
    state.pending.splice(0).forEach((fn) => fn());
  }
  function travel(n) {
    state.navigating = true;
    history.go(-n);
    setTimeout(() => { if (state.navigating) { state.navigating = false; flushPending(); } }, 400);
  }

  function render(key) {
    const meta = INFO_LABELS[key];
    state.key = key;
    ico.className = `info-ico tone-${meta.tone}`;
    ico.innerHTML = icon(meta.icon);
    title.textContent = meta.label;
    sub.textContent = meta.bn;
    body.innerHTML = PAGES[key]();
    body.scrollTop = 0;
    document.title = `${meta.label} — ${CONTACT.brand}`;
  }

  function show(key, { push }) {
    const wasOpen = state.open;
    if (!wasOpen) {
      state.lastFocus = document.activeElement;
      state.open = true;
      lockScroll();
      overlay.classList.add("open");
    }
    render(key);
    if (push) {
      state.depth += 1;
      try { history.pushState({ tvInfo: state.depth }, "", `#${key}`); } catch (_) {}
    }
    if (!wasOpen) setTimeout(() => title.focus({ preventScroll: true }), 60);
  }

  function hide() {
    if (!state.open) return;
    state.open = false;
    overlay.classList.remove("open");
    unlockScroll();
    document.title = originalTitle;
    const f = state.lastFocus;
    state.lastFocus = null;
    if (f && document.contains(f) && typeof f.focus === "function") setTimeout(() => f.focus({ preventScroll: true }), 0);
  }

  function open(key) {
    if (!PAGES[key]) return;
    afterNav(() => {
      if (state.open && state.key === key) return;
      if (!state.open) state.deepLoaded = false;
      show(key, { push: true });
    });
  }

  function close() {
    if (!state.open) return;
    const depth = state.depth;
    const deep = state.deepLoaded;
    state.depth = 0;
    state.deepLoaded = false;
    hide();
    if (depth > 0) {
      state.expectClean = deep;
      travel(depth);
    } else if (deep) {
      try { history.replaceState(null, "", cleanUrl()); } catch (_) {}
    }
  }

  /** URL/হিস্ট্রির সাথে শিটের অবস্থা মেলানো (Back/Forward, হাতে লেখা #লিংক, সরাসরি লিংকে ঢোকা) */
  function sync() {
    state.navigating = false;
    const key = keyFromHash();
    const st = window.history.state;
    const d = (st && st.tvInfo) || 0;
    if (state.expectClean) {
      state.expectClean = false;
      if (key) { try { history.replaceState(null, "", cleanUrl()); } catch (_) {} }
      hide();
    } else if (key) {
      if (!state.open) {
        state.depth = d;
        state.deepLoaded = d === 0;
        show(key, { push: false });
      } else {
        state.depth = d;
        if (key !== state.key) render(key);
      }
    } else if (state.open) {
      state.depth = 0;
      state.deepLoaded = false;
      hide();
    }
    flushPending();
  }

  window.addEventListener("popstate", sync);
  window.addEventListener("hashchange", () => {
    // popstate আগে থেকেই মিলিয়ে দিয়ে থাকলে কিছু করার নেই (sync ইডেমপোটেন্ট)
    const key = keyFromHash();
    if ((key && (!state.open || key !== state.key)) || (!key && state.open)) sync();
  });

  /* ক্লিক: ফুটারের লিংক ([data-info]), শিটের ভেতরের ক্রস-লিংক ([data-info-go]), বাটন ([data-info-action]) */
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-info], [data-info-go]");
    if (link) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // নতুন ট্যাবে খুললে আসল #লিংকেই যাবে
      e.preventDefault();
      open(link.dataset.info || link.dataset.infoGo);
      return;
    }
    const act = e.target.closest("[data-info-action]");
    if (act && overlay.contains(act)) {
      const which = act.dataset.infoAction;
      close();
      afterNav(() => requestAnimationFrame(() => {
        if (which === "start" && opts.onStartProject) opts.onStartProject();
        if (which === "login" && opts.onOpenAuth) opts.onOpenAuth("login");
      }));
      return;
    }
    if (e.target === overlay || e.target.closest(".info-close")) close();
  });

  document.addEventListener("keydown", (e) => {
    if (!state.open) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...sheet.querySelectorAll('a[href], button:not([disabled]), summary, [tabindex="0"]')].filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!sheet.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement === title)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // সরাসরি লিংকে ঢুকলে (যেমন /index.html#privacy) শিট খুলে দেয়
  if (keyFromHash()) sync();

  api = { open, close, isOpen: () => state.open };
  return api;
}
