import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, SessionPayload } from "./session";

/*
 * تنظیم و پاک‌کردن کوکی نشست — تنها جای نوشتن `Secure` و `HttpOnly`.
 * در dev (http://localhost) پرچم Secure خاموش است وگرنه مرورگر کوکی را دور می‌ریزد.
 */
export async function setSessionCookie(
  payload: SessionPayload,
  body: Record<string, unknown> = { ok: true },
): Promise<NextResponse> {
  const token = await signSession(payload);

  const res = NextResponse.json(body);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });

  return res;
}

export function clearSessionCookie(): NextResponse {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}

/** خواندن نشست از ریکوئست (در route handler) */
export function readSessionToken(req: NextRequest): string | undefined {
  return req.cookies.get(SESSION_COOKIE)?.value;
}
