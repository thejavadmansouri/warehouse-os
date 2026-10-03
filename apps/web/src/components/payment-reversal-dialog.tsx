"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money, PAYMENT_LABELS, toFa } from "@/lib/format";
import type { ReversePaymentDto } from "@/lib/types";

/**
 * برگشتِ پرداخت — خنثی‌سازیِ پرداختِ ثبت‌شدهٔ یک فاکتور.
 *
 * کارتخوان تراکنش را برگشت می‌زند یا بانک رد می‌کند: فاکتور سالم است، فقط پول
 * برگشته. این پنل سه چیز می‌پرسد: چه مبلغی (پیش‌فرضِ کامل = همهٔ پرداخت‌شدهٔ
 * فاکتور)، با چه روشی وجه برگشته (معمولاً همان کارت)، و چرا — دلیل اجباری است
 * تا سند در دفتر قابل‌دفاع باشد.
 *
 * ثبت بعد از این پنل سمتِ سرور اتمیک است (ردیفِ منفی + مانده + دفتر در یک
 * تراکنش)؛ اینجا فقط مبلغ و دلیل را می‌گیرد.
 *
 * کلیدها: ۱..۳ روش، Enter ثبت، Esc بستن — همان زبانِ پنل‌های دیگرِ صندوق.
 */
export function PaymentReversalDialog({
  open,
  invoiceNumber,
  invoiceId,
  paidAmount,
  customerName,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** برای نمایش در سرصفحه — «فاکتور ۱۰۲۳» */
  invoiceNumber: number;
  invoiceId: string;
  /** سقفِ برگشت = پرداخت‌شدهٔ فاکتور. */
  paidAmount: number;
  customerName?: string | null;
  pending: boolean;
  onConfirm: (invoiceId: string, dto: ReversePaymentDto) => void;
  onClose: () => void;
}) {
  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState<"CARD" | "CASH" | "CHEQUE">("CARD");
  const [reason, setReason] = useState("");
  const reasonRef = useRef<HTMLInputElement>(null);

  /*
   * باز شدن → فرم از نو: مبلغِ کامل به‌عنوان پیش‌فرض و فوکوس روی دلیل.
   * روشِ پیش‌فرض «کارت» است چون برگشتِ تراکنشِ کارتخوان رایج‌ترین سناریوست.
   *
   * ریست با تطبیقِ state در رندر (به ازایِ open/invoiceId)، نه effect — همان
   * الگویِ پنلِ مشتری؛ setState داخلِ effect رندرِ آبشاری می‌سازد.
   */
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevInvoiceId, setPrevInvoiceId] = useState(invoiceId);
  if (open !== prevOpen || invoiceId !== prevInvoiceId) {
    setPrevOpen(open);
    setPrevInvoiceId(invoiceId);
    setAmountText(open && paidAmount ? String(paidAmount) : "");
    setMethod("CARD");
    setReason("");
  }

  // فقط فوکوسِ دلیل — جابه‌جاییِ DOM، نه تغییرِ state؛ در effectِ بدونِ setState.
  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => reasonRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open, invoiceId]);

  /* دلیلِ برگشت اختیاری است — خنثی‌سازی نباید به تایپِ دلیل گره بخورد. */
  const amount = Number(amountText.replace(/[^\d]/g, "")) || 0;
  const invalid = amount <= 0 || amount > paidAmount;

  function confirm() {
    if (invalid || pending) return;
    onConfirm(invoiceId, {
      amount,
      method,
      reason: reason.trim(),
    });
  }

  const methods: ("CARD" | "CASH" | "CHEQUE")[] = ["CARD", "CASH", "CHEQUE"];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold">برگشت پرداخت — فاکتور {toFa(invoiceNumber)}</h2>
            <p className="text-sm text-muted-foreground">
              {customerName ? `${customerName} — ` : ""}
              پرداخت‌شدهٔ فاکتور: <span className="tabular-nums">{money(paidAmount)}</span> ریال.
              مانده به بدهی مشتری برمی‌گردد.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reversal-amount">مبلغ برگشتی (ریال)</Label>
            <Input
              id="reversal-amount"
              inputMode="numeric"
              className="tabular-nums text-end"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
            />
            {amount > paidAmount && (
              <p className="text-xs text-destructive">
                از پرداخت‌شدهٔ فاکتور بیشتر است — بیشترین برگشت {money(paidAmount)} ریال است.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>روشِ برگشت وجه</Label>
            <div className="flex gap-2">
              {methods.map((m, i) => (
                <Button
                  key={m}
                  type="button"
                  variant={method === m ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setMethod(m)}
                >
                  <span className="me-1 text-xs opacity-60">{toFa(i + 1)}</span>
                  {PAYMENT_LABELS[m]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reversal-reason">دلیل (اختیاری)</Label>
            <Input
              id="reversal-reason"
              ref={reasonRef}
              placeholder="مثلاً: کارتخوان تراکنش را برگشت زد"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Enter ثبت · Esc بستن
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={pending}>
                انصراف
              </Button>
              <Button onClick={confirm} disabled={invalid || pending}>
                {pending ? "در حال ثبت…" : "ثبت برگشت"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
