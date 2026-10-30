import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { mapCatalog } from "@/lib/catalog";

/*
 * کاتالوگ — فقط برای مشتریان وارد‌شده.
 * قیمت فقط برای مشتری ACTIVE محاسبه و برگردانده می‌شود؛ PENDING فقط نام و موجودی.
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
  const brand = searchParams.get("brand")?.trim() ?? "";
  const category = searchParams.get("category")?.trim() ?? "";

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(brand ? { brand } : {}),
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { oemCode: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
              { model: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { volumePrices: { orderBy: { qtyFrom: "asc" } } },
    orderBy: [{ brand: "asc" }, { category: "asc" }, { name: "asc" }],
    take: 200,
  });

  const items = mapCatalog(
    products,
    {
      tierDiscountPercent: customer.tierDiscount,
      customerDiscountPercent: customer.customerDiscount,
    },
    priceVisible,
  );

  return NextResponse.json({ ok: true, priceVisible, items });
}
