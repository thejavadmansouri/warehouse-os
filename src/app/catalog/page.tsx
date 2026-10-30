import { connection } from "next/server";
import { requireCustomer } from "@/lib/server-account";
import { CustomerShell } from "@/components/customer-shell";
import { CatalogBrowser } from "./catalog-browser";
import { prisma } from "@/lib/prisma";
import { mapCatalog } from "@/lib/catalog";

export const instant = false;

/*
 * کاتالوگ — رندر اولیه سمت سرور تا اولین قاب خالی نباشد.
 * فیلترها بعد از تایپ از API به‌روز می‌شوند.
 */
export default async function CatalogPage() {
  await connection();

  const acc = await requireCustomer();

  const [products, shipping] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: { volumePrices: { orderBy: { qtyFrom: "asc" } } },
      orderBy: [{ brand: "asc" }, { category: "asc" }, { name: "asc" }],
      take: 200,
    }),
    prisma.shippingMethod.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const initialItems = mapCatalog(
    products,
    {
      tierDiscountPercent: acc.tierDiscount,
      customerDiscountPercent: acc.customerDiscount,
    },
    acc.customer.status === "ACTIVE",
  );

  return (
    <CustomerShell
      companyName={acc.customer.companyName}
      wallet={acc.wallet}
      active="catalog"
    >
      <CatalogBrowser
        initialItems={initialItems}
        canOrder={acc.customer.status === "ACTIVE"}
        wallet={acc.wallet}
        availableCredit={acc.availableCredit}
        creditLimit={acc.creditLimit}
        tierDiscount={acc.tierDiscount}
        customerDiscount={acc.customerDiscount}
        shipping={shipping.map((s) => ({
          id: s.id,
          name: s.name,
          cost: Number(s.cost),
          freeAbove: s.freeAbove ? Number(s.freeAbove) : null,
          note: s.note,
        }))}
      />
    </CustomerShell>
  );
}
