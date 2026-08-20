"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Money } from "@/components/money";
import { getReturns } from "@/lib/api";
import { faDate, toFa, PAYMENT_LABELS } from "@/lib/format";

/** برچسب روش برگشتِ وجه — CREDIT اینجا یعنی «کسر از حساب»، نه «نسیه». */
const REFUND_LABELS: Record<string, string> = {
  CASH: "نقد",
  CARD: "کارتخوان",
  CREDIT: "کسر از حساب",
};

/** داخلِ صفحه‌ی «اسناد» سرتیترِ خودش را نشان نمی‌دهد. */
export function ReturnsPanel({ embedded }: { embedded?: boolean } = {}) {
  const list = useQuery({
    queryKey: ["returns"],
    queryFn: () => getReturns({ limit: 50 }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        compact={embedded}
        title="برگشت از فروش (مرجوعی)"
        description="تاریخچه‌ی مرجوعی‌ها. ثبت مرجوعی از دل فاکتور در «فاکتورهای امروز» انجام می‌شود."
        icon={Undo2}
      />

      {list.isLoading ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : !list.data?.data.length ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          هنوز مرجوعی‌ای ثبت نشده است
        </p>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره</TableHead>
                <TableHead>فاکتور</TableHead>
                <TableHead>مشتری</TableHead>
                <TableHead>اقلام</TableHead>
                <TableHead>روش برگشت</TableHead>
                <TableHead>دلیل</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead className="text-start">مبلغ برگشتی</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums">{toFa(r.number)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {r.invoice ? toFa(r.invoice.number) : "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {r.customer?.fullName ?? "نقدی گذری"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {toFa(r._count?.lines ?? 0)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {REFUND_LABELS[r.refundMethod] ??
                        PAYMENT_LABELS[r.refundMethod] ??
                        r.refundMethod}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                    {r.reason}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {faDate(r.createdAt)}
                  </TableCell>
                  <TableCell className="font-bold">
                    <Money value={r.refundAmount} tone="due" />
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


/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function ReturnsPage() {
  return <ReturnsPanel />;
}
