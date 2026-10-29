import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";
import { createHash, randomInt } from "crypto";

/*
 * درخواست OTP برای ورود با موبایل.
 *
 * فاز ۱ «شبیه‌سازی‌شده» است: هیچ پیامکی نمی‌رود؛
 *  - کد در لاگ سرور چاپ می‌شود، و
 *  - در dev در پاسخ برمی‌گردد تا تست راحت باشد.
 * در فازهای بعد فقط تابع `deliverOtp` به SMS وصل می‌شود؛ بقیه ثابت می‌ماند.
 */
const OTP_TTL_MS = 3 * 60_000; // ۳ دقیقه
const MAX_CODES_PER_WINDOW = 5; // حداکثر ۵ کد در پنجره‌ی ۱۰ دقیقه‌ای
const WINDOW_MS = 10 * 60_000;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const phone = normalizePhone(body?.phone ?? "");

  if (!phone) {
    return apiError(400, "INVALID_PHONE", "شماره موبایل نامعتبر است (مثال: ۰۹۱۲۳۴۵۶۷۸۹)");
  }

  // گیت: فقط مشتریِ ثبت‌شده می‌تواند کد بگیرد
  const customer = await prisma.customer.findUnique({ where: { phone } });

  if (!customer) {
    return apiError(404, "NOT_REGISTERED", "این شماره ثبت نشده — ابتدا ثبت‌نام کنید.");
  }

  if (customer.status === "BLOCKED" || customer.status === "REJECTED") {
    return apiError(403, "BLOCKED", "دسترسی این حساب محدود شده. با فروشگاه تماس بگیرید.");
  }

  // ضد سواستفاده: بیش از سقف، درخواست کد نگیر
  const recent = await prisma.otpCode.count({
    where: { phone, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  });

  if (recent >= MAX_CODES_PER_WINDOW) {
    return apiError(
      429,
      "OTP_RATE_LIMIT",
      "درخواست کد زیاد است. ۱۰ دقیقه دیگر دوباره امتحان کنید.",
    );
  }

  // کد ۶ رقمی — ذخیره به شکل هش، نه متنِ روشن
  const code = String(randomInt(100000, 1000000));

  const record = await prisma.otpCode.create({
    data: {
      phone,
      code: sha256(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  void record;

  console.log(`[OTP] phone=${phone} code=${code} (فاز ۱ شبیه‌سازی‌شده)`);

  return NextResponse.json({
    ok: true,
    expiresInSeconds: OTP_TTL_MS / 1000,
    // فقط تا وقتی پیامک واقعی وصل نشده، همین‌جا برمی‌گردیم
    devCode: code,
  });
}
