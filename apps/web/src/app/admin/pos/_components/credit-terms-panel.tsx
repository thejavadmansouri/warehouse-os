"use client";

import { useMemo } from "react";

import { JalaliDateInput } from "@/components/jalali-date-input";
import { faDate, toFa } from "@/lib/format";

/**
 * مهلت‌های رایج پرداخت.
 * فروشنده عدد تایپ نمی‌کند؛ از بین چند گزینه‌ی رایج یکی را برمی‌دارد.
 */
export const CREDIT_TERMS = [0, 7, 15, 30, 45, 60, 90];

/** تاریخِ تنها-روز (YYYY-MM-DD). */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * سررسید پایان روز از مهلت روزشمار یا تاریخ سفارشی.
 *
 * «YYYY-MM-DD» را عمداً در تقویمِ محلی می‌خوانیم: `new Date("2026-12-01")`
 * طبق استاندارد UTC تفسیر می‌شود و در منطقه‌های زمانیِ منفی یک روز عقب
 * می‌افتد — فروشنده ۱ آذر را انتخاب می‌کند و برگه ۳۰ آبان نشان می‌دهد.
 */
export function computeCreditDueDate(
  creditDays: number | null,
  customDue: string,
  customerCreditDays?: number | null,
): Date {
  const effectiveDays = creditDays ?? customerCreditDays ?? 0;
  const d = customDue
    ? new Date(DATE_ONLY.test(customDue) ? `${customDue}T00:00:00` : customDue)
    : new Date();
  if (!customDue) d.setDate(d.getDate() + effectiveDays);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * چیپ‌های مهلت + تاریخ سررسید — مشترک F2 و F7.
 *
 * کنترل‌شده است تا هر دیالوگ state خودش را نگه دارد و فقط UI یکی باشد.
 */
export function CreditTermsPanel({
  customerCreditDays,
  creditDays,
  customDue,
  onCreditDays,
  onCustomDue,
  hint,
}: {
  customerCreditDays?: number | null;
  /** null = هنوز انتخاب نشده. */
  creditDays: number | null;
  customDue: string;
  onCreditDays: (days: number) => void;
  onCustomDue: (isoDate: string) => void;
  /** توضیح کوتاه زیر پنل (مثلاً حساب‌باز در F2). */
  hint?: string;
}) {
  const hasChosenTerm = creditDays !== null || customDue !== "";
  const dueDate = useMemo(
    () => computeCreditDueDate(creditDays, customDue, customerCreditDays),
    [creditDays, customDue, customerCreditDays],
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
      <div>
        <span className="mb-2 block text-sm text-muted-foreground">
          مهلت پرداخت
        </span>
        <div className="flex flex-wrap gap-1.5">
          {[...new Set([...CREDIT_TERMS, customerCreditDays ?? 0])]
            .sort((a, b) => a - b)
            .map((d) => {
              const active = !customDue && creditDays === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onCreditDays(d)}
                  className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:border-primary hover:text-primary"
                  }`}
                >
                  {d === 0 ? "همان روز" : `${toFa(d)} روز`}
                </button>
              );
            })}

          <button
            type="button"
            onClick={() =>
              onCustomDue(customDue || new Date().toISOString().slice(0, 10))
            }
            className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors ${
              customDue
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:border-primary hover:text-primary"
            }`}
          >
            سفارشی
          </button>
        </div>
      </div>

      {customDue ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">تاریخ سررسید</span>
          <JalaliDateInput value={customDue} onChange={onCustomDue} />
        </div>
      ) : null}

      {hasChosenTerm ? (
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm text-muted-foreground">سررسید</span>
          <span className="text-base font-semibold tabular-nums text-primary">
            {faDate(dueDate.toISOString())}
          </span>
        </div>
      ) : (customerCreditDays ?? 0) > 0 ? (
        <p className="text-xs text-muted-foreground">
          مهلت همیشگی این مشتری {toFa(customerCreditDays!)} روز است — برای ثبت
          همین مهلت، «{toFa(customerCreditDays!)} روز» را بزنید.
        </p>
      ) : null}

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
