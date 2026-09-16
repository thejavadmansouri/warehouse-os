/**
 * ماندگاریِ سبدِ صندوق — سبدی که با رفرش یا قطعِ برق نمی‌سوزد.
 *
 * تا حالا تب‌های فاکتور فقط در حافظه‌ی React زندگی می‌کردند: بین رفت‌وآمدهای
 * صفحه زنده می‌ماندند، ولی یک رفرشِ کامل (یا Crash مرورگر یا قطعِ برقِ مغازه)
 * همه‌ی نیم‌فاکتورها را می‌سوزاند — دقیقاً لحظه‌ای که مشتری جلوی پیشخوان
 * ایستاده. این فایل همان حالت را در localStorage می‌نویسد و موقعِ بالا آمدن
 * برمی‌گرداند.
 *
 * قواعد ایمنی:
 *   • نسخه‌بندی‌شده — هر تغییری در شکلِ Cart نسخه را بالا می‌برد. ولی نسخه‌ی
 *     قدیمیِ **سازگار** (v1، بدونِ فیلدهای تازه) خوانده می‌شود، نه دور
 *     ریخته: سبدِ وسطِ فروشِ مغازه را نمی‌شود قربانیِ آپدیت کرد.
 *   • خواندن هرگز نمی‌میرد: JSON خراب، نسخه‌ی ناشناس یا شکلِ غلط ⇒ آرایه‌ی
 *     خالی؛ صندوق با سبدِ نو بالا می‌آید، نه با خطا.
 *   • نوشتن هم هرگز نمی‌میرد: پرشدنِ localStorage (سهمیه) یا خطای
 *     سریال‌سازی بی‌صدا رد می‌شود — ماندگاری نباید رقیبِ فروش باشد.
 *   • داده همه‌چیزِ معمولی است (متن/عدد)، پس JSON-ایمن است؛ ولی شکلِ هر تب
 *     باز هم سبک‌وارسی می‌شود تا داده‌ی دست‌کاری‌شده هرگز به state نریزد.
 */

import type { Cart } from "./carts";

/** حداکثر تب — باید با MAX_CARTS در carts.ts هم‌خوان بماند. */
const MAX_CARTS = 10;

const STORAGE_KEY = "warehouse-os.pos-carts";
const VERSION = 2;
/**
 * نسخه‌هایی که خوانده می‌شوند.
 *
 * v2 فیلدِ `ephemeral` (تبِ خودکارِ ویرایش) را دارد؛ v1 ندارد و فقط همان
 * فیلد با مقدارِ امنِ `false` پر می‌شود — یعنی «تبِ دستی»، که رفتارِ قبلیِ
 * برنامه است.
 */
const READABLE_VERSIONS = new Set([1, 2]);

type SavedPayload = {
  version: number;
  /** تبِ فعالِ آخرین جلسه — بعد از برگرداندن همان‌جا ادامه می‌دهیم. */
  activeId: string | null;
  carts: Cart[];
};

function defaultStorage(): Storage | null {
  return typeof window !== "undefined" ? window.localStorage : null;
}

/**
 * سبدها را بنویس. هر تغییرِ state صدا زده می‌شود — داده کوچک است (چند ردیف
 * متن) و نوشتنِ همگام مشکلی ندارد.
 */
export function saveCarts(
  carts: Cart[],
  activeId: string,
  storage: Storage | null = defaultStorage(),
): void {
  if (!storage || !carts.length) {
    // تبِ تنها و خالی هم ذخیره می‌شود، ولی کلِ حذف‌شده یعنی «چیزی نبود» —
    // نگه‌داشتنش همان resurrection ناخواسته بعد از بستنِ عمدیِ تب‌هاست.
    return;
  }
  const payload: SavedPayload = { version: VERSION, activeId, carts };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // سهمیه یا حالت خصوصی مرورگر — بی‌صدا؛ صندوق باید کار کند حتی بدون ذخیره.
  }
}

/** داده‌ی ذخیره‌شده را بخوان — یا هیچ. هرگز پرتاب نمی‌کند. */
export function loadSavedCarts(
  storage: Storage | null = defaultStorage(),
): SavedPayload | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SavedPayload>;
    if (!READABLE_VERSIONS.has(Number(parsed.version)) || !Array.isArray(parsed.carts))
      return null;

    const carts = parsed.carts
      .filter(
        (c): c is Cart =>
          !!c &&
          typeof c.id === "string" &&
          c.id.length > 0 &&
          typeof c.label === "number" &&
          Array.isArray(c.lines)
      )
      .slice(0, MAX_CARTS)
      // داده‌ی v1 تیکِ «تبِ خودکار» را ندارد؛ نبودش یعنی تبِ دستی.
      .map((c) => ({ ...c, ephemeral: c.ephemeral === true }));
    if (!carts.length) return null;

    const activeId =
      typeof parsed.activeId === "string" && carts.some((c) => c.id === parsed.activeId)
        ? parsed.activeId
        : null;

    return { version: VERSION, activeId, carts };
  } catch {
    return null;
  }
}

/** برای تست و «پاک کردن دستی» — کلیدِ ذخیره را از بین می‌برد. */
export function clearSavedCarts(storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // بی‌اهمیت — نبودِ ذخیره همان «هیچی برای برگرداندن» است.
  }
}
