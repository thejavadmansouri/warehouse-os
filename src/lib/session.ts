import { SignJWT, jwtVerify } from "jose";
import { jwtSecret } from "./jwt-secret";

export type Role = "customer" | "admin";

export type SessionPayload = {
  sub: string; // شناسه مشتری یا ادمین
  role: Role;
  status?: string; // وضعیت مشتری هنگام صدور توکن (برای UI؛ حقیقت از DB خوانده می‌شود)
};

const ALG = "HS256";
export const SESSION_COOKIE = "b2b_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 3600; // یک هفته

export async function signSession(payload: SessionPayload): Promise<string> {
  const jwt = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(jwtSecret());

  return jwt;
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), { algorithms: [ALG] });

    if (typeof payload.sub !== "string") return null;
    if (payload.role !== "customer" && payload.role !== "admin") return null;

    return {
      sub: payload.sub,
      role: payload.role,
      status: typeof payload.status === "string" ? payload.status : undefined,
    };
  } catch {
    return null; // امضای نامعتبر، منقضی، بدشکل — همه «مهمان»
  }
}
