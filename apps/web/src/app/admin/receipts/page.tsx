"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, User } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
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
import { ReceiptForm } from "@/components/receipt-form";
import { getCustomer, getReceipts } from "@/lib/api";
import { faDate, money, toFa, PAYMENT_LABELS } from "@/lib/format";
import type { Customer } from "@/lib/types";

import { CustomerPicker } from "../pos/_components/customer-picker";

/** داخلِ صفحه‌ی «اسناد» سرتیترِ خودش را نشان نمی‌دهد. */
export function ReceiptsPanel({ embedded }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();

  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [showPicker, setShowPicker] = React.useState(false);

  // پروفایل کامل مشتری را می‌گیریم چون خلاصه‌ی بدهی فقط آنجاست.
  const profile = useQuery({
    queryKey: ["customer", customer?.id],
    queryFn: () => getCustomer(customer!.id),
    enabled: !!customer?.id,
  });

  const list = useQuery({
    queryKey: ["receipts", customer?.id],
    queryFn: () => getReceipts({ customerId: customer?.id, limit: 20 }),
  });

  const totalDue = profile.data?.summary?.totalDue ?? 0;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["customer"] });
    qc.invalidateQueries({ queryKey: ["receipts"] });
  };

  const chequesOf = (r: { payments?: { method: string; cheque?: { number: string } | null }[] }) =>
    (r.payments ?? []).filter((p) => p.method === "CHEQUE" && p.cheque);

  return (
    <div className="space-y-6">
      <PageHeader
        compact={embedded}
        title="دریافت وجه از بدهکار"
        description="ثبت پرداخت مشتری بابت فاکتورهای نسیه"
        icon={HandCoins}
      />

      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        {/* انتخاب مشتری + فرم ثبت */}
        <div className="h-fit space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">مشتری</span>
              <Button variant="ghost" size="sm" onClick={() => setShowPicker(true)}>
                <User className="size-4" /> انتخاب
              </Button>
            </div>

            {customer ? (
              <div className="rounded-lg border p-3">
                <p className="font-medium">{customer.fullName}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {customer.phones?.[0]?.phone ? toFa(customer.phones[0].phone) : "بدون شماره"}
                </p>
                <p className="mt-2 text-sm">
                  بدهی فعلی:{" "}
                  <b className={totalDue > 0 ? "text-amber-600 tabular-nums" : "tabular-nums"}>
                    {money(totalDue)} ریال
                  </b>
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                برای شروع، مشتری را انتخاب کنید
              </p>
            )}
          </Card>

          {customer && totalDue > 0 && (
            <ReceiptForm
              customerId={customer.id}
              totalDue={totalDue}
              chequeRateBp={customer.chequeRateBp}
              chequeRateMode={customer.chequeRateMode}
              onDone={refresh}
            />
          )}
        </div>

        {/* تاریخچه */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">
            {customer ? `رسیدهای ${customer.fullName}` : "آخرین رسیدها"}
          </h2>

          {list.isLoading ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState onRetry={() => list.refetch()} />
          ) : !list.data?.data.length ? (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              هنوز رسیدی ثبت نشده است
            </p>
          ) : (
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شماره</TableHead>
                    <TableHead>مشتری</TableHead>
                    <TableHead>روش</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead className="text-start">مبلغ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums">{toFa(r.number)}</TableCell>
                      <TableCell className="font-medium">{r.customerName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{PAYMENT_LABELS[r.method] ?? r.method}</Badge>
                        {chequesOf(r).map((c) => (
                          <span
                            key={c.cheque!.number}
                            className="ms-2 text-xs text-muted-foreground tabular-nums"
                          >
                            چک {toFa(c.cheque!.number)}
                          </span>
                        ))}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {faDate(r.createdAt)}
                      </TableCell>
                      <TableCell className="font-bold">
                        <Money value={r.amount} tone="positive" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      </div>

      <CustomerPicker
        open={showPicker}
        onPick={(c) => { setCustomer(c); setShowPicker(false); }}
        onClose={() => setShowPicker(false)}
      />
    </div>
  );
}


/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function ReceiptsPage() {
  return <ReceiptsPanel />;
}
