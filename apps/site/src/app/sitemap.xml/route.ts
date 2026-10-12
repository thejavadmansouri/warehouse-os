import { NextResponse } from "next/server";

/**
 * `/sitemap.xml` روی دامنه‌ی سایت.
 *
 * خودِ سایت‌مپ در API ساخته می‌شود (از روی کالاهای showOnline)؛ اینجا فقط
 * همان را با دامنه‌ی درست `base` می‌گیریم تا گوگل آدرس‌ها را مطلق ببیند.
 * بدون این route، روی دامنه‌ی اصلی sitemap.xml 404 می‌شد.
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
      `${API_BASE}/sitemap.xml?base=${encodeURIComponent(SITE_URL)}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) throw new Error(`api ${res.status}`);
    const xml = await res.text();
    return new NextResponse(xml, {
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  } catch {
    return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"/>\n", {
      status: 200,
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  }
}
