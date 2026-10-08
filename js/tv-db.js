// js/tv-db.js
// Tech Verse-এর সব Firestore পাথ এক জায়গায়।
// সব ডেটা tvProject/main/** নেমস্পেসে থাকে — firestore.rules-এর পাথের সাথে হুবহু মেলে।
// নেমস্পেসের বাইরের কোনো কালেকশনে অ্যাপ কিছু পড়ে/লেখে না (rules-ও সেটা আটকায়)।
//
//   tvCol("users")                          → tvProject/main/users
//   tvDoc("users", uid)                     → tvProject/main/users/{uid}
//   tvCol("discussions", id, "replies")     → tvProject/main/discussions/{id}/replies

import { db } from "./firebase-config.js";
import { collection, doc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const TV_ROOT = Object.freeze(["tvProject", "main"]);

export const tvCol = (...path) => collection(db, ...TV_ROOT, ...path);
export const tvDoc = (...path) => doc(db, ...TV_ROOT, ...path);
