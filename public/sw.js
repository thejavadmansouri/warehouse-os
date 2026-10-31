// Service Worker کاردو B2B — نسخه غیرفعال در لوکال‌هاست جهت جلوگیری از رفرش مکرر
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // هرگز clients.claim() را صدا نزن تا controllerchange و رفرش مکرر رخ ندهد
  event.waitUntil(
    self.registration.unregister().then(() => {
      if (typeof caches !== "undefined") {
        return caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
      }
    })
  );
});
