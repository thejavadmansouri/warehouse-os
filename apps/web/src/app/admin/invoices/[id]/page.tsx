"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText, ArrowRight, Printer, Ban, Undo2, PencilLine, Layers, ScrollText, CreditCard,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { getInvoice, getReturns, getReturnableLines, getCorrections, getInvoiceSettlement, reversePayment, getVouchersByInvoice } from "@/lib/api";
import { PaymentReversalDialog } from "@/components/payment-reversal-dialog";
import { PaymentRecomposeDialog } from "../../pos/_components/payment-recompose-dialog";
import { VoucherCard } from "@/components/voucher-card";
import { useAuthStore } from "@/lib/auth-store";
import { uuid } from "@/lib/uuid";
import { faDate, faDateTime, formatDateTime, toFa, PAYMENT_LABELS } from "@/lib/format";
import {
  groupAdjustOperations,
  standaloneCorrections,
  standaloneReturns,
  type AdjustOperation,
} from "@/lib/adjust-operations";

/** یک ردیفِ برچسب/مقدار برای بلوکِ اطلاعات. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

/**
 * یک ردیفِ عملیاتِ یکپارچه — مرجوعی + اصلاحیه‌ی همان operationKey در یک سطر.
 *
 * «اختلاف نهایی» = اثرِ اصلاحیه − ارزشِ مرجوعی؛ مثبت یعنی به نفع فروشگاه و
 * منفی یعنی به نفع مشتری. روشِ مرجوعی هم در جزئیاتِ فروتن نشان داده می‌شود.
 */
function AdjustOperationRow({ op }: { op: AdjustOperation }) {
  const details: string[] = [];
  if (op.returns.length && op.corrections.length) {
    details.push("مرجوعی + اصلاحیه");
  } else if (op.returns.length) {
    details.push("فقط مرجوعی");
  } else {
    details.push("فقط اصلاحیه");
  }
  for (const r of op.returns) {
    const m = PAYMENT_LABELS[r.refundMethod] ?? r.refundMethod;
    if (details.indexOf(m) < 0) details.push(m);
  }

  return (
    <TableRow>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {faDateTime(op.createdAt)}
      </TableCell>
      <TableCell>
        <div className="max-w-[16rem] truncate text-sm">{op.reason || "—"}</div>
        <div className="text-[0.7rem] text-muted-foreground">
          {details.join(" · ")} · {toFa(op.lines)} قلم
        </div>
      </TableCell>
      <TableCell className="text-center tabular-nums">{toFa(op.lines)}</TableCell>
      <TableCell className="tabular-nums">
        {op.refundAmount > 0 ? (
          <Money value={op.refundAmount} tone="due" />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="tabular-nums">
        {op.amountAdjust !== 0 ? (
          op.amountAdjust > 0 ? (
            <Money value={op.amountAdjust} tone="due" />
          ) : (
            <Money value={-op.amountAdjust} tone="positive" />
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="font-semibold tabular-nums">
        {op.net > 0 ? (
          <span className="text-amber-600">+<Money value={op.net} /></span>
        ) : op.net < 0 ? (
          <span className="text-emerald-600">−<Money value={-op.net} /></span>
        ) : (
          <span className="text-muted-foreground">صفر</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const queryClient = useQueryClient();

  /*
   * برگشتِ پرداخت از پنل مدیریت — با ردپای کامل در دفتر. همان منطقِ صندوق،
   * ولی برای مدیر که می‌خواهد از بیرونِ صندوق درست کند.
   */
  const [reversing, setReversing] = React.useState<{ paid: number; idem: string } | null>(null);
  /*
   * «نحوهٔ پرداختش اشتباه ثبت شده» — قلم‌ها دست نمی‌خورد، فقط تقسیمِ پرداخت
   * از نو نوشته می‌شود. همان پنلِ صندوق، ولی از همین‌جا هم باز می‌شود تا مدیر
   * برای یک اصلاحِ ساده مجبور نباشد تا صندوق برگردد.
   */
  const [fixingPayment, setFixingPayment] = React.useState(false);
  const reverse = useMutation({
    mutationFn: (dto: { invoiceId: string; amount: number; method: "CASH" | "CARD" | "CHEQUE"; reason?: string; idempotencyKey?: string }) =>
      reversePayment(dto.invoiceId, dto),
    onSuccess: () => {
      toast.success("برگشت پرداخت ثبت شد");
      setReversing(null);
      void queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      void queryClient.invalidateQueries({ queryKey: ["invoice-payments"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "ثبت برگشت پرداخت ناموفق بود"),
  });

  const invoiceQ = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => getInvoice(id as string),
    enabled: !!id,
  });

  // سندهای مرجوعیِ همین فاکتور — ردِ رویدادها.
  const returnsQ = useQuery({
    queryKey: ["invoice-returns", id],
    queryFn: () => getReturns({ invoiceId: id as string, limit: 100 }),
    enabled: !!id,
  });

  // سندهای اصلاحیه‌ی همین فاکتور — ردِ رویدادهایِ تصحیح قیمت/تعداد.
  const correctionsQ = useQuery({
    queryKey: ["invoice-corrections", id],
    queryFn: () => getCorrections({ invoiceId: id as string, limit: 100 }),
    enabled: !!id,
  });

  // نقشِ مدیر — سندهای خودکار فقط برای ADMIN/MANAGER (اندپوینت هم همین گیت را دارد).
  const isManager = useAuthStore((s) =>
    s.user?.role === "ADMIN" || s.user?.role === "MANAGER"
  );

  // سندهایِ خودکارِ همین فاکتور — «از فاکتور به سندهایش»: فروش، ابطال، رسیدها،
  // مرجوعی‌ها و اصلاحیه‌ها به ترتیبِ زمان. هر کارت هم لینکِ برگشت دارد.
  const vouchersQ = useQuery({
    queryKey: ["invoice-vouchers", id],
    queryFn: () => getVouchersByInvoice(id as string),
    enabled: !!id && isManager,
    retry: false,
  });

  // خلاصهٔ per-line «فروخته/مرجوع‌شده» — برای ستونِ «مرجوع‌شده» در جدول اقلام.
  // best-effort: اگر فاکتور باطل باشد یا خطا بدهد، ستون خالی می‌ماند.
  const returnableQ = useQuery({
    queryKey: ["invoice-returnable", id],
    queryFn: () => getReturnableLines(id as string),
    enabled: !!id,
    retry: false,
  });

  /*
   * وضعیتِ تسویه و «آیا می‌شود تقسیمش را اصلاح کرد» — همان کلیدِ کوئریِ پنلِ
   * صندوق، پس اگر پنل هم باز باشد هیچ درخواستِ تکراری‌ای زده نمی‌شود. دلیلِ
   * خاموشی هم می‌آید تا دکمهٔ غیرفعال خودش توضیح داشته باشد.
   */
  const settleQ = useQuery({
    queryKey: ["invoice-settlement", id],
    queryFn: () => getInvoiceSettlement(id as string),
    enabled: !!id,
  });

  const returnedByLine = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const l of returnableQ.data?.lines ?? []) {
      if (l.alreadyReturned > 0) m.set(l.saleLogId, l.alreadyReturned);
    }
    return m;
  }, [returnableQ.data]);

  if (!id) {
    return (
      <div className="space-y-6">
        <PageHeader title="فاکتور" icon={FileText} />
        <ErrorState message="شناسهٔ فاکتور نامعتبر است." />
      </div>
    );
  }

  if (invoiceQ.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="جزئیات فاکتور" icon={FileText} />
        <LoadingState />
      </div>
    );
  }

  if (invoiceQ.isError || !invoiceQ.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="جزئیات فاکتور" icon={FileText} />
        <ErrorState onRetry={() => invoiceQ.refetch()} />
      </div>
    );
  }

  const inv = invoiceQ.data;
  const returns = returnsQ.data?.data ?? [];
  const corrections = correctionsQ.data?.data ?? [];
  const isCancelled = inv.status === "CANCELLED";

  /*
   * مرجوعی و اصلاحیه‌ای که به یک operationKey وصل‌اند «یک عملیات یکپارچه»
   * بوده‌اند — در گزارش با هم دیده می‌شوند تا اثرِ کل و دلیلِ واحد قابلِ پیگیری
   * باشد. سندِ مستقل (بدون operationKey) در جدولِ جدا می‌ماند.
   *
   * این‌ها مشتقِ خالص از داده‌یِ بارشده‌اند، پس hook نیستند — می‌توانند بعد از
   * early-return‌ها همین‌جا حساب شوند.
   */
  const operationGroups = groupAdjustOperations(returns, corrections);
  const soloReturns = standaloneReturns(returns);
  const soloCorrections = standaloneCorrections(corrections);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`فاکتور ${toFa(inv.number)}`}
        description={`تاریخ: ${formatDateTime(inv.createdAt)}`}
        icon={FileText}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/admin/print/invoice/${inv.id}`, "_blank")}
            >
              <Printer className="size-4" />
              چاپ
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/invoices">
                <ArrowRight className="size-4" />
                بازگشت به فهرست
              </Link>
            </Button>
          </div>
        }
      />

      {/* بنرِ ابطال — روند باید شفاف باشد. */}
      {isCancelled && (
        <div className="flex items-start gap-3 rounded-lg border-e-4 border-e-destructive bg-destructive/5 p-4">
          <Ban className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <p className="font-bold text-destructive">این فاکتور باطل شده است</p>
            {inv.cancelReason ? (
              <p className="mt-1 text-sm text-muted-foreground">
                دلیل: {inv.cancelReason}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* اطلاعات کلی */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <Field label="مشتری" value={inv.customer?.fullName ?? "نقدی گذری"} />
          <Field label="فروشنده" value={inv.user?.fullName ?? "—"} />
          <Field
            label="وضعیت"
            value={<StatusBadge kind="invoice" status={inv.status} />}
          />
          <Field
            label="مرجوعی"
            value={
              returns.length > 0 ? (
                <Badge variant="outline" className="gap-1 text-amber-600">
                  <Undo2 className="size-3" />
                  {toFa(returns.length)} سند
                </Badge>
              ) : (
                <span className="text-muted-foreground">ندارد</span>
              )
            }
          />
        </CardContent>
      </Card>

      {/* اقلام فاکتور */}
      <Card className="overflow-hidden p-0">
        <CardHeader className="p-4">
          <CardTitle className="text-base">اقلام فاکتور</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>کالا</TableHead>
              <TableHead>مکان</TableHead>
              <TableHead className="text-center">تعداد</TableHead>
              <TableHead className="text-center">مرجوع‌شده</TableHead>
              <TableHead className="text-start">قیمت واحد</TableHead>
              <TableHead className="text-start">تخفیف</TableHead>
              <TableHead className="text-start">جمع</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inv.lines.map((l) => {
              const unit = l.unitPrice ?? 0;
              const disc = l.lineDiscount ?? 0;
              const lineTotal = unit * l.quantity - disc;
              const returned = returnedByLine.get(l.id) ?? 0;
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    <div className="max-w-[20rem] truncate">{l.product.name}</div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {toFa(l.product.sku ?? "")}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.location.name}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {toFa(l.quantity)}
                  </TableCell>
                  <TableCell className="text-center">
                    {returned > 0 ? (
                      <span
                        className="inline-flex items-center gap-1 rounded bg-amber-600/10 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-600/15 dark:text-amber-400"
                        title="این تعداد از این قلم مرجوع شده است"
                      >
                        <Undo2 className="size-3" />
                        {toFa(returned)}
                        {returned < l.quantity
                          ? ` / مانده ${toFa(l.quantity - returned)}`
                          : " · کامل"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <Money value={unit} />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {disc > 0 ? <Money value={disc} /> : "—"}
                  </TableCell>
                  <TableCell className="font-semibold tabular-nums">
                    <Money value={lineTotal} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* جمع‌ها */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">جمع فاکتور</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-muted-foreground">جمع جزء</span>
              <Money value={inv.subtotal} />
            </div>
            {inv.discount > 0 && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">تخفیف کل</span>
                <Money value={inv.discount} tone="muted" />
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm font-bold">مبلغ کل</span>
              <span className="text-base font-bold">
                <Money value={inv.total} withUnit />
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-muted-foreground">پرداخت‌شده</span>
              <div className="flex items-center gap-2">
                {inv.paidAmount > 0 && inv.status !== "CANCELLED" && inv.customer && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setReversing({ paid: inv.paidAmount, idem: uuid() })}
                  >
                    برگشت پرداخت
                  </Button>
                )}
                <Money value={inv.paidAmount} tone="positive" />
              </div>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-muted-foreground">مانده</span>
              {inv.dueAmount > 0 ? (
                <Money value={inv.dueAmount} tone="due" />
              ) : (
                <span className="text-muted-foreground">تسویه</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* پرداخت‌ها */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">پرداخت‌ها</CardTitle>
            {settleQ.data ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={!settleQ.data.canRecompose}
                title={settleQ.data.blockedReason ?? undefined}
                onClick={() => setFixingPayment(true)}
              >
                <CreditCard className="size-3.5" />
                اصلاح نحوهٔ پرداخت
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {inv.payments.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                پرداختی ثبت نشده است.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {inv.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {PAYMENT_LABELS[p.method] ?? p.method}
                        {/*
                          مبلغِ منفی یعنی تاریخچه پاک نشده و این ردیف سهمِ قبلی
                          را برمی‌دارد — همان چیزی که «اصلاح نحوهٔ پرداخت»
                          می‌سازد. بدون این نشانه، ردیفِ منفی مثل پرداخت خوانده
                          می‌شود.
                        */}
                        {p.amount < 0 ? (
                          <span className="ms-2 text-xs font-normal text-destructive">
                            برداشت
                          </span>
                        ) : null}
                      </span>
                      {p.note ? (
                        <span className="text-xs text-muted-foreground">{p.note}</span>
                      ) : null}
                      {p.cheque ? (
                        <span className="text-xs text-muted-foreground">
                          چک {toFa(p.cheque.number)}
                          {p.cheque.bankName ? ` — ${p.cheque.bankName}` : ""} — سررسید{" "}
                          {faDate(p.cheque.dueDate)}
                        </span>
                      ) : null}
                    </div>
                    <Money value={p.amount} className="font-semibold" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* عملیات‌های یکپارچه — یک سندِ واحد و قابلِ پیگیری */}
      {operationGroups.length > 0 && (
        <Card className="overflow-hidden p-0">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="size-4 text-violet-600" />
              عملیات‌های یکپارچه این فاکتور
              <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                {toFa(operationGroups.length)} مورد
              </Badge>
            </CardTitle>
            <CardDescription>
              مرجوعی و اصلاحیه‌ای که با یک operationKey ثبت شده‌اند — یک عملیات، یک
              دلیل، یک اختلاف.
            </CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>تاریخ</TableHead>
                <TableHead>دلیل</TableHead>
                <TableHead>اقلام</TableHead>
                <TableHead className="text-start">ارزش مرجوعی</TableHead>
                <TableHead className="text-start">اثر اصلاحیه</TableHead>
                <TableHead className="text-start">اختلاف نهایی</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {operationGroups.map((g) => (
                <AdjustOperationRow key={g.operationKey} op={g} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* سندهای مرجوعی مستقل — ردِ کامل رویدادها */}
      {soloReturns.length > 0 && (
        <Card className="overflow-hidden p-0">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Undo2 className="size-4 text-amber-600" />
              مرجوعی‌های این فاکتور
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره مرجوعی</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>روش برگشت</TableHead>
                <TableHead>تعداد اقلام</TableHead>
                <TableHead>دلیل</TableHead>
                <TableHead className="text-start">مبلغ برگشت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {soloReturns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium tabular-nums">
                    {toFa(r.number)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {faDateTime(r.createdAt)}
                  </TableCell>
                  <TableCell>{PAYMENT_LABELS[r.refundMethod] ?? r.refundMethod}</TableCell>
                  <TableCell className="tabular-nums">
                    {toFa(r._count?.lines ?? 0)}
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate text-sm">{r.reason}</TableCell>
                  <TableCell className="font-semibold tabular-nums">
                    <Money value={r.refundAmount} tone="due" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* سندهای اصلاحیه‌ی مستقل — ردِ رویدادهای تصحیح */}
      {soloCorrections.length > 0 && (
        <Card className="overflow-hidden p-0">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <PencilLine className="size-4 text-primary" />
              اصلاحیه‌های این فاکتور
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره اصلاحیه</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>تعداد اقلام</TableHead>
                <TableHead>دلیل</TableHead>
                <TableHead className="text-start">اثر اصلاحیه</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {soloCorrections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium tabular-nums">
                    {toFa(c.number)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {faDateTime(c.createdAt)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {toFa(c._count?.lines ?? 0)}
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate text-sm">{c.reason}</TableCell>
                  <TableCell className="font-semibold tabular-nums">
                    {c.amountAdjust > 0 ? (
                      <Money value={c.amountAdjust} tone="due" />
                    ) : (
                      <Money value={-c.amountAdjust} tone="positive" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/*
        سندهای خودکار این فاکتور — رفت‌وبرگشت با دفتر روزنامه.

        هر اکشن مالیِ این فاکتور (فروش، ابطال، رسیدِ تخصیص‌یافته، مرجوعی،
        اصلاحیه) یک سندِ متوازن در دفتر دارد؛ این‌جا همان سندها به ترتیبِ زمان
        می‌آیند و هر کارت لینکِ «مشاهدهٔ فاکتور مبدأ» را دارد — از فاکتور به
        سندهایش و از هر سند برگشت به فاکتور. فقط مدیر؛ بقیه جدول‌های بالا را دارند.
      */}
      {isManager && (
        <Card className="overflow-hidden p-0">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="size-4 text-primary" />
              سندهای خودکار این فاکتور
            </CardTitle>
            <CardDescription>
              ردِّ «چی به چی» پشت هر اکشن — بدهکار و بستانکارِ هر سند با هم
              برابرند؛ برای پیگیری کامل به دفتر روزنامه بروید.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {vouchersQ.isLoading ? (
              <LoadingState label="در حال بارگذاری سندها..." />
            ) : vouchersQ.isError ? (
              <ErrorState onRetry={() => vouchersQ.refetch()} />
            ) : !vouchersQ.data?.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                این فاکتور پیش از فعال‌شدنِ «سند خودکار» ثبت شده و سندی ندارد.
              </p>
            ) : (
              vouchersQ.data.map((v) => (
                <VoucherCard key={v.id} voucher={v} />
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/*
        اصلاحِ نحوهٔ پرداخت — هم برای این‌که مدیر بدونِ صندوق بتواند تقسیمِ
        اشتباه را درست کند. مشتری از خودِ فاکتور می‌آید؛ اگر فاکتور مشتری
        ندارد، خودِ پنل انتخابگرِ مشتری را باز می‌کند.
      */}
      <PaymentRecomposeDialog
        open={fixingPayment}
        invoiceId={fixingPayment ? inv.id : null}
        customer={null}
        onClose={() => setFixingPayment(false)}
        onDone={() => {
          void queryClient.invalidateQueries({ queryKey: ["invoice", id] });
          void queryClient.invalidateQueries({ queryKey: ["invoice-payments"] });
          // سندِ خودکارِ تازه — «چی به چی»ی همین اصلاح باید همان‌جا دیده شود.
          void queryClient.invalidateQueries({ queryKey: ["invoice-vouchers", id] });
        }}
      />

      {/* برگشتِ پرداخت — فقط با پرداخت‌شده و مشتری‌دار سرور اجازه می‌دهد؛ اینجا هم گیت کرده‌ایم. */}
      {reversing && inv && (
        <PaymentReversalDialog
          open
          invoiceId={inv.id}
          invoiceNumber={inv.number}
          paidAmount={reversing.paid}
          customerName={inv.customer?.fullName ?? null}
          pending={reverse.isPending}
          onConfirm={(invoiceId, dto) =>
            reverse.mutate({ ...dto, invoiceId, idempotencyKey: reversing.idem })
          }
          onClose={() => setReversing(null)}
        />
      )}
    </div>
  );
}
