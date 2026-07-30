"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Package,
  Boxes,
  Activity,
  TrendingUp,
  ArrowLeft,
} from "lucide-react";
import {
  getCurrentStock,
  getInventoryLogs,
  getProducts,
} from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState, EmptyState } from "@/components/states";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ACTION_LABELS,
  ACTION_BADGE_CLASS,
  formatDateTime,
  formatNumber,
} from "@/lib/format";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  loading,
  error,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-xl bg-primary/10 p-3 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <div className="mt-1 h-7 w-20 animate-pulse rounded bg-muted" />
          ) : error ? (
            <p className="mt-1 text-lg font-bold text-destructive">—</p>
          ) : (
            <p className="mt-0.5 text-2xl font-bold">{value}</p>
          )}
          {hint ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  // طبق بخش ۶.۲ — داشبورد از ترکیب چند endpoint ساخته می‌شود
  const productsQ = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => getProducts(),
  });

  const stockQ = useQuery({
    queryKey: ["inventory", "current-stock", 1, 200],
    queryFn: () => getCurrentStock(1, 200),
  });

  const logsQ = useQuery({
    queryKey: ["inventory", "logs", { limit: 10 }],
    queryFn: () => getInventoryLogs({ limit: 10 }),
  });

  // نمودار روند فعالیت — طبق بخش ۶.۲: تجمیع سمت کلاینت روی لاگ‌ها
  const logsForChartQ = useQuery({
    queryKey: ["inventory", "logs", "chart", { limit: 100 }],
    queryFn: () => getInventoryLogs({ limit: 100 }),
  });

  const chartData = React.useMemo(() => {
    const items = logsForChartQ.data?.items ?? [];
    const byDay = new Map<string, { date: string; count: number }>();
    for (const it of items) {
      const d = new Date(it.createdAt);
      if (isNaN(d.getTime())) continue;
      const key = new Intl.DateTimeFormat("fa-IR", {
        month: "short",
        day: "numeric",
      }).format(d);
      const cur = byDay.get(key) ?? { date: key, count: 0 };
      cur.count += 1;
      byDay.set(key, cur);
    }
    return Array.from(byDay.values()).slice(-12);
  }, [logsForChartQ.data]);

  const totalProducts = productsQ.data?.length ?? 0;
  const itemsWithStock =
    stockQ.data?.data?.filter((r) => r.quantity > 0).length ?? 0;
  const totalStockQty =
    stockQ.data?.data?.reduce((s, r) => s + (r.quantity ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="داشبورد"
        description="نمای کلی وضعیت انبار و فعالیت‌های اخیر"
        icon={Boxes}
      />

      {/* کارت‌های آماری */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="کل محصولات"
          value={formatNumber(totalProducts)}
          icon={Package}
          hint="تعداد کل قطعات ثبت‌شده"
          loading={productsQ.isLoading}
          error={productsQ.isError}
        />
        <StatCard
          title="اقلام دارای موجودی"
          value={formatNumber(itemsWithStock)}
          icon={Boxes}
          hint="از مجموع ثبت‌شده"
          loading={stockQ.isLoading}
          error={stockQ.isError}
        />
        <StatCard
          title="مجموع موجودی انبار"
          value={formatNumber(totalStockQty)}
          icon={TrendingUp}
          hint="مجموع تعداد همه اقلام"
          loading={stockQ.isLoading}
          error={stockQ.isError}
        />
        <StatCard
          title="فعالیت اخیر"
          value={formatNumber(logsQ.data?.total ?? 0)}
          icon={Activity}
          hint="تعداد کل تراکنش‌های موجودی"
          loading={logsQ.isLoading}
          error={logsQ.isError}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* نمودار روند فعالیت */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">روند فعالیت انبار</CardTitle>
            <Badge variant="secondary" className="gap-1">
              <TrendingUp className="h-3 w-3" />
              ۱۰۰ تراکنش اخیر
            </Badge>
          </CardHeader>
          <CardContent>
            {logsForChartQ.isLoading ? (
              <LoadingState />
            ) : logsForChartQ.isError ? (
              <ErrorState message="بارگذاری نمودار ناموفق بود" />
            ) : chartData.length === 0 ? (
              <EmptyState title="داده‌ای برای نمایش وجود ندارد" />
            ) : (
              <div className="h-64 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="oklch(0.68 0.19 44)"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="oklch(0.68 0.19 44)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      allowDecimals={false}
                      className="text-muted-foreground"
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid oklch(0.92 0.008 250)",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="oklch(0.68 0.19 44)"
                      strokeWidth={2}
                      fill="url(#actGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* آخرین فعالیت‌ها */}
        <Card className="shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">آخرین فعالیت‌ها</CardTitle>
            <Link
              href="/admin/inventory/logs"
              className="flex items-center gap-1 text-xs text-accent hover:underline"
            >
              مشاهده همه
              <ArrowLeft className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {logsQ.isLoading ? (
              <LoadingState />
            ) : logsQ.isError ? (
              <ErrorState message="بارگذاری فعالیت‌ها ناموفق بود" />
            ) : !logsQ.data?.items?.length ? (
              <EmptyState title="فعالیتی ثبت نشده" />
            ) : (
              <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto scroll-thin pe-1">
                {logsQ.data.items.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center gap-3 rounded-lg border p-2.5"
                  >
                    <Badge
                      variant="secondary"
                      className={`shrink-0 ${ACTION_BADGE_CLASS[log.action] ?? ""}`}
                    >
                      {ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {log.product?.name ?? "محصول حذف‌شده"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {log.location?.name ?? "—"}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-sm font-semibold">
                        {formatNumber(log.quantity)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
