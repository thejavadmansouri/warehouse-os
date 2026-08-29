"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { ErrorState } from "@/components/states";

import { getReturns } from "@/lib/api";
import { faDate, faTime, money, toFa, PAYMENT_LABELS } from "@/lib/format";

const TH = "border-b px-2 py-1 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-2 py-1.5 whitespace-nowrap";

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

  const rows = list.data?.data ?? [];

  return (
    /* همان الگوی بقیه‌ی فهرست‌ها. مرجوعی از دلِ فاکتور ثبت می‌شود، پس اینجا
       فقط تاریخچه است و کاری روی ردیف‌ها نیست. */
    <div className={`flex flex-col ${embedded ? "min-h-0 flex-1" : "h-[calc(100vh-2.5rem)]"}`}>
      <div className="min-h-0 flex-1 overflow-auto">
        {list.isError ? (
          <ErrorState onRetry={() => list.refetch()} />
        ) : !rows.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {list.isFetching ? "…" : "هنوز مرجوعی‌ای ثبت نشده است"}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur">
              <tr>
                <th className={`${TH} w-16`}>شماره</th>
                <th className={`${TH} w-24`}>تاریخ</th>
                <th className={`${TH} w-16`}>ساعت</th>
                <th className={`${TH} w-20`}>فاکتور</th>
                <th className={TH}>مشتری</th>
                <th className={`${TH} w-16 text-center`}>اقلام</th>
                <th className={`${TH} w-28`}>روش برگشت</th>
                <th className={TH}>دلیل</th>
                <th className={`${TH} w-36`}>مبلغ برگشتی</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b odd:bg-muted/25">
                  <td className={`${TD} font-bold tabular-nums`}>{toFa(r.number)}</td>
                  <td className={`${TD} tabular-nums text-muted-foreground`}>
                    {faDate(r.createdAt)}
                  </td>
                  <td className={`${TD} tabular-nums text-muted-foreground`}>
                    {faTime(r.createdAt)}
                  </td>
                  <td className={`${TD} tabular-nums text-muted-foreground`}>
                    {r.invoice ? toFa(r.invoice.number) : "—"}
                  </td>
                  <td className={`${TD} max-w-0 truncate font-medium`}>
                    {r.customer?.fullName ?? "نقدی گذری"}
                  </td>
                  <td className={`${TD} text-center tabular-nums`}>
                    {toFa(r._count?.lines ?? 0)}
                  </td>
                  <td className={TD}>
                    {REFUND_LABELS[r.refundMethod] ??
                      PAYMENT_LABELS[r.refundMethod] ??
                      r.refundMethod}
                  </td>
                  <td className={`${TD} max-w-0 truncate text-muted-foreground`}>{r.reason}</td>
                  <td className={`${TD} text-end font-bold tabular-nums text-warning`}>
                    {money(r.refundAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function ReturnsPage() {
  return <ReturnsPanel />;
}
