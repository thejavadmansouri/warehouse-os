/**
 * ویرایشِ فاکتورِ ثبت‌شده در خودِ صفحه‌ی فروش.
 *
 * از بیرون یک ویرایشِ ساده دیده می‌شود: فاکتور می‌آید بالا، تعداد و قیمت عوض
 * می‌شود، Enter. از درون اما فاکتور دست نمی‌خورد — یک «اصلاحیه» ثبت می‌شود.
 *
 * چرا این‌طور و نه بازنویسیِ خودِ فاکتور: موجودیِ انبار و دفترِ حسابِ مشتری از
 * روی همان سندِ اولیه ساخته شده‌اند. عوض‌کردنِ فاکتور یعنی عددهایی که قبلاً
 * جای دیگری اثر گذاشته‌اند بی‌سروصدا تغییر کنند، و اولین جایی که می‌شکند
 * ترازِ حسابِ همان مشتری است. اصلاحیه اثرِ تفاوت را جبران می‌کند و ردِ تغییر
 * هم برای حسابدار می‌ماند.
 */
import type { CorrectableInvoice } from "@/lib/types";

import type { PosLine } from "../_components/line-items";
import { lineNet } from "../_components/line-items";
import { NO_DISCOUNT } from "./discount";
import type { CartDoc } from "./carts";

/** شاخه‌ی «اصلاحیه» از اتحادیه‌ی سند — تنها چیزی که این فایل با آن کار دارد. */
type Correction = Extract<CartDoc, { type: "correction" }>;

/** یک فاکتورِ قابل‌اصلاح را به ردیف‌های سبد تبدیل می‌کند. */
export function invoiceToLines(data: CorrectableInvoice): PosLine[] {
  return data.lines.map((l) => ({
    /*
     * کلیدِ ردیف عمداً همان saleLogId است.
     *
     * موقعِ ثبت باید بدانیم هر ردیفِ سبد به کدام ردیفِ فاکتور برمی‌گردد؛ با
     * کلیدِ تصادفی این نگاشت یک جدولِ جداگانه لازم داشت که با هر حذف/افزودن
     * از سبد عقب می‌ماند.
     */
    key: l.saleLogId,
    productId: l.product.id,
    productName: l.product.name,
    unit: l.product.unit ?? "عدد",
    locationId: l.location?.id ?? "",
    locationPath: l.location?.path ?? "",
    // موجودی فقط نمایشی است؛ سرور موقعِ اصلاحیه خودش کنترل می‌کند.
    available: l.oldQuantity,
    quantity: l.oldQuantity,
    unitPrice: l.oldUnitPrice,
    discount: NO_DISCOUNT,
    included: true,
    // توضیحِ فعلی، تا ویرایش از همان‌جا که بود ادامه بدهد.
    note: l.lineNote ?? undefined,
  }));
}

export function editingStateOf(data: CorrectableInvoice): Correction {
  return {
    type: "correction",
    invoiceId: data.invoice.id,
    invoiceNumber: data.invoice.number,
    originals: Object.fromEntries(
      data.lines.map((l) => [
        l.saleLogId,
        {
          saleLogId: l.saleLogId,
          quantity: l.oldQuantity,
          unitPrice: l.oldUnitPrice,
          note: l.lineNote ?? "",
        },
      ]),
    ),
  };
}

/**
 * ردیف‌هایی که فقط **توضیح‌شان** عوض شده.
 *
 * جدا از `diffEdit` است چون مقصدش هم جداست: توضیح سندِ اصلاحیه نمی‌سازد و
 * مستقیم روی همان ردیفِ فاکتور می‌نشیند. اگر با هم قاطی می‌شدند، عوض‌کردنِ
 * یک کلمه یک سندِ مالیِ بی‌اثر می‌ساخت — که سرور هم قبولش نمی‌کند.
 */
export function diffNotes(
  editing: Correction,
  lines: PosLine[],
): { saleLogId: string; lineNote?: string }[] {
  const out: { saleLogId: string; lineNote?: string }[] = [];
  const byKey = new Map(lines.map((l) => [l.key, l]));

  for (const [key, orig] of Object.entries(editing.originals)) {
    const l = byKey.get(key);
    // ردیفِ حذف‌شده توضیحش هم بی‌معنی است — با خودش می‌رود.
    if (!l) continue;
    const next = (l.note ?? "").trim();
    if (next !== (orig.note ?? "").trim()) {
      out.push({ saleLogId: orig.saleLogId, lineNote: next || undefined });
    }
  }
  return out;
}

export interface EditDiff {
  /** ردیف‌های موجود که تعداد یا قیمتشان عوض شده (حذف = تعداد صفر). */
  changed: { saleLogId: string; newQuantity: number; newUnitPrice: number }[];
  /** ردیف‌هایی که در فاکتور نبودند و حالا اضافه شده‌اند. */
  added: PosLine[];
  /** خلاصه‌ی خوانا برای تأییدِ فروشنده و متنِ دلیلِ سند. */
  summary: string[];
}

/**
 * تفاوتِ سبد با وضعیتِ سرور.
 *
 * تخفیفِ ردیف در اصلاحیه جایی ندارد (سند فقط «قیمت واحد» می‌شناسد)، پس در
 * قیمتِ واحد تا می‌شود: قیمتی که واقعاً بابتِ هر عدد گرفته شده. این همان
 * عددی است که فروشنده روی کاغذ می‌بیند، پس گم‌کننده نیست.
 */
export function diffEdit(editing: Correction, lines: PosLine[]): EditDiff {
  const byKey = new Map(lines.map((l) => [l.key, l]));
  const changed: EditDiff["changed"] = [];
  const summary: string[] = [];

  for (const [key, orig] of Object.entries(editing.originals)) {
    const l = byKey.get(key);

    // نبودنِ ردیف در سبد، یا تیک‌خوردنش، هر دو یعنی «این قلم را برگردان».
    if (!l || !l.included || l.quantity <= 0) {
      if (orig.quantity > 0) {
        changed.push({ saleLogId: orig.saleLogId, newQuantity: 0, newUnitPrice: orig.unitPrice });
        summary.push(`حذف ${l?.productName ?? "یک قلم"}`);
      }
      continue;
    }

    const effective = l.quantity > 0 ? Math.round(lineNet(l) / l.quantity) : l.unitPrice;
    if (l.quantity !== orig.quantity || effective !== orig.unitPrice) {
      changed.push({
        saleLogId: orig.saleLogId,
        newQuantity: l.quantity,
        newUnitPrice: effective,
      });
      const parts: string[] = [];
      if (l.quantity !== orig.quantity) parts.push(`تعداد ${orig.quantity}←${l.quantity}`);
      if (effective !== orig.unitPrice) parts.push("قیمت");
      summary.push(`${l.productName}: ${parts.join("، ")}`);
    }
  }

  const added = lines.filter((l) => l.included && l.quantity > 0 && !editing.originals[l.key]);
  for (const l of added) summary.push(`افزودن ${l.productName}`);

  return { changed, added, summary };
}
