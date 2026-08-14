import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // همان نام‌مستعارِ tsconfig. بدون این، هر فایلی که با "@/..." ایمپورت
      // می‌کند در تست پیدا نمی‌شود — و همه‌ی کد اپ همین‌طور ایمپورت می‌کند.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // jsdom لازم است چون تست هوک‌های ری‌اکت بدون DOM اجرا نمی‌شود.
    // تست‌های خالصِ منطقی (مثل تبدیل تاریخ) هم زیر jsdom بی‌مشکل می‌مانند.
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
