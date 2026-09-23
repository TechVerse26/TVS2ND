// js/firebase-config.js
//
// এখানে আপনার নিজের Firebase প্রজেক্টের কনফিগ বসান।
// Firebase Console → Project settings → General → Your apps → SDK setup and configuration
//
// বিস্তারিত সেটআপ ধাপ README.md ফাইলে দেওয়া আছে।

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app-check.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA33aia52cAM2n-W6IvuaTdBtdcy0xh-qQ",
  authDomain: "tvsaccount.firebaseapp.com",
  projectId: "tvsaccount",
  storageBucket: "tvsaccount.firebasestorage.app",
  messagingSenderId: "923190024339",
  appId: "1:923190024339:web:fede554f57feac35e91566",
  measurementId: "G-GXJR3YEBMS"
};

export const app = initializeApp(firebaseConfig);

/* ---------------- App Check — স্প্যাম/বট থেকে সুরক্ষা ----------------
   কাজ করে কীভাবে: Firestore/Auth-এ যাওয়া প্রতিটা রিকোয়েস্টের সাথে একটা প্রমাণ (টোকেন) জুড়ে
   দেয় যে রিকোয়েস্টটা সত্যিই আসল ব্রাউজারে চলা tvsaccount সাইট থেকে আসছে। Firebase Console-এ
   "Enforce" অন করলে এই প্রমাণ ছাড়া কোনো রিকোয়েস্ট (যেমন কেউ ব্রাউজার কনসোল/স্ক্রিপ্ট/curl দিয়ে
   সরাসরি bookings কালেকশনে লেখার চেষ্টা করলে) Firebase নিজেই বাতিল করে দেয় — কোডে হাত না দিয়েই।

   চালু করতে ৩টা ধাপ (এই ফাইলে কোড রেডি আছে, বাকিটা কনসোলে করতে হবে, এখান থেকে করা যায় না):
   ১) https://www.google.com/recaptcha/admin/create -এ reCAPTCHA v3 সাইট রেজিস্টার করে
      "সাইট কী" (site key, public) আর "সিক্রেট কী" নাও — ডোমেইনে নিজের আসল ডিপ্লয়েড ডোমেইন দাও।
   ২) Firebase Console → Build → App Check → Apps-এ গিয়ে এই ওয়েব অ্যাপ রেজিস্টার করো,
      প্রোভাইডার reCAPTCHA v3, আর ধাপ ১-এর সিক্রেট কী ওখানে বসাও।
   ৩) নিচের RECAPTCHA_V3_SITE_KEY-এর জায়গায় ধাপ ১-এর "সাইট কী"টা বসাও (সিক্রেট কী না, সাইট কী)।

   ⚠️ ক্রম জরুরি: শুধু এই কোড ডিপ্লয় করলে সাইট ভাঙবে না, প্লেসহোল্ডার কী দিয়েও না — যতক্ষণ না
   Firebase Console → App Check-এ গিয়ে Firestore-এর জন্য "Enforce" অন করছ, সব আগের মতোই চলবে।
   আসল সাইট-কী বসিয়ে ডিপ্লয় করে কিছুদিন মনিটর করে সব ঠিক দেখলে তারপর Enforce অন করো — সাইট-কী
   না বসিয়ে আগেই Enforce অন করলে নিজের সাইটেই লগইন/বুকিং আটকে যাবে। */
const RECAPTCHA_V3_SITE_KEY = "PASTE_YOUR_RECAPTCHA_V3_SITE_KEY_HERE";

// লোকালহোস্টে টেস্ট করার সময় reCAPTCHA কাজ করে না (ডোমেইন রেজিস্টার করা থাকে না), তাই debug
// মোড: ব্রাউজার কনসোলে একটা টোকেন দেখাবে, সেটা Firebase Console → App Check → Manage debug
// tokens-এ একবার বসিয়ে দিলে লোকালহোস্ট থেকেও Firestore/Auth স্বাভাবিকভাবে কাজ করবে।
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

export let appCheck = null;
try {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
} catch (err) {
  // সাইট-কী প্লেসহোল্ডার অবস্থায় থাকলে এখানে একটা warning আসতে পারে — এতে বাকি সাইট
  // (auth/db) ভাঙে না, শুধু App Check-এর প্রকৃত সুরক্ষাটা তখনো একটিভ হয় না।
  console.warn("App Check চালু হয়নি — RECAPTCHA_V3_SITE_KEY আসল সাইট-কী দিয়ে বসানো হয়েছে কি না দেখো:", err);
}

export const auth = getAuth(app);
export const db = getFirestore(app);
