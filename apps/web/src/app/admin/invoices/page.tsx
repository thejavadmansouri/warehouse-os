"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Undo2 } from "lucide-react";

import { ErrorState } from "@/components/states";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { StatusBadge } from "@/components/status-badge";
import { InvoicePayBadge, balanceTextClass } from "@/components/finance-badges";
import { CustomerBalanceStrip } from "@/app/admin/pos/_components/customer-balance-strip";
import { ReceiptForm } from "@/components/receipt-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCustomer } from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReturnDialog } from "@/app/admin/pos/_components/return-dialog";
import { CorrectionDialog } from "@/app/admin/pos/_components/correction-dialog";
import { getInvoices, cancelInvoice } from "@/lib/api";
import { faDate, faTime, money, toFa, rial, INVOICE_STATUS_LABELS } from "@/lib/format";
import { useAuthStore } from "@/lib/auth-store";
import type { Invoice } from "@/lib/types";

/**
 * فهرستِ همه‌ی فاکتورها — لنگرِ هابِ «اسناد فروش».
 *
 * تا حالا فاکتورها فقط داخلِ مودالِ «فاکتورهای امروز» در صندوق دیده می‌شدند و
 * راهی برای دیدنِ فاکتورهای روزهای قبل، جز از گزارش‌ها، نبود. این صفحه همان
 * فهرست است با جست‌وجو (نام/شماره/تلفن) و صفحه‌بندی.
 */
const TH = "border-b px-2 py-1 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-2 py-1.5 whitespace-nowrap";

// برچسب‌ها از دیکشنری مرکزی می‌آیند — این صفحه حقِ نسخه‌برداریِ خودش را ندارد.
const STATUS_TABS = ["", "OPEN", "CONFIRMED", "RETURNED", "CANCELLED"].map((key) => ({
  key,
  label: key === "" ? "همه" : INVOICE_STATUS_LABELS[key] ?? key,
}));

/** امروز به‌صورت «YYYY-MM-DD» محلی — ورودیِ فیلترهای تاریخ. */
function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** پایانِ همان روز به‌صورت ISO — تا فیلترِ «تا تاریخ» کلِ آن روز را هم بگیرد. */
function endOfDay(iso: string): string {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** داخلِ صفحه‌ی «اسناد» سرتیترِ خودش را نشان نمی‌دهد. */
export function InvoicesPanel({ embedded }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const canManage = useAuthStore((s) => s.hasRole("ADMIN", "MANAGER"));

  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  /** «مانده‌دار» — پایه‌ی پیگیریِ وصول، پرکاربردترین فیلترِ این صفحه. */
  const [hasDue, setHasDue] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [row, setRow] = React.useState(0);
  const router = useRouter();

  // مرجوعی، اصلاحیه و ابطال — از همین‌جا روی هر فاکتوری با سرچ، نه فقط فاکتورهای امروز.
  const [returning, setReturning] = React.useState<string | null>(null);
  const [correcting, setCorrecting] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState<{ id: string; number: number; total: number } | null>(null);

  /*
   * نوارِ ماندهٔ مشتری زیرِ جدول — بخشِ دومِ طرحِ تأییدشده: هر جا حافظهٔ
   * فاکتور و وضعیت فاکتور دیده می‌شود، وضعیت مالی مشتری هم همان‌جاست.
   * ردیفِ فعال زیر نشانگر کیبورد نوار را می‌سازد؛ F6 از همان‌جا دریافت باز می‌کند.
   */
  const [receiving, setReceiving] = React.useState<{ customerId: string; customerName: string; number: number } | null>(null);
  const [receiptDone, setReceiptDone] = React.useState(false);

  const doCancel = useMutation({
    mutationFn: (v: { id: string; reason: string }) => cancelInvoice(v.id, v.reason),
    onSuccess: (inv) => {
      toast.success(`فاکتور ${toFa(inv.number)} باطل شد — موجودی برگشت`);
      setCancelling(null);
      qc.invalidateQueries({ queryKey: ["invoices-list"] });
    },
    onError: () => toast.error("باطل‌کردن فاکتور ناموفق بود"),
  });

  // ورودی را کمی نگه می‌داریم تا هر ضربه‌ی کلید یک درخواست نزند.
  const [debouncedQ, setDebouncedQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  /** هر فیلتر عوض شد به صفحهٔ ۱ برگرد — در همان دست‌کاره، نه در افکت. */
  const withPageReset = <A extends unknown[]>(fn: (...a: A) => void) =>
    (...a: A) => { fn(...a); setPage(1); };

  const list = useQuery({
    queryKey: ["invoices-list", debouncedQ, status, from, to, hasDue, page],
    queryFn: () =>
      getInvoices({
        q: debouncedQ || undefined,
        status: status || undefined,
        hasDue: hasDue ? ("true" as const) : undefined,
        from: from || undefined,
        // تا پایانِ همان روز، وگرنه فاکتورهای بعدازظهرِ روزِ «تا» جا می‌مانند.
        to: to ? endOfDay(to) : undefined,
        page,
        pageSize: 30,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  /* ردیفِ فعال — نوارِ ماندهٔ مشتری زیر جدول از همین ساخته می‌شود. */
  const activeInv = rows[row];
  const receiptDetail = useQuery({
    queryKey: ["customer", receiving?.customerId],
    queryFn: () => getCustomer(receiving!.customerId),
    enabled: !!receiving,
  });

  /* خلاصهٔ مالی مشتریِ ردیفِ فعال — کلیدِ مشترک با پرونده؛ realtime تازه می‌شود. */
  const activeSummaryQuery = useQuery({
    queryKey: ["customer", activeInv?.customer?.id],
    queryFn: () => getCustomer(activeInv!.customer!.id),
    enabled: !!activeInv?.customer?.id,
  });
  const activeSummary = activeSummaryQuery.data?.summary;

  /** ردیفِ فعال همیشه باید دیده شود — کیبورد خودش اسکرول نمی‌کند. */
  React.useEffect(() => {
    document.querySelector('[data-active-row="true"]')?.scrollIntoView({ block: "nearest" });
  }, [row, rows.length]);

  const openInPos = (inv?: Invoice) => {
    if (inv) router.push(`/admin/pos?edit=${inv.id}`);
  };

  return (
    /*
      یک سطر فیلتر، یک جدول، یک نوار کلید.
      سرصفحه، کارت، منوی سه‌نقطه‌ی هر ردیف و سه ردیفِ فیلترِ جدا حذف شدند:
      روی لپ‌تاپِ پیشخوان همه‌ی آن‌ها با هم نصفِ صفحه را می‌گرفتند.
    */
    <div
      tabIndex={-1}
      className={`flex flex-col outline-none ${embedded ? "min-h-0 flex-1" : "h-[calc(100vh-2.5rem)]"}`}
      onKeyDown={(e) => {
        if (returning || correcting || cancelling || receiving) return;
        const inv = rows[row];

        // F6 — دریافت از مشتریِ ردیفِ فعال، بدون ترکِ صفحه.
        if (e.key === "F6") {
          e.preventDefault();
          if (inv?.customer) {
            setReceiptDone(false);
            setReceiving({ customerId: inv.customer.id, customerName: inv.customer.fullName ?? "", number: inv.number });
          }
          return;
        }

        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setRow((r) => Math.min(r + 1, Math.max(rows.length - 1, 0)));
            return;
          case "ArrowUp":
            e.preventDefault();
            setRow((r) => Math.max(r - 1, 0));
            return;
          case "PageDown":
            e.preventDefault();
            setRow((r) => Math.min(r + 12, Math.max(rows.length - 1, 0)));
            return;
          case "PageUp":
            e.preventDefault();
            setRow((r) => Math.max(r - 12, 0));
            return;
          case "Enter":
            e.preventDefault();
            // Alt+Enter = مرجوعی؛ همان قاعده‌ی پنلِ مشتری در صندوق.
            if (e.altKey) { if (canManage && inv) setReturning(inv.id); }
            else openInPos(inv);
            return;
        }

        if (!inv) return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
          e.preventDefault();
          window.open(`/admin/print/invoice/${inv.id}`, "_blank");
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "Delete") {
          e.preventDefault();
          if (canManage && inv.status === "CONFIRMED") {
            setCancelling({ id: inv.id, number: inv.number, total: inv.total });
          }
        }
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="نام مشتری، شماره فاکتور یا تلفن…"
            className="h-8 pe-9 text-sm"
          />
        </div>

        <select
          value={status}
          onChange={withPageReset((e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value))}
          aria-label="وضعیت"
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {STATUS_TABS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={withPageReset(() => setHasDue((v) => !v))}
          className={`h-8 rounded-md border px-3 text-sm font-medium ${
            hasDue ? "border-warning bg-warning/10 text-warning" : "bg-background"
          }`}
        >
          مانده‌دار
        </button>

        <button
          type="button"
          onClick={() => { const t = todayIso(); setFrom(t); setTo(t); }}
          className="h-8 rounded-md border bg-background px-3 text-sm font-medium"
        >
          امروز
        </button>

        <JalaliDateInput value={from} onChange={withPageReset(setFrom)} />
        <JalaliDateInput value={to} onChange={withPageReset(setTo)} />

        {(hasDue || from || to || status) && (
          <button
            type="button"
            onClick={() => { setHasDue(false); setFrom(""); setTo(""); setStatus(""); }}
            className="h-8 rounded-md border border-dashed px-3 text-sm text-muted-foreground"
          >
            پاک‌کردن
          </button>
        )}

        <span className="text-xs text-muted-foreground">
          {meta ? `${toFa(meta.total)} فاکتور` : ""}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {list.isError ? (
          <ErrorState onRetry={() => list.refetch()} />
        ) : !rows.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {list.isFetching ? "…" : debouncedQ ? "فاکتوری پیدا نشد" : "هنوز فاکتوری ثبت نشده"}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur">
              <tr>
                <th className={`${TH} w-20`}>شماره</th>
                <th className={`${TH} w-24`}>تاریخ</th>
                <th className={`${TH} w-16`}>ساعت</th>
                <th className={TH}>مشتری</th>
                <th className={`${TH} w-28`}>وضعیت</th>
                <th className={`${TH} w-36`}>مبلغ</th>
                <th className={`${TH} w-36`}>مانده</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv, i) => (
                <tr
                  key={inv.id}
                  data-active-row={i === row}
                  onMouseEnter={() => setRow(i)}
                  onClick={() => openInPos(inv)}
                  title="باز کردن این فاکتور در صندوق برای ویرایش"
                  className={`cursor-pointer border-b odd:bg-muted/25 ${
                    inv.status === "CANCELLED" ? "opacity-60" : ""
                  }`}
                >
                  <td className={`${TD} font-bold tabular-nums`}>{toFa(inv.number)}</td>
                  <td className={`${TD} tabular-nums text-muted-foreground`}>
                    {faDate(inv.createdAt)}
                  </td>
                  <td className={`${TD} tabular-nums text-muted-foreground`}>
                    {faTime(inv.createdAt)}
                  </td>
                  <td className={`${TD} max-w-0 truncate`}>
                    {inv.customer?.fullName ?? "نقدی گذری"}
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge kind="invoice" status={inv.status} />
                      {/* وضعیت پرداخت — پرداخت کامل/نسیه/معوق، از دیکشنری مالی. */}
                      <InvoicePayBadge invoice={inv} />
                      {inv.hasReturns && <Undo2 className="size-3.5 text-warning" />}
                    </div>
                  </td>
                  <td className={`${TD} text-end font-semibold tabular-nums`}>
                    {money(inv.total)}
                  </td>
                  <td
                    className={`${TD} text-end font-bold tabular-nums ${
                      inv.dueAmount > 0 ? balanceTextClass(inv.dueAmount) : "text-muted-foreground"
                    }`}
                  >
                    {inv.dueAmount > 0 ? money(inv.dueAmount) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/*
        نوارِ وضعیت مالی مشتری — برای ردیفِ فعال، همان طرحِ تأییدشده: هر جا
        فاکتور دیده می‌شود، بدهکاری مشتری هم همان‌جاست. مشتریِ نقدیِ گذری نوار ندارد.
      */}
      {activeInv?.customer && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t bg-card px-3 py-1.5">
          <span className="whitespace-nowrap text-sm font-bold">
            {activeInv.customer.fullName}
          </span>
          <CustomerBalanceStrip
            totalDue={activeSummary?.totalDue ?? 0}
            overdue={activeSummary?.overdue ?? 0}
            invoiceDue={activeInv.dueAmount}
            chequesInHand={activeSummary?.chequesInHandCount ?? 0}
          />
          <Button
            type="button"
            variant="outline"
            className="ms-auto h-7 gap-1.5 px-3 text-xs font-bold"
            onClick={() => {
              setReceiptDone(false);
              setReceiving({ customerId: activeInv.customer!.id, customerName: activeInv.customer!.fullName ?? "", number: activeInv.number });
            }}
          >
            دریافت از مشتری
            <kbd className="rounded border bg-muted px-1 text-[10px]">F6</kbd>
          </Button>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-x-5 overflow-x-auto whitespace-nowrap border-t bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
        {(
          [
            ["↑↓", "حرکت"],
            ["Enter", "ویرایش در صندوق"],
            ...(canManage ? [["Alt+Enter", "مرجوعی"]] : []),
            ["F6", "دریافت از مشتری"],
            ["Ctrl+P", "چاپ"],
            ...(canManage ? [["Ctrl+Del", "ابطال"]] : []),
          ] as [string, string][]
        ).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-sans text-[11px]">
              {k}
            </kbd>
            {label}
          </span>
        ))}

        {meta && meta.pageCount > 1 && (
          <span className="ms-auto flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border bg-background px-2 py-0.5 disabled:opacity-40"
            >
              قبلی
            </button>
            <span className="tabular-nums">
              {toFa(meta.page)} از {toFa(meta.pageCount)}
            </span>
            <button
              type="button"
              disabled={page >= meta.pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border bg-background px-2 py-0.5 disabled:opacity-40"
            >
              بعدی
            </button>
          </span>
        )}
      </div>

      <ReturnDialog
        invoiceId={returning}
        onClose={() => setReturning(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ["invoices-list"] })}
      />

      <CorrectionDialog
        invoiceId={correcting}
        onClose={() => setCorrecting(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ["invoices-list"] })}
      />

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(v) => { if (!v) setCancelling(null); }}
        title={cancelling ? `ابطال فاکتور ${toFa(cancelling.number)}؟` : "ابطال فاکتور؟"}
        description={
          cancelling
            ? `مبلغ ${rial(cancelling.total)} — موجودی کالاها به انبار برمی‌گردد. این کار برگشت‌ناپذیر است.`
            : undefined
        }
        destructive
        requireReason
        reasonPlaceholder="دلیل ابطال (اجباری) — مثلاً: مشتری منصرف شد"
        confirmText="بله، باطل کن"
        loading={doCancel.isPending}
        onConfirm={(reason) =>
          cancelling && doCancel.mutate({ id: cancelling.id, reason: reason ?? "" })
        }
      />

      {/*
        دریافت از مشتری — همان فرمِ مشترکِ چندروشه (نقد/کارت/چک در یک رسید).
        ماندهٔ کل از خلاصهٔ مشتری می‌آید؛ مازادِ تایپی خودِ فرم تأیید می‌خواهد.
      */}
      <Dialog
        open={!!receiving}
        onOpenChange={(v) => {
          if (!v) setReceiving(null);
        }}
      >
        <DialogContent className="max-w-lg overflow-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {receiving
                ? `دریافت از «${receiving.customerName}» — فاکتور ${toFa(receiving.number)}`
                : ""}
            </DialogTitle>
          </DialogHeader>
          {receiving &&
            (receiptDone ? (
              <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
                دریافت ثبت شد — ماندهٔ نوار زیر جدول همان لحظه تازه می‌شود.
              </p>
            ) : (
              <ReceiptForm
                customerId={receiving.customerId}
                totalDue={Math.max(0, receiptDetail.data?.summary?.totalDue ?? 0)}
                chequeRateBp={receiptDetail.data?.chequeRateBp}
                chequeRateMode={receiptDetail.data?.chequeRateMode}
                onDone={() => {
                  qc.invalidateQueries({ queryKey: ["invoices-list"] });
                  qc.invalidateQueries({ queryKey: ["customer", receiving.customerId] });
                  setReceiptDone(true);
                }}
              />
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}


/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function InvoicesPage() {
  return <InvoicesPanel />;
}
