"use client";

import { useMemo, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { rial, PAYMENT_LABELS } from "@/lib/format";
import type { PaymentInput, PaymentMethod } from "@/lib/types";

import { ChequeFields } from "@/components/cheque-fields";
import {
  computeCreditDueDate,
  CreditTermsPanel,
} from "./credit-terms-panel";

const METHODS: PaymentMethod[] = ["CASH", "CARD", "CHEQUE", "CREDIT"];

/**
 * تسویه‌ی فاکتور. چند سطر پرداخت مجاز است (نقد + چک + …) چون سرور هم چند
 * سطر پرداخت می‌پذیرد. CREDIT یعنی نسیه: در «پرداخت‌شده» حساب نمی‌شود و
 * سررسیدش از همین‌جا تعیین می‌شود — مثل مسیر سریع F2.
 */
export function PaymentDialog({
  open,
  total,
  hasCustomer,
  customerCreditDays,
  customerChequeRateBp,
  customerChequeRateMode,
  onConfirm,
  onClose,
}: {
  open: boolean;
  total: number;
  hasCustomer: boolean;
  /** مهلت پیش‌فرضِ خودِ مشتری — برای چیپ‌ها و پیش‌فرض. */
  customerCreditDays?: number | null;
  customerChequeRateBp?: number;
  customerChequeRateMode?: "FLAT" | "MONTHLY";
  /** `dueDate` فقط وقتی مهلت/سررسیدِ نسیه صراحتاً انتخاب شده باشد پر می‌شود. */
  onConfirm: (payments: PaymentInput[], dueDate?: string) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<PaymentInput[]>([]);
  const [creditDays, setCreditDays] = useState<number | null>(null);
  const [customDue, setCustomDue] = useState("");

  const [prevOpen, setPrevOpen] = useState(open);
  const [prevTotal, setPrevTotal] = useState(total);
  if (open !== prevOpen || total !== prevTotal) {
    setPrevOpen(open);
    setPrevTotal(total);
    if (open) {
      setRows([{ method: "CASH", amount: total }]);
      setCreditDays(null);
      setCustomDue("");
    }
  }

  const paid = rows
    .filter((r) => r.method !== "CREDIT")
    .reduce((s, r) => s + (r.amount || 0), 0);
  const credit = rows
    .filter((r) => r.method === "CREDIT")
    .reduce((s, r) => s + (r.amount || 0), 0);
  const remaining = total - paid - credit;

  const overpaid = paid > total;
  const needsCustomer = credit > 0 && !hasCustomer;
  const hasChosenTerm = creditDays !== null || customDue !== "";
  const dueDate = useMemo(
    () => computeCreditDueDate(creditDays, customDue, customerCreditDays),
    [creditDays, customDue, customerCreditDays],
  );
  const chequeMissing = rows.some(
    (r) => r.method === "CHEQUE" && (!r.cheque?.number?.trim() || !r.cheque?.dueDate)
  );
  const invalid = overpaid || needsCustomer || chequeMissing || remaining !== 0;

  const patch = (i: number, p: Partial<PaymentInput>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base">پرداخت — {rial(total)}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {METHODS.map((m) => (
                    <button
                      key={m}
                      onClick={() => patch(i, { method: m, cheque: undefined })}
                      className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                        r.method === m
                          ? "bg-primary text-primary-foreground"
                          : "border bg-background hover:bg-accent"
                      }`}
                    >
                      {PAYMENT_LABELS[m]}
                    </button>
                  ))}
                </div>

                <MoneyInput
                  autoFocus={i === 0}
                  className="h-9 flex-1 text-end tabular-nums"
                  value={r.amount}
                  onChange={(n) => patch(i, { amount: n })}
                />

                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  >
                    حذف
                  </Button>
                )}
              </div>

              {r.method === "CHEQUE" && (
                <ChequeFields
                  base={r.amount}
                  value={r.cheque}
                  defaultRateBp={customerChequeRateBp}
                  defaultRateMode={customerChequeRateMode}
                  onChange={(cheque) => patch(i, { cheque })}
                />
              )}
            </div>
          ))}

          {credit > 0 && (
            <CreditTermsPanel
              customerCreditDays={customerCreditDays}
              creditDays={creditDays}
              customDue={customDue}
              onCreditDays={(d) => {
                setCustomDue("");
                setCreditDays(d);
              }}
              onCustomDue={(v) => setCustomDue(v)}
            />
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                { method: "CASH", amount: Math.max(0, remaining) },
              ])
            }
          >
            افزودن سطر پرداخت
          </Button>

          <div className="rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span>پرداخت‌شده</span>
              <span className="tabular-nums">{rial(paid)}</span>
            </div>
            {credit > 0 && (
              <div className="mt-1 flex justify-between text-amber-600">
                <span>نسیه</span>
                <span className="tabular-nums">{rial(credit)}</span>
              </div>
            )}
            <div
              className={`mt-1 flex justify-between font-semibold ${
                remaining !== 0 ? "text-destructive" : ""
              }`}
            >
              <span>{remaining >= 0 ? "باقی‌مانده" : "اضافه‌پرداخت"}</span>
              <span className="tabular-nums">{rial(Math.abs(remaining))}</span>
            </div>
          </div>

          {paid === 0 && credit > 0 && (
            <p className="rounded-md bg-amber-600/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
              هیچ مبلغی دریافت نشده — این فروش روی حساب بازِ مشتری ثبت می‌شود و
              سرِ تسویه یک‌جا حساب می‌گردد.
            </p>
          )}
          {paid > 0 && credit > 0 && (
            <p className="text-xs text-muted-foreground">
              بخشی دریافت شد، پس فاکتور نهایی می‌شود و {rial(credit)} با سررسید
              روی حساب مشتری می‌ماند.
            </p>
          )}

          {needsCustomer && (
            <p className="text-sm text-destructive">
              برای فروش نسیه ابتدا مشتری را انتخاب کنید (F4).
            </p>
          )}
          {chequeMissing && (
            <p className="text-sm text-destructive">
              شماره چک و تاریخ سررسید الزامی است.
            </p>
          )}

          <Button
            className="h-11 w-full"
            disabled={invalid}
            onClick={() =>
              onConfirm(
                rows.filter((r) => r.amount > 0),
                credit > 0 && hasChosenTerm ? dueDate.toISOString() : undefined
              )
            }
          >
            تأیید پرداخت
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
