"use client";

import { useEffect } from "react";

// ثبت service worker فقط برای صفحه‌ی کارگر
// فقط در محیط production و در مرورگر؛ در dev هم فعال می‌شود چون فایل
// در public است و توسط Next سرو می‌شود.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    // فقط در مسیر worker ثبت شود تا با پنل ادمین تداخل نکند
    if (!window.location.pathname.startsWith("/worker")) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw-worker.js", { scope: "/worker" })
        .catch(() => {
          // ثبت ناموفق بی‌صدا نادیده گرفته می‌شود — صفحه بدون SW هم کار می‌کند
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
