import { NextResponse } from "next/server";

/**
 * `/robots.txt` روی دامنه‌ی سایت — همان متنِ API با دامنه‌ی درست، چون
 * خط `Sitemap:` باید مطلق باشد تا گوگل آن را پیدا کند.
 */
const API_BASE =
  process.env.SITE_API_URL ??
  `http://127.0.0.1:${process.env.NEXT_PUBLIC_SITE_API_PORT ?? "3000"}`;
const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3002").replace(
  /\/+$/,
  ""
);

export const revalidate = 3600;

export async function GET() {
  try {
    const res = await fetch(
      `${API_BASE}/robots.txt?base=${encodeURIComponent(SITE_URL)}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) throw new Error(`api ${res.status}`);
    const body = await res.text();
    return new NextResponse(body, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch {
    return new NextResponse(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
