import { connection } from "next/server";
// داده‌ی پویا — بدون پیش‌ساخت
export const instant = false;

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";
import { ProductsAdminPanel } from "./products-admin-panel";

export default async function AdminProductsPage() {
  await connection();
  const products = await prisma.product.findMany({
    orderBy: [{ brand: "asc" }, { name: "asc" }],
    include: { volumePrices: { orderBy: { qtyFrom: "asc" } } },
    take: 300,
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 pb-16">
      <div className="flex items-center justify-between gap-3 flex-wrap pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-slate-900">محصولات و موجودی انبار</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {toFaDigits(products.length)} قطعه در کاتالوگ — قیمت، موجودی و پله‌های تخفیف
          </p>
        </div>

        <Link
          href="/admin/import"
          className="btn btn-brass text-xs px-4 py-2 font-bold flex items-center gap-1.5 shadow-xs"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          <span>ورود گروهی با فایل اکسل</span>
        </Link>
      </div>

      <ProductsAdminPanel
        products={products.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          brand: p.brand,
          model: p.model,
          category: p.category,
          unit: p.unit,
          packSize: p.packSize,
          minQty: p.minQty,
          price: Number(p.price),
          priceLabel: formatToman(p.price),
          stockQty: p.stockQty,
          isActive: p.isActive,
          volumePrices: p.volumePrices.map((v) => ({
            qtyFrom: v.qtyFrom,
            discountPercent: Number(v.discountPercent),
          })),
        }))}
      />
    </div>
  );
}
