import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { mapCatalog } from "@/lib/catalog";

/*
 * کاتالوگ پیشرفته B2B — فیلترهای چندگانه:
 * برند خودرو، مدل خودرو، قسمت و بخش خودرو، برند سازنده قطعه، تاریخ و موجودی
 */
export async function GET(req: NextRequest) {
  const user = await currentUser(req);

  if (!user) {
    return apiError(401, "ANON", "وارد نشده‌اید");
  }

  if (user.role === "admin") {
    return apiError(403, "ADMIN_NO_CATALOG", "کاتالوگ مخصوص مشتریان است");
  }

  const { customer } = user;
  const priceVisible = customer.status === "ACTIVE";

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const brand = searchParams.get("brand")?.trim() ?? ""; // خودرو (برند خودرو)
  const model = searchParams.get("model")?.trim() ?? ""; // مدل خودرو
  const category = searchParams.get("category")?.trim() ?? ""; // قسمت خودرو
  const partBrand = searchParams.get("partBrand")?.trim() ?? ""; // سازنده قطعه
  const inStock = searchParams.get("inStock") === "true";
  const dateFilter = searchParams.get("dateFilter")?.trim() ?? "all";
  const sort = searchParams.get("sort")?.trim() ?? "default";

  // فیلتر تاریخ
  let createdAtCondition: { gte?: Date } | undefined;
  if (dateFilter === "week") {
    createdAtCondition = { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) };
  } else if (dateFilter === "month") {
    createdAtCondition = { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) };
  } else if (dateFilter === "quarter") {
    createdAtCondition = { gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) };
  }

  // مرتب‌سازی
  let orderBy: any = [{ brand: "asc" }, { category: "asc" }, { name: "asc" }];
  if (sort === "newest") {
    orderBy = [{ createdAt: "desc" }];
  } else if (sort === "price_asc") {
    orderBy = [{ price: "asc" }];
  } else if (sort === "price_desc") {
    orderBy = [{ price: "desc" }];
  } else if (sort === "stock_desc") {
    orderBy = [{ stockQty: "desc" }];
  }

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(brand ? { brand } : {}),
      ...(model ? { model: { contains: model, mode: "insensitive" } } : {}),
      ...(category ? { category } : {}),
      ...(partBrand ? { partBrand } : {}),
      ...(inStock ? { stockQty: { gt: 0 } } : {}),
      ...(createdAtCondition ? { createdAt: createdAtCondition } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { oemCode: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
              { model: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
              { partBrand: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { volumePrices: { orderBy: { qtyFrom: "asc" } } },
    orderBy,
    take: 300,
  });

  const items = mapCatalog(
    products,
    {
      tierDiscountPercent: customer.tierDiscount,
      customerDiscountPercent: customer.customerDiscount,
    },
    priceVisible,
  );

  return NextResponse.json({ ok: true, priceVisible, items, total: items.length });
}
