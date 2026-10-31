import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { mapCatalog } from "@/lib/catalog";
import {
  tokenizeQuery,
  buildTokenWhereClause,
  scoreProductMatch,
} from "@/lib/persian-search";

/*
 * کاتالوگ پیشرفته B2B — فیلترهای چندگانه و موتور جستجوی هوشمند پوز کاردو:
 * برند خودرو، مدل خودرو، قسمت و بخش خودرو، برند سازنده قطعه، تاریخ و موجودی
 * جستجوی پیشوندی توکنیزه شده (مثال: «کم پرا» -> کمک فنر پراید)
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

  // توکن‌سازی هوشمند به سبک پوز کاردو
  const tokens = q ? tokenizeQuery(q) : [];

  // مرتب‌سازی پایه در دیتابیس
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

  const baseWhere = {
    isActive: true,
    ...(brand ? { brand } : {}),
    ...(model ? { model: { contains: model, mode: "insensitive" as const } } : {}),
    ...(category ? { category } : {}),
    ...(partBrand ? { partBrand } : {}),
    ...(inStock ? { stockQty: { gt: 0 } } : {}),
    ...(createdAtCondition ? { createdAt: createdAtCondition } : {}),
  };

  let products = await prisma.product.findMany({
    where: {
      ...baseWhere,
      ...(tokens.length > 0 ? buildTokenWhereClause(tokens) : {}),
    },
    include: { volumePrices: { orderBy: { qtyFrom: "asc" } } },
    orderBy: sort === "default" && tokens.length > 0 ? undefined : orderBy,
    take: 300,
  });

  // الگوریتم Fallback یکی‌کم (n-1) برگرفته از پوز کاردو:
  // اگر کاربر چند کلمه وارد کرد اما محصولی پیدا نشد (به دلیل یک کلمه اضافه یا اشتباه املایی جزئی)،
  // با زیرمجموعه‌های n-1 کلمه‌ای جستجو می‌کنیم تا کاربر نتیجه خالی نبیند
  if (products.length === 0 && tokens.length >= 2) {
    for (let skip = 0; skip < tokens.length && products.length === 0; skip++) {
      const subsetTokens = tokens.filter((_, i) => i !== skip);
      products = await prisma.product.findMany({
        where: {
          ...baseWhere,
          ...buildTokenWhereClause(subsetTokens),
        },
        include: { volumePrices: { orderBy: { qtyFrom: "asc" } } },
        take: 100,
      });
    }
  }

  // اگر سورت پیش‌فرض است و سرچ انجام شده، مرتب‌سازی امتیازی پوز کاردو را اعمال می‌کنیم
  if (sort === "default" && tokens.length > 0) {
    products.sort((a, b) => {
      const scoreB = scoreProductMatch(b, q, tokens);
      const scoreA = scoreProductMatch(a, q, tokens);
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      // در صورت تساوی امتیاز، موجودی بیشتر و نام کوتاه‌تر بالاتر بیاید
      return b.stockQty - a.stockQty || a.name.length - b.name.length;
    });
  }

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
