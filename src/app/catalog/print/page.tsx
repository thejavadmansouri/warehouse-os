import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/server-account";
import { PrintCatalogClient, PrintCatalogItem } from "./print-client";

export const instant = false;

export const metadata = {
  title: "کاتالوگ و لیست قیمت چاپی (PDF) | کاردو B2B",
};

export default async function PrintCatalogPage() {
  const acc = await requireCustomer();
  const customer = acc.customer;

  const totalDiscount = (acc.tierDiscount || 0) + (acc.customerDiscount || 0);

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ brand: "asc" }, { category: "asc" }, { name: "asc" }],
  });

  const items: PrintCatalogItem[] = products.map((p) => {
    const basePrice = Number(p.price);
    const discountMultiplier = Math.max(0, 1 - totalDiscount / 100);
    const finalPrice = Math.round(basePrice * discountMultiplier);

    return {
      id: p.id,
      sku: p.sku,
      oemCode: p.oemCode,
      name: p.name,
      brand: p.brand,
      model: p.model,
      category: p.category,
      partBrand: p.partBrand,
      unit: p.unit,
      basePrice,
      finalPrice,
      stockQty: p.stockQty,
    };
  });

  return (
    <PrintCatalogClient
      items={items}
      customer={{
        companyName: customer.companyName,
        contactName: customer.contactName,
        phone: customer.phone,
        tierName: customer.tier?.name,
        discountPercent: totalDiscount,
      }}
    />
  );
}
