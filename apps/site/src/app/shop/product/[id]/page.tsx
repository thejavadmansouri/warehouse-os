import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductView } from "./product-view";
import type { ShopProductDetail } from "@/lib/shop-types";

const API_PORT = process.env.NEXT_PUBLIC_SITE_API_PORT ?? "3000";
/** Same-machine API for server-side fetches (dev and single-box prod). */
const API_BASE =
  process.env.SITE_API_URL ?? `http://127.0.0.1:${API_PORT}`;
const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3002").replace(
  /\/$/,
  ""
);
/** Public API origin for OG images (may differ from SITE_API_URL on a VPS). */
const API_PUBLIC =
  process.env.SITE_API_PUBLIC_URL ??
  (process.env.SITE_URL ?? `http://127.0.0.1:${API_PORT}`);

async function getDetail(id: string): Promise<ShopProductDetail | null> {
  // قیمت و موجودی نباید کشِ کهنه بماند؛ صفحه در هر درخواستِ رندر تازه می‌خواند.
  const res = await fetch(
    `${API_BASE}/shop/products/${encodeURIComponent(id)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return (await res.json()) as ShopProductDetail;
}

/** میانگین ستاره‌ها برای نمایش در نتایج گوگل (AggregateRating). */
async function getRating(
  id: string
): Promise<{ average: number; count: number } | null> {
  try {
    const res = await fetch(
      `${API_BASE}/shop/products/${encodeURIComponent(id)}/reviews`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { average: number; count: number };
    return data.count > 0 ? data : null;
  } catch {
    return null;
  }
}

const STOCK_AVAILABILITY: Record<string, string> = {
  IN: "https://schema.org/InStock",
  LOW: "https://schema.org/LimitedAvailability",
  OUT: "https://schema.org/OutOfStock",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await getDetail(id);
  if (!p) return { title: "کالا یافت نشد" };
  const shopName = "شهر یدکی صادقی";
  const title = `${p.name} | ${shopName}`;
  const priceBit =
    p.price != null
      ? ` — قیمت: ${p.price.toLocaleString("fa-IR")} تومان`
      : "";
  const description = [
    p.name,
    p.brand ? `برند ${p.brand}` : "",
    p.vehicles?.length ? `مناسب ${p.vehicles.slice(0, 3).join("، ")}` : "",
    priceBit,
    ` — خرید از ${shopName}`,
  ]
    .filter(Boolean)
    .join(" ");
  const images = (p.images ?? []).slice(0, 4).map((src) => ({
    url: src.startsWith("http") ? src : `${API_PUBLIC}${src}`,
    alt: p.name,
  }));
  return {
    title,
    description: description.slice(0, 160),
    alternates: { canonical: `${SITE_URL}/shop/product/${p.id}` },
    openGraph: {
      title,
      description: description.slice(0, 200),
      url: `${SITE_URL}/shop/product/${p.id}`,
      type: "website",
      locale: "fa_IR",
      siteName: shopName,
      images,
    },
    twitter: { card: "summary_large_image", title, description: description.slice(0, 200), images: images.map((i) => i.url) },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Server-rendered so crawlers see name, price, images and JSON-LD in the
  // first HTML. Interactive parts (gallery, qty, cart, reviews) stay client.
  const { id } = await params;
  const [p, rating] = await Promise.all([getDetail(id), getRating(id)]);
  if (!p) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku ?? p.id,
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    ...(p.category ? { category: p.category } : {}),
    image: (p.images ?? [])
      .slice(0, 8)
      .map((src) => (src.startsWith("http") ? src : `${API_PUBLIC}${src}`)),
    ...(rating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: rating.average,
            reviewCount: rating.count,
            bestRating: 5,
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/shop/product/${p.id}`,
      priceCurrency: "IRT",
      ...(p.price != null ? { price: p.price } : {}),
      availability: STOCK_AVAILABILITY[p.stock] ?? STOCK_AVAILABILITY.OUT,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* key per id: navigating between related products must reset gallery/qty. */}
      <ProductView key={id} id={id} initial={p} />
    </>
  );
}
