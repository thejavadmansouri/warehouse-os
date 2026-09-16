"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/money-input";
import { JalaliDateInput } from "@/components/jalali-date-input";

import { createPayout } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { amount as amountFmt, money, toFa, PAYMENT_LABELS } from "@/lib/format";
import { uuid } from "@/lib/uuid";
import type { PaymentMethod } from "@/lib/types";

/** روش‌های پرداخت به مشتری. نسیه یعنی «پولی جابه‌جا نشود» — اینجا بی‌معناست. */
const METHODS: Exclude<PaymentMethod, "CREDIT">[] = ["CASH", "CARD", "CHEQUE"];

/**
 * پرداخت وجه به مشتری — تسویه‌ی اعتبار او با پولِ واقعی، یا «پرداختِ آزاد» به
 * مشتریِ بدونِ بستانکاری (با `allowBeyondCredit` که بدهی‌اش را بیشتر می‌کند).
 *
 * قرینه‌ی فرمِ «دریافت وجه» با جهتِ معکوس، ولی ساده‌تر: یک مبلغ و یک روش و
 * یک دلیل. چکِ پرداختی سود/نرخ ندارد — مبلغِ روی کاغذِ چک همان مبلغِ سند است
 * (برخلاف چکِ دریافتی که «تفاوت فروش مدت‌دار» ممکن است داشته باشد).
 *
 * قواعد سرور: مبلغ تا سقفِ بستانکاری، دلیلِ اجباری، و `idempotencyKey` تا
 * دوبارِ Enter یا قطعِ شبکه دو سند نسازد. مازادِ آزاد فقط وقتی ممکن است که
 * `allowBeyondCredit` صریح داده شود و کاربر آن را تأیید کرده باشد — همان الگوی
 * «پیش‌دریافت» در رسید، تا صفرِ اضافه بی‌سروصدا مشتری را بدهکارتر نکند.
 */
export function PayoutForm({
  customerId,
  creditBalance,
  allowBeyondCredit = false,
  onDone,
}: {
  customerId: string;
  /** قدرمطلقِ بستانکاریِ مشتری — عددِ مثبت. <=0 یعنی چیزی برای پرداخت نیست. */
  creditBalance: number;
  /**
   * پرداختِ آزاد: فرم برای مشتریِ بدونِ بستانکاری هم باز می‌شود و مبلغ می‌تواند
   * از بستانکاری بگذرد — با تأییدِ صریح، مازاد به بدهیِ مشتری اضافه می‌شود.
   */
  allowBeyondCredit?: boolean;
  onDone: () => void;
}) {
  const [method, setMethod] = React.useState<Exclude<PaymentMethod, "CREDIT">>("CASH");
  const [amount, setAmount] = React.useState(Math.max(0, creditBalance));
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  /** تأییدِ پرداختِ آزاد — مازادِ تایپی نباید بی‌سروصدا بدهی بسازد. */
  const [allowOver, setAllowOver] = React.useState(false);
  const [cheque, setCheque] = React.useState({
    number: "",
    bankName: "",
    dueDate: "",
  });

  /**
   * کلید یکتا هنگام ثبت ساخته می‌شود و تا موفق‌شدن نگه داشته می‌شود، تا اگر
   * شبکه قطع شد و کاربر دوباره زد، اعتبار مشتری دو بار مصرف نشود.
   */
  const idemRef = React.useRef<string | null>(null);
  const resetIdem = () => { idemRef.current = null; };

  const over = amount > creditBalance;
  const chequeIncomplete =
    method === "CHEQUE" && (!cheque.number.trim() || !cheque.dueDate);

  const submit = useMutation({
    mutationFn: () => {
      if (!idemRef.current) idemRef.current = uuid();
      return createPayout({
        idempotencyKey: idemRef.current,
        customerId,
        amount,
        method,
        reason: reason.trim(),
        note: note.trim() || undefined,
        allowBeyondCredit: over && allowBeyondCredit ? true : undefined,
        ...(method === "CHEQUE"
          ? {
              cheque: {
                number: cheque.number.trim(),
                bankName: cheque.bankName.trim() || undefined,
                dueDate: cheque.dueDate,
              },
            }
          : {}),
      });
    },
    onSuccess: (r) => {
      toast.success(
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-bold">پرداخت {toFa(r.number)} ثبت شد</span>
          <span className="tabular-nums">{amountFmt(r.amount)}</span>
        </div>
      );
      setReason("");
      setNote("");
      setAllowOver(false);
      setCheque({ number: "", bankName: "", dueDate: "" });
      idemRef.current = null;
      onDone();
    },
    onError: (e: unknown) => {
      const err = e instanceof ApiException ? e : null;
      if (err?.code === "EXCEEDS_CREDIT") {
        toast.error("مبلغ از بستانکاری مشتری بیشتر است");
      } else if (err?.code === "NO_CREDIT") {
        toast.error("این مشتری بستانکار نیست — چیزی برای پرداخت ندارد");
      } else {
        toast.error(err?.message ?? "ثبت پرداخت ناموفق بود");
      }
      // خطای اعتبارسنجی یعنی مبلغ باید عوض شود → این دیگر همان سند نیست.
      resetIdem();
    },
  });

  // در حالتِ عادی مازاد اصلاً قابلِ ثبت نیست؛ در پرداختِ آزاد فقط با تأییدِ صریح.
  /* دلیلِ پرداخت اختیاری است — تسویه نباید به تایپِ دلیل گره بخورد. */
  const overAllowed = allowBeyondCredit ? allowOver : false;
  const canSubmit =
    amount > 0 && (!over || overAllowed) && !chequeIncomplete && !submit.isPending;

  if (creditBalance <= 0 && !allowBeyondCredit) {
    return (
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <HandCoins className="size-4" /> پرداخت به مشتری
        </h2>
        <p className="text-sm text-muted-foreground">
          این مشتری بستانکار نیست. پرداخت وجه فقط برای تسویه‌ی بستانکاری ثبت‌شده
          ممکن است.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <HandCoins className="size-4" /> پرداخت به مشتری
        {allowBeyondCredit && creditBalance <= 0 && (
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-normal text-emerald-700 dark:text-emerald-300">
            پرداخت آزاد — بدهیِ او بیشتر می‌شود
          </span>
        )}
      </h2>

      <div className="flex flex-col gap-3">
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMethod(m); resetIdem(); }}
                  className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                    method === m
                      ? "bg-blue-600 text-white"
                      : "border bg-background hover:border-blue-500 hover:text-blue-600"
                  }`}
                >
                  {PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>

            <MoneyInput
              className="h-9 flex-1 text-right tabular-nums"
              value={amount}
              onChange={(n) => { setAmount(n); resetIdem(); }}
            />
          </div>

          {method === "CHEQUE" && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Input
                placeholder="شماره چک"
                value={cheque.number}
                onChange={(e) => { setCheque((c) => ({ ...c, number: e.target.value })); resetIdem(); }}
              />
              <Input
                placeholder="بانک"
                value={cheque.bankName}
                onChange={(e) => { setCheque((c) => ({ ...c, bankName: e.target.value })); resetIdem(); }}
              />
              <JalaliDateInput
                value={cheque.dueDate?.slice(0, 10) ?? ""}
                onChange={(iso) => { setCheque((c) => ({ ...c, dueDate: iso })); resetIdem(); }}
              />
            </div>
          )}

          {over && allowBeyondCredit ? (
            <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 p-3 dark:bg-amber-950/30">
              <input
                type="checkbox"
                checked={allowOver}
                onChange={(e) => { setAllowOver(e.target.checked); resetIdem(); }}
                className="mt-0.5 size-4 accent-amber-600"
              />
              <span className="text-xs">
                <b className="block text-amber-800 dark:text-amber-300">
                  {creditBalance <= 0
                    ? "این مشتری بستانکاری ندارد"
                    : `${amountFmt(amount - creditBalance)} بیشتر از بستانکاریِ مشتری`}
                </b>
                <span className="text-muted-foreground">
                  به‌عنوان «پرداخت آزاد» ثبت شود و به بدهیِ مشتری اضافه شود
                  (بدهکارتر می‌شود)؟ بدون این تأیید، ثبت رد می‌شود.
                </span>
              </span>
            </label>
          ) : over ? (
            <p className="mt-2 text-xs text-destructive">
              مبلغ از بستانکاری ({money(creditBalance)}) بیشتر است — مشتری ناگهان
              بدهکار می‌شود؛ کم کنید.
            </p>
          ) : (
            creditBalance > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                بستانکاریِ فعلی: {money(creditBalance)}
              </p>
            )
          )}
          {chequeIncomplete && (
            <p className="mt-2 text-xs text-destructive">
              شماره چک و تاریخ سررسید الزامی است.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {creditBalance > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={amount === creditBalance}
              onClick={() => { setAmount(creditBalance); resetIdem(); }}
            >
              کلِ بستانکاری ({money(creditBalance)})
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            className="h-10 flex-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="دلیل (اختیاری) — مثلاً تسویه بستانکاری مرجوعی"
          />
        </div>

        <div className="flex items-center gap-2">
          <Input
            className="h-11 flex-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="توضیح (اختیاری)"
          />
          <Button
            className="h-11 bg-amber-600 px-6 text-white hover:bg-amber-700"
            disabled={!canSubmit}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? "در حال ثبت…" : "ثبت پرداخت"}
          </Button>
        </div>

        <p className="text-xs leading-6 text-muted-foreground">
          پول واقعی به مشتری می‌رسد؛ بستانکاری مصرف می‌شود و مازادِ آزاد به بدهی
          اضافه می‌شود. هیچ فاکتوری دست نمی‌خورد و سابقه‌ی کامل در گردش حسابِ
          مشتری می‌ماند.
        </p>
      </div>
    </Card>
  );
}
