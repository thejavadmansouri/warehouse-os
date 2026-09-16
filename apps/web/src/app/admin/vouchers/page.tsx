"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState, EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTablePagination } from "@/components/data-table-pagination";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { VoucherCard } from "@/components/voucher-card";
import { useAuthStore } from "@/lib/auth-store";
import { getVouchers } from "@/lib/api";
import type { VoucherSourceType } from "@/lib/types";

/** برچسب فارسیِ نوع سند — با enum سمت سرور هماهنگ. */
const SOURCE_LABELS: Record<string, string> = {
  SALE_INVOICE: "فاکتور فروش",
  SALE_CANCEL: "ابطال فاکتور",
  RECEIPT: "دریافت وجه",
  SALE_RETURN: "مرجوعی",
  SALE_CORRECTION: "اصلاحیه",
  PURCHASE_INVOICE: "فاکتور خرید",
  PURCHASE_CANCEL: "ابطال فاکتور خرید",
};

export default function VouchersPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isManager = role === "ADMIN" || role === "MANAGER";

  const [sourceType, setSourceType] = React.useState<VoucherSourceType | "">("");
  const [from, setFrom] = React.useState<string | undefined>(undefined);
  const [to, setTo] = React.useState<string | undefined>(undefined);
  const [page, setPage] = React.useState(1);

  const list = useQuery({
    queryKey: ["vouchers", sourceType, from, to, page],
    queryFn: () => getVouchers({ sourceType, from, to, page, limit: 20 }),
    enabled: isManager,
  });

  const hasFilter = sourceType !== "" || !!from || !!to;

  const reset = () => {
    setSourceType("");
    setFrom(undefined);
    setTo(undefined);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="دفتر روزنامه"
        description="سندِ خودکارِ پشتِ هر اکشن مالی — جمعِ بدهکار هر سند همیشه با بستانکارش برابر است"
        icon={ScrollText}
      />

      {!isManager ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          این صفحه فقط برای مدیر است.
        </Card>
      ) : (
        <>
          {/* فیلترها */}
          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">نوع سند</label>
                <Select
                  value={sourceType || "all"}
                  onValueChange={(v) => {
                    setSourceType(v === "all" ? "" : (v as VoucherSourceType));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه</SelectItem>
                    {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">از تاریخ</label>
                <JalaliDateInput
                  value={from}
                  onChange={(iso) => {
                    setFrom(iso);
                    setPage(1);
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">تا تاریخ</label>
                <JalaliDateInput
                  value={to}
                  onChange={(iso) => {
                    setTo(iso);
                    setPage(1);
                  }}
                />
              </div>

              {hasFilter ? (
                <Button variant="ghost" size="sm" onClick={reset}>
                  پاک کردن فیلترها
                </Button>
              ) : null}
            </div>
          </Card>

          {/* فهرست سندها */}
          {list.isLoading ? (
            <LoadingState label="در حال بارگذاری سندها..." />
          ) : list.isError ? (
            <ErrorState onRetry={() => list.refetch()} />
          ) : !list.data?.data.length ? (
            <EmptyState
              title="سندی یافت نشد"
              description={
                hasFilter
                  ? "با این فیلترها سندی ثبت نشده است"
                  : "هنوز هیچ اکشن مالی ثبت نشده — با اولین فاکتور، اولین سند اینجا می‌نشیند"
              }
            />
          ) : (
            <>
              <div className="space-y-2">
                {list.data.data.map((v) => (
                  <VoucherCard key={v.id} voucher={v} />
                ))}
              </div>

              <DataTablePagination
                page={list.data.meta.page}
                totalPages={Math.max(
                  1,
                  Math.ceil(list.data.meta.total / list.data.meta.limit)
                )}
                onChange={setPage}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}