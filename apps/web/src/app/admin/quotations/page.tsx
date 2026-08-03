"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileClock } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  cancelQuotation,
  convertQuotation,
  extendQuotation,
  getQuotation,
  getQuotations,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { faDate, money, qty, toFa } from "@/lib/format";
import type { Quotation } from "@/lib/types";

const TABS: { id: string; label: string }[] = [
  { id: "ACTIVE", label: "معتبر" },
  { id: "EXPIRED", label: "منقضی" },
  { id: "CONVERTED", label: "تبدیل‌شده" },
  { id: "CANCELLED", label: "لغو‌شده" },
];

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "معتبر", className: "border-emerald-600 text-emerald-700" },
  EXPIRED: { label: "منقضی", className: "border-amber-600 text-amber-700" },
  CONVERTED: { label: "تبدیل شد", className: "border-primary text-primary" },
  CANCELLED: { label: "لغو شد", className: "border-destructive text-destructive" },
};

/** باقی‌مانده‌ی اعتبار به شکل خوانا: «۳ ساعت و ۲۰ دقیقه» */
function remaining(minutes: number): string {
  if (minutes <= 0) return "منقضی";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${toFa(h)} ساعت و ${toFa(m)} دقیقه`;
  if (h) return `${toFa(h)} ساعت`;
  return `${toFa(m)} دقیقه`;
}

export default function QuotationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = React.useState("ACTIVE");
  const [openId, setOpenId] = React.useState<string | null>(null);

  const list = useQuery({
    queryKey: ["quotations", tab],
    queryFn: () => getQuotations({ status: tab, limit: 50 }),
  });

  const detail = useQuery({
    queryKey: ["quotation", openId],
    queryFn: () => getQuotation(openId!),
    enabled: !!openId,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["quotations"] });
    qc.invalidateQueries({ queryKey: ["quotation"] });
  };

  const convert = useMutation({
    mutationFn: (id: string) => convertQuotation(id),
    onSuccess: (inv) => {
      toast.success(`فاکتور ${toFa(inv.number)} ثبت شد — ${money(inv.total)} تومان`);
      setOpenId(null);
      refresh();
    },
    onError: (e: unknown) => {
      const err = e instanceof ApiException ? e : null;
      if (err?.code === "QUOTATION_EXPIRED") {
        toast.error("اعتبار تمام شده — اول تمدیدش کنید");
      } else if (err?.code === "INSUFFICIENT_STOCK") {
        toast.error("موجودی کافی نیست؛ از زمان صدور پیش‌فاکتور فروش رفته است");
      } else {
        toast.error(err?.message ?? "تبدیل ناموفق بود");
      }
    },
  });

  const extend = useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      extendQuotation(id, minutes),
    onSuccess: () => { toast.success("اعتبار تمدید شد"); refresh(); },
    onError: () => toast.error("تمدید ناموفق بود"),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelQuotation(id),
    onSuccess: () => { toast.success("پیش‌فاکتور لغو شد"); setOpenId(null); refresh(); },
    onError: () => toast.error("لغو ناموفق بود"),
  });

  const q: Quotation | undefined = detail.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="پیش‌فاکتورها"
        description="قیمت‌هایی که به مشتری داده شده و هنوز فروش نشده‌اند"
        icon={FileClock}
      />

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? "default" : "outline"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {list.isLoading ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : !list.data?.data.length ? (
        <p className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          پیش‌فاکتوری در این وضعیت نیست.
          <br />
          <span className="text-xs">
            پیش‌فاکتور از صندوق فروش ساخته می‌شود — سبد را ببندید و
            <kbd className="mx-1 rounded border px-1.5 py-0.5">F8</kbd> بزنید.
          </span>
        </p>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره</TableHead>
                <TableHead>مشتری</TableHead>
                <TableHead className="text-center">اقلام</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>اعتبار</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead className="text-start">مبلغ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.data.map((row) => {
                const s = STATUS_STYLE[row.displayStatus] ?? STATUS_STYLE.ACTIVE;
                return (
                  <TableRow
                    key={row.id}
                    onClick={() => setOpenId(row.id)}
                    className="cursor-pointer hover:bg-primary/5"
                  >
                    <TableCell className="font-medium tabular-nums">{toFa(row.number)}</TableCell>
                    <TableCell>{row.customerName ?? "بدون مشتری"}</TableCell>
                    <TableCell className="text-center tabular-nums">
                      {toFa(row._count?.lines ?? 0)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {faDate(row.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.displayStatus === "ACTIVE" ? remaining(row.remainingMinutes) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={s.className}>{s.label}</Badge>
                    </TableCell>
                    <TableCell className="font-bold tabular-nums">{money(row.total)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* جزئیات */}
      <Dialog open={!!openId} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              پیش‌فاکتور {q ? toFa(q.number) : ""}
            </DialogTitle>
          </DialogHeader>

          {detail.isLoading || !q ? (
            <LoadingState />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge
                  variant="outline"
                  className={(STATUS_STYLE[q.displayStatus] ?? STATUS_STYLE.ACTIVE).className}
                >
                  {(STATUS_STYLE[q.displayStatus] ?? STATUS_STYLE.ACTIVE).label}
                </Badge>
                <span>{q.customerName ?? "بدون مشتری"}</span>
                <span className="text-muted-foreground">
                  اعتبار تا {faDate(q.validUntil)}
                  {q.displayStatus === "ACTIVE" && ` — ${remaining(q.remainingMinutes)} مانده`}
                </span>
              </div>

              <div className="max-h-72 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>کالا</TableHead>
                      <TableHead className="text-center">تعداد</TableHead>
                      <TableHead className="text-start">قیمت واحد</TableHead>
                      <TableHead className="text-start">جمع</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q.lines?.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="max-w-[20rem] truncate font-medium">
                          {l.product.name}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{qty(l.quantity)}</TableCell>
                        <TableCell className="tabular-nums">{money(l.unitPrice)}</TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {money(l.quantity * l.unitPrice - l.discount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                <span className="font-semibold">مبلغ کل</span>
                <span className="text-lg font-bold tabular-nums">{money(q.total)} تومان</span>
              </div>

              {q.displayStatus === "EXPIRED" && (
                <p className="rounded-md border-e-4 border-e-amber-600 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
                  اعتبار این پیش‌فاکتور تمام شده. برای تبدیل به فاکتور باید تمدید شود —
                  چون قیمت‌ها ممکن است از زمان صدور تغییر کرده باشند.
                </p>
              )}

              {(q.displayStatus === "ACTIVE" || q.displayStatus === "EXPIRED") && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="flex-1"
                    disabled={q.displayStatus !== "ACTIVE" || convert.isPending}
                    onClick={() => convert.mutate(q.id)}
                  >
                    {convert.isPending ? "در حال ثبت…" : "تبدیل به فاکتور"}
                  </Button>

                  <Button
                    variant="outline"
                    disabled={extend.isPending}
                    onClick={() => extend.mutate({ id: q.id, minutes: 24 * 60 })}
                  >
                    تمدید ۲۴ ساعت
                  </Button>

                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(q.id)}
                  >
                    لغو
                  </Button>
                </div>
              )}

              {q.displayStatus === "CONVERTED" && (
                <p className="text-sm text-muted-foreground">
                  این پیش‌فاکتور به فاکتور تبدیل شده است.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
