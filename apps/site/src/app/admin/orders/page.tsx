"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listSiteOrders } from "@/lib/api";
import { faDateTime, toFa } from "@/lib/format";
import type { OnlineOrderStatus } from "@/lib/types";

const STATUS_LABELS: Record<OnlineOrderStatus, string> = {
  PLACED: "ثبت سفارش",
  PREPARING: "در حال آماده‌سازی",
  SHIPPED: "ارسال شد",
  DELIVERED: "تحویل شد",
  CANCELLED: "لغو شد",
};

const STATUS_CLASS: Record<OnlineOrderStatus, string> = {
  PLACED: "bg-sky-100 text-sky-700",
  PREPARING: "bg-amber-100 text-amber-700",
  SHIPPED: "bg-indigo-100 text-indigo-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-rose-100 text-rose-700",
};

const PAY_LABELS: Record<string, string> = {
  ON_DELIVERY: "پرداخت در محل",
  TRANSFER: "کارت به کارت",
  GATEWAY: "درگاه پرداخت",
};

export default function SiteOrdersPage() {
  const [status, setStatus] = React.useState<OnlineOrderStatus | "ALL">("ALL");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);

  const orders = useQuery({
    queryKey: ["site-admin", "orders", { status, q, page }],
    queryFn: () =>
      listSiteOrders({
        status: status === "ALL" ? undefined : status,
        q: q || undefined,
        page,
      }),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="سفارش‌های آنلاین"
        description="مشاهده‌ی سفارش‌های سایت — پیش‌بردنِ مرحله‌ی تحویل از پنلِ مغازه انجام می‌شود."
        icon={PackageCheck}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as OnlineOrderStatus | "ALL");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">همه</SelectItem>
              <SelectItem value="PLACED">ثبت سفارش</SelectItem>
              <SelectItem value="PREPARING">در حال آماده‌سازی</SelectItem>
              <SelectItem value="SHIPPED">ارسال شد</SelectItem>
              <SelectItem value="DELIVERED">تحویل شد</SelectItem>
              <SelectItem value="CANCELLED">لغو شد</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative min-w-52 flex-1">
            <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setPage(1);
              }}
              placeholder="جستجوی نام، تلفن یا شماره سفارش..."
              className="pr-9"
            />
          </div>

          <Button
            variant="outline"
            onClick={() => {
              setPage(1);
              orders.refetch();
            }}
          >
            جستجو
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {orders.isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : orders.isError ? (
            <p className="p-6 text-center text-sm text-destructive">
              دریافت سفارش‌ها ممکن نشد.
            </p>
          ) : orders.data && orders.data.items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              سفارشی یافت نشد.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-start font-medium">شماره</th>
                    <th className="px-4 py-3 text-start font-medium">وضعیت</th>
                    <th className="px-4 py-3 text-start font-medium">گیرنده</th>
                    <th className="px-4 py-3 text-start font-medium">پرداخت</th>
                    <th className="px-4 py-3 text-start font-medium">تاریخ</th>
                    <th className="px-4 py-3 text-start font-medium">داخل مغازه</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.data!.items.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-semibold tabular-nums">
                        {toFa(o.number)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS_CLASS[o.status]}>
                          {STATUS_LABELS[o.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div>{o.receiverName}</div>
                        <div className="text-xs text-muted-foreground" dir="ltr">
                          {toFa(o.receiverPhone)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {PAY_LABELS[o.payMethod] ?? o.payMethod}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {faDateTime(o.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {o.deliveredToShop ? "بله" : "خیر"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {orders.data && orders.data.total > 0 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {toFa(orders.data.total)} سفارش
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              قبلی
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * orders.data.pageSize >= orders.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              بعدی
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
