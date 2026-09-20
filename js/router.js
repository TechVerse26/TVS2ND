// js/router.js
// খুব হালকা hash রাউটার। প্রোফাইল এখন আলাদা পেজ নয় — স্লাইডার। তাই এখানে শুধু পুরোনো
// #profile লিংক (যেমন অ্যাডমিন গেটের "সাইটে গিয়ে লগইন করুন") কাজ করানো হয়: #profile → স্লাইডার খোলা।

export function initRouter({ onProfile, onHome }) {
  function apply() {
    const hash = window.location.hash.replace("#", "");
    if (hash === "profile") onProfile();
    else onHome();
  }
  window.addEventListener("hashchange", apply);
  apply();
}

/** URL থেকে #hash সরিয়ে দেয় (পেজ স্ক্রল/রিলোড ছাড়াই) */
export function clearHash() {
  history.replaceState(history.state, "", window.location.pathname + window.location.search);
}
