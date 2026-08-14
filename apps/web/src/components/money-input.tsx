"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { faToEn, money, parseNum } from "@/lib/format";

/**
 * ورودی پولی با نمایشِ زنده.
 *
 * همان لحظه‌ی تایپ، ارقام فارسی با جداکننده‌ی «٬» نشان داده می‌شود — نه اینکه
 * فقط بعد از blur قالب بگیرد. مکان‌نما هم حفظ می‌شود: جای آن بر اساسِ «تعداد
 * رقمِ قبل از مکان‌نما» در ورودیِ خام حساب می‌شود و در رشته‌ی قالب‌بندی‌شده
 * بعد از همان تعداد رقم می‌نشیند. جداکننده‌ها رقم نیستند، پس ویرایشِ رقمِ
 * وسطی هم به هم نمی‌ریزد — تنها کاری که نمی‌کنیم «جایِ دقیقِ کاراکتری» است
 * که با جداکننده‌های بین رقم‌ها معنا ندارد.
 *
 * ارقام فارسی و انگلیسی هر دو پذیرفته می‌شود و `value` همیشه عددِ خالص است.
 */
export function MoneyInput({
  value,
  onChange,
  selectOnFocus = false,
  onFocus,
  onBlur,
  className,
  ref,
  ...rest
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "dir" | "inputMode" | "ref"> & {
  value: number;
  onChange: (n: number) => void;
  /** با فوکوس، کل عدد انتخاب شود — برای جاهایی که معمولاً کل مبلغ عوض می‌شود. */
  selectOnFocus?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const display = value ? money(value) : "";

  const setRef = (el: HTMLInputElement | null) => {
    inputRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  return (
    <Input
      {...rest}
      ref={setRef}
      className={className}
      dir="ltr"
      inputMode="numeric"
      /* نمایشِ زنده: عددِ خالص → همان لحظه با ارقام فارسی و «٬». */
      value={display}
      onFocus={(e) => {
        onFocus?.(e);
        if (selectOnFocus) e.target.select();
      }}
      onBlur={onBlur}
      onChange={(e) => {
        const el = e.target;
        // چند رقم قبل از مکان‌نما بود؟ جداکننده‌ها به حساب نمی‌آیند.
        const caretInRaw = (
          faToEn(el.value.slice(0, el.selectionStart ?? el.value.length)).match(/\d/g) ??
          []
        ).length;
        const next = parseNum(el.value);
        onChange(next);

        /*
         * بعد از رندرِ مقدارِ قالب‌بندی‌شده، مکان‌نما را بعد از همان تعداد رقم
         * بگذار — جداکننده‌هایی که بین رقم‌ها جا گرفتند نباید مکان‌نما را پرت کنند.
         */
        requestAnimationFrame(() => {
          const input = inputRef.current;
          if (!input) return;
          const formatted = input.value;
          let pos = 0;
          let seen = 0;
          while (pos < formatted.length && seen < caretInRaw) {
            // ارقامِ نمایش داده‌شده فارسی‌اند — هر دو بازه باید شمرده شوند.
            if (/[0-9۰-۹]/.test(formatted[pos])) seen++;
            pos++;
          }
          input.setSelectionRange(pos, pos);
        });
      }}
    />
  );
}
