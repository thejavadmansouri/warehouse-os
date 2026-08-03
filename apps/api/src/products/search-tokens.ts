import { normalizePersian } from '../engine/utils/persian-normalize';

/**
 * توکن‌سازیِ canonical برای جستجو — هم هنگام ایندکس‌کردن (`Product.searchTokens`)
 * و هم هنگام کوئری از همین تابع استفاده می‌شود، تا این دو هرگز از هم جدا نشوند.
 *
 * چرا آرایه‌ی توکن به‌جای pg_trgm: در این محیط `show_trgm()` برای متن فارسی آرایه‌ی
 * خالی برمی‌گرداند (ctype سیستم حروف عربی/فارسی را alpha نمی‌شناسد)، بنابراین
 * ایندکس ترای‌گرام روی نام فارسی عملاً همه‌ی سطرها را برمی‌گرداند و بی‌فایده است.
 * آرایه‌ی توکن با ایندکس GIN مستقل از locale کار می‌کند.
 */
export function buildSearchTokens(
  name: string,
  sku?: string | null,
  partNumber?: string | null,
): string[] {
  const out = new Set<string>();

  for (const raw of [name, sku ?? '', partNumber ?? '']) {
    for (const tok of tokenizeQuery(raw)) out.add(tok);
  }

  return [...out];
}

/** همان نرمال‌سازی، برای ورودی کاربر. تک‌حرفی‌ها حذف می‌شوند (نویز خالص). */
export function tokenizeQuery(input: string): string[] {
  const normalized = normalizePersian(input);
  if (!normalized) return [];

  return normalized
    .split(/[\s\/(),._-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}
