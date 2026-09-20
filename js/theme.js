// js/theme.js
// থিম: "system" (ডিফল্ট — OS-এর সাথে মিলে), "light" বা "dark"। পছন্দ localStorage-এ "tv-theme" কী-তে থাকে
// (system হলে কী-টা থাকে না)। <head>-এর ছোট ইনলাইন স্ক্রিপ্ট পেইন্টের আগেই data-theme বসিয়ে দেয়, যাতে ঝলক না লাগে।

const KEY = "tv-theme";
const listeners = [];
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function read() {
  try { return localStorage.getItem(KEY); } catch (_) { return null; }
}
function write(v) {
  try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (_) {}
}

export function getThemePref() {
  const v = read();
  return v === "light" || v === "dark" ? v : "system";
}

export function effectiveTheme() {
  const pref = getThemePref();
  return pref !== "system" ? pref : darkQuery.matches ? "dark" : "light";
}

function syncChrome() {
  // ব্রাউজারের অ্যাড্রেস বার/স্ট্যাটাস বারের রঙ পেজের সাথে মেলানো
  const meta = document.getElementById("metaThemeColor");
  if (meta) meta.setAttribute("content", effectiveTheme() === "dark" ? "#0A1120" : "#F6F9FD");
}

export function setThemePref(pref) {
  const root = document.documentElement;
  if (pref === "light" || pref === "dark") {
    write(pref);
    root.setAttribute("data-theme", pref);
  } else {
    write(null);
    root.removeAttribute("data-theme");
  }
  syncChrome();
  listeners.forEach((fn) => fn(getThemePref()));
}

/** হেডারের সান/মুন বাটন — এখনকার দৃশ্যমান থিমের উল্টোটা বেছে নেয় */
export function toggleTheme() {
  setThemePref(effectiveTheme() === "dark" ? "light" : "dark");
}

export function onThemeChange(fn) {
  listeners.push(fn);
}

export function initTheme() {
  const saved = read();
  if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
  syncChrome();
  // "system" থাকা অবস্থায় OS-এর থিম বদলালে UI আপডেট
  const onSystemChange = () => { if (getThemePref() === "system") { syncChrome(); listeners.forEach((fn) => fn("system")); } };
  if (darkQuery.addEventListener) darkQuery.addEventListener("change", onSystemChange);
  else if (darkQuery.addListener) darkQuery.addListener(onSystemChange);
}
