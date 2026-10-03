"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/money-input";
import { money, PAYMENT_LABELS, toFa } from "@/lib/format";
import { getInvoiceSettlement, recomposeInvoicePayments } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { uuid } from "@/lib/uuid";
import { CustomerPicker } from "./customer-picker";

/**
 * «اصلاح نحوهٔ پرداخت» یک فاکتورِ ثبت‌شده — تسویه از نو.
 *
 * چرا یک پنلِ جدا و نه همان پنلِ پرداختِ فروش: آن پنل پولِ **دریافت‌شده** را
 * ثبت می‌کند و سبدِ در جریان را می‌بندد؛ اینجا فاکتوری ثبت شده و باید تقسیمش
 * بازنویسی شود. ولی زبانش عمداً همان است: نقد، کارتخوان، نسیه.
 *
 * شکلِ پنل ساده است — دو عددِ قابلِ تایپ (نقد، کارتخوان) و یک عددِ **محاسبه‌شده**
 * (نسیه = باقی‌مانده). فروشنده سه بار عدد نمی‌زند، جمع هم همیشه می‌خواند:
 * نقد + کارت + نسیه = مبلغ فاکتور، به‌حکمِ خودِ محاسبه.
 *
 * کلیدها: Tab بین دو عدد، F4 انتخاب/عوض‌کردن مشتری (وقتی نسیه دارد)،
 * Alt+۱ همه‌اش نقد، Alt+۲ همه‌اش کارت، Enter ثبت، Esc بستن.
 */
export function PaymentRecomposeDialog({
  open,
  invoiceId,
  customer,
  onPickCustomer,
  onClose,
  onDone,
}: {
  open: boolean;
  /** فاکتوری که اصلاح می‌شود؛ null یعنی پنل بسته است. */
  invoiceId: string | null;
  /** مشتریِ انتخاب‌شده بیرونِ پنل — برای فاکتورِ بدونِ مشتری که نسیه می‌شود. */
  customer: Customer | null;
  /**
   * بازکردنِ پنلِ مشتریِ صندوق (انتخاب یا ساختِ سریع).
   *
   * اختیاری: صفحهٔ فاکتور و پروندهٔ حساب‌بازها انتخابگرِ مشتریِ صندوق را
   * ندارند؛ آنجا خودِ این پنل یک انتخابگرِ کوچک باز می‌کند تا فاکتورِ
   * بدونِ مشتری هم بشود نسیه‌اش کرد.
   */
  onPickCustomer?: () => void;
  onClose: () => void;
  /** بعد از ثبتِ موفق — برای تازه‌کردنِ فهرست‌هایی که صفحه نگه داشته. */
  onDone?: (result: { invoiceId: string; dueAmount: number }) => void;
}) {
  const qc = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["invoice-settlement", invoiceId],
    queryFn: () => getInvoiceSettlement(invoiceId!),
    enabled: open && !!invoiceId,
  });

  const [cash, setCash] = useState(0);
  const [card, setCard] = useState(0);
  const [reason, setReason] = useState("");
  /** مشتریِ انتخاب‌شده از انتخابگرِ داخلی — وقتی بیرونِ پنل انتخابگری نیست. */
  const [innerCustomer, setInnerCustomer] = useState<Customer | null>(null);
  const [pickOpen, setPickOpen] = useState(false);

  const total = data?.invoice.total ?? 0;
  const received = cash + card;
  /** نسیه از باقی‌مانده حساب می‌شود، نه از ورودیِ کاربر. */
  const credit = Math.max(0, total - received);
  const overpaid = received > total;

  const currentOf = (m: "CASH" | "CARD" | "CREDIT") =>
    data?.byMethod.find((b) => b.method === m)?.amount ?? 0;
  const currentReceived = currentOf("CASH") + currentOf("CARD");

  /*
   * تقسیمِ فعلیِ فاکتور، به‌محضِ رسیدنِ داده، یک‌بار روی دو عدد می‌نشیند.
   *
   * پیش‌تر این کار فقط داخلِ `onOpenAutoFocus` انجام می‌شد؛ ولی آن لحظه هنوز
   * درخواستِ تسویه برنگشته و `data` خالی است — یعنی پنل همیشه از صفر باز
   * می‌شد و «تقسیمِ فعلی» برای خواننده فقط یک متن بود. حالا خودِ پنل از همان
   * تقسیمی شروع می‌کند که فاکتور دارد.
   */
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (data && seededFor !== invoiceId) {
    setSeededFor(invoiceId);
    setCash(currentOf("CASH"));
    setCard(currentOf("CARD"));
  }

  /** مشتریِ ثبتِ فاکتور، بعد مشتریِ انتخاب‌شده بیرونِ پنل، بعد انتخابگرِ داخلی. */
  const pickedCustomer = customer ?? innerCustomer;
  const customerId = data?.invoice.customerId ?? pickedCustomer?.id ?? null;
  const needsCustomer = credit > 0 && !customerId;
  const attachingCustomer = !!customerId && !data?.invoice.customerId;

  /*
   * «چیزی عوض نشده» را همین‌جا می‌گیریم تا کاربر به‌جای پیامِ خطای سرور، همان
   * لحظه ببیند دکمه خاموش است. تنها استثنا: وصل‌کردنِ فاکتور به یک مشتری —
   * خودش یک تغییرِ واقعی است.
   */
  const unchanged = received === currentReceived && !attachingCustomer;

  const blocked = data ? !data.canRecompose : false;
  const invalid = isLoading || blocked || overpaid || needsCustomer || unchanged;

  const save = useMutation({
    mutationFn: () => {
      const payments = [
        { method: "CASH" as const, amount: cash },
        { method: "CARD" as const, amount: card },
        { method: "CREDIT" as const, amount: credit },
      ].filter((p) => p.amount > 0);

      return recomposeInvoicePayments(invoiceId!, {
        idempotencyKey: uuid(),
        reason: reason.trim() || undefined,
        customerId: customerId ?? undefined,
        payments,
      });
    },
    onSuccess: (res) => {
      toast.success(
        `نحوهٔ پرداخت فاکتور ${toFa(res.invoice.number)} اصلاح شد — ` +
          (res.invoice.dueAmount > 0
            ? `نسیهٔ جدید: ${money(res.invoice.dueAmount)} ریال`
            : "دیگر نسیه‌ای ندارد"),
        {
          duration: 9000,
          action: {
            label: "چاپ نسخهٔ اصلاحی",
            onClick: () =>
              window.open(`/admin/print/invoice/${res.invoice.id}`, "_blank"),
          },
        },
      );

      qc.invalidateQueries({ queryKey: ["invoice", res.invoice.id] });
      qc.invalidateQueries({ queryKey: ["invoice-settlement", res.invoice.id] });
      qc.invalidateQueries({ queryKey: ["pos-customer-invoices"] });
      qc.invalidateQueries({ queryKey: ["pos-recent-invoices"] });
      qc.invalidateQueries({ queryKey: ["open-plain-invoices"] });
      if (customerId) qc.invalidateQueries({ queryKey: ["customer", customerId] });

      onDone?.({ invoiceId: res.invoice.id, dueAmount: res.invoice.dueAmount });
      onClose();
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof Error ? e.message : "اصلاح نحوهٔ پرداخت ناموفق بود",
      ),
  });

  const submit = () => {
    if (invalid || save.isPending) return;
    save.mutate();
  };

  /**
   * انتخابِ مشتری: اول انتخابگرِ بیرونی (پنل صندوق)، وگرنه انتخابگرِ خودِ پنل.
   * همین یک تابع هم روی F4 و هم روی دکمهٔ راهنما نشسته تا رفتار یکی بماند.
   */
  const openPicker = () => {
    if (onPickCustomer) onPickCustomer();
    else setPickOpen(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    // F4 — انتخاب/عوض‌کردنِ مشتری، همان کلیدِ آشنای صندوق.
    if (e.key === "F4") {
      e.preventDefault();
      openPicker();
      return;
    }
    // Alt+۱ و Alt+۲ — دو کارِ پرتکرارِ پیشخوان: «همه‌اش نقد» و «همه‌اش کارت».
    if (e.altKey && (e.code === "Digit1" || e.code === "Digit2")) {
      e.preventDefault();
      if (e.code === "Digit1") {
        setCash(total);
        setCard(0);
      } else {
        setCard(total);
        setCash(0);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !save.isPending && onClose()}>
      <DialogContent
        ref={contentRef}
        tabIndex={-1}
        className="max-w-lg gap-0 p-0"
        onKeyDown={onKeyDown}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // هر بازشدن از تقسیمِ فعلیِ خودِ فاکتور شروع می‌شود، نه از صفر.
          // خودِ نشستنِ عددها با رسیدنِ داده انجام می‌شود (بلوکِ `seededFor`).
          setSeededFor(null);
          setReason("");
          setInnerCustomer(null);
          setPickOpen(false);
          setTimeout(() => contentRef.current?.focus(), 30);
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          // انتخابگرِ مشتری روی این پنل است — Esc اول باید آن را ببندد.
          if (pickOpen) return;
          if (!save.isPending) onClose();
        }}
      >
        {/* سربرگ: مبلغ فاکتور و تقسیمِ فعلی — تا معلوم باشد «از چه» به «چه». */}
        <div className="border-b bg-muted/40 px-5 py-4 text-center">
          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            اصلاح نحوهٔ پرداخت
            {data ? ` — فاکتور ${toFa(data.invoice.number)}` : ""}
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums">
            {money(total)} <span className="text-sm font-normal text-muted-foreground">ریال</span>
          </div>
          {data && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              الان:{" "}
              {data.byMethod
                .filter((b) => b.amount !== 0)
                .map((b) => `${PAYMENT_LABELS[b.method]} ${money(b.amount)}`)
                .join(" · ") || "بدونِ پرداخت"}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 p-5">
          {isLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              در حال خواندنِ وضعیتِ فاکتور…
            </p>
          )}

          {blocked && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {data?.blockedReason}
            </p>
          )}

          {!isLoading && !blocked && (
            <>
              {/* دو عددِ قابلِ تایپ. نسیه محاسبه می‌شود، پس هیچ‌وقت جمع غلط نمی‌شود. */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">نقد</span>
                  <MoneyInput
                    value={cash}
                    onChange={(n) => setCash(Math.max(0, n))}
                    className="h-11 text-center text-lg font-semibold"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">کارتخوان</span>
                  <MoneyInput
                    value={card}
                    onChange={(n) => setCard(Math.max(0, n))}
                    className="h-11 text-center text-lg font-semibold"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => {
                    setCash(total);
                    setCard(0);
                  }}
                  className="rounded-md border px-2 py-1 hover:bg-muted"
                >
                  Alt+۱ همه نقد
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCard(total);
                    setCash(0);
                  }}
                  className="rounded-md border px-2 py-1 hover:bg-muted"
                >
                  Alt+۲ همه کارت
                </button>
              </div>

              {/* نتیجهٔ همین تقسیم، پیش از ثبت. */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border bg-muted/30 px-2 py-2">
                  <div className="text-[0.7rem] text-muted-foreground">پرداخت</div>
                  <div className="mt-0.5 text-sm font-bold tabular-nums">
                    {money(received)}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 px-2 py-2">
                  <div className="text-[0.7rem] text-muted-foreground">
                    روی حساب (نسیه)
                  </div>
                  <div
                    className={`mt-0.5 text-sm font-bold tabular-nums ${
                      credit > 0 ? "text-amber-600 dark:text-amber-400" : ""
                    }`}
                  >
                    {money(credit)}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 px-2 py-2">
                  <div className="text-[0.7rem] text-muted-foreground">مشتری</div>
                  <div className="mt-0.5 truncate text-sm font-bold">
                    {data?.invoice.customer?.fullName ?? pickedCustomer?.fullName ?? "—"}
                  </div>
                </div>
              </div>

              {overpaid && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                  مجموعِ نقد و کارت از مبلغ فاکتور بیشتر است — اول یکی را کم کنید.
                </p>
              )}

              {/*
                مشتری فقط وقتی لازم می‌شود که نسیه بماند. همان کلیدِ F4 صندوق،
                تا فروشنده کلید تازه یاد نگیرد.
              */}
              {needsCustomer && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2">
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    این مبلغ روی حساب می‌ماند — مشتری را انتخاب کنید
                  </span>
                  <button
                    type="button"
                    onClick={openPicker}
                    className="shrink-0 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  >
                    انتخاب مشتری (F4)
                  </button>
                </div>
              )}

              {!data?.invoice.customerId && pickedCustomer && (
                <p className="text-xs text-muted-foreground">
                  این فاکتور به «{pickedCustomer.fullName}» وصل می‌شود
                  {credit > 0 ? " و مبلغ باقی‌مانده به بدهی او می‌نشیند." : "."}
                </p>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">دلیل (اختیاری)</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="مثلاً: اشتباه در روش پرداخت"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                />
              </label>

              <button
                type="button"
                disabled={invalid || save.isPending}
                onClick={submit}
                className="flex h-12 items-center justify-center rounded-lg bg-primary text-base
                           font-semibold text-primary-foreground transition-opacity
                           hover:opacity-90 disabled:opacity-40"
              >
                {save.isPending
                  ? "در حال ثبت…"
                  : unchanged
                    ? "چیزی عوض نشده"
                    : credit > 0
                      ? `ثبت — ${money(received)} دریافت و ${money(credit)} نسیه`
                      : `ثبت — تسویهٔ کامل ${money(received)}`}
              </button>
            </>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
            {(
              [
                ["Tab", "بین نقد و کارت"],
                ["F4", "مشتری"],
                ["Enter", "ثبت"],
                ["Esc", "بستن"],
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

      {/*
        انتخابگرِ مشتریِ داخلی — فقط وقتی بیرونِ پنل یکی نیست (صفحهٔ فاکتور و
        پروندهٔ حساب‌بازها). در صندوق، خودِ صندوق پنلِ مشتری را باز می‌کند و
        انتخاب به همان پنل برمی‌گردد؛ اینجا خودِ پنل کارِ خودش را می‌کند.
      */}
      {!onPickCustomer && (
        <CustomerPicker
          open={pickOpen}
          onPick={(c) => {
            setPickOpen(false);
            setInnerCustomer(c);
          }}
          onClose={() => setPickOpen(false)}
        />
      )}
    </Dialog>
  );
}
