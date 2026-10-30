import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت الزامی است");
  }

  const tiers = await prisma.tier.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: {
        select: { customers: true },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    tiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      creditLimit: t.creditLimit ? Number(t.creditLimit) : 0,
      baseDiscount: t.baseDiscount ? Number(t.baseDiscount) : 0,
      sortOrder: t.sortOrder,
      customerCount: t._count.customers,
    })),
  });
}

const tierSchema = z.object({
  name: z.string().trim().min(2, "نام سطح الزامی است"),
  creditLimit: z.number().nonnegative("سقف اعتبار باید بزرگتر یا مساوی صفر باشد"),
  baseDiscount: z.number().min(0).max(100, "درصد تخفیف باید بین ۰ تا ۱۰۰ باشد"),
  sortOrder: z.number().int().default(1),
});

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت الزامی است");
  }

  const body = await req.json().catch(() => ({}));
  const parsed = tierSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات ارسالی نامعتبر است");
  }

  const data = parsed.data;

  const existing = await prisma.tier.findUnique({
    where: { name: data.name },
  });

  if (existing) {
    return apiError(400, "DUPLICATE_NAME", "سطحی با این عنوان قبلاً ایجاد شده است");
  }

  const tier = await prisma.tier.create({
    data: {
      name: data.name,
      creditLimit: data.creditLimit,
      baseDiscount: data.baseDiscount,
      sortOrder: data.sortOrder,
    },
  });

  return NextResponse.json({
    ok: true,
    tier: {
      id: tier.id,
      name: tier.name,
      creditLimit: Number(tier.creditLimit),
      baseDiscount: Number(tier.baseDiscount),
      sortOrder: tier.sortOrder,
    },
  });
}
