"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getReturns } from "@/lib/api";
import { faDate, faTime, money, toFa, PAYMENT_LABELS } from "@/lib/format";

/** برچسب روش برگشتِ وجه — CREDIT اینجا یعنی «کسر از حساب»، نه «نسیه». */
const REFUND_LABELS: Record<string, string> = {
  CASH: "نقد",
  CARD: "کارتخوان",
  CREDIT: "کسر از حساب",
};

const NUM = "text-end tabular-nums";

/** داخلِ صفحه‌ی «اسناد» سرتیترِ خودش را نشان نمی‌دهد. */
export function ReturnsPanel({ embedded }: { embedded?: boolean } = {}) {
  const list = useQuery({
    queryKey: ["returns"],
    queryFn: () => getReturns({ limit: 50 }),
  });

  const rows = list.data?.data ?? [];

  return (
    /* همان الگوی بقیه‌ی فهرست‌ها. مرجوعی از دلِ فاکتور ثبت می‌شود، پس اینجا
       فقط تاریخچه است و کاری روی ردیف‌ها نیست. */
    <div className={`flex flex-col ${embedded ? "min-h-0 flex-1" : "h-[calc(100vh-2.5rem)]"}`}>
      {list.isLoading ? (
        <LoadingState label="در حال بارگذاری مرجوعی‌ها..." />
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : !rows.length ? (
        <EmptyState
          className="m-3"
          icon={RotateCcw}
          title="هنوز مرجوعی‌ای ثبت نشده است"
          description="مرجوعی از داخلِ فاکتور فروش ثبت می‌شود و تاریخچه‌اش اینجا می‌آید."
        />
      ) : (
        <Table containerClassName="min-h-0 flex-1 overflow-y-auto">
          <TableHeader sticky>
            <TableRow>
              <TableHead className="w-20">شماره</TableHead>
              <TableHead className="w-28">تاریخ</TableHead>
              <TableHead className="w-20">ساعت</TableHead>
              <TableHead className="w-24">فاکتور</TableHead>
              <TableHead>مشتری</TableHead>
              <TableHead className={`${NUM} w-20`}>اقلام</TableHead>
              <TableHead className="w-32">روش برگشت</TableHead>
              <TableHead>دلیل</TableHead>
              <TableHead className={`${NUM} w-40`}>مبلغ برگشتی (ریال)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-bold tabular-nums">{toFa(r.number)}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{faDate(r.createdAt)}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{faTime(r.createdAt)}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {r.invoice ? toFa(r.invoice.number) : "—"}
                </TableCell>
                <TableCell className="whitespace-normal font-medium">
                  {r.customer?.fullName ?? "نقدی گذری"}
                </TableCell>
                <TableCell className={NUM}>{toFa(r._count?.lines ?? 0)}</TableCell>
                <TableCell>
                  {REFUND_LABELS[r.refundMethod] ??
                    PAYMENT_LABELS[r.refundMethod] ??
                    r.refundMethod}
                </TableCell>
                <TableCell className="max-w-0 whitespace-normal text-muted-foreground">
                  <span className="line-clamp-2 text-sm">
                    {r.operationKey ? (
                      <Badge
                        variant="outline"
                        className="me-1 border-violet-600/30 bg-violet-600/10 py-0 text-[0.7rem] font-semibold text-violet-700 dark:text-violet-400"
                        title="این مرجوعی نیمی از یک «عملیات یکپارچه» است — با اصلاحیه‌ی همان operationKey ثبت شده و در صفحه‌ی فاکتور به‌صورت یک سند دیده می‌شود"
                      >
                        عملیات یکپارچه
                      </Badge>
                    ) : null}
                    {r.reason}
                  </span>
                </TableCell>
                <TableCell className={`${NUM} font-bold text-warning`}>{money(r.refundAmount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}


/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function ReturnsPage() {
  return <ReturnsPanel />;
}
