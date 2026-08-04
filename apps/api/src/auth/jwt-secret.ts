/**
 * کلید امضای توکن — تنها منبعِ خواندنش.
 *
 * قبلاً هر دو مصرف‌کننده روی `process.env.JWT_SECRET || 'super-secret-key-...'`
 * می‌افتادند. چون آن رشته داخل سورس است، یعنی **هر نصبی روی هر مشتری یک کلید
 * مشترکِ عمومی داشت** و هرکس آن را می‌دانست می‌توانست برای هر سیستمی توکن مدیر
 * جعل کند. هیچ fallback ای وجود ندارد: نبودِ کلید باید سرور را بالا نیاورد، نه
 * اینکه بی‌صدا ناامن اجرا شود.
 *
 * نصب‌کننده‌ی ویندوز باید موقع نصب یک مقدار تصادفی تولید و در فایل تنظیمات
 * بنویسد — یکی به‌ازای هر نصب.
 */
const MIN_LENGTH = 32;

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.trim().length === 0) {
    throw new Error(
      'JWT_SECRET تنظیم نشده است. سرور بدون کلید امضا بالا نمی‌آید.\n' +
        'یک کلید تصادفی بسازید و در .env بگذارید:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }

  if (secret.trim().length < MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET کوتاه است (${secret.trim().length} کاراکتر). حداقل ${MIN_LENGTH} کاراکتر لازم است.`,
    );
  }

  return secret.trim();
}
