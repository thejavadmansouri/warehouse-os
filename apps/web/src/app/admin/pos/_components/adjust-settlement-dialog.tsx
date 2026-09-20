"use client";

import { useRef, useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChequeFields } from "@/components/cheque-fields";
import { MoneyInput } from "@/components/money-input";
import { money, PAYMENT_LABELS, toFa } from "@/lib/format";
import type { ChequeInput } from "@/lib/types";

/**
 * تسویه‌ی اختلافِ عملیاتِ یکپارچه — همان پنلِ پرداختِ خودِ فروش، ولی برای یک
 * مبلغِ از پیش‌محاسبه‌شده و یک روشِ واحد.
 *
 * اختلافِ مثبت = از مشتری بگیر (نقد/کارت/چک/روی حساب). اختلافِ منفی = به مشتری
 * بده یا در حسابش بستانکار کن (نقد/کارت/روی حساب — چکِ پرداختی معنی ندارد).
 * مبلغ دستِ فروشنده نیست: عددِ «اختلاف نهایی» همانی است که سرور می‌خواهد و
 * همین‌جا می‌ماند؛ فقط روش انتخاب می‌شود.
 *
 * کلیدها: ۱..۴ روش را عوض می‌کند، Enter ثبتِ نهاییِ همان عملیات، Esc برمی‌گردد
 * به سبد. همه‌چیز در همان درخواستِ createAdjust اتمیک ثبت می‌شود — این پنل فقط
 * تصمیمِ روش را می‌گیرد.
 */
export function AdjustSettlementDialog({
  open,
  direction,
  amount,
  beforeTotal,
  afterTotal,
  paidAmount,
  hasCustomer,
  preferCredit = false,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  direction: "COLLECT" | "PAY";
  amount: number;
  /** مبلغِ فاکتور پیش از عملیات. */
  beforeTotal: number;
  /** مبلغِ فاکتور پس از عملیات. */
  afterTotal: number;
  /** آنچه مشتری تاکنون پرداخت کرده. */
  paidAmount: number;
  /** «روی حساب» و «چک» فقط با مشتری معنا دارند — سرور بدون مشتری ردشان می‌کند. */
  hasCustomer: boolean;
  /**
   * مشتریِ حساب‌باز یا بدهکار — پیش‌فرضِ جهتِ PAY روی «روی حساب» می‌رود تا
   * پولِ نقد بی‌دلیل از صندوق بیرون نرود و بدهیِ مشتری همان‌جا کم شود.
   */
  preferCredit?: boolean;
  pending: boolean;
  /**
   * مبلغِ ویرایش‌شده را هم برمی‌گرداند — مدیر حق دارد اختلافِ نهایی را سرِ
   * پیشخوان چانه بزند یا گرد کند؛ صفر یعنی «تسویه‌ای ثبت نشود».
   */
  onConfirm: (
    method: "CASH" | "CARD" | "CHEQUE" | "CREDIT",
    cheque?: ChequeInput,
    editedAmount?: number,
  ) => void;
  onClose: () => void;
}) {
  /*
   * آیا این عملیاتِ PAY یعنی مشتری بیشتر از فاکتورِ پس‌ازعملیات پول داده
   * (پرداختِ اضافه — باید برگردد یا بستانکار شود)؟ اگر فاکتورِ OPEN باشد
   * پرداختی ثبت نشده و این سناریو پیش نمی‌آید؛ پیش‌فرضِ این حالتِ برگشت،
   * «روی حساب» (بستانکار) است تا پولِ نقد بی‌دلیل از صندوق بیرون نرود.
   */
  const overpaid = paidAmount > afterTotal;

  /** روش‌های مجازِ این جهت — چک فقط برای دریافت. */
  const methods: ("CASH" | "CARD" | "CHEQUE" | "CREDIT")[] =
    direction === "COLLECT"
      ? hasCustomer
        ? ["CASH", "CARD", "CHEQUE", "CREDIT"]
        : ["CASH", "CARD"]
      : hasCustomer
        ? ["CASH", "CARD", "CREDIT"]
        : ["CASH", "CARD"];

  const [method, setMethod] = useState<(typeof methods)[number]>(
    // پرداختِ اضافه: «روی حساب» کم‌ریسک‌ترین انتخاب است — پول نقد کمتری جابه‌جا
    // می‌شود و بستانکارِ مشتری سرِ تسویهٔ بعد می‌خورد. مشتریِ حساب‌باز یا
    // بدهکار هم (از preferCredit) پیش‌فرضش روی حساب است — همان قانونِ مرجوعی.
    // نبودِ مشتری = نقد.
    direction === "PAY" &&
      hasCustomer &&
      (overpaid || preferCredit) &&
      methods.includes("CREDIT")
      ? "CREDIT"
      : "CASH",
  );
  const [cheque, setCheque] = useState<ChequeInput | undefined>(undefined);
  /**
   * مبلغِ قابل‌ویرایش — پیش‌فرض همان اختلافِ محاسبه‌شده است و مدیر می‌تواند
   * همان‌جا عوضش کند (چانه‌زنی، گرد‌کردن، بخشش). صفر یعنی از مشتری چیزی
   * گرفته نمی‌شود و اختلافِ باقی‌مانده روی تعدیلِ دستی می‌نشیند.
   */
  const [editedAmount, setEditedAmount] = useState(amount);
  const contentRef = useRef<HTMLDivElement>(null);

  /*
   * هر بار که باز می‌شود، از پیش‌فرضِ «نقد» شروع کن — رایج‌ترین انتخاب.
   *
   * ریست در رویدادِ بازشدنِ خودِ دیالوگ (onOpenAutoFocus) انجام می‌شود، نه
   * در effect: این stateها فقط به «باز شدن» وابسته‌اند و در همان لحظه باید
   * ریست شوند. direction هم فقط با یک بازشدنِ تازه عوض می‌شود (والد برای هر
   * عملیات یک adjustSettle تازه می‌سازد)، پس همان رویداد کافی است.
   */
  const chequeMissing =
    method === "CHEQUE" && (!cheque?.number?.trim() || !cheque?.dueDate);
  const invalid =
    pending || chequeMissing || (method === "CREDIT" && !hasCustomer);
  /** تعدیلِ دستی نسبت به اختلافِ محاسبه‌شده — فقط برای نمایش. */
  const manualDelta = editedAmount - amount;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!invalid)
        onConfirm(
          method,
          method === "CHEQUE" ? cheque : undefined,
          editedAmount,
        );
      return;
    }
    // ۱..۴ روش را عوض می‌کند — خانه‌ی دیگری برای تایپ نیست.
    if (e.key >= "1" && e.key <= "4") {
      const picked = methods[Number(e.key) - 1];
      if (picked) {
        e.preventDefault();
        setMethod(picked);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent
        ref={contentRef}
        tabIndex={-1}
        className="max-w-md gap-0 p-0"
        onKeyDown={onKeyDown}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setMethod(
            direction === "PAY" &&
              hasCustomer &&
              (overpaid || preferCredit) &&
              methods.includes("CREDIT")
              ? "CREDIT"
              : "CASH",
          );
          setCheque(undefined);
          setEditedAmount(amount);
          // با تأخیرِ یک فریم تا بعد از انیمیشنِ بازشدن، فوکوس روی پنل بنشیند.
          // پاک‌کردنِ تایمر لازم نیست: اگر پنل زودتر بسته شود، فوکوس رویِ
          // گره‌ی جدا از DOM بی‌اثر است.
          setTimeout(() => contentRef.current?.focus(), 30);
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          if (!pending) onClose();
        }}
      >
        {/* سربرگ: مبلغ و جهت، بزرگ‌ترین چیزِ روی پنل — و مبلغ قابلِ ویرایش. */}
        <div className="border-b bg-muted/40 px-5 py-4 text-center">
          <div
            className={`text-xs font-semibold ${
              direction === "COLLECT"
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {direction === "COLLECT" ? "دریافت از مشتری" : "پرداخت به مشتری"} —
            اختلافِ نهاییِ عملیات
          </div>
          <div className="mx-auto mt-2 flex max-w-56 items-center gap-2">
            <MoneyInput
              value={editedAmount}
              onChange={(n) => setEditedAmount(Math.max(0, n))}
              className="h-10 text-center text-xl font-bold"
            />
            <span className="text-xs text-muted-foreground">ریال</span>
          </div>
          {manualDelta !== 0 && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              اختلافِ محاسبه‌شده: {money(amount)} · تعدیلِ دستی{" "}
              <span
                className={
                  manualDelta > 0
                    ? "font-semibold text-amber-600"
                    : "font-semibold text-emerald-600"
                }
              >
                {manualDelta > 0 ? "+" : "−"}
                {money(Math.abs(manualDelta))}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 p-5">
          {/*
            متنِ «فاکتور از/به و پرداختِ قبلی» — تا فروشنده بفهمد این پول دارد
            از کجا می‌آید، نه اینکه فقط یک عددِ ناشناس بپردازد/بگیرد. پرداختِ بیش
            از فاکتورِ پس‌ازعملیات (paidAmount > afterTotal) یعنی این پولِ
            برگشتی، «اضافه‌پرداختِ مشتری» است که باید بستانکار شود یا نقد
            برگردد.
          */}
          {(overpaid || paidAmount > 0) && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border bg-muted/30 px-2 py-2">
                <div className="text-[0.7rem] text-muted-foreground">
                  فاکتور پس از عملیات
                </div>
                <div className="mt-0.5 text-sm font-bold tabular-nums">
                  {money(afterTotal)}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-2 py-2">
                <div className="text-[0.7rem] text-muted-foreground">
                  پرداختِ قبلی
                </div>
                <div className="mt-0.5 text-sm font-bold tabular-nums">
                  {money(paidAmount)}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-2 py-2">
                <div className="text-[0.7rem] text-muted-foreground">
                  {overpaid
                    ? "اضافه‌پرداخت"
                    : direction === "COLLECT"
                      ? "مانده"
                      : "تغییر"}
                </div>
                <div
                  className={`mt-0.5 text-sm font-bold tabular-nums ${
                    overpaid
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {money(
                    Math.max(
                      0,
                      overpaid
                        ? paidAmount - afterTotal
                        : afterTotal - paidAmount,
                    ),
                  )}
                </div>
              </div>
            </div>
          )}

          {overpaid && (
            <p className="rounded-md bg-amber-600/10 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-600/10 dark:text-amber-400">
              مشتری قبلاً بیش از مبلغِ پس‌ازعملیات پرداخت کرده — این اختلاف یا
              روی حسابش بستانکار می‌شود، یا همان لحظه به او پرداخت می‌شود.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {methods.map((m, i) => {
              const active = method === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:border-primary hover:bg-primary/5"
                  }`}
                >
                  <span className="text-sm font-medium">
                    {PAYMENT_LABELS[m]}
                  </span>
                  <span
                    className={`text-[11px] ${
                      active
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    کلید {toFa(i + 1)}
                  </span>
                </button>
              );
            })}
          </div>

          {method === "CHEQUE" && (
            <ChequeFields
              base={editedAmount}
              value={cheque}
              onChange={setCheque}
            />
          )}

          {method === "CREDIT" && (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              مبلغ روی حسابِ مشتری می‌نشیند —{" "}
              {direction === "COLLECT" ? "بدهکارتر می‌شود" : "بستانکار می‌شود"}{" "}
              و در تسویه‌ی بعدی حساب می‌شود.
            </p>
          )}

          {method === "CREDIT" && !hasCustomer && (
            <p className="text-sm text-destructive">
              فاکتورِ بدونِ مشتری روی حساب نمی‌نشیند — نقد یا کارت انتخاب کنید.
            </p>
          )}
          {chequeMissing && (
            <p className="text-sm text-destructive">
              شماره چک و تاریخ سررسید الزامی است.
            </p>
          )}

          <button
            type="button"
            disabled={invalid}
            onClick={() =>
              onConfirm(
                method,
                method === "CHEQUE" ? cheque : undefined,
                editedAmount,
              )
            }
            className="flex h-12 items-center justify-center rounded-lg bg-primary text-base
                       font-semibold text-primary-foreground transition-opacity
                       hover:opacity-90 disabled:opacity-40"
          >
            {pending
              ? "در حال ثبت…"
              : `ثبت عملیات — ${direction === "COLLECT" ? "دریافت" : "پرداخت"} ${money(editedAmount)}`}
          </button>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
            {(
              [
                ["۱..۴", "روش"],
                ["Enter", "ثبت نهایی"],
                ["Esc", "بازگشت به سبد"],
              ] as [string, string][]
            ).map(([k, label]) => (
              <span key={k} className="flex items-center gap-1.5">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px]">
                  {k}
                </kbd>
                {label}
              </span>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
