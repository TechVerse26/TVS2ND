// sw.js — বেসিক অফলাইন সাপোর্ট (app shell cache)
//
// কৌশল: নিজের সাইটের ফাইল (HTML/CSS/JS) আগে নেটওয়ার্ক থেকে আনে (তাই ডিজাইন/কোড আপডেট করলে ইউজার সাথে সাথেই
// নতুনটা পায়), নেটওয়ার্ক না থাকলে ক্যাশ থেকে দেয়। Firebase SDK ও ফন্টের মতো ভার্সন-করা বাইরের ফাইল ক্যাশ-ফার্স্ট।
// Firestore/Auth API রিকোয়েস্ট কখনো ক্যাশ হয় না।
const CACHE_NAME = "techverse-shell-v7";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./css/drawer.css",
  "./css/footer.css",
  "./js/app.js",
  "./js/drawer.js",
  "./js/theme.js",
  "./js/site.js",
  "./js/contact.js",
  "./js/footer.js",
  "./js/info.js",
  "./js/scrolllock.js",
  "./js/content.js",
  "./js/seed-data.js",
  "./js/icons.js",
  "./js/utils.js",
  "./js/templates.js",
  "./js/router.js",
  "./js/animations.js",
  "./js/toast.js",
  "./js/auth.js",
  "./js/firebase-config.js",
  "./manifest.json",
  "./assets/logo.png"
];

// ফ্যাভিকন/অ্যাপ আইকন (assets/icons/) আলাদাভাবে ক্যাশ হয় — কোনো আইকন ফাইল না থাকলেও বাকি শেল ক্যাশ হতে বাধা পায় না
const ICON_FILES = [
  "./assets/icons/favicon.ico",
  "./assets/icons/favicon-64x64.png",
  "./assets/icons/favicon-48x48.png",
  "./assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(SHELL_FILES).catch(() => {});
      await Promise.all(ICON_FILES.map((f) => cache.add(f).catch(() => {})));
    }).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function store(request, response) {
  if (response && (response.ok || response.type === "opaque")) {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Firebase/Google API রিকোয়েস্ট ক্যাশ না করে সরাসরি নেটওয়ার্কে পাঠানো হয়
  if (url.origin.includes("googleapis") || url.origin.includes("firebase")) return;

  if (url.origin === self.location.origin) {
    // নিজের ফাইল: নেটওয়ার্ক-ফার্স্ট
    event.respondWith(
      fetch(req)
        .then((res) => store(req, res))
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // বাইরের (ভার্সন-করা) ফাইল: ক্যাশ-ফার্স্ট
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => store(req, res)))
  );
});
