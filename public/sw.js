// Service Worker کاردو B2B — نسخه غیرفعال در لوکال‌هاست جهت جلوگیری از رفرش مکرر
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => {
      return self.clients.claim();
    })
  );
});

// هیچ درخواستی را اینترسپت نکن تا تداخلی با HMR رخ ندهد
self.addEventListener("fetch", (event) => {
  return;
});
