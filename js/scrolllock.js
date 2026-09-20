// js/scrolllock.js
// ড্রয়ার/মডাল খোলা থাকলে পেছনের পেজের স্ক্রল বন্ধ রাখে। ডেস্কটপে স্ক্রলবার সরে গেলে কনটেন্ট যেন
// ডানে "লাফ" না দেয়, তাই স্ক্রলবারের সমান প্যাডিং দিয়ে ক্ষতিপূরণ করা হয় (শুধু লক থাকা অবস্থায়)।
// একাধিক জায়গা থেকে লক হলে কাউন্টার রাখা হয় — শেষ আনলকেই আসল আনলক।

let count = 0;

export function lockScroll() {
  if (count++ > 0) return;
  const root = document.documentElement;
  const sbw = window.innerWidth - root.clientWidth;
  root.style.setProperty("--sbw", (sbw > 0 ? sbw : 0) + "px");
  root.classList.add("is-locked");
}

export function unlockScroll() {
  if (count === 0) return;
  if (--count > 0) return;
  const root = document.documentElement;
  root.classList.remove("is-locked");
  root.style.removeProperty("--sbw");
}
