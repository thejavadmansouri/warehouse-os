"use client";

/**
 * پرداخت‌ها — تسویه بستانکاریِ مشتری‌ها.
 *
 * قرینه‌ی صفحه‌ی رسیدها با جهتِ معکوس: اینجا فروشگاه پول می‌دهد. فرم فقط برای
 * مشتریِ بستانکار باز می‌شود و فهرستِ سندها پایینش تاریخچه را نگه می‌دارد.
 * مدیر این تب را در «اسناد» می‌بیند؛ فروشنده نمی‌بیند — پولِ بیرون‌رفته
 * تصمیمِ مدیر است.
 */

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User } from "lucide-react";

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
import { PayoutForm } from "@/components/payout-form";
import { getCustomer, getPayouts } from "@/lib/api";
import { faDate, money, toFa, PAYMENT_LABELS } from "@/lib/format";
import type { Customer } from "@/lib/types";

import { CustomerPicker } from "../pos/_components/customer-picker";

/** داخلِ صفحه‌ی «اسناد» ساختارِ تمام‌صفحه نمی‌خواهد. */
export function PayoutsPanel({ embedded }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();

  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [showPicker, setShowPicker] = React.useState(false);

  // پروفایل کامل مشتری — مانده فقط در summary آنجاست.
  const profile = useQuery({
    queryKey: ["customer", customer?.id],
    queryFn: () => getCustomer(customer!.id),
    enabled: !!customer?.id,
  });

  const list = useQuery({
    queryKey: ["payouts", customer?.id],
    queryFn: () => getPayouts({ customerId: customer?.id, limit: 20 }),
  });

  const totalDue = profile.data?.summary?.totalDue ?? 0;
  const credit = totalDue < 0 ? -totalDue : 0;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["customer"] });
    qc.invalidateQueries({ queryKey: ["payouts"] });
  };

  return (
    <div className={`space-y-3 p-3 ${embedded ? "" : "h-[calc(100vh-2.5rem)] overflow-auto"}`}>
      <div className="grid gap-3 lg:grid-cols-[24rem_1fr]">
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
                <p className="mt-2 text-sm">
                  مانده فعلی:{" "}
                  <b
                    className={
                      totalDue < 0
                        ? "text-emerald-600 tabular-nums"
                        : totalDue > 0
                          ? "text-amber-600 tabular-nums"
                          : "tabular-nums"
                    }
                  >
                    {money(Math.abs(totalDue))}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {totalDue > 0 ? "بدهکار" : totalDue < 0 ? "بستانکار" : "تسویه"}
                    </span>
                  </b>
                </p>
                {totalDue > 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    این مشتری بدهکار است — پرداخت به او یعنی «چیزی برای پرداخت
                    ندارد». برای گرفتن پول از او به «دریافت‌ها» بروید.
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                برای شروع، مشتری را انتخاب کنید
              </p>
            )}
          </Card>

          {customer && (
            <PayoutForm customerId={customer.id} creditBalance={credit} onDone={refresh} />
          )}
        </div>

        {/* تاریخچه */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">
            {customer ? `پرداخت‌های ${customer.fullName}` : "آخرین پرداخت‌ها"}
          </h2>

          {list.isLoading ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState onRetry={() => list.refetch()} />
          ) : !list.data?.data.length ? (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              هنوز پرداختی ثبت نشده است
            </p>
          ) : (
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شماره</TableHead>
                    <TableHead>مشتری</TableHead>
                    <TableHead>روش</TableHead>
                    <TableHead>دلیل</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead className="text-start">مبلغ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.data.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="tabular-nums">{toFa(p.number)}</TableCell>
                      <TableCell className="font-medium">{p.customerName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{PAYMENT_LABELS[p.method] ?? p.method}</Badge>
                        {p.chequeNumber && (
                          <span className="ms-2 text-xs text-muted-foreground tabular-nums">
                            چک {toFa(p.chequeNumber)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-52 truncate text-xs text-muted-foreground">
                        {p.reason}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {faDate(p.createdAt)}
                      </TableCell>
                      <TableCell className="font-bold">
                        <Money value={-p.amount} tone="danger" />
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
export default function PayoutsPage() {
  return <PayoutsPanel />;
}
