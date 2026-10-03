import { Prisma } from '@prisma/client';

/**
 * تخصیص کد کالا (SKU).
 *
 * کد کالا در این سیستم **همان کد حسابداری** است — عددی، در کاتالوگ واقعی
 * ۷ رقمی و یکتا. همین عدد روی لیبل به‌صورت بارکد چاپ می‌شود، پس هر کالای
 * جدید هم باید یک عدد از همان دنباله بگیرد، نه یک کد موقتِ حروف‌دار.
 *
 * چرا کد جدا برای بارکد نساختیم: دو شماره برای یک کالا یعنی فروشنده و
 * حسابدار دو زبان مختلف حرف می‌زنند. عددی که روی قفسه چاپ شده باید همان
 * عددی باشد که در نرم‌افزار حسابداری وارد می‌شود.
 */

/** فقط SKUهای عددی جزو دنباله‌اند؛ کدهای قدیمیِ حروف‌دار نادیده گرفته می‌شوند. */
const NUMERIC_SKU = /^[0-9]+$/;

export function isNumericSku(sku: string | null | undefined): boolean {
  return !!sku && NUMERIC_SKU.test(sku);
}

/**
 * کد بعدی = بزرگ‌ترین کد عددی موجود + ۱.
 *
 * داخل همان تراکنشِ صداکننده اجرا می‌شود تا بین خواندن بیشینه و درج، کس
 * دیگری همان عدد را نگیرد. یکتایی در سطح دیتابیس هم هست، پس بدترین حالت
 * یک خطای درج است نه کد تکراری.
 */
export async function nextSku(
  tx: Prisma.TransactionClient,
  minimum = 1_000_000,
): Promise<string> {
  const rows = await tx.$queryRaw<{ max: string | null }[]>`
    SELECT MAX(("sku")::bigint)::text AS max
    FROM "Product"
    WHERE "sku" ~ '^[0-9]+$'
  `;

  const current = Number(rows[0]?.max ?? 0);
  return String(Math.max(current + 1, minimum));
}
