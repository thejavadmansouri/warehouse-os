import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // On-prem LAN panel: server-side image optimization buys nothing here and
  // pulls in `sharp`, a per-OS native binary. Turning it off lets the web bundle
  // be built anywhere (e.g. a Mac) and dropped onto the Windows server for a
  // quick front-end-only update, without shipping a wrong-platform sharp.
  images: { unoptimized: true },

  /*
   * عکس‌های کالا/بنر ریشه‌نسبی‌اند (`/storage/...`) و اینجا به API وصل می‌شوند:
   *
   * - همان‌مبدأ: بازدیدکننده فقط از این سرور فایل می‌گیرد (نه پورت 3000) و
   *   `Cross-Origin-Resource-Policy` دیگر اهمیتی ندارد.
   * - HTML سمت سرور و رندر کلاینت یک `src` یکسان می‌سازند ⇒ بدون خطای
   *   hydration (قبلاً سرور `127.0.0.1` و کلاینت `localhost` می‌نوشت).
   */
  async rewrites() {
    const api =
      process.env.SITE_API_URL ??
      `http://127.0.0.1:${process.env.NEXT_PUBLIC_SITE_API_PORT ?? "3000"}`;
    return [{ source: "/storage/:path*", destination: `${api}/storage/:path*` }];
  },

  allowedDevOrigins: [
    "10.141.233.130",
    "192.168.1.136",
  ],

  typescript: {
    ignoreBuildErrors: true,
  },

  reactStrictMode: false,
};

export default nextConfig;
