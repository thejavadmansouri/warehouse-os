"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileText, ArrowRight, Printer, Ban, Undo2, PencilLine } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { getInvoice, getReturns, getReturnableLines, getCorrections } from "@/lib/api";
import { faDate, formatDateTime, toFa, PAYMENT_LABELS } from "@/lib/format";

/** یک ردیفِ برچسب/مقدار برای بلوکِ اطلاعات. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

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

  // خلاصهٔ per-line «فروخته/مرجوع‌شده» — برای ستونِ «مرجوع‌شده» در جدول اقلام.
  // best-effort: اگر فاکتور باطل باشد یا خطا بدهد، ستون خالی می‌ماند.
  const returnableQ = useQuery({
    queryKey: ["invoice-returnable", id],
    queryFn: () => getReturnableLines(id as string),
    enabled: !!id,
    retry: false,
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
                  <TableCell className="text-center tabular-nums">
                    {returned > 0 ? (
                      <span className="text-amber-600">{toFa(returned)}</span>
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
              <Money value={inv.paidAmount} tone="positive" />
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
          <CardHeader className="pb-2">
            <CardTitle className="text-base">پرداخت‌ها</CardTitle>
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
                      </span>
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

      {/* سندهای مرجوعی — ردِ کامل رویدادها */}
      {returns.length > 0 && (
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
              {returns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium tabular-nums">
                    {toFa(r.number)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {faDate(r.createdAt)}
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

      {/* سندهای اصلاحیه — ردِ رویدادهای تصحیح */}
      {corrections.length > 0 && (
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
              {corrections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium tabular-nums">
                    {toFa(c.number)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {faDate(c.createdAt)}
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
    </div>
  );
}
