"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/money-input";

import { ChequeFields } from "@/components/cheque-fields";
import { createReceipt } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { amount, money, toFa, PAYMENT_LABELS } from "@/lib/format";
import { uuid } from "@/lib/uuid";
import type { PaymentInput, PaymentMethod } from "@/lib/types";

/** روش‌های دریافت. نسیه روش دریافت نیست — «پول ندادم» پول دادن نیست. */
const METHODS: PaymentMethod[] = ["CASH", "CARD", "CHEQUE"];

/**
 * دریافت وجه از مشتری — چند سطر پرداخت در یک رسید.
 *
 * همان الگوی «پرداخت ترکیبی» در صندوق: یک رسید می‌تواند نقد + کارت + چک باشد،
 * هر چک با شماره/بانک/سررسیدِ خودش. سرور هم همین را می‌پذیرد (ReceiptPayment).
 * برای پنل مشتری و صفحه‌ی رسیدها مشترک است تا دو فرم از هم جدا نیفتند.
 */
export function ReceiptForm({
  customerId,
  totalDue,
  chequeRateBp,
  chequeRateMode,
  onDone,
}: {
  customerId: string;
  totalDue: number;
  /** نرخِ فروشِ مدت‌دارِ خودِ مشتری. نیامدنش یعنی از پیش‌فرضِ فروشگاه. */
  chequeRateBp?: number;
  chequeRateMode?: "FLAT" | "MONTHLY";
  onDone: () => void;
}) {
  const [rows, setRows] = React.useState<PaymentInput[]>([
    { method: "CASH", amount: 0 },
  ]);
  const [note, setNote] = React.useState("");
  /** تأیید پیش‌دریافت — مازادِ تایپی نباید بی‌سروصدا بستانکاری بسازد. */
  const [allowOver, setAllowOver] = React.useState(false);

  /**
   * کلید یکتا هنگام ثبت ساخته می‌شود و تا موفق‌شدن نگه داشته می‌شود، تا اگر
   * شبکه قطع شد و کاربر دوباره زد، بدهی دو بار کم نشود.
   */
  const idemRef = React.useRef<string | null>(null);
  const resetIdem = () => { idemRef.current = null; };

  const paid = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const overpayment = Math.max(0, paid - totalDue);
  const remaining = Math.max(0, totalDue - paid);

  const patch = (i: number, p: Partial<PaymentInput>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const submit = useMutation({
    mutationFn: () => {
      if (!idemRef.current) idemRef.current = uuid();
      return createReceipt({
        idempotencyKey: idemRef.current,
        customerId,
        payments: rows
          .filter((r) => r.amount > 0)
          .map((r) => ({
            method: r.method,
            amount: r.amount,
            ...(r.method === "CHEQUE" && r.cheque
              ? { cheque: { ...r.cheque, bankName: r.cheque.bankName?.trim() || undefined } }
              : {}),
          })),
        note: note.trim() || undefined,
        allowOverpayment: overpayment > 0 ? true : undefined,
      });
    },
    onSuccess: (r) => {
      toast.success(
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-bold">رسید {toFa(r.number)} ثبت شد</span>
          <span className="tabular-nums">{amount(r.amount)}</span>
        </div>
      );
      setRows([{ method: "CASH", amount: 0 }]);
      setNote("");
      setAllowOver(false);
      idemRef.current = null;
      onDone();
    },
    onError: (e: unknown) => {
      const err = e instanceof ApiException ? e : null;
      if (err?.code === "AMOUNT_EXCEEDS_DEBT") {
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

  const chequeIncomplete = rows.some(
    (r) => r.method === "CHEQUE" && (!r.cheque?.number?.trim() || !r.cheque?.dueDate)
  );
  const canSubmit =
    paid > 0 && !chequeIncomplete && !submit.isPending && (overpayment === 0 || allowOver);

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

      <div className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { patch(i, { method: m, cheque: undefined }); resetIdem(); }}
                    className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                      r.method === m
                        ? "bg-blue-600 text-white"
                        : "border bg-background hover:border-blue-500 hover:text-blue-600"
                    }`}
                  >
                    {PAYMENT_LABELS[m]}
                  </button>
                ))}
              </div>

              <MoneyInput
                autoFocus={i === 0}
                className="h-9 flex-1 text-right tabular-nums"
                value={r.amount}
                onChange={(n) => { patch(i, { amount: n }); resetIdem(); }}
              />

              {rows.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setRows((rs) => rs.filter((_, j) => j !== i)); resetIdem(); }}
                >
                  حذف
                </Button>
              )}
            </div>

            {r.method === "CHEQUE" && (
              <ChequeFields
                base={r.amount}
                value={r.cheque}
                defaultRateBp={chequeRateBp}
                defaultRateMode={chequeRateMode}
                onChange={(cheque) => { patch(i, { cheque }); resetIdem(); }}
              />
            )}
          </div>
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((rs) => [...rs, { method: "CASH", amount: Math.max(0, remaining) }])
          }
        >
          افزودن سطر دریافت
        </Button>

        <div className="rounded-lg bg-muted p-3 text-sm">
          <div className="flex justify-between">
            <span>جمع دریافتی</span>
            <span className="tabular-nums">{amount(paid)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>بدهی فعلی</span>
            <span className="tabular-nums">{amount(totalDue)}</span>
          </div>
          <div className={`mt-1 flex justify-between font-semibold ${overpayment > 0 ? "text-destructive" : ""}`}>
            <span>{overpayment > 0 ? "اضافه‌پرداخت" : "باقی‌مانده‌ی بدهی"}</span>
            <span className="tabular-nums">{amount(overpayment > 0 ? overpayment : remaining)}</span>
          </div>
        </div>

        {overpayment > 0 && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border
                            border-amber-400 bg-amber-50 p-3 dark:bg-amber-950/30">
            <input
              type="checkbox"
              checked={allowOver}
              onChange={(e) => { setAllowOver(e.target.checked); resetIdem(); }}
              className="mt-0.5 size-4 accent-amber-600"
            />
            <span className="text-xs">
              <b className="block text-amber-800 dark:text-amber-300">
                {amount(overpayment)} بیشتر از بدهی است
              </b>
              <span className="text-muted-foreground">
                به‌عنوان پیش‌دریافت ثبت شود و مشتری بستانکار شود؟ فروش بعدی
                خودکار از همین کم می‌کند.
              </span>
            </span>
          </label>
        )}

        {chequeIncomplete && (
          <p className="text-sm text-destructive">
            شماره چک و تاریخ سررسید الزامی است.
          </p>
        )}

        <div className="flex items-center gap-2">
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

        <p className="text-xs leading-6 text-muted-foreground">
          مبلغ به‌طور خودکار به <b>قدیمی‌ترین فاکتور بدهکار</b> تخصیص داده می‌شود
          و تا جایی که برسد جلو می‌رود. چک‌ها تا وصول در «در جریان وصول» می‌مانند.
        </p>
      </div>
    </Card>
  );
}
