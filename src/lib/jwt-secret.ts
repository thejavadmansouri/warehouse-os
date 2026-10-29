/*
 * کلید امضای توکن — الگوی کاردو (apps/api/src/auth/jwt-secret.ts):
 * هیچ fallback ای وجود ندارد؛ نبود یا کوتاه بودن کلید باید سرور را متوقف کند.
 */
const MIN_LENGTH = 32;

export function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.trim().length === 0) {
    throw new Error(
      "JWT_SECRET تنظیم نشده است. سرور بدون کلید امضا بالا نمی‌آید.\n" +
        'یک کلید تصادفی بسازید و در .env بگذارید:\n' +
        "  node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
    );
  }

  if (secret.trim().length < MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET کوتاه است (${secret.trim().length} کاراکتر). حداقل ${MIN_LENGTH} لازم است.`,
    );
  }

  return new TextEncoder().encode(secret.trim());
}
