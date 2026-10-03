"use client";

import { money, toFa } from "@/lib/format";
import { balanceTextClass } from "@/components/finance-badges";

/**
 * نوارِ ماندهٔ مشتری — دقیقاً کنارِ تیکِ «دیدن حافظهٔ این فاکتور».
 *
 * طرحِ تأییدشده: فروشنده در لحظه‌ی ویرایش باید بدون رفتن به هیچ پنجره‌ای
 * بفهمد مشتری چند بدهکار است، مانده‌ی همین فاکتور چیست و با ثبت، چه می‌شود.
 * همه‌ی اعداد از دیکشنری مالی رنگ می‌گیرند — اینجا حقِ رنگ‌سازیِ محلی نیست.
 *
 * داده از کوئری‌ی «customer» می‌آید که با رویدادهای رسید/پرداخت/برگشتِ
 * پرداخت realtime تازه می‌شود؛ یعنی اگر همزمان صندوقِ دیگری پول گرفت،
 * همین نوار هم عوض می‌شود.
 */
export function CustomerBalanceStrip({
  totalDue,
  overdue,
  invoiceDue,
  dueAfter,
  chequesInHand,
  className = "",
  layout = "row",
}: {
  /** نمایش سطری در نماهای معمول، یا جدول شبکه‌ای در فوتر اصلاح POS. */
  layout?: "row" | "grid";
  /** ماندهٔ کل حساب — مثبت بدهکار، منفی طلبکار. */
  totalDue: number;
  /** بخشِ معوقِ مانده — فقط برای بدهکار معنا دارد. */
  overdue: number;
  /** ماندهٔ فعلیِ همین فاکتور — نامعلوم باشد جعبه‌اش نمی‌آید. */
  invoiceDue?: number;
  /** ماندهٔ فاکتور بعد از ثبتِ عملیات — فقط در ویرایش معنا دارد. */
  dueAfter?: number;
  /** تعداد چکِ نزد ما که هنوز وصول نشده. */
  chequesInHand: number;
  className?: string;
}) {
  const box =
    "whitespace-nowrap rounded-md border bg-muted/40 px-1.5 py-0 text-[11px]";
  const containerClass =
    layout === "grid"
      ? "grid w-full grid-cols-2 gap-1 sm:grid-cols-4"
      : "flex shrink-0 items-center gap-1";

  return (
    <span
      className={`${containerClass} ${className}`}
      title="وضعیت مالی مشتری — با هر رسید و پرداخت، همان لحظه تازه می‌شود"
    >
      <span className={`${box} text-muted-foreground`}>
        ماندهٔ کل:{" "}
        <b className={`tabular-nums ${balanceTextClass(totalDue)}`}>
          {money(totalDue)}
        </b>
      </span>      {invoiceDue !== undefined && (
        <span className={`${box} text-muted-foreground`}>
          همین فاکتور: {" "}
          <b className={`tabular-nums ${balanceTextClass(invoiceDue)}`}>
            {money(invoiceDue)}
          </b>
        </span>
      )}

      {dueAfter !== undefined && (
        <span className={`${box} text-muted-foreground`}>
          بعد از ثبت: {" "}
          <b className={`tabular-nums ${balanceTextClass(dueAfter)}`}>
            {money(dueAfter)}
          </b>
        </span>
      )}

      {overdue > 0 && (
        <span
          className={`${box} border-destructive/30 bg-destructive/10 font-semibold text-destructive`}
          title="بخشی از بدهی از سررسیدش گذشته است"
        >
          معوق: <b className="tabular-nums">{money(overdue)}</b>
        </span>
      )}

      {chequesInHand > 0 && (
        <span className={`${box} text-muted-foreground`} title="چک‌های نزد ما که هنوز وصول نشده">
          {toFa(chequesInHand)} چک نزد ما
        </span>
      )}
    </span>
  );
}
