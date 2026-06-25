/* BriloDetails service worker - basic offline cache */
const CACHE = "brilo-v10";
const ASSETS = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./store.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./qr.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Only manage our own app shell. Let cross-origin requests (Supabase REST/
  // realtime, the supabase-js CDN) go straight to the network so live data and
  // auth are never served stale from cache.
  if (url.origin !== self.location.origin) return;
  // Network-first for the app shell: always pick up new deploys when online,
  // fall back to cache only when offline. This ends the "stale cached app" bug.
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
