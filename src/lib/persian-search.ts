/**
 * موتور جستجوی هوشمند قطعات کاردو (برگرفته از هسته الگوریتم پوز کاردو / WarehouseOS)
 * 
 * ویژگی‌ها:
 * ۱. نرمال‌سازی عمیق کاراکترهای فارسی و عربی (ي/ك/ة/آ/أ/إ)
 * ۲. تبدیل ارقام فارسی و عربی به انگلیسی
 * ۳. توکن‌سازی چندکلمه‌ای مستقل از ترتیب
 * ۴. تطبیق پیشوندی و زیررشته‌ای (مانند پیدا کردن «کمک فنر پراید» با عبارت «کم پرا»)
 * ۵. سیستم امتیازدهی و رتبه‌بندی (تطبیق دقیق SKU/کد فنی در صدر، پاداش حفظ ترتیب کلمات، پاداش موجودی انبار)
 * ۶. خطایاب و تحمل لغت اضافه (الگوریتم Fallback یکی‌کم / n-1)
 */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * نرمال‌سازی استاندارد و کامل متن فارسی
 */
export function normalizePersian(input?: string | null): string {
  if (!input) return "";

  let t = input.normalize("NFC");

  // یکسان‌سازی حروف عربی و انواع الف
  t = t
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ی");

  // تبدیل ارقام فارسی و عربی به لاتین
  t = t
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

  // حذف اعراب (تشدید، تنوین، فتحه، ضمه، کسره و کشیدگی)
  t = t.replace(/[ً-ْـ]/g, "");

  // تبدیل نیم‌فاصله (ZWNJ) به فاصله و پاکسازی بیدی و کاراکترهای پنهان
  t = t.replace(/\u200c/g, " ").replace(/[​‍‎‏﻿]/g, "");

  // حروف کوچک برای عبارات انگلیسی (مانند پژو 206 یا کروز)
  t = t.toLowerCase();

  return t.replace(/\s+/g, " ").trim();
}

/**
 * تجزیه کوئری جستجو به توکن‌های مفید
 */
export function tokenizeQuery(input: string): string[] {
  const normalized = normalizePersian(input);
  if (!normalized) return [];

  return normalized
    .split(/[\s\/(),._\-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * فیلدهای استاندارد محصول برای تطبیق جستجو
 */
export const PRODUCT_SEARCH_FIELDS = [
  "name",
  "sku",
  "oemCode",
  "brand",
  "model",
  "category",
  "partBrand",
] as const;

export type ProductSearchField = (typeof PRODUCT_SEARCH_FIELDS)[number];

/**
 * تولید شرط‌های Prisma برای جستجوی چندتوکنی پیشوندی/زیررشته‌ای
 * هر توکن باید حداقل در یکی از فیلدها پیدا شود (AND بین تمام توکن‌ها)
 */
export function buildTokenWhereClause(tokens: string[]) {
  if (!tokens.length) return {};

  return {
    AND: tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: "insensitive" as const } },
        { sku: { contains: token, mode: "insensitive" as const } },
        { oemCode: { contains: token, mode: "insensitive" as const } },
        { brand: { contains: token, mode: "insensitive" as const } },
        { model: { contains: token, mode: "insensitive" as const } },
        { category: { contains: token, mode: "insensitive" as const } },
        { partBrand: { contains: token, mode: "insensitive" as const } },
      ],
    })),
  };
}

/**
 * امتیازدهی هوشمند به کالاهای یافت‌شده مطابق الگوریتم پوز کاردو
 * - تطبیق دقیق SKU / کد فنی: +100
 * - هر کلمه کوئری ابتدای نام باشد: +15
 * - هر کلمه کوئری ابتدای یکی از کلمات باشد: +8
 * - هر کلمه کوئری در متن نام باشد: +3
 * - حفظ ترتیب توکن‌ها در متن نام: +25
 * - کالا دارای موجودی باشد: +10
 */
export function scoreProductMatch(
  product: {
    sku?: string | null;
    oemCode?: string | null;
    name: string;
    brand?: string | null;
    model?: string | null;
    stockQty?: number;
  },
  queryRaw: string,
  tokens: string[],
): number {
  let score = 0;
  const rawClean = normalizePersian(queryRaw);
  const normName = normalizePersian(product.name);
  const normSku = normalizePersian(product.sku ?? "");
  const normOem = normalizePersian(product.oemCode ?? "");

  // ۱. تطبیق دقیق کد کالا یا شماره فنی
  if (normSku === rawClean || normOem === rawClean) {
    score += 150;
  } else if (normSku.startsWith(rawClean) || normOem.startsWith(rawClean)) {
    score += 50;
  }

  // ۲. تطبیق دقیق نام
  if (normName === rawClean) {
    score += 100;
  }

  // ۳. امتیازدهی کلمه‌به‌کلمه
  let lastIndex = -1;
  let orderPreserved = true;

  for (const token of tokens) {
    const idx = normName.indexOf(token);
    if (idx === 0) {
      score += 15; // در ابتدای نام کالا
    } else if (idx > 0 && normName[idx - 1] === " ") {
      score += 10; // در ابتدای یکی از کلمات نام
    } else if (idx > 0) {
      score += 4; // زیررشته در میان کلمه
    }

    // بررسی حفظ ترتیب ظاهر شدن توکن‌ها
    if (idx !== -1) {
      if (lastIndex !== -1 && idx < lastIndex) {
        orderPreserved = false;
      }
      lastIndex = idx;
    } else {
      orderPreserved = false;
    }
  }

  // پاداش بزرگ برای رعایت ترتیب کلمات (مانند «کم پرا» به ترتیب در «کمک فنر جلو پراید»)
  if (tokens.length >= 2 && orderPreserved && lastIndex !== -1) {
    score += 25;
  }

  // پاداش کالای موجود در انبار
  if ((product.stockQty ?? 0) > 0) {
    score += 10;
  }

  // نام‌های متمرکزتر و کوتاه‌تر ترجیح دارند (کاهش جزئی نمره به ازای طولانی بودن نام)
  score -= Math.min(10, Math.floor(normName.length / 25));

  return score;
}
