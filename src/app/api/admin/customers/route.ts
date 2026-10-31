import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { verifySession } from "@/lib/session";
import { readSessionToken } from "@/lib/auth-cookie";
import { normalizePhone } from "@/lib/phone";
import argon2 from "argon2";
import { randomBytes } from "crypto";

/*
 * گیت ادمین — همه‌ی مسیرهای /api/admin از این guard می‌گذرند.
 * توکن میگوید «ادمین» ولی سالید بودنش را دوباره از DB چک می‌کنیم:
 * ادمینِ حذف‌شده نباید تا انقضای توکن باقی بماند.
 */
async function requireAdmin(req: NextRequest) {
  const session = await verifySession(readSessionToken(req) ?? "");

  if (!session || session.role !== "admin") return null;

  return prisma.adminUser.findUnique({ where: { id: session.sub } });
}

/** GET /api/admin/customers?status=PENDING — لیست مشتری‌ها */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where =
    status && ["PENDING", "ACTIVE", "REJECTED", "BLOCKED"].includes(status)
      ? { status: status as "PENDING" | "ACTIVE" | "REJECTED" | "BLOCKED" }
      : {};

  const customers = await prisma.customer.findMany({
    where: { ...where, deletedAt: null },
    select: {
      id: true,
      companyName: true,
      contactName: true,
      phone: true,
      nationalId: true,
      address: true,
      status: true,
      createdAt: true,
      username: true,
      tier: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ok: true, customers });
}

/*
 * POST /api/admin/customers — ساخت دستی مشتری (مثلاً مشتریِ تلفنی).
 * مشتریِ دستی ادمین از همان حالت ACTIVE درمی‌آید — تأییدش همیشه خود ادمین بود.
 * رمز: اگر ادمین نداده باشد، یک رمز موقت ساخته و در پاسخ برمی‌گردیم
 * (تنها نقطه‌ای که پسورد روشن دیده می‌شود — ادمین حضوری به مشتری می‌دهد).
 */
const createSchema = z.object({
  companyName: z.string().trim().min(2, "نام فروشگاه حداقل ۲ کاراکتر"),
  contactName: z.string().trim().min(2, "نام رابط حداقل ۲ کاراکتر"),
  phone: z.string().min(10, "شماره موبایل نامعتبر است"),
  username: z.string().trim().min(3).optional().nullable(),
  password: z.string().min(6, "رمز حداقل ۶ کاراکتر").optional(),
  nationalId: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  tierId: z.string().trim().optional().nullable(),
  discountPercent: z.number().min(0).max(100).optional(),
  creditLimitOverride: z.number().min(0).optional().nullable(),
});

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "داده نامعتبر");
  }

  const input = parsed.data;
  const phone = normalizePhone(input.phone);

  if (!phone) {
    return apiError(400, "INVALID_PHONE", "شماره موبایل نامعتبر است");
  }

  if (await prisma.customer.findUnique({ where: { phone } })) {
    return apiError(409, "PHONE_EXISTS", "این شماره قبلاً ثبت شده است");
  }

  if (input.username) {
    if (await prisma.customer.findUnique({ where: { username: input.username } })) {
      return apiError(409, "USERNAME_EXISTS", "این نام کاربری قبلاً گرفته شده");
    }

    if (await prisma.adminUser.findUnique({ where: { username: input.username } })) {
      return apiError(409, "USERNAME_TAKEN", "این نام کاربری برای ادمین رزرو است");
    }
  }

  if (input.tierId && !(await prisma.tier.findUnique({ where: { id: input.tierId } }))) {
    return apiError(400, "INVALID_TIER", "طبقه پیدا نشد");
  }

  const tempPassword = input.password ?? randomBytes(6).toString("hex") + "aA1!";

  const customer = await prisma.customer.create({
    data: {
      companyName: input.companyName,
      contactName: input.contactName,
      phone,
      username: input.username || null,
      nationalId: input.nationalId || null,
      address: input.address || null,
      tierId: input.tierId || null,
      discountPercent: input.discountPercent ?? 0,
      creditLimitOverride: input.creditLimitOverride ?? null,
      passwordHash: await argon2.hash(tempPassword),
      status: "ACTIVE",
    },
  });

  return NextResponse.json({
    ok: true,
    customerId: customer.id,
    tempPassword,
  });
}
