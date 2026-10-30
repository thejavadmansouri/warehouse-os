import { connection } from "next/server";
// داده‌ی پویا — بدون پیش‌ساخت
export const instant = false;

import { prisma } from "@/lib/prisma";
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
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold tracking-tight">محصولات</h1>
          <p className="text-xs text-ink-soft mt-0.5">
            {toFaDigits(products.length)} قطعه در کاتالوگ — قیمت، موجودی و پله‌های تخفیف
          </p>
        </div>
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
