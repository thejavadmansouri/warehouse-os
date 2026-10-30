// Service Worker کاردو B2B — پشتیبانی PWA و عملکرد بهینه در موبایل
const CACHE_NAME = "kardo-b2b-v1";
const STATIC_ASSETS = [
  "/",
  "/catalog",
  "/manifest.json",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // برای درخواست‌های API مستقیم به شبکه وصل شو
  if (event.request.url.includes("/api/")) {
    return;
  }

  // استراتژی Network-First برای صفحات کاتالوگ و استاتیک با پشتیبانی کش آفلاین
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
