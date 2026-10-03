// Service Worker ساده برای صفحه‌ی کارگر (/worker)
// فقط shell استاتیک را کش می‌کند — داده‌های API هرگز کش نمی‌شوند
// (صفحه برای هر عملیات به شبکه نیاز دارد). نسخه‌ی کش با بامپ VERSION عوض می‌شود.

const VERSION = "worker-shell-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const SHELL_ASSETS = [
  "/worker",
  "/manifest.json",
  "/icons/worker-icon-192.png",
  "/icons/worker-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        // addAll	all-or-nothing است؛ اگر یک فایل نبود، نصب fail شود ولی SW فعال بماند
        Promise.allSettled(
          SHELL_ASSETS.map((url) =>
            cache.add(new Request(url, { cache: "reload" }))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// استراتژی: شبکه اول برای همه‌ی درخواست‌ها؛ فقط در صورت آفلاین بودن
// به کش shell برگرد. درخواست‌های API هرگز از کش سرو نمی‌شوند.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // فقط GET را مدیریت کن
  if (req.method !== "GET") return;

  // درخواست‌های API (همان origin با /api یا /auth یا ...): هیچ‌گاه کش نشوند
  if (
    url.origin === self.location.origin &&
    !SHELL_ASSETS.includes(url.pathname) &&
    url.pathname !== "/worker" &&
    !url.pathname.startsWith("/_next/static/")
  ) {
    return; // اجازه بده مرورگر عادی handle کند
  }

  // برای shell استاتیک: network-first با fallback به کش
  event.respondWith(
    fetch(req)
      .then((res) => {
        // کپی در کش (فقط پاسخ‌های ok)
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("/worker")))
  );
});
