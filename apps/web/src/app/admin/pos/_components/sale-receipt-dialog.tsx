"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, Printer } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PAYMENT_LABELS, money, toFa } from "@/lib/format";
import type { Invoice } from "@/lib/types";

/**
 * رسیدِ پس از ثبت فاکتور.
 *
 * جایگزینِ toastِ موفقیت است: toast شش ثانیه بعد محو می‌شد و فروشنده‌ی مشغولِ
 * پیشخوان (نگاهش رفته سمت مشتری بعدی) نه تأیید را می‌دید نه دکمه‌ی چاپ را.
 * این پنجره تا وقتی خودش ببندد می‌ماند — Enter یا Esc فوری می‌بنددش و فوکوس
 * به نوار اسکن برمی‌گردد، پس سرعتِ کار با یک کلید حفظ می‌شود ولی تأییدِ
 * قطعی و «چاپ مجدد» همیشه جلوی چشم است.
 */
export function SaleReceiptDialog({
  invoice,
  onClose,
}: {
  invoice: Invoice | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // فوکوس اولیه روی «بستن» — Enterِ بی‌توجه همین لحظه پنجره را می‌بندد.
  useEffect(() => {
    if (!invoice) return;
    const t = setTimeout(() => closeRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [invoice]);

  const due = invoice?.dueAmount ?? 0;

  return (
    <Dialog open={!!invoice} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        tabIndex={-1}
        className="max-w-sm gap-0 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          // Enter روی دکمه‌ها خودِ دکمه را می‌زند؛ در بقیه‌ی فضا یعنی
          // «تأیید شد، ببند و برگرد به اسکن».
          if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        {invoice && (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <div className="text-base font-bold">
                    فاکتور {toFa(invoice.number)} ثبت شد
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {toFa(
                      new Date(invoice.createdAt).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    )}{" "}
                    · {toFa(invoice.lines.length)} قلم
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">مشتری</span>
              <span className="font-medium">
                {invoice.customer?.fullName ?? "نقدی گذری"}
              </span>
            </div>

            {/* مبلغ نهایی — همان عددی که فروشنده بلند می‌خواند. */}
            <div className="rounded-lg bg-blue-600 px-3 py-2.5 text-white dark:bg-blue-700">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-blue-100">مبلغ نهایی</span>
                <span className="text-2xl font-bold tabular-nums">{money(invoice.total)}</span>
              </div>
              <p className="text-end text-[11px] text-blue-200">ریال</p>
            </div>

            {/* تفکیک پرداخت — روش‌های ترکیبی و چک اینجا دیده می‌شوند. */}
            {invoice.payments.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {invoice.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
                      {PAYMENT_LABELS[p.method] ?? p.method}
                      {p.cheque?.number ? ` (چک ${p.cheque.number})` : ""}
                    </span>
                    <span className="tabular-nums">{money(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* مانده — برای فروش حساب‌باز مهم‌ترین عددِ همین رسید است. */}
            {due > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                <span className="font-medium">مانده‌ی حساب</span>
                <span className="font-bold tabular-nums">{money(due)}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className="h-11 flex-1"
                onClick={() =>
                  window.open(`/admin/print/invoice/${invoice.id}`, "_blank")
                }
              >
                <Printer className="size-4" /> چاپ مجدد
              </Button>
              <Button
                ref={closeRef}
                variant="outline"
                className="h-11"
                onClick={onClose}
              >
                بستن
              </Button>
            </div>

            <p className="text-center text-[11px] text-muted-foreground">
              Enter یا Esc برای بستن و ادامه‌ی فروش
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
