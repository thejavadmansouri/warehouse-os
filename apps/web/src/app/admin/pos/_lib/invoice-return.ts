/**
 * برگشت از فروش، داخل خودِ صفحه‌ی فروش.
 *
 * همان سبد، همان جدول، همان کلیدها — فقط «تعداد» یعنی «چندتا برمی‌گردد» و
 * سقفش قابل‌برگشتِ همان ردیف است. قیمت دستِ فروشنده نیست: قیمتِ مؤثرِ سرور
 * (سهمِ تخفیفِ فاکتور کسر شده) پایه‌ی مبلغِ برگشت است، وگرنه با یک تخفیفِ
 * فاکتوری، مشتری بیشتر از آنچه داده پس می‌گیرد.
 */
import type { ReturnableInvoice } from "@/lib/types";

import type { PosLine } from "../_components/line-items";
import { NO_DISCOUNT } from "./discount";
import type { CartDoc } from "./carts";

type Returning = Extract<CartDoc, { type: "return" }>;

/**
 * ردیف‌های سبد برای یک مرجوعی.
 *
 * تعداد از صفر شروع می‌شود، نه از فروخته‌شده: مرجوعی معمولاً یک قلم از یک
 * فاکتورِ ده‌قلمی است، و پر شروع‌کردن یعنی فروشنده باید نُه ردیف را صفر کند.
 * ردیفی که دیگر قابل‌برگشت نیست اصلاً نمی‌آید.
 */
export function invoiceToReturnLines(data: ReturnableInvoice): PosLine[] {
  return data.lines
    .filter((l) => l.returnable > 0)
    .map((l) => ({
      key: l.saleLogId,
      productId: l.product.id,
      productName: l.product.name,
      unit: l.product.unit ?? "عدد",
      locationId: l.location?.id ?? "",
      locationPath: l.location?.path ?? "",
      // «موجودی» اینجا یعنی سقفِ برگشت — جدول همین را کنار ردیف نشان می‌دهد.
      available: l.returnable,
      quantity: 0,
      unitPrice: l.effectiveUnitPrice,
      discount: NO_DISCOUNT,
      included: true,
      // پیش‌فرض سالم است؛ جنسِ معیوب استثناست نه قاعده.
      restock: true,
    }));
}

export function returningStateOf(data: ReturnableInvoice): Returning {
  return {
    type: "return",
    invoiceId: data.invoice.id,
    invoiceNumber: data.invoice.number,
    lines: Object.fromEntries(
      data.lines.map((l) => [
        l.saleLogId,
        {
          saleLogId: l.saleLogId,
          returnable: l.returnable,
          effectiveUnitPrice: l.effectiveUnitPrice,
        },
      ]),
    ),
    isOpenAccount: data.isOpenAccount,
    hasCustomer: !!data.invoice.customer,
  };
}

export interface ReturnDraft {
  lines: { saleLogId: string; quantity: number; restock: boolean }[];
  /** مبلغی که به مشتری برمی‌گردد. */
  refundAmount: number;
}

/**
 * چیزی که واقعاً ارسال می‌شود.
 *
 * ردیفِ صفر حذف می‌شود (کارِ نکرده سند نمی‌خواهد) و تعدادِ بیشتر از سقف به
 * سقف بریده می‌شود — سرور هم همین را چک می‌کند، ولی بریدنِ اینجا یعنی عددی
 * که فروشنده در «جمع برگشت» می‌بیند همانی است که ثبت خواهد شد.
 */
export function returnDraft(doc: Returning, lines: PosLine[]): ReturnDraft {
  const out: ReturnDraft["lines"] = [];
  let refundAmount = 0;

  for (const l of lines) {
    const spec = doc.lines[l.key];
    if (!spec || !l.included) continue;

    const qty = Math.max(0, Math.min(l.quantity, spec.returnable));
    if (qty === 0) continue;

    out.push({ saleLogId: spec.saleLogId, quantity: qty, restock: l.restock !== false });
    refundAmount += qty * spec.effectiveUnitPrice;
  }

  return { lines: out, refundAmount };
}
