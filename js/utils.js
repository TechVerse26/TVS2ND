// js/utils.js
// ছোট ছোট হেল্পার ফাংশন — পাবলিক সাইট ও অ্যাডমিন প্যানেল দুটোতেই ব্যবহৃত হয়।

/**
 * ইউজার/ভিজিটর-সাবমিট করা টেক্সট (যেমন বুকিং ফর্মের নাম/মেসেজ) কখনোই সরাসরি innerHTML-এ
 * বসানো উচিত না — তাহলে কেউ ইচ্ছাকৃতভাবে HTML/script ঢুকিয়ে দিতে পারে। তাই যেকোনো জায়গায়
 * পাবলিক ফর্ম থেকে আসা ডেটা টেমপ্লেটে বসানোর আগে সবসময় এই ফাংশন দিয়ে escape করা হয়।
 */
export function escapeHtml(value) {
  const str = value === null || value === undefined ? "" : String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** হেডলাইনের মতো টেক্সটে **শব্দ** লিখলে সেটা অ্যাকসেন্ট রঙে হাইলাইট হয় — বাকিটুকু escape থাকে */
export function parseAccent(text) {
  if (!text) return "";
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<span class="accent">$1</span>');
}

/** Firestore Timestamp, JS Date, বা null — সবকিছু থেকে একটা পড়ার-যোগ্য বাংলা-ঘেঁষা তারিখ বানায় */
export function formatDate(value) {
  if (!value) return "—";
  const d = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("bn-BD", { year: "numeric", month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" });
}

/** সার্চ ইনপুটে প্রতিটা কি-স্ট্রোকে ক্যোয়ারি না চালিয়ে টাইপ থামার পর একবার চালানোর জন্য */
export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** খালি/অকার্যকর ইনপুট থেকে সেফ স্ট্রিং */
export function safeText(value, fallback = "") {
  return (value === null || value === undefined || value === "") ? fallback : String(value);
}

/* বুকিং স্ট্যাটাসের একক তালিকা — প্রোফাইল পেজের ব্যাজ আর অ্যাডমিন প্যানেলের ড্রপডাউন
   দুটোই এখান থেকে নেয়, যাতে কোথাও বানান/রঙ আলাদা হয়ে না যায়। */
export const BOOKING_STATUSES = [
  { value: "নতুন", cls: "st-new" },
  { value: "যোগাযোগ করা হয়েছে", cls: "st-contacted" },
  { value: "চলমান", cls: "st-progress" },
  { value: "সম্পন্ন", cls: "st-done" },
  { value: "বাতিল", cls: "st-cancelled" }
];

export function statusClass(status) {
  return (BOOKING_STATUSES.find((s) => s.value === status) || BOOKING_STATUSES[0]).cls;
}
