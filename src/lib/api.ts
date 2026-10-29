import { NextResponse } from "next/server";

/** پاسخ خطای استاندارد API — کلاینت همیشه body.error را دارد (الگوی کاردو) */
export function apiError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { ok: false, error: code, message, ...extra },
    { status },
  );
}
