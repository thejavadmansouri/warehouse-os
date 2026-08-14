"use client";

import { useQuery } from "@tanstack/react-query";
import { User, CreditCard, Clock, ShoppingCart, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCustomer } from "@/lib/api";
import { money, toFa, rial } from "@/lib/format";
import type { Customer, Invoice } from "@/lib/types";
import { useState } from "react";

/**
 * خلاصه وضعیت مشتری و تاریخچه خرید.
 *
 * این کامپوننت اطلاعات مالی مشتری (بدهی، سقف اعتبار، مانده) و تاریخچه خرید
 * را در یک پنل فشرده نمایش می‌دهد تا فروشنده بدون خروج از صفحه POS
 * بتواند وضعیت مشتری را ببیند.
 */
export function CustomerSummary({
  customer,
  todayCount,
  recentInvoices,
  onOpenFullProfile,
  onShowTodayPurchases,
}: {
  customer: Customer | null;
  /** تعداد فاکتورهای امروزِ مشتری — از همان کوئریِ واحدِ page.tsx می‌آید. */
  todayCount: number;
  /** آخرین فاکتورهای امروزِ مشتری (تا ۵ تا) — همان کوئریِ واحد. */
  recentInvoices: Invoice[];
  onOpenFullProfile: () => void;
  onShowTodayPurchases: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);

  const customerDetail = useQuery({
    queryKey: ["customer", customer?.id],
    queryFn: () => getCustomer(customer!.id),
    enabled: !!customer?.id,
  });

  if (!customer) return null;

  const d = customerDetail.data;
  const due = d?.summary?.totalDue ?? 0;
  const limit = d?.creditLimit ?? 0;
  const left = limit - due;
  const days = d?.creditDays ?? 0;
  /*
   * شماره‌ی اصلی (isPrimary) را نشان بده — نه همیشه اولینِ فهرست. همراستا با
   * چیپ مشتری؛ برای مشتری‌ای که شماره‌ی اصلی‌اش اولین نیست، دو جا نباید دو
   * شماره‌ی متفاوت ببینند.
   */
  const primaryPhone =
    customer.phones?.find((p) => p.isPrimary)?.phone ??
    customer.phones?.[0]?.phone ??
    null;

  return (
    <div className="rounded-lg border bg-card">
      {/* هدر مشتری */}
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <User className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{customer.fullName}</div>
            {primaryPhone && (
              <div className="text-xs text-muted-foreground" dir="ltr">
                {toFa(primaryPhone)}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenFullProfile}
            className="text-xs"
          >
            پرونده
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowTodayPurchases}
            className="text-xs"
          >
            امروز
          </Button>
        </div>
      </div>

      {/* اطلاعات مالی */}
      <div className="p-3">
        {customerDetail.isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* وضعیت مالی اصلی */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-muted/50 px-2 py-1.5">
                <div className="text-[11px] text-muted-foreground">بدهی</div>
                <div className={`text-sm font-semibold tabular-nums ${
                  due > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-foreground"
                }`}>
                  {money(due)}
                </div>
              </div>

              {limit > 0 && (
                <div className="rounded-md bg-muted/50 px-2 py-1.5">
                  <div className="text-[11px] text-muted-foreground">سقف اعتبار</div>
                  <div className="text-sm font-semibold tabular-nums">
                    {money(limit)}
                  </div>
                </div>
              )}

              {limit > 0 && (
                <div className="rounded-md bg-muted/50 px-2 py-1.5">
                  <div className="text-[11px] text-muted-foreground">مانده اعتبار</div>
                  <div className={`text-sm font-semibold tabular-nums ${
                    left <= 0
                      ? "text-destructive"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {money(left)}
                  </div>
                </div>
              )}

              {days > 0 && (
                <div className="rounded-md bg-muted/50 px-2 py-1.5">
                  <div className="text-[11px] text-muted-foreground">مهلت</div>
                  <div className="text-sm font-semibold tabular-nums">
                    {toFa(days)} روز
                  </div>
                </div>
              )}
            </div>

            {/* هشدار اعتبار */}
            {limit > 0 && due > limit && (
              <div className="flex items-center gap-2 rounded-md bg-amber-600/10 px-2 py-1.5 text-xs text-amber-600 dark:bg-amber-600/10 dark:text-amber-400">
                <AlertTriangle className="size-3.5" />
                <span>از سقف اعتبار عبور کرده</span>
              </div>
            )}

            {/* فاکتورهای امروز */}
            {todayCount > 0 && (
              <div className="flex items-center justify-between rounded-md bg-primary/10 px-2 py-1.5 text-xs">
                <span className="text-primary">
                  <ShoppingCart className="inline size-3.5" />
                  {" "}{toFa(todayCount)} خرید امروز
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className="h-6 px-2 text-xs text-primary hover:text-primary/80"
                >
                  {showHistory ? (
                    <ChevronUp className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                </Button>
              </div>
            )}

            {/* تاریخچه خرید امروز */}
            {showHistory && recentInvoices.length > 0 && (
              <div className="space-y-1 border-t pt-2">
                <div className="text-xs font-medium text-muted-foreground">
                  آخرین خریدهای امروز:
                </div>
                {recentInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1 text-xs"
                  >
                    <span className="truncate">فاکتور {toFa(inv.number)}</span>
                    <span className="shrink-0 tabular-nums">{rial(inv.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
