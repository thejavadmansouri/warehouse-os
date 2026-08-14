"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { MoneyInput } from "@/components/money-input";

import { createReceipt } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { money, toFa, PAYMENT_LABELS } from "@/lib/format";
import { uuid } from "@/lib/uuid";
import type { PaymentMethod } from "@/lib/types";

/** نسیه روش دریافت نیست — «پول ندادم» پول دادن نیست. */
const METHODS: PaymentMethod[] = ["CASH", "CARD", "CHEQUE"];


/**
 * دریافت وجه، همان‌جا در پرونده‌ی مشتری.
 *
 * قبلاً یک صفحه‌ی جدا بود که اول باید مشتری را دوباره پیدا می‌کردی — در حالی
 * که کار همیشه از مشتری شروع می‌شود، نه از «دریافت». حالا حسابش باز است،
 * مانده‌اش جلوی چشم است، و پول همان‌جا ثبت می‌شود.
 */
export function TakePayment({
  customerId,
  totalDue,
  onDone,
}: {
  customerId: string;
  totalDue: number;
  onDone: () => void;
}) {
  const [amount, setAmount] = React.useState(0);
  const [method, setMethod] = React.useState<PaymentMethod>("CASH");
  const [note, setNote] = React.useState("");
  const [chequeNumber, setChequeNumber] = React.useState("");
  const [chequeBank, setChequeBank] = React.useState("");
  const [chequeDue, setChequeDue] = React.useState("");
  /**
   * تأیید پیش‌دریافت.
   *
   * تا وقتی کاربر صریحاً تأیید نکند، مازاد فرستاده نمی‌شود — یک صفرِ اضافه‌ی
   * تایپی نباید بی‌سروصدا مشتری را بستانکار کند.
   */
  const [allowOver, setAllowOver] = React.useState(false);

  /**
   * کلید یکتا هنگام ثبت ساخته می‌شود و تا موفق‌شدن نگه داشته می‌شود، تا اگر
   * شبکه قطع شد و کاربر دوباره زد، بدهی دو بار کم نشود.
   */
  const idemRef = React.useRef<string | null>(null);
  const resetIdem = () => { idemRef.current = null; };

  const submit = useMutation({
    mutationFn: () => {
      if (!idemRef.current) idemRef.current = uuid();
      return createReceipt({
        idempotencyKey: idemRef.current,
        customerId,
        amount,
        method,
        note: note.trim() || undefined,
        allowOverpayment: allowOver || undefined,
        cheque:
          method === "CHEQUE"
            ? {
                number: chequeNumber.trim(),
                bankName: chequeBank.trim() || undefined,
                dueDate: chequeDue,
              }
            : undefined,
      });
    },
    onSuccess: (r) => {
      toast.success(
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-bold">رسید {toFa(r.number)} ثبت شد</span>
          <span className="tabular-nums">{money(r.amount)} ریال</span>
        </div>
      );
      setAmount(0);
      setNote("");
      setChequeNumber("");
      setChequeBank("");
      setChequeDue("");
      setAllowOver(false);
      idemRef.current = null;
      onDone();
    },
    onError: (e: unknown) => {
      const err = e instanceof ApiException ? e : null;
      if (err?.code === "AMOUNT_EXCEEDS_DEBT") {
        // خودِ فرم گزینه‌ی پیش‌دریافت را نشان می‌دهد؛ اینجا فقط دلیل را می‌گوییم.
        toast.error(
          `مبلغ از بدهی بیشتر است — برای ثبتِ مازاد، «پیش‌دریافت» را تیک بزنید`
        );
      } else {
        toast.error(err?.message ?? "ثبت دریافت ناموفق بود");
      }
      // خطای اعتبارسنجی یعنی مبلغ باید عوض شود → این دیگر همان رسید نیست.
      resetIdem();
    },
  });

  const chequeIncomplete =
    method === "CHEQUE" && (!chequeNumber.trim() || !chequeDue);
  /** مازادِ این دریافت نسبت به بدهی — صفر یعنی دریافت عادی. */
  const overpayment = Math.max(0, amount - totalDue);
  const canSubmit =
    amount > 0 &&
    !chequeIncomplete &&
    !submit.isPending &&
    (overpayment === 0 || allowOver);

  if (totalDue <= 0) {
    return (
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <HandCoins className="size-4" /> دریافت وجه
        </h2>
        <p className="text-sm text-muted-foreground">
          این مشتری بدهی ندارد. دریافت وجه فقط بابت بدهی ثبت‌شده ممکن است.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <HandCoins className="size-4" /> دریافت وجه
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">مبلغ دریافتی</label>
          <MoneyInput
            className="h-11 text-left text-base tabular-nums"
            value={amount}
            onChange={(n) => { setAmount(n); resetIdem(); }}
            placeholder="۰"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setAmount(totalDue); resetIdem(); }}
            >
              تسویه‌ی کامل ({money(totalDue)})
            </Button>
          </div>

          {overpayment > 0 && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border
                              border-amber-400 bg-amber-50 p-3 dark:bg-amber-950/30">
              <input
                type="checkbox"
                checked={allowOver}
                onChange={(e) => { setAllowOver(e.target.checked); resetIdem(); }}
                className="mt-0.5 size-4 accent-amber-600"
              />
              <span className="text-xs">
                <b className="block text-amber-800 dark:text-amber-300">
                  {money(overpayment)} ریال بیشتر از بدهی است
                </b>
                <span className="text-muted-foreground">
                  به‌عنوان پیش‌دریافت ثبت شود و مشتری بستانکار شود؟ فروش بعدی
                  خودکار از همین کم می‌کند.
                </span>
              </span>
            </label>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">روش دریافت</label>
          <div className="flex gap-1">
            {METHODS.map((m) => (
              <button
                key={m}
                onClick={() => { setMethod(m); resetIdem(); }}
                className={`h-11 flex-1 rounded-md text-sm font-medium transition-colors ${
                  method === m
                    ? "bg-blue-600 text-white"
                    : "border bg-background hover:border-blue-500 hover:text-blue-600"
                }`}
              >
                {PAYMENT_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {method === "CHEQUE" && (
        <div className="mt-4 grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">شماره چک</label>
            <Input
              value={chequeNumber}
              onChange={(e) => { setChequeNumber(e.target.value); resetIdem(); }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">بانک</label>
            <Input
              value={chequeBank}
              onChange={(e) => setChequeBank(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">تاریخ سررسید</label>
            <JalaliDateInput
              value={chequeDue}
              onChange={(iso) => { setChequeDue(iso); resetIdem(); }}
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            بدهی همین حالا کم می‌شود، ولی چک تا وصول در «در جریان وصول» می‌ماند.
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Input
          className="h-11 flex-1"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="توضیح (اختیاری)"
        />
        <Button
          className="h-11 bg-emerald-600 px-6 text-white hover:bg-emerald-700"
          disabled={!canSubmit}
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? "در حال ثبت…" : "ثبت دریافت"}
        </Button>
      </div>
    </Card>
  );
}
