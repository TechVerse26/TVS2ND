// js/content.js
// পাবলিক সাইটের কন্টেন্ট এখন এখান থেকে আসে — সরাসরি Firestore থেকে পড়ে।
// অ্যাডমিন প্যানেলে কেউ কিছু যোগ/এডিট/মুছলে, সাইট রিলোড করলেই সেটা এখানে প্রতিফলিত হয়।

import { db } from "./firebase-config.js";
import {
  collection, getDocs, query, orderBy, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { defaultSettings } from "./seed-data.js";

export const CONTENT_COLLECTIONS = [
  "services", "portfolio", "caseStudies", "testimonials", "team", "stats", "pricingPlans", "faqItems"
];

/** একটা কন্টেন্ট কালেকশন order অনুযায়ী সাজিয়ে নিয়ে আসে — সমস্যা হলে খালি অ্যারে দেয়, সাইট ভাঙে না */
export async function getContent(name) {
  try {
    const q = query(collection(db, name), orderBy("order", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(`"${name}" কালেকশন লোড করতে সমস্যা হয়েছে:`, err);
    return [];
  }
}

/** একসাথে সব কন্টেন্ট কালেকশন লোড করে একটা অবজেক্টে দেয় */
export async function getAllContent() {
  const entries = await Promise.all(CONTENT_COLLECTIONS.map((name) => getContent(name)));
  return Object.fromEntries(CONTENT_COLLECTIONS.map((name, i) => [name, entries[i]]));
}

/** সাইট-ওয়াইড সেটিংস (হিরো টেক্সট, হোয়াটসঅ্যাপ নম্বর ইত্যাদি) — না থাকলে ডিফল্ট মান ব্যবহার হয় */
export async function getSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "site"));
    return snap.exists() ? { ...defaultSettings, ...snap.data() } : { ...defaultSettings };
  } catch (err) {
    console.error("সাইট সেটিংস লোড করতে সমস্যা হয়েছে:", err);
    return { ...defaultSettings };
  }
}
