import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";
import { setSessionCookie } from "@/lib/auth-cookie";
import { createHash, timingSafeEqual } from "crypto";

/*
 * تأیید OTP و صدور نشست.
 * قفل brute-force در حافظه — دوره доставки OTP فاز ۱ شبیه‌سازی‌شده نیازش است.
 */
const otpSha = (text: string) => createHash("sha256").update(text).digest("hex");

const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;
const verifyAttempts = new Map<string, { count: number; lockUntil: number }>();

function assertNotLocked(phone: string): NextResponse | null {
  const rec = verifyAttempts.get(phone);

  if (!rec) return null;

  if (rec.lockUntil > Date.now()) {
    return apiError(429, "TOO_MANY_ATTEMPTS", "تلاش‌های ناموفق زیاد — چند دقیقه دیگر دوباره امتحان کنید.");
  }

  verifyAttempts.delete(phone);
  return null;
}

function noteFailure(phone: string) {
  const rec = verifyAttempts.get(phone) ?? { count: 0, lockUntil: 0 };
  rec.count += 1;

  if (rec.count >= MAX_FAILS) {
    rec.lockUntil = Date.now() + LOCK_MS;
    rec.count = 0;
  }

  verifyAttempts.set(phone, rec);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const phone = normalizePhone(body?.phone ?? "");
  const code = String(body?.code ?? "").trim();

  if (!phone) {
    return apiError(400, "INVALID_PHONE", "شماره موبایل نامعتبر است");
  }

  const locked = assertNotLocked(phone);

  if (locked) return locked;

  if (!/^\d{6}$/.test(code)) {
    return apiError(400, "INVALID_CODE", "کد باید ۶ رقم باشد");
  }

  const record = await prisma.otpCode.findFirst({
    where: {
      phone,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    // اینجا شمرده می‌شود ولی مثل کد اشتباه، برای جلوگیری از سرکشی تعداد ناموجود
    noteFailure(phone);
    return apiError(401, "OTP_NOT_FOUND", "کدی فعال پیدا نشد — کد جدید بگیرید.");
  }

  const given = Buffer.from(otpSha(code));
  const stored = Buffer.from(record.code);
  const matched = given.length === stored.length && timingSafeEqual(given, stored);

  if (!matched) {
    noteFailure(phone);
    return apiError(401, "OTP_MISMATCH", "کد اشتباه است.");
  }

  await prisma.otpCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });

  const customer = await prisma.customer.findUnique({ where: { phone } });

  if (!customer || customer.status === "BLOCKED" || customer.status === "REJECTED") {
    return apiError(403, "BLOCKED", "دسترسی این حساب محدود شده. با فروشگاه تماس بگیرید.");
  }

  verifyAttempts.delete(phone);

  // نشست صادر می‌شود؛ PENDING هم میتواند وارد شود — فقط قیمت/کاتالوگ قفل است
  return setSessionCookie(
    { sub: customer.id, role: "customer", status: customer.status },
    { ok: true, status: customer.status, role: "customer", redirect: "/dashboard" },
  );
}
