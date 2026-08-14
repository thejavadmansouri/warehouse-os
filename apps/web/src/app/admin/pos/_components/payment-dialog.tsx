"use client";

import { useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { faDate, money, toFa, rial, PAYMENT_LABELS } from "@/lib/format";
import type { PaymentInput, PaymentMethod } from "@/lib/types";

import { CREDIT_TERMS } from "./checkout-flow";

const METHODS: PaymentMethod[] = ["CASH", "CARD", "CHEQUE", "CREDIT"];

/**
 * تسویه‌ی فاکتور. چند سطر پرداخت مجاز است (نقد + چک + …) چون سرور هم چند
 * سطر پرداخت می‌پذیرد. CREDIT یعنی نسیه: در «پرداخت‌شده» حساب نمی‌شود و
 * سررسیدش از همین‌جا تعیین می‌شود — مثل مسیر سریع F2، نه پیش‌فرضِ بی‌سروصدا.
 */
export function PaymentDialog({
  open,
  total,
  hasCustomer,
  customerCreditDays,
  onConfirm,
  onClose,
}: {
  open: boolean;
  total: number;
  hasCustomer: boolean;
  /** مهلت پیش‌فرضِ خودِ مشتری — فقط برای نمایش چیپِ فعالِ اولیه. */
  customerCreditDays?: number | null;
  /** `dueDate` فقط وقتی مهلت/سررسیدِ نسیه صراحتاً انتخاب شده باشد پر می‌شود. */
  onConfirm: (payments: PaymentInput[], dueDate?: string) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<PaymentInput[]>([]);
  /** مهلت پرداختِ نسیه. null یعنی «دست نخورده، از مهلتِ خودِ مشتری بگیر». */
  const [creditDays, setCreditDays] = useState<number | null>(null);
  /** سررسیدِ دستی (ISO) — وقتی پر باشد بر مهلتِ روزشمار می‌چربد. */
  const [customDue, setCustomDue] = useState("");

  // هر بار که باز می‌شود، پیش‌فرض «کل مبلغ نقد» — رایج‌ترین حالت پیشخوان.
  useEffect(() => {
    if (open) {
      setRows([{ method: "CASH", amount: total }]);
      setCreditDays(null);
      setCustomDue("");
    }
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
  /** مهلت مؤثر: چیزی که انتخاب شده، وگرنه مهلتِ همیشگیِ خودِ مشتری. */
  const effectiveDays = creditDays ?? customerCreditDays ?? 0;
  /** آیا فروشنده صراحتاً مهلت/سررسید انتخاب کرده؟ اگر نه، سرور از مهلتِ مشتری می‌سازد. */
  const hasChosenTerm = creditDays !== null || customDue !== "";
  /** سررسید = پایانِ روزِ n اُم — وگرنه صبحِ همان روز «معوق» می‌شود. */
  const dueDate = useMemo(() => {
    const d = customDue ? new Date(customDue) : new Date();
    if (!customDue) d.setDate(d.getDate() + effectiveDays);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [effectiveDays, customDue]);
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
                  className="h-9 flex-1 text-left tabular-nums"
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
                  {/* سررسید چک شمسی وارد می‌شود — فروشنده تاریخ میلادی را از
                      کسی نمی‌شنود و روی خود چک هم شمسی نوشته شده. */}
                  <JalaliDateInput
                    value={r.cheque?.dueDate?.slice(0, 10) ?? ""}
                    onChange={(iso) =>
                      patch(i, {
                        cheque: {
                          ...(r.cheque ?? { number: "" }),
                          dueDate: iso,
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>
          ))}

          {/*
            پنل مهلت نسیه — فقط وقتی واقعاً نسیه در کار است.

            قبلاً فرم کامل (F7) هیچ سررسیدی نمی‌فرستاد و سرور بی‌صدا به مهلت
            پیش‌فرضِ مشتری برمی‌گشت؛ فروشنده در فرمِ «پرداخت ترکیبی» نمی‌توانست
            مهلت یا تاریخِ سررسید را عوض کند، ولی در مسیر سریع F2 می‌توانست.
            همین پنل، دو مسیر را هم‌رفتار می‌کند.
          */}
          {credit > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
              <div>
                <span className="mb-2 block text-sm text-muted-foreground">
                  مهلت پرداخت نسیه
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set([...CREDIT_TERMS, customerCreditDays ?? 0])]
                    .sort((a, b) => a - b)
                    .map((d) => {
                      const active = !customDue && effectiveDays === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => { setCustomDue(""); setCreditDays(d); }}
                          className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors ${                              active
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
                      setCustomDue((v) => v || new Date().toISOString().slice(0, 10))
                    }
                    className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors ${                        customDue
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:border-primary hover:text-primary"
                    }`}
                  >
                    سفارشی
                  </button>
                </div>
              </div>

              {customDue && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">تاریخ سررسید</span>
                  <JalaliDateInput value={customDue} onChange={setCustomDue} />
                </div>
              )}

              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm text-muted-foreground">سررسید</span>
                <span className="text-base font-semibold tabular-nums text-primary">
                  {faDate(dueDate.toISOString())}
                </span>
              </div>
            </div>
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
