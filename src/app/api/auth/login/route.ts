import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth-cookie";
import argon2 from "argon2";

/*
 * ورود با یوزرنیم/پسورد — برای ادمین و مشتریِ دارای یوزرنیم.
 *
 * قفل brute-force در حافظه: با یک یوزرنیمِ ناموجود هم زمان‌بندی هش اجرا می‌شود
 * (timing пошук ناموجود = EnumeratingDark)، ولی ثبت تلاش‌ها فقط برای یوزرهای واقعی معنا دارد؛
 * برای هر دو ۴۲۰ms صبر مصنوعی نمی‌گذاریم — قفل روی کلید yوزرنیم رخ می‌دهد.
 */
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;
const loginAttempts = new Map<string, { count: number; lockUntil: number }>();

function assertNotLocked(key: string): NextResponse | null {
  const rec = loginAttempts.get(key);

  if (!rec) return null;

  if (rec.lockUntil && rec.lockUntil <= Date.now()) {
    loginAttempts.delete(key);
    return null;
  }

  if (rec.lockUntil > Date.now()) {
    return apiError(429, "TOO_MANY_ATTEMPTS", "تلاش‌های ناموفق زیاد — ۵ دقیقه دیگر دوباره امتحان کنید.");
  }

  return null;
}

function noteFailure(key: string) {
  const rec = loginAttempts.get(key) ?? { count: 0, lockUntil: 0 };
  rec.count += 1;

  if (rec.count >= MAX_FAILS) {
    rec.lockUntil = Date.now() + LOCK_MS;
    rec.count = 0;
  }

  loginAttempts.set(key, rec);
}

const HALF = "FAKE-HASH-PLACEHOLDER"; // هشِ فیک برای زمان‌بندی برابر وقتی یوزرنیم وجود ندارد

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!username || !password) {
    return apiError(400, "VALIDATION", "نام کاربری و رمز عبور الزامی است");
  }

  const locked = assertNotLocked(username);

  if (locked) return locked;

  /*
   * ادمین اول جست‌وجو می‌شود؛ اگر نبود مشتریِ دارای یوزرنیم.
   * هشِ فیک همیشه verify می‌شود تا زمان‌بندی یوزرنیمِ ناموجود، واقعی جلوه کند.
   */
  const admin = await prisma.adminUser.findUnique({ where: { username } });
  const customer = admin
    ? null
    : await prisma.customer.findUnique({ where: { username } });

  const hash = admin?.passwordHash ?? customer?.passwordHash;

  const hashOkay = await argon2.verify(hash ?? HALF, password).catch(() => false);

  if (!hashOkay || (!admin && !customer)) {
    noteFailure(username);
    return apiError(401, "BAD_CREDENTIALS", "نام کاربری یا رمز عبور اشتباه است.");
  }

  if (admin) {
    loginAttempts.delete(username);

    return setSessionCookie({ sub: admin.id, role: "admin" }, { ok: true, role: "admin", redirect: "/admin" });
  }

  if (customer?.status === "BLOCKED" || customer?.status === "REJECTED") {
    return apiError(403, "BLOCKED", "دسترسی این حساب محدود شده. با فروشگاه تماس بگیرید.");
  }

  loginAttempts.delete(username);

  return setSessionCookie(
    { sub: customer!.id, role: "customer", status: customer!.status },
    { ok: true, status: customer!.status, role: "customer", redirect: "/dashboard" },
  );
}
