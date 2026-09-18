// sw.js — বেসিক অফলাইন সাপোর্ট (app shell cache)
const CACHE_NAME = "techverse-shell-v3";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/content.js",
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
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

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Firebase/Google API রিকোয়েস্ট ক্যাশ না করে সরাসরি নেটওয়ার্কে পাঠানো হয়
  if (url.origin.includes("googleapis") || url.origin.includes("firebase")) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return res;
          })
          .catch(() => caches.match("./index.html"))
      );
    })
  );
});
