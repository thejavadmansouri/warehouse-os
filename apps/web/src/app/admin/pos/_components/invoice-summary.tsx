"use client";

import { Percent } from "lucide-react";

import { Input } from "@/components/ui/input";
import { money, toFa } from "@/lib/format";
import { discountToRial, tomanToPercent, type DiscountInput as DiscountValue } from "../_lib/discount";
import { DiscountField } from "./discount-input";

/**
 * خلاصه فاکتور و مبلغ نهایی.
 *
 * این کامپوننت خلاصه‌ای از فاکتور (جمع اقلام، تخفیف‌ها، مبلغ نهایی) را
 * در یک پنل فشرده و همیشه قابل مشاهده نمایش می‌دهد. مبلغ نهایی باید
 * از فاصله یک متری هم خوانده شود.
 */
export function InvoiceSummary({
  grossSubtotal,
  linesDiscountTotal,
  subtotal,
  invoiceDiscountInput,
  invoiceDiscount,
  totalDiscount,
  effectivePercent,
  total,
  note,
  onNoteChange,
  onDiscountChange,
}: {
  grossSubtotal: number;
  linesDiscountTotal: number;
  subtotal: number;
  invoiceDiscountInput: DiscountValue;
  invoiceDiscount: number;
  totalDiscount: number;
  effectivePercent: number;
  total: number;
  note: string;
  onNoteChange: (n: string) => void;
  onDiscountChange: (d: DiscountValue) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      {/* جمع اقلام */}
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">جمع اقلام</span>
        <span className="tabular-nums">{money(grossSubtotal)}</span>
      </div>

      {/* تخفیف ردیف‌ها */}
      {linesDiscountTotal > 0 && (
        <div className="mt-1 flex justify-between text-sm">
          <span className="text-muted-foreground">تخفیف ردیف‌ها</span>
          <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            − {money(linesDiscountTotal)}
          </span>
        </div>
      )}

      {/* تخفیف فاکتور */}
      <div className="mt-2 flex items-start justify-between gap-2">
        <span className="flex items-center gap-1 pt-2 text-sm text-muted-foreground">
          <Percent className="size-3.5" /> تخفیف فاکتور <kbd className="ms-1 rounded border bg-background/20 px-1 py-0.5 text-[11px] font-normal">F6</kbd>
        </span>
        <DiscountField
          id="invoice-discount"
          value={invoiceDiscountInput}
          base={subtotal}
          onChange={onDiscountChange}
        />
      </div>

      {/* مجموع تخفیف */}
      {totalDiscount > 0 && (
        <div className="mt-2 flex justify-between border-t pt-2 text-xs text-muted-foreground">
          <span>مجموع تخفیف</span>
          <span className="tabular-nums">
            {money(totalDiscount)} ({toFa(effectivePercent)}٪)
          </span>
        </div>
      )}

      {/* مبلغ نهایی — باید از فاصله یک متری هم خوانده شود */}
      <div className="mt-3 rounded-lg bg-blue-600 px-3 py-3 text-white dark:bg-blue-700">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-blue-100">مبلغ نهایی</span>
          <span className="text-3xl font-bold tabular-nums">{money(total)}</span>
        </div>
        <p className="text-end text-xs text-blue-200">ریال</p>
      </div>

      {/* یادداشت */}
      <Input
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        maxLength={300}
        placeholder="توضیح روی فاکتور (اختیاری)"
        className="mt-3 h-9 text-sm"
      />
    </div>
  );
}
