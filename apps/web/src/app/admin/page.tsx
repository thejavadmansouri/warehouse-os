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
  PieChart as PieIcon,
  AlertTriangle,
} from "lucide-react";
import {
  getCurrentStock,
  getInventoryLogs,
  getProductsPaged,
  getSalesByCategory,
  getPeriodicSales,
  getPeriodicProfit,
  getDebtors,
  getChequesReport,
  getLowStock,
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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { presetDates, SummaryCard, t } from "./reports/_components/shared";
import { money, toFa } from "@/lib/format";

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
        <div className="rounded-2xl bg-primary/10 p-3.5 text-primary">
          <Icon className="h-8 w-8" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          {loading ? (
            <div className="mt-1 h-10 w-24 animate-pulse rounded bg-muted" />
          ) : error ? (
            <p className="mt-1 text-3xl font-bold text-destructive">—</p>
          ) : (
            <p className="mt-0.5 text-4xl font-bold tracking-tight tabular-nums">
              {value}
            </p>
          )}
          {hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  // طبق بخش ۶.۲ — داشبورد از ترکیب چند endpoint ساخته می‌شود
  /*
   * تعدادِ کل کالاها از `meta.total` می‌آید، نه از طولِ آرایه.
   *
   * قبلاً `getProducts()` صدا زده می‌شد و کارتِ «کل محصولات» روی
   * `data.length` می‌نشست — ولی آن اندپوینت صفحه‌بندی‌شده است و پیش‌فرضش ۵۰
   * ردیف. یعنی داشبورد برای کاتالوگِ ۳۳ هزارتایی همیشه «۵۰» نشان می‌داد.
   *
   * حالا فقط یک ردیف گرفته می‌شود و عدد از خودِ شمارشِ سرور خوانده می‌شود.
   */
  const productsQ = useQuery({
    queryKey: ["products", "count"],
    queryFn: () => getProductsPaged(1, 1),
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

  // سهم دسته‌های مشتری از فروشِ این ماه (ماه شمسی) — همان گزارشِ فروش بر اساس دسته.
  const categoryShareQ = useQuery({
    queryKey: ["sales-by-category", "this-month"],
    queryFn: () => getSalesByCategory(presetDates("this_month")),
  });

  // KPIهای مالی — از همان اندپوینت‌های گزارش‌ها؛ فقط summary لازم است، پس
  // کوچک‌ترین صفحه (limit=1) گرفته می‌شود تا داشبورد سبک بماند.
  const salesTodayQ = useQuery({
    queryKey: ["kpi", "sales", "today"],
    queryFn: () => getPeriodicSales({ ...presetDates("today"), page: 1, limit: 1 }),
  });
  const salesMonthQ = useQuery({
    queryKey: ["kpi", "sales", "month"],
    queryFn: () => getPeriodicSales({ ...presetDates("this_month"), page: 1, limit: 1 }),
  });
  const profitMonthQ = useQuery({
    queryKey: ["kpi", "profit", "month"],
    queryFn: () => getPeriodicProfit({ ...presetDates("this_month"), page: 1, limit: 1 }),
  });
  const debtorsKpiQ = useQuery({
    queryKey: ["kpi", "debtors"],
    queryFn: () => getDebtors({ page: 1, limit: 1 }),
  });
  const chequesKpiQ = useQuery({
    queryKey: ["kpi", "cheques", "upcoming"],
    queryFn: () => getChequesReport({ status: "UPCOMING", page: 1, limit: 1 }),
  });
  const lowStockKpiQ = useQuery({
    queryKey: ["kpi", "low-stock"],
    queryFn: () => getLowStock({ page: 1, limit: 1 }),
  });

  /** مقدارِ کارتِ مالی با در نظر گرفتن حالت بارگذاری/خطا. */
  const kpi = (
    q: { isLoading: boolean; isError: boolean },
    value: () => string,
  ): string => (q.isLoading ? "…" : q.isError ? "—" : value());

  const categoryPieData = React.useMemo(() => {
    const cats = categoryShareQ.data?.categories ?? [];
    if (!cats.length) return [];
    // سهم‌ها روی ۱۰۰ جمع می‌شوند؛ در نمودار دایره‌ای هم همان درصدها را رسم می‌کنیم.
    return cats.map((c) => ({
      name: c.categoryName,
      value: c.sharePercent,
      amount: c.totalAmount,
      color: c.color,
    }));
  }, [categoryShareQ.data]);

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

  const totalProducts = productsQ.data?.meta.total ?? 0;
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

      {/* KPIهای مالی — مهم‌ترین اعداد برای مدیر، بالای صفحه */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label="فروش خالص امروز"
          value={kpi(salesTodayQ, () => t(salesTodayQ.data!.summary.netAmount))}
        />
        <SummaryCard
          label="فروش خالص این ماه"
          value={kpi(salesMonthQ, () => t(salesMonthQ.data!.summary.netAmount))}
        />
        <SummaryCard
          label="سود این ماه"
          value={kpi(profitMonthQ, () => t(profitMonthQ.data!.summary.grossProfit))}
          tone="success"
        />
        <SummaryCard
          label="بدهی مشتریان"
          value={kpi(debtorsKpiQ, () => t(debtorsKpiQ.data!.summary.totalCreditBalance))}
          tone="warning"
        />
        <SummaryCard
          label="چک سررسید نزدیک"
          value={kpi(chequesKpiQ, () =>
            chequesKpiQ.data!.summary.totalCount > 0
              ? `${t(chequesKpiQ.data!.summary.totalAmount)}`
              : "—",
          )}
        />
        <SummaryCard
          label="اقلام زیر حد سفارش"
          value={kpi(lowStockKpiQ, () => toFa(lowStockKpiQ.data!.summary.totalLowStockItems))}
          tone={
            !lowStockKpiQ.isLoading &&
            !lowStockKpiQ.isError &&
            lowStockKpiQ.data!.summary.totalLowStockItems > 0
              ? "warning"
              : "default"
          }
        />
      </div>

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

      {/* سهم دسته‌های مشتری از فروشِ این ماه */}
      <Card className="shadow-sm">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">سهم دسته‌های مشتری از فروش این ماه</CardTitle>
          <Badge variant="secondary" className="gap-1">
            <PieIcon className="h-3 w-3" />
            {categoryShareQ.isLoading
              ? "…"
              : categoryShareQ.data?.categories.length
              ? `${toFa(categoryShareQ.data.categories.length)} دسته`
              : "بدون داده"}
          </Badge>
        </CardHeader>
        <CardContent>
          {categoryShareQ.isLoading ? (
            <LoadingState />
          ) : categoryShareQ.isError ? (
            <ErrorState message="بارگذاری سهم دسته‌ها ناموفق بود" />
          ) : categoryPieData.length === 0 ? (
            <EmptyState title="فروشی در این ماه ثبت نشده یا دسته‌ای تعریف نشده است" />
          ) : (
            <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-2">
              <div className="h-56 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {categoryPieData.map((c) => (
                        <Cell key={c.name} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name, item) => [
                        `٪${toFa(Number(v))} — ${money((item?.payload as { amount: number })?.amount ?? 0)}`,
                        String(name),
                      ]}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid oklch(0.925 0.007 252)",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* افسانه + مبالغ */}
              <ul className="flex flex-col gap-2">
                {categoryPieData.map((c) => (
                  <li
                    key={c.name}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {c.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      ٪{toFa(c.value)}
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">
                      {money(c.amount)}
                    </span>
                  </li>
                ))}
                {categoryShareQ.data?.summary.uncategorizedSales ? (
                  <li className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                    {money(categoryShareQ.data.summary.uncategorizedSales)} فروشِ بدون دسته —
                    دسته‌ها را کامل کنید تا سهم‌ها دقیق شوند.
                  </li>
                ) : null}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

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
                          stopColor="oklch(0.55 0.19 254)"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="oklch(0.55 0.19 254)"
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
                        border: "1px solid oklch(0.925 0.007 252)",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="oklch(0.55 0.19 254)"
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
