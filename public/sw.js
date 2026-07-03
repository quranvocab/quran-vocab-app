// Quranic Vocab — Service Worker
// Awami Baitulmaal Committee

const CACHE_NAME = "quranic-vocab-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html"
];

// Install — cache core assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clear old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — only cache same-origin requests, skip ALL external APIs
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Skip external API calls — Supabase, EmailJS, fonts, CDNs
  if (url.origin !== self.location.origin) return;

  // Skip Supabase specifically (belt and braces)
  if (e.request.url.includes("supabase.co")) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});