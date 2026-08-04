"use client";

import { forwardRef } from "react";

import { Input } from "@/components/ui/input";
import { money, parseNum, toFa } from "@/lib/format";
import {
  MAX_PERCENT,
  clamp,
  discountToToman,
  type DiscountInput as DiscountValue,
} from "../_lib/discount";

/**
 * ورودی تخفیف با کلید تعویضِ تومان/درصد.
 *
 * یک کنترل برای هر دو حالت است، نه دو فیلد جدا: فروشنده وسط فروش نباید فکر کند
 * کدام خانه را پر کند. دکمه‌ی کنارش حالت را عوض می‌کند و **عدد را نگه نمی‌دارد**
 * — «۱۰» در حالت درصد یعنی ۱۰٪ و در حالت تومان یعنی ۱۰ تومان، و تبدیلِ خودکار
 * بینشان بیشتر گیج می‌کند تا کمک.
 *
 * زیرِ فیلد، معادلِ محاسبه‌شده نشان داده می‌شود تا قبل از ثبت معلوم باشد این
 * درصد چقدر تومان می‌شود.
 */
export const DiscountField = forwardRef<
  HTMLInputElement,
  {
    value: DiscountValue;
    /** مبلغی که تخفیف روی آن اعمال می‌شود (جمع ردیف یا جمع کل اقلام). */
    base: number;
    onChange: (v: DiscountValue) => void;
    /** فشرده = داخل جدول ردیف‌ها؛ عادی = پنل جمع فاکتور. */
    compact?: boolean;
    id?: string;
    disabled?: boolean;
  }
>(function DiscountField(
  { value, base, onChange, compact = false, id, disabled },
  ref
) {
  const isPercent = value.mode === "percent";
  const applied = discountToToman(value, base);
  // تخفیفِ تایپ‌شده از مبلغ بیشتر است → سرور ردش می‌کند، همین‌جا هشدار بده.
  const clipped = !isPercent && value.value > base && base > 0;

  const toggle = () =>
    onChange({ value: 0, mode: isPercent ? "amount" : "percent" });

  return (
    <div className={compact ? "flex flex-col gap-0.5" : "flex flex-col gap-1"}>
      <div className="flex items-stretch gap-1">
        <Input
          ref={ref}
          id={id}
          dir="ltr"
          disabled={disabled}
          inputMode="numeric"
          className={`min-w-0 flex-1 text-left tabular-nums ${
            compact ? "h-10" : "h-10 w-28"
          } ${clipped ? "border-amber-500" : ""}`}
          value={
            value.value
              ? isPercent
                ? toFa(value.value)
                : money(value.value)
              : ""
          }
          onChange={(e) => {
            const n = parseNum(e.target.value);
            onChange({
              ...value,
              value: isPercent ? clamp(n, 0, MAX_PERCENT) : Math.max(0, n),
            });
          }}
          placeholder={isPercent ? "۰٪" : "۰"}
        />
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          title={isPercent ? "تبدیل به مبلغ تومانی" : "تبدیل به درصد"}
          aria-label={isPercent ? "حالت درصد — برای تومان کلیک کنید" : "حالت تومان — برای درصد کلیک کنید"}
          /* عرض ثابت: وگرنه «٪» و «تومان» دو عرض متفاوت می‌سازند و ستون ناهموار می‌شود. */
          className={`w-14 shrink-0 rounded-md border text-xs font-medium transition-colors
                      hover:border-primary hover:text-primary focus:outline-none
                      focus:ring-2 focus:ring-primary disabled:opacity-50 ${
                        isPercent
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground"
                      }`}
        >
          {isPercent ? "٪" : "تومان"}
        </button>
      </div>

      {/* معادلِ محاسبه‌شده — فقط وقتی چیزی برای گفتن هست. یک خط، بدون شکستن. */}
      {isPercent && applied > 0 && (
        <span className="truncate text-[11px] tabular-nums text-muted-foreground">
          −{money(applied)}
        </span>
      )}
      {clipped && (
        <span className="truncate text-[11px] text-amber-600">
          حداکثر {money(base)}
        </span>
      )}
    </div>
  );
});
