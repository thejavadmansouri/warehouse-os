"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  Search,
  Printer,
  Undo2,
  Ban,
  Eye,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  PencilLine,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { StatusBadge } from "@/components/status-badge";
import { Money } from "@/components/money";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReturnDialog } from "@/app/admin/pos/_components/return-dialog";
import { CorrectionDialog } from "@/app/admin/pos/_components/correction-dialog";
import { getInvoices, cancelInvoice } from "@/lib/api";
import { faDate, toFa, rial } from "@/lib/format";
import { useAuthStore } from "@/lib/auth-store";

/**
 * فهرستِ همه‌ی فاکتورها — لنگرِ هابِ «اسناد فروش».
 *
 * تا حالا فاکتورها فقط داخلِ مودالِ «فاکتورهای امروز» در صندوق دیده می‌شدند و
 * راهی برای دیدنِ فاکتورهای روزهای قبل، جز از گزارش‌ها، نبود. این صفحه همان
 * فهرست است با جست‌وجو (نام/شماره/تلفن) و صفحه‌بندی.
 */
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

export default function InvoicesPage() {
  const qc = useQueryClient();
  const canManage = useAuthStore((s) => s.hasRole("ADMIN", "MANAGER"));

  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  /** «مانده‌دار» — پایه‌ی پیگیریِ وصول، پرکاربردترین فیلترِ این صفحه. */
  const [hasDue, setHasDue] = React.useState(false);
  const [page, setPage] = React.useState(1);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="فاکتورها"
        description="همه‌ی فاکتورهای فروش — جست‌وجو بر اساس نام مشتری، شماره فاکتور یا تلفن."
        icon={FileText}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="نام مشتری، شماره فاکتور یا تلفن…"
            className="h-10 pe-10"
          />
        </div>

        <div className="flex gap-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`h-10 rounded-md px-4 text-sm font-medium transition-colors ${
                status === t.key
                  ? "bg-primary text-primary-foreground"
                  : "border bg-background hover:bg-primary/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/*
        فیلترهای آماده.

        به‌جای چند آیتمِ منو که هرکدام یک «گزارشِ» ازپیش‌پخته بودند، همان کار با
        یک کلیک روی همین صفحه انجام می‌شود — و برخلافِ آن آیتم‌ها، بعدش قابلِ
        دستکاری است: بازه را عوض کن، وضعیت را عوض کن.
      */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">فیلتر سریع:</span>
        {(
          [
            ["امروز", () => { const t = todayIso(); setFrom(t); setTo(t); }],
            ["مانده‌دار", () => setHasDue(true)],
            ["حساب باز", () => setStatus("OPEN")],
            ["مرجوع‌شده", () => setStatus("RETURNED")],
          ] as const
        ).map(([label, apply]) => (
          <button
            key={label}
            type="button"
            onClick={apply}
            className="h-8 rounded-full border px-3 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
          >
            {label}
          </button>
        ))}

        {(hasDue || from || to || status) && (
          <button
            type="button"
            onClick={() => { setHasDue(false); setFrom(""); setTo(""); setStatus(""); }}
            className="h-8 rounded-full border border-dashed px-3 text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            پاک‌کردن فیلترها
          </button>
        )}

        {hasDue && (
          <span className="inline-flex h-8 items-center gap-1 rounded-full bg-amber-600/10 px-3 text-xs font-medium text-amber-700 dark:text-amber-400">
            فقط مانده‌دار
            <button type="button" onClick={() => setHasDue(false)} aria-label="حذف فیلتر">
              ✕
            </button>
          </span>
        )}
      </div>

      {/* بازه‌ی تاریخ — «مشتری می‌گوید فلان روز خریدم» را همین‌جا پیدا کن. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">از تاریخ</label>
          <JalaliDateInput value={from} onChange={setFrom} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">تا تاریخ</label>
          <JalaliDateInput value={to} onChange={setTo} />
        </div>
        {(from || to) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => { setFrom(""); setTo(""); }}
          >
            پاک کردن تاریخ
          </Button>
        )}
      </div>

      {list.isLoading ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {debouncedQ ? "فاکتوری با این جست‌وجو پیدا نشد" : "هنوز فاکتوری ثبت نشده است"}
        </p>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>شماره</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>مشتری</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="text-start">مبلغ</TableHead>
                  <TableHead className="text-start">مانده</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((inv) => (
                  <TableRow key={inv.id} className={inv.status === "CANCELLED" ? "opacity-60" : ""}>
                    <TableCell className="font-medium tabular-nums">
                      <Link
                        href={`/admin/invoices/${inv.id}`}
                        className="text-primary hover:underline"
                      >
                        {toFa(inv.number)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {faDate(inv.createdAt)}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {inv.customer?.fullName ?? "نقدی گذری"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge kind="invoice" status={inv.status} />
                        {inv.hasReturns && (
                          <Badge variant="outline" className="gap-1 text-amber-600">
                            <Undo2 className="size-3" />
                            مرجوعی
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">
                      <Money value={inv.total} />
                    </TableCell>
                    <TableCell>
                      {inv.dueAmount > 0 ? (
                        <Money value={inv.dueAmount} tone="due" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="عملیات">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/invoices/${inv.id}`}>
                              <Eye className="size-4" /> مشاهده
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              window.open(`/admin/print/invoice/${inv.id}`, "_blank")
                            }
                          >
                            <Printer className="size-4" /> چاپ
                          </DropdownMenuItem>

                          {/*
                            مرجوعی و اصلاحیه روی فاکتورِ نهایی و روی فاکتورِ جاریِ
                            حساب باز؛ ابطال اما فقط روی نهایی — فاکتورِ حساب باز
                            با اصلاح/مرجوعی خالی می‌شود، نه با ابطال.
                          */}
                          {canManage &&
                            (inv.status === "CONFIRMED" || inv.status === "OPEN") && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setReturning(inv.id)}>
                                <Undo2 className="size-4" /> مرجوعی
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setCorrecting(inv.id)}>
                                <PencilLine className="size-4" /> اصلاحیه
                              </DropdownMenuItem>
                              {inv.status === "CONFIRMED" && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() =>
                                    setCancelling({
                                      id: inv.id,
                                      number: inv.number,
                                      total: inv.total,
                                    })
                                  }
                                >
                                  <Ban className="size-4" /> ابطال فاکتور
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {meta && meta.pageCount > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronRight className="size-4" /> قبلی
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                صفحه {toFa(meta.page)} از {toFa(meta.pageCount)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی <ChevronLeft className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}

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
