// js/router.js
// খুব হালকা hash-based রাউটার — শুধু "মূল সাইট" আর "প্রোফাইল" ভিউয়ের মধ্যে সুইচ করে।

export function initRouter({ onProfile, onHome }) {
  function apply() {
    const hash = window.location.hash.replace("#", "");
    if (hash === "profile") {
      onProfile();
    } else {
      onHome();
    }
  }
  window.addEventListener("hashchange", apply);
  apply();
}

export function goTo(route) {
  window.location.hash = route;
}
