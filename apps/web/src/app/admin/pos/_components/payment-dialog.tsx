"use client";

import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { money, parseNum, toman, PAYMENT_LABELS } from "@/lib/format";
import type { PaymentInput, PaymentMethod } from "@/lib/types";

const METHODS: PaymentMethod[] = ["CASH", "CARD", "CHEQUE", "CREDIT"];

/**
 * تسویه‌ی فاکتور. چند سطر پرداخت مجاز است (نقد + چک + …) چون سرور هم چند
 * سطر پرداخت می‌پذیرد. CREDIT یعنی نسیه: در «پرداخت‌شده» حساب نمی‌شود.
 */
export function PaymentDialog({
  open,
  total,
  hasCustomer,
  onConfirm,
  onClose,
}: {
  open: boolean;
  total: number;
  hasCustomer: boolean;
  onConfirm: (payments: PaymentInput[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<PaymentInput[]>([]);

  // هر بار که باز می‌شود، پیش‌فرض «کل مبلغ نقد» — رایج‌ترین حالت پیشخوان.
  useEffect(() => {
    if (open) setRows([{ method: "CASH", amount: total }]);
  }, [open, total]);

  const paid = rows
    .filter((r) => r.method !== "CREDIT")
    .reduce((s, r) => s + (r.amount || 0), 0);
  const credit = rows
    .filter((r) => r.method === "CREDIT")
    .reduce((s, r) => s + (r.amount || 0), 0);
  const remaining = total - paid - credit;

  const overpaid = paid > total;
  const needsCustomer = credit > 0 && !hasCustomer;
  const chequeMissing = rows.some(
    (r) => r.method === "CHEQUE" && (!r.cheque?.number?.trim() || !r.cheque?.dueDate)
  );
  const invalid = overpaid || needsCustomer || chequeMissing || remaining !== 0;

  const patch = (i: number, p: Partial<PaymentInput>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">پرداخت — {toman(total)}</DialogTitle>
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

                <Input
                  autoFocus={i === 0}
                  dir="ltr"
                  className="h-9 flex-1 text-left tabular-nums"
                  value={r.amount ? money(r.amount) : ""}
                  onChange={(e) => patch(i, { amount: parseNum(e.target.value) })}
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
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Input
                    placeholder="شماره چک"
                    value={r.cheque?.number ?? ""}
                    onChange={(e) =>
                      patch(i, {
                        cheque: { ...(r.cheque ?? { dueDate: "" }), number: e.target.value },
                      })
                    }
                  />
                  <Input
                    placeholder="بانک"
                    value={r.cheque?.bankName ?? ""}
                    onChange={(e) =>
                      patch(i, {
                        cheque: {
                          ...(r.cheque ?? { number: "", dueDate: "" }),
                          bankName: e.target.value,
                        },
                      })
                    }
                  />
                  <Input
                    type="date"
                    dir="ltr"
                    value={r.cheque?.dueDate?.slice(0, 10) ?? ""}
                    onChange={(e) =>
                      patch(i, {
                        cheque: {
                          ...(r.cheque ?? { number: "" }),
                          dueDate: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>
          ))}

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
              <span className="tabular-nums">{toman(paid)}</span>
            </div>
            {credit > 0 && (
              <div className="mt-1 flex justify-between text-amber-600">
                <span>نسیه</span>
                <span className="tabular-nums">{toman(credit)}</span>
              </div>
            )}
            <div
              className={`mt-1 flex justify-between font-semibold ${
                remaining !== 0 ? "text-destructive" : ""
              }`}
            >
              <span>{remaining >= 0 ? "باقی‌مانده" : "اضافه‌پرداخت"}</span>
              <span className="tabular-nums">{toman(Math.abs(remaining))}</span>
            </div>
          </div>

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
            onClick={() => onConfirm(rows.filter((r) => r.amount > 0))}
          >
            تأیید پرداخت
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
