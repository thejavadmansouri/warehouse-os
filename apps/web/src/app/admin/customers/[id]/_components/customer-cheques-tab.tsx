"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { LoadingState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { getCustomerCheques } from "@/lib/api";
import { faDate, money, toFa } from "@/lib/format";
import type { CustomerChequeRow } from "@/lib/types";

const TH = "border-b px-2 py-1 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-2 py-1.5 whitespace-nowrap";

/**
 * تبِ «چک‌ها» در پرونده‌ی مشتری — طرحِ تأییدشده.
 *
 * چهار کارتِ خلاصه بالا (نزد ما · برگشتی · وصول‌شده · نزدیک‌ترین سررسید) و
 * جدولِ چک‌ها با سندِ مبدا — چک یا با فاکتور گرفته شده یا بابتِ تسویه آمده،
 * و مدیر باید بداند کدام. «نزد ما» یعنی هنوز پول نشده؛ ترتیبِ جدول هم
 * نزدیک‌ترین سررسیدِ معلق اول.
 */
export function CustomerChequesTab({ customerId }: { customerId: string }) {
  const cheques = useQuery({
    queryKey: ["customer-cheques", customerId],
    queryFn: () => getCustomerCheques(customerId),
  });

  const rows = React.useMemo(() => {
    const list = cheques.data ?? [];
    // معلق‌ها (نزد ما / سپرده‌شده) اول، نزدیک‌ترین سررسید جلوتر؛ بقیه بعد.
    const pending = (s: CustomerChequeRow["status"]) =>
      s === "IN_HAND" || s === "DEPOSITED" ? 0 : 1;
    return [...list].sort(
      (a, b) =>
        pending(a.status) - pending(b.status) ||
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
  }, [cheques.data]);

  if (cheques.isLoading) return <LoadingState />;

  const sum = (list: CustomerChequeRow[]) =>
    list.reduce((s, r) => s + r.amount, 0);
  const inHand = rows.filter((r) => r.status === "IN_HAND" || r.status === "DEPOSITED");
  const bounced = rows.filter((r) => r.status === "BOUNCED");
  const cashed = rows.filter((r) => r.status === "CASHED");
  const nearestDue = inHand[0]?.dueDate ?? null;

  return (
    <div className="space-y-3">
      {/* کارت‌های خلاصه — همان چهار خانه‌ی پیش‌نمایش */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">نزد ما</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">
            {toFa(inHand.length)} چک · {money(sum(inHand))}
          </p>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-xs text-muted-foreground">برگشتی</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-destructive">
            {toFa(bounced.length)} چک · {money(sum(bounced))}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">وصول‌شده</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">
            {money(sum(cashed))}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">نزدیک‌ترین سررسید</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">
            {nearestDue ? faDate(nearestDue) : "—"}
          </p>
        </div>
      </div>

      <Card className="p-0">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">
            چک‌ها <span className="text-sm font-normal text-muted-foreground">({toFa(rows.length)} فقره)</span>
          </h2>
        </div>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            این مشتری چکی در سیستم ندارد
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={`${TH} w-24`}>شماره چک</th>
                  <th className={`${TH} w-32`}>بانک</th>
                  <th className={`${TH} w-32`}>مبلغ</th>
                  <th className={`${TH} w-28`}>سررسید</th>
                  <th className={`${TH} w-36`}>وضعیت</th>
                  <th className={TH}>سندِ مبدا</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ch) => (
                  <tr key={ch.id} className="border-b odd:bg-muted/25">
                    <td className={`${TD} font-bold tabular-nums`}>{toFa(ch.number)}</td>
                    <td className={`${TD} text-muted-foreground`}>{ch.bankName ?? "—"}</td>
                    <td className={`${TD} font-semibold tabular-nums`}>{money(ch.amount)}</td>
                    <td className={`${TD} tabular-nums text-muted-foreground`}>
                      {faDate(ch.dueDate)}
                    </td>
                    <td className={TD}>
                      <StatusBadge kind="cheque" status={ch.status} />
                    </td>
                    <td className={`${TD} text-xs text-muted-foreground`}>
                      {ch.source === "SALE"
                        ? `فاکتور #${toFa(ch.docNumber ?? 0)}`
                        : `رسید #${toFa(ch.docNumber ?? 0)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
