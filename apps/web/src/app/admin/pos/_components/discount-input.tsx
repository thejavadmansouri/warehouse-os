"use client";

import { forwardRef } from "react";

import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/money-input";
import { money, parseNum, toFa } from "@/lib/format";
import {
  MAX_PERCENT,
  clamp,
  discountToRial,
  type DiscountInput as DiscountValue,
} from "../_lib/discount";

/**
 * ورودی تخفیف با کلید تعویضِ ریال/درصد.
 *
 * یک کنترل برای هر دو حالت است، نه دو فیلد جدا: فروشنده وسط فروش نباید فکر کند
 * کدام خانه را پر کند. دکمه‌ی کنارش حالت را عوض می‌کند و **عدد را نگه نمی‌دارد**
 * — «۱۰» در حالت درصد یعنی ۱۰٪ و در حالت ریال یعنی ۱۰ ریال، و تبدیلِ خودکار
 * بینشان بیشتر گیج می‌کند تا کمک.
 *
 * زیرِ فیلد، معادلِ محاسبه‌شده نشان داده می‌شود تا قبل از ثبت معلوم باشد این
 * درصد چقدر ریال می‌شود.
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
    /**
     * چیپ = داخل نوارِ پایینِ سبد، هم‌قدِ «جمع اقلام» و «تخفیف ردیف‌ها». در این
     * حالت ورودی و دکمه‌ی واحد روی یک خطِ ۲۴پیکسلی می‌نشینند تا ارتفاعِ چیپ
     * با بقیه یکی بماند.
     */
    chip?: boolean;
    id?: string;
    disabled?: boolean;
  }
>(function DiscountField(
  { value, base, onChange, compact = false, chip = false, id, disabled },
  ref
) {
  const isPercent = value.mode === "percent";
  const applied = discountToRial(value, base);
  // تخفیفِ تایپ‌شده از مبلغ بیشتر است → سرور ردش می‌کند، همین‌جا هشدار بده.
  const clipped = !isPercent && value.value > base && base > 0;

  const toggle = () =>
    onChange({ value: 0, mode: isPercent ? "amount" : "percent" });

  return (
    <div
      className={
        chip ? "flex flex-col" : compact ? "flex flex-col gap-0.5" : "flex flex-col gap-1"
      }
      title={chip && isPercent && applied > 0 ? `−${money(applied)}` : undefined}
    >
      <div className={chip ? "flex items-stretch gap-0.5" : "flex items-stretch gap-1"}>
        {isPercent ? (
          /* درصد جداکننده ندارد، پس همان Input ساده کافی است. */
          <Input
            ref={ref}
            id={id}
            dir="ltr"
            disabled={disabled}
            inputMode="numeric"
            /*
              در سبد `h-7` — هم‌قدِ خانه‌های تعداد و قیمت. با `h-10` این فیلد
              بلندترین چیزِ ردیف بود و ارتفاعِ کلِ ردیف را تعیین می‌کرد؛ یعنی
              روی هر صفحه چند قلم کم‌تر دیده می‌شد.
            */
            className={`min-w-0 flex-1 text-right tabular-nums ${
              chip ? "h-6 px-1 text-xs" : compact ? "h-7" : "h-10 w-28"
            } ${clipped ? "border-amber-600/70" : ""}`}
            value={value.value ? toFa(value.value) : ""}
            onChange={(e) => {
              const n = parseNum(e.target.value);
              onChange({ ...value, value: clamp(n, 0, MAX_PERCENT) });
            }}
            placeholder="۰٪"
          />
        ) : (
          /* ریال جداکننده دارد — فقط بعد از blur قالب‌بندی شود. */
          <MoneyInput
            ref={ref}
            id={id}
            disabled={disabled}
            className={`min-w-0 flex-1 text-right tabular-nums ${
              chip ? "h-6 px-1 text-xs" : compact ? "h-7" : "h-10 w-28"
            } ${clipped ? "border-amber-600/70" : ""}`}
            value={value.value}
            onChange={(n) => onChange({ ...value, value: Math.max(0, n) })}
            placeholder="۰"
          />
        )}
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          title={isPercent ? "تبدیل به مبلغ ریالی" : "تبدیل به درصد"}
          aria-label={isPercent ? "حالت درصد — برای ریال کلیک کنید" : "حالت ریال — برای درصد کلیک کنید"}
          /* عرض ثابت: وگرنه «٪» و «ریال» دو عرض متفاوت می‌سازند و ستون ناهموار می‌شود. */
          className={`${chip ? "h-6 w-8 text-[10px]" : compact ? "h-7 w-10" : "w-14"} shrink-0 rounded-md border text-xs font-medium transition-colors
                      hover:border-primary hover:text-primary focus:outline-none
                      focus:ring-2 focus:ring-primary disabled:opacity-50 ${
                        isPercent
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground"
                      }`}
        >
          {isPercent ? "٪" : "ریال"}
        </button>
      </div>

      {/* معادلِ محاسبه‌شده — فقط وقتی چیزی برای گفتن هست. یک خط، بدون شکستن.
          در حالتِ چیپ جایی برای خط دوم نیست؛ همان عدد در title می‌آید. */}
      {!chip && isPercent && applied > 0 && (
        <span className="truncate text-[11px] tabular-nums text-muted-foreground">
          −{money(applied)}
        </span>
      )}
      {!chip && clipped && (
        <span className="truncate text-[11px] text-amber-600">
          حداکثر {money(base)}
        </span>
      )}
    </div>
  );
});
