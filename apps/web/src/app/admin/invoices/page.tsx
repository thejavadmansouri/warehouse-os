"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Undo2 } from "lucide-react";

import { ErrorState } from "@/components/states";
import { Input } from "@/components/ui/input";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReturnDialog } from "@/app/admin/pos/_components/return-dialog";
import { CorrectionDialog } from "@/app/admin/pos/_components/correction-dialog";
import { getInvoices, cancelInvoice } from "@/lib/api";
import { faDate, faTime, money, toFa, rial } from "@/lib/format";
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

const STATUS_TABS = [
  { key: "", label: "همه" },
  // فاکتورهای جاریِ حساب‌های باز — تا تسویه نهایی نشده‌اند.
  { key: "OPEN", label: "حساب باز" },
  { key: "CONFIRMED", label: "تأییدشده" },
  { key: "RETURNED", label: "مرجوع‌شده" },
  { key: "CANCELLED", label: "باطل‌شده" },
] as const;

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

  React.useEffect(() => {
    setPage(1);
  }, [debouncedQ, status, from, to, hasDue]);

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
        if (returning || correcting || cancelling) return;
        const inv = rows[row];

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
          onChange={(e) => setStatus(e.target.value)}
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
          onClick={() => setHasDue((v) => !v)}
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

        <JalaliDateInput value={from} onChange={setFrom} />
        <JalaliDateInput value={to} onChange={setTo} />

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
                      {inv.hasReturns && <Undo2 className="size-3.5 text-warning" />}
                    </div>
                  </td>
                  <td className={`${TD} text-end font-semibold tabular-nums`}>
                    {money(inv.total)}
                  </td>
                  <td
                    className={`${TD} text-end font-bold tabular-nums ${
                      inv.dueAmount > 0 ? "text-warning" : "text-muted-foreground"
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

      <div className="flex shrink-0 items-center gap-x-5 overflow-x-auto whitespace-nowrap border-t bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
        {(
          [
            ["↑↓", "حرکت"],
            ["Enter", "ویرایش در صندوق"],
            ...(canManage ? [["Alt+Enter", "مرجوعی"]] : []),
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
    </div>
  );
}


/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function InvoicesPage() {
  return <InvoicesPanel />;
}
