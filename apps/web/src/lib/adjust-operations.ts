/**
 * گروه‌بندیِ «عملیات یکپارچه» (adjust) برای گزارش‌ها.
 *
 * عملیات یکپارچه در پایگاه‌داده «یک سندِ تازه» نیست — همان `SaleReturn` و
 * `SaleCorrection`ِ شناخته‌شده‌ی سیستم است که با یک `operationKey` مشترک به هم
 * وصل شده‌اند. در گزارش مرجوعی‌ها و اصلاحیه‌ها هر نیمه جدا دیده می‌شد و هیچ‌جا
 * معلوم نبود این دو با هم «یک عملیات» بوده‌اند. همین‌جا آن‌ها را کنار هم
 * می‌نشانی تا اثرِ کل (اختلاف) و دلیلِ واحد قابلِ پیگیری باشد.
 */
import type { SaleCorrectionListRow, SaleReturnListRow } from "./types";

/** یک عملیاتِ یکپارچه — ترکیبِ مرجوعی + اصلاحیه‌ی همان operationKey. */
export interface AdjustOperation {
  operationKey: string;
  /** قدیمی‌ترین زمانِ اسنادِ عضو. */
  createdAt: string;
  /** دلیلِ واحد (از اولین سند). */
  reason: string;
  returns: SaleReturnListRow[];
  corrections: SaleCorrectionListRow[];
  /** ارزشِ اقلامِ برگشتی. */
  refundAmount: number;
  /** اثرِ کلِ اصلاحیه (افزودن + تصحیح). */
  amountAdjust: number;
  /** شمارِ کل خطوطِ مرجوعی+اصلاحیه. */
  lines: number;
  /** اختلاف = اثر اصلاحیه − ارزش مرجوعی؛ مثبت = به نفع فروشگاه، منفی = به نفع مشتری. */
  net: number;
}

/** اسنادی (مرجوعی یا اصلاحیه) که بخشی از عملیاتِ یکپارچه نیستند. */
export function isStandalone(opKey: string | null | undefined): boolean {
  return !opKey;
}

export function standaloneReturns(
  returns: SaleReturnListRow[],
): SaleReturnListRow[] {
  return returns.filter((r) => isStandalone(r.operationKey));
}

export function standaloneCorrections(
  corrections: SaleCorrectionListRow[],
): SaleCorrectionListRow[] {
  return corrections.filter((c) => isStandalone(c.operationKey));
}

export function groupAdjustOperations(
  returns: SaleReturnListRow[],
  corrections: SaleCorrectionListRow[],
): AdjustOperation[] {
  const byKey = new Map<string, AdjustOperation>();

  const touch = (key: string, createdAt: string, reason: string): AdjustOperation => {
    let g = byKey.get(key);
    if (!g) {
      g = {
        operationKey: key,
        createdAt,
        reason: "",
        returns: [],
        corrections: [],
        refundAmount: 0,
        amountAdjust: 0,
        lines: 0,
        net: 0,
      };
      byKey.set(key, g);
    }
    // قدیمی‌ترین زمان به‌عنوان تاریخِ شروع عملیات.
    if (createdAt < g.createdAt) g.createdAt = createdAt;
    if (!g.reason && reason) g.reason = reason;
    return g;
  };

  for (const r of returns) {
    if (!r.operationKey) continue;
    const g = touch(r.operationKey, r.createdAt, r.reason);
    g.returns.push(r);
    g.refundAmount += r.refundAmount;
    g.lines += r._count?.lines ?? 0;
  }

  for (const c of corrections) {
    if (!c.operationKey) continue;
    const g = touch(c.operationKey, c.createdAt, c.reason);
    g.corrections.push(c);
    g.amountAdjust += c.amountAdjust;
    g.lines += c._count?.lines ?? 0;
  }

  const ops = [...byKey.values()];
  for (const g of ops) g.net = g.amountAdjust - g.refundAmount;
  // قدیمی‌ترین اول، مثل بقیه‌ی فهرست‌ها.
  return ops.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}