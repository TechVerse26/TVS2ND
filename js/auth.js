// js/auth.js
// সব ধরনের Firebase Authentication লজিক এখানে — ইমেইল/পাসওয়ার্ড, Google, GitHub,
// পাসওয়ার্ড রিসেট, প্রোফাইল আপডেট এবং auth state পরিবর্তন হ্যান্ডলিং।
// রোল/অ্যাডমিন-সংক্রান্ত হেল্পারও এখানে — বাস্তব নিরাপত্তা Firestore Security Rules-এ,
// এই ফাংশনগুলো শুধু UI দেখানোর সিদ্ধান্তে সাহায্য করে।

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();
githubProvider.addScope("user:email");

/** সাধারণ Firebase error code-কে বাংলা মেসেজে রূপান্তর করে */
export function friendlyAuthError(err) {
  const code = err?.code || "";
  const map = {
    "auth/email-already-in-use": "এই ইমেইল দিয়ে আগে থেকেই একটি অ্যাকাউন্ট আছে।",
    "auth/invalid-email": "ইমেইল ঠিকানাটি সঠিক নয়।",
    "auth/weak-password": "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।",
    "auth/user-not-found": "এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।",
    "auth/wrong-password": "পাসওয়ার্ড সঠিক নয়।",
    "auth/invalid-credential": "ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।",
    "auth/too-many-requests": "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
    "auth/popup-closed-by-user": "লগইন উইন্ডোটি বন্ধ হয়ে গেছে, আবার চেষ্টা করুন।",
    "auth/account-exists-with-different-credential": "এই ইমেইলটি অন্য একটি লগইন পদ্ধতিতে ইতিমধ্যে ব্যবহৃত হয়েছে।",
    "auth/network-request-failed": "ইন্টারনেট সংযোগে সমস্যা হচ্ছে, সংযোগ দেখে আবার চেষ্টা করুন।",
    "auth/popup-blocked": "ব্রাউজার লগইন পপআপ আটকে দিয়েছে — পপআপ অনুমতি দিয়ে আবার চেষ্টা করুন।",
    "auth/cancelled-popup-request": "লগইন উইন্ডোটি বন্ধ হয়ে গেছে, আবার চেষ্টা করুন।"
  };
  return map[code] || "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।";
}

/** নতুন ইউজারের জন্য Firestore-এ প্রোফাইল ডকুমেন্ট তৈরি করে (না থাকলে) —
    isAdmin: false স্পষ্টভাবে সেট করা হয়, কারণ users/{uid}-এর সিকিউরিটি রুল
    create-এর সময় এই ফিল্ডটা false হিসেবে থাকা বাধ্যতামূলক করে রেখেছে
    (অন্য কোর্স/এক্সাম সাইটের মতোই একই isAdmin বুলিয়ান স্কিম ব্যবহার করা হচ্ছে)। */
export async function ensureUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      name: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      phone: "",
      isAdmin: false,
      createdAt: serverTimestamp()
    });
  }
}

export async function registerWithEmail(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await ensureUserDoc(cred.user);
  try { await sendEmailVerification(cred.user); } catch (_) {}
  return cred.user;
}

export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function loginWithGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function loginWithGithub() {
  const cred = await signInWithPopup(auth, githubProvider);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

/** বর্তমান ইউজারের ইমেইলে যাচাইকরণ লিংক পাঠায় (অ্যাকাউন্ট সেটিং থেকে ব্যবহৃত) */
export async function sendVerification() {
  if (!auth.currentUser) throw new Error("not-signed-in");
  await sendEmailVerification(auth.currentUser);
}

export async function logout() {
  await signOut(auth);
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveUserProfile(uid, data) {
  await setDoc(doc(db, "users", uid), data, { merge: true });
  if (auth.currentUser && data.name) {
    await updateProfile(auth.currentUser, { displayName: data.name });
  }
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

/* ---------------- Admin role হেল্পার ----------------
   অ্যাডমিন প্যানেলে ঢোকার আগে UI-লেভেলে চেক করতে ব্যবহৃত হয়।
   আসল সুরক্ষা Firestore Security Rules-এ isAdmin() ফাংশনের মাধ্যমে — এখানে না। */

export function isAdminProfile(profile) {
  return !!profile && profile.isAdmin === true;
}

export async function checkIsAdmin(uid) {
  if (!uid) return false;
  const profile = await getUserProfile(uid);
  return isAdminProfile(profile);
}
