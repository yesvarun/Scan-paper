/* ScanPaper Service Worker — offline shell + cache of static assets */
const CACHE = "scanpaper-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API / language data / large wasm — always network
  if (
    url.hostname.includes("dictionaryapi.dev") ||
    url.hostname.includes("jsdelivr") ||
    url.hostname.includes("tessdata") ||
    url.pathname.endsWith(".wasm") ||
    url.pathname.includes("traineddata")
  ) {
    return; // network only
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((res) => {
          // Cache successful same-origin GET
          if (res.ok && event.request.method === "GET" && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        }).catch(() => cached)
      );
    })
  );
});
