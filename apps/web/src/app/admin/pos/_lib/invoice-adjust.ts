/**
 * عملیاتِ یکپارچه‌ی «ویرایش فاکتور پس از فروش» داخل خودِ صفحه‌ی فروش.
 *
 * همان سبد، همان جدول، همان کلیدها — با سه تواناییِ هم‌زمان:
 *   • برگشتِ قلم (با سالم/معیوب) روی ردیف‌های موجود
 *   • افزودنِ قلمِ تازه (اسکن، ردیفِ جدا با برچسب «اضافه‌شده»)
 *   • تصحیحِ قیمتِ ردیف‌های موجود
 *
 * یک ردیف می‌تواند هم‌زمان برگشتی باشد و قیمتش عوض شود: برگشت با قیمتِ مؤثرِ
 * قبلی حساب می‌شود و قیمتِ تازه فقط روی مانده می‌نشیند (سرور همین قرارداد را
 * می‌پذیرد — تعدادِ changes باید دقیقاً ماندهِ پس از برگشت باشد).
 *
 * افزایشِ تعدادِ یک ردیفِ موجود (در حالتِ عادی) به‌صورت قلمِ تازه با همان
 * کالا ثبت می‌شود، نه ویرایشِ همان ردیف.
 *
 * اختلافِ نهایی = ارزشِ افزوده‌ها + اثرِ تغییرات − ارزشِ مرجوعی؛ همه Int و ریال.
 */
import type { AdjustableInvoice } from "@/lib/types";

import type { PosLine } from "../_components/line-items";
import { NO_DISCOUNT } from "./discount";
import type { CartDoc } from "./carts";

type Adjusting = Extract<CartDoc, { type: "adjust" }>;

/**
 * ردیف‌های سبد برای حالتِ یکپارچه.
 *
 * «تعداد» یعنی تعدادِ برگشتی (از صفر شروع می‌شود، سقفش مانده‌ی قابل‌برگشت)؛
 * قیمت همان قیمتِ فعلیِ ردیف است که می‌شود تصحیحش کرد. قیمتِ مؤثرِ برگشت در
 * سند نگه داشته می‌شود تا مبلغِ برگشت از همان عددِ سرور بیاید.
 */
export function invoiceToAdjustLines(data: AdjustableInvoice): PosLine[] {
  return data.lines.map((l) => ({
    key: l.saleLogId,
    productId: l.product.id,
    productName: l.product.name,
    unit: l.product.unit ?? "عدد",
    locationId: l.location?.id ?? "",
    locationPath: l.location?.path ?? "",
    // سقفِ «تعداد برگشتی» همین مانده است؛ جدول کنار ردیف نشانش می‌دهد.
    available: l.returnable,
    quantity: 0,
    unitPrice: l.oldUnitPrice,
    discount: NO_DISCOUNT,
    included: true,
    restock: true,
    note: l.lineNote ?? undefined,
    // اطلاعاتِ نمایشیِ ردیف برای حالت adjust.
    sold: l.sold,
    alreadyReturned: l.alreadyReturned,
    outstanding: l.returnable,
    effectiveUnitPrice: l.effectiveUnitPrice,
  }));
}

export function adjustingStateOf(data: AdjustableInvoice): Adjusting {
  return {
    type: "adjust",
    invoiceId: data.invoice.id,
    invoiceNumber: data.invoice.number,
    /** مبلغِ کلِ فاکتور پیش از این عملیات — پایه‌ی نمایشِ «فاکتور از/به». */
    invoiceTotal: data.invoice.total,
    /** آنچه مشتری تاکنون بابت همین فاکتور پرداخت کرده — برای دیدنِ پرداختِ اضافه. */
    paidAmount: data.invoice.paidAmount,
    originals: Object.fromEntries(
      data.lines.map((l) => [
        l.saleLogId,
        {
          saleLogId: l.saleLogId,
          sold: l.sold,
          alreadyReturned: l.alreadyReturned,
          outstanding: l.returnable,
          oldUnitPrice: l.oldUnitPrice,
          effectiveUnitPrice: l.effectiveUnitPrice,
          returnable: l.returnable,
          note: l.lineNote ?? "",
        },
      ])
    ),
    isOpenAccount: data.isOpenAccount,
    hasCustomer: !!data.invoice.customer,
  };
}

export interface AdjustDraft {
  returns: { saleLogId: string; quantity: number; restock: boolean }[];
  changes: { saleLogId: string; newQuantity: number; newUnitPrice: number }[];
  additions: {
    productId: string;
    locationId?: string;
    quantity: number;
    unitPrice: number;
  }[];
  /** ارزشِ اقلامِ برگشتی. */
  refundAmount: number;
  /** ارزشِ اقلامِ اضافه‌شده. */
  additionsAmount: number;
  /** اثرِ تصحیحِ قیمت‌ها. */
  changesAdjust: number;
  /** اختلافِ نهایی = افزودن + تغییر − مرجوعی. */
  net: number;
  /** توضیح‌های عوض‌شده — سندِ مالی نمی‌سازند، جدا می‌روند. */
  notes: { saleLogId: string; lineNote?: string }[];
}

/**
 * چیزی که واقعاً ارسال می‌شود.
 *
 * ردیفِ برگشتیِ صفر حذف می‌شود و تعدادِ بیشتر از سقف به سقف بریده می‌شود —
 * سرور هم همین را چک می‌کند، ولی بریدنِ اینجا یعنی عددی که فروشنده در «اختلاف
 * نهایی» می‌بیند همانی است که ثبت خواهد شد.
 */
export function adjustDraft(doc: Adjusting, lines: PosLine[]): AdjustDraft {
  const returns: AdjustDraft["returns"] = [];
  const changes: AdjustDraft["changes"] = [];
  const additions: AdjustDraft["additions"] = [];
  let refundAmount = 0;
  let additionsAmount = 0;
  let changesAdjust = 0;

  for (const l of lines.entries()) {
    const [, line] = l;
    const spec = doc.originals[line.key];

    if (spec) {
      // ردیفِ موجودِ فاکتور.
      const qty = Math.max(0, Math.min(line.quantity, spec.returnable));
      const priceChanged = line.unitPrice !== spec.oldUnitPrice;

      if (qty > 0 && priceChanged) {
        /*
         * برگشت + تصحیحِ قیمت روی همان ردیف: برگشت با قیمتِ مؤثرِ قبلی حساب
         * می‌شود و قیمتِ تازه فقط روی ماندهِ پس از برگشت می‌نشیند. تعدادِ
         * changes دقیقاً همان مانده است — قراردادی که سرور می‌پذیرد.
         */
        returns.push({
          saleLogId: spec.saleLogId,
          quantity: qty,
          restock: line.restock !== false,
        });
        refundAmount += qty * spec.effectiveUnitPrice;
        const remaining = spec.outstanding - qty;
        changes.push({
          saleLogId: spec.saleLogId,
          newQuantity: remaining,
          newUnitPrice: line.unitPrice,
        });
        changesAdjust += remaining * line.unitPrice - remaining * spec.oldUnitPrice;
      } else if (qty > 0) {
        returns.push({
          saleLogId: spec.saleLogId,
          quantity: qty,
          restock: line.restock !== false,
        });
        refundAmount += qty * spec.effectiveUnitPrice;
      } else if (priceChanged) {
        changes.push({
          saleLogId: spec.saleLogId,
          // تعدادِ باقی‌مانده دست نمی‌خورد — فقط قیمت.
          newQuantity: spec.outstanding,
          newUnitPrice: line.unitPrice,
        });
        changesAdjust +=
          spec.outstanding * line.unitPrice - spec.outstanding * spec.oldUnitPrice;
      }
      continue;
    }

    // قلمِ تازه‌ای که با اسکن اضافه شده.
    if (line.included && line.quantity > 0) {
      additions.push({
        productId: line.productId,
        locationId: line.locationId || undefined,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      });
      additionsAmount += line.quantity * line.unitPrice;
    }
  }

  return {
    returns,
    changes,
    additions,
    refundAmount,
    additionsAmount,
    changesAdjust,
    net: additionsAmount + changesAdjust - refundAmount,
    notes: changedNotes(doc, lines),
  };
}

/**
 * توضیح‌های عوض‌شده — سندِ مالی نمی‌سازند و جدا از اختلاف می‌روند.
 * ردیفِ کاملاً برگشتی هم توضیحش را نگه می‌داریم (تا در حافظه قابلِ دید باشد).
 */
export function changedNotes(
  doc: Adjusting,
  lines: PosLine[],
): { saleLogId: string; lineNote?: string }[] {
  const out: { saleLogId: string; lineNote?: string }[] = [];
  const byKey = new Map(lines.map((l) => [l.key, l]));
  for (const [key, orig] of Object.entries(doc.originals)) {
    const l = byKey.get(key);
    if (!l) continue;
    const next = (l.note ?? "").trim();
    if (next !== (orig.note ?? "").trim()) {
      out.push({ saleLogId: orig.saleLogId, lineNote: next || undefined });
    }
  }
  return out;
}

/**
 * تعدادِ خالصِ یک ردیفِ موجود — همان چیزی که در حالتِ عادی دیده و ویرایش
 * می‌شود: ماندهِ سرور منهای برگشتیِ همین جلسه.
 */
export function adjustNetQty(l: PosLine): number {
  return Math.max(0, (l.outstanding ?? 0) - l.quantity);
}

/**
 * ورودیِ «تعداد» در حالتِ عادی روی ردیفِ موجود — عدد = تعدادِ خالص.
 *   کمتر یا برابرِ مانده ⇒ برگشتِ همان اختلاف
 *   صفر ⇒ برگشتِ کامل (ردیف از دیدِ عادی پنهان می‌شود)
 *   بیشتر از مانده ⇒ برگشتی که بوده برمی‌گردد و مابه‌التفاوت باید به‌عنوان
 *   قلمِ تازه اضافه شود (overflow) — مثل اسکنِ دوباره.
 */
export function offQtyToReturnQty(
  outstanding: number,
  input: number,
): { returnQty: number; overflow: number } {
  if (input > outstanding) return { returnQty: 0, overflow: input - outstanding };
  return { returnQty: outstanding - Math.max(0, input), overflow: 0 };
}
