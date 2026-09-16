import type { PosLine } from "../_components/line-items";

/**
 * برگرداندنِ آخرین افزودن — منطقِ خالصِ Ctrl+Z صندوق.
 *
 * پرتکرارترین خطای پیشخوان، اسکنِ اشتباه است. آخرین کار یا «افزودنِ ردیفِ
 * نو» بوده (حذفش کن) یا «افزودن به ردیفِ موجود» (تعداد را به مقدارِ قبلی
 * برگردان). `prevQuantity = 0` یعنی ردیفِ نو.
 *
 * عمداً مستقل از React است: page.tsx آن را صدا می‌زند و تستِ واحد مستقیم
 * روی همین می‌دود — همان قاعده‌ی `_lib/invoice-adjust.ts`.
 */
export function applyUndoAdd(
  lines: PosLine[],
  lastAdd: { lineKey: string; prevQuantity: number } | null,
): { lines: PosLine[]; /** اندیسِ ردیفِ حذف‌شده — null یعنی چیزی حذف نشد. */ removedIndex: number | null } {
  if (!lastAdd) return { lines, removedIndex: null };

  const i = lines.findIndex((l) => l.key === lastAdd.lineKey);
  if (i < 0) {
    // ردیفِ هدف این میان رفت (دستی حذف شده) — فقط ردِ نشانه را پاک کن.
    return { lines, removedIndex: null };
  }

  if (lastAdd.prevQuantity > 0) {
    // افزودن به ردیفِ موجود بود — تعداد به همان مقدارِ قبل برمی‌گردد.
    return {
      lines: lines.map((l, j) => (j === i ? { ...l, quantity: lastAdd.prevQuantity } : l)),
      removedIndex: null,
    };
  }

  // ردیفِ تازه بود — کلاً بردار.
  return {
    lines: lines.filter((_, j) => j !== i),
    removedIndex: i,
  };
}
