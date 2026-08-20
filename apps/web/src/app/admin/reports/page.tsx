"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Calendar, BarChart3 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  bounceCheque,
  cashCheque,
  depositCheque,
  getChequesReport,
  getDebtors,
  getLowStock,
  getPeriodicProfit,
  getPeriodicSales,
  getProductPerformance,
  getSalesByCategory,
  getSellerPerformance,
} from "@/lib/api";
import { faDate, money, qty, toFa } from "@/lib/format";
import { ApiException } from "@/lib/api-error-messages";
import { useAuthStore } from "@/lib/auth-store";

import {
  CHART_COLOR,
  ExportButton,
  NoData,
  Pagination,
  PRESETS,
  presetDates,
  StickyTotal,
  DrillCard,
  SummaryCard,
  faDayLabel,
  sum,
  t,
  type PresetRange,
} from "./_components/shared";

/**
 * مقدارِ یک کارت وقتی کوئری هنوز نیامده یا خطا خورده.
 *
 * بدون این، کارت‌ها موقعِ بارگذاری «۰» نشان می‌دادند — و صفرِ دروغ بدتر از سه
 * نقطه است: مدیر یک لحظه فکر می‌کند امروز هیچ فروشی نبوده.
 */
function kpi(
  q: { isLoading: boolean; isError: boolean },
  read: () => string,
): string {
  if (q.isLoading) return "…";
  if (q.isError) return "—";
  try {
    return read();
  } catch {
    return "—";
  }
}

const CHEQUE_STATUS_LABELS: Record<string, string> = {
  IN_HAND: "نزد ما",
  DEPOSITED: "به بانک ارائه شده",
  CASHED: "وصول شده",
  BOUNCED: "برگشتی",
};

/** جدول با ردیف جمع چسبیده. */
function ScrollTable({
  children,
  total,
}: {
  children: React.ReactNode;
  total?: { label: string; value: string };
}) {
  return (
    <Card className="relative overflow-hidden p-0">
      <div className="max-h-[420px] overflow-auto">{children}</div>
      {total && <StickyTotal label={total.label} value={total.value} />}
    </Card>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = React.useState("overview");
  const [preset, setPreset] = React.useState<PresetRange>("today");
  const [page, setPage] = React.useState(1);
  const [chequeStatus, setChequeStatus] = React.useState("UPCOMING");
  const [perfType, setPerfType] = React.useState("TOP_SELLING");

  React.useEffect(() => setPage(1), [tab, preset, chequeStatus, perfType]);

  const dates = React.useMemo(() => presetDates(preset), [preset]);
  const widen = () => setPreset("this_month");
  const limit = 15;

  const sales = useQuery({
    queryKey: ["rep", "sales", dates, page],
    queryFn: () => getPeriodicSales({ ...dates, page, limit }),
    enabled: tab === "sales" || tab === "overview",
  });
  const profit = useQuery({
    queryKey: ["rep", "profit", dates, page],
    queryFn: () => getPeriodicProfit({ ...dates, page, limit }),
    enabled: tab === "profit" || tab === "overview",
  });
  const debtors = useQuery({
    queryKey: ["rep", "debtors", page],
    queryFn: () => getDebtors({ page, limit }),
    enabled: tab === "debtors" || tab === "overview",
  });
  const cheques = useQuery({
    queryKey: ["rep", "cheques", chequeStatus, page],
    queryFn: () => getChequesReport({ status: chequeStatus, page, limit }),
    enabled: tab === "cheques" || tab === "overview",
  });

  /*
   * چرخه‌ی چک.
   *
   * وضعیتِ چک پول جابه‌جا می‌کند: برگشت، بدهیِ مشتری را برمی‌گرداند. پس فقط مدیر
   * می‌بیندش، و بعد از هر عمل مانده‌ی مشتری و مطالبات هم باید تازه شوند — نه فقط
   * خودِ فهرستِ چک‌ها.
   */
  const qc = useQueryClient();
  const canManage = useAuthStore((st) => st.hasRole("ADMIN", "MANAGER"));

  const afterChequeAction = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["rep"] });
    qc.invalidateQueries({ queryKey: ["customer"] });
    qc.invalidateQueries({ queryKey: ["statement"] });
  };

  const onError = (e: unknown) =>
    toast.error(e instanceof ApiException ? e.message : "ثبت وضعیت چک ناموفق بود");

  const deposit = useMutation({
    mutationFn: (id: string) => depositCheque(id),
    onSuccess: () => afterChequeAction("چک به بانک سپرده شد"),
    onError,
  });

  const cash = useMutation({
    mutationFn: (id: string) => cashCheque(id),
    onSuccess: () => afterChequeAction("چک وصول شد"),
    onError,
  });

  const bounce = useMutation({
    mutationFn: (v: { id: string; reason?: string }) => bounceCheque(v.id, v.reason),
    onSuccess: () => afterChequeAction("چک برگشتی ثبت شد — بدهی مشتری برگشت"),
    onError,
  });

  const chequeBusy = deposit.isPending || cash.isPending || bounce.isPending;
  const products = useQuery({
    queryKey: ["rep", "products", perfType, dates, page],
    queryFn: () => getProductPerformance({ ...dates, type: perfType, page, limit }),
    enabled: tab === "products",
  });
  const lowStock = useQuery({
    queryKey: ["rep", "low-stock", page],
    queryFn: () => getLowStock({ page, limit }),
    enabled: tab === "low-stock" || tab === "overview",
  });
  const sellers = useQuery({
    queryKey: ["rep", "sellers", dates, page],
    queryFn: () => getSellerPerformance({ ...dates, page, limit }),
    enabled: tab === "sellers",
  });
  const byCategory = useQuery({
    queryKey: ["rep", "by-category", dates],
    queryFn: () => getSalesByCategory(dates),
    enabled: tab === "categories",
  });

  const timeBased = tab !== "debtors" && tab !== "cheques" && tab !== "low-stock";

  return (
    <div className="space-y-6">
      <PageHeader
        title="گزارش‌ها"
        description="فروش، سود، مطالبات، چک، موجودی و عملکرد فروشندگان"
        icon={BarChart3}
      />

      {/* بازه‌ی یک‌کلیکی — کاربر برای گزارش روزانه نباید تاریخ انتخاب کند */}
      {timeBased && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="size-4 text-muted-foreground" />
              بازه‌ی گزارش
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={preset === p.id ? "default" : "outline"}
                  onClick={() => setPreset(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid h-auto grid-cols-2 gap-1 p-1 md:grid-cols-5 lg:grid-cols-9">
          <TabsTrigger value="overview" className="py-2 text-xs font-semibold">یک نگاه</TabsTrigger>
          <TabsTrigger value="sales" className="py-2 text-xs">فروش</TabsTrigger>
          <TabsTrigger value="profit" className="py-2 text-xs">سود</TabsTrigger>
          <TabsTrigger value="categories" className="py-2 text-xs">دسته مشتری</TabsTrigger>
          <TabsTrigger value="debtors" className="py-2 text-xs">بدهکاران</TabsTrigger>
          <TabsTrigger value="cheques" className="py-2 text-xs">چک‌ها</TabsTrigger>
          <TabsTrigger value="products" className="py-2 text-xs">پرفروش/راکد</TabsTrigger>
          <TabsTrigger value="low-stock" className="py-2 text-xs">موجودی زیر حد</TabsTrigger>
          <TabsTrigger value="sellers" className="py-2 text-xs">فروشندگان</TabsTrigger>
        </TabsList>

        {/* ۱ — فروش دوره‌ای */}
        {/* ---------- ۰ — یک نگاه ---------- */}
        <TabsContent value="overview" className="space-y-4">
          {/*
            همه‌ی اعدادِ روز در یک صفحه، و هر کارت یک درِ ورودی.
            تفاوتش با داشبوردِ قدیمی این است که کارت‌ها بن‌بست نیستند: کلیک روی
            هرکدام همان فهرست را با **همین بازه‌ی تاریخِ بالای صفحه** باز می‌کند،
            پس عددی که دیدی و فهرستی که می‌بینی همیشه یکی‌اند.
          */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <DrillCard
              label="فروش خالص"
              value={kpi(sales, () => t(sales.data!.summary.netAmount))}
              hint={
                sales.data ? `${toFa(sales.data.summary.invoiceCount)} فاکتور` : undefined
              }
              onClick={() => setTab("sales")}
            />
            <DrillCard
              label="سود کالا"
              tone="success"
              value={kpi(profit, () => t(profit.data!.summary.grossProfit))}
              hint={
                profit.data
                  ? `حاشیه ٪${toFa(profit.data.summary.profitMarginPercent)}`
                  : undefined
              }
              onClick={() => setTab("profit")}
            />
            <DrillCard
              label="تفاوت فروش مدت‌دار"
              value={kpi(profit, () => t(profit.data!.summary.financeCharge))}
              hint="سودِ چک — جدا از حاشیه‌ی کالا"
              onClick={() => setTab("profit")}
            />
            <DrillCard
              label="میانگین هر فاکتور"
              value={kpi(sales, () => t(sales.data!.summary.averageInvoiceAmount))}
              onClick={() => setTab("sales")}
            />

            <DrillCard
              label="مرجوعی"
              value={kpi(sales, () => t(sales.data!.summary.returnsAmount))}
              hint={
                sales.data ? `${toFa(sales.data.summary.returnCount)} سند` : undefined
              }
              onClick={() => setTab("sales")}
            />
            <DrillCard
              label="بدهی مشتریان"
              tone="warning"
              value={kpi(debtors, () => t(debtors.data!.summary.totalCreditBalance))}
              onClick={() => setTab("debtors")}
            />
            <DrillCard
              label="سررسید گذشته"
              tone={
                !debtors.isLoading && (debtors.data?.summary.overdue ?? 0) > 0
                  ? "danger"
                  : "default"
              }
              value={kpi(debtors, () => t(debtors.data!.summary.overdue))}
              onClick={() => setTab("debtors")}
            />
            <DrillCard
              label="چک در جریان"
              value={kpi(cheques, () => t(cheques.data!.summary.totalAmount))}
              hint={
                cheques.data
                  ? `${toFa(cheques.data.summary.totalCount)} فقره`
                  : undefined
              }
              onClick={() => setTab("cheques")}
            />

            <DrillCard
              label="اقلام زیر حد سفارش"
              tone={
                !lowStock.isLoading &&
                (lowStock.data?.summary.totalLowStockItems ?? 0) > 0
                  ? "warning"
                  : "default"
              }
              value={kpi(lowStock, () =>
                toFa(lowStock.data!.summary.totalLowStockItems),
              )}
              onClick={() => setTab("low-stock")}
            />
            <DrillCard
              label="پرفروش‌ترین"
              value={
                products.data?.products.data[0]?.productName ??
                (products.isLoading ? "…" : "—")
              }
              small
              onClick={() => { setPerfType("TOP_SELLING"); setTab("products"); }}
            />
            <DrillCard
              label="بدهکارترین مشتری"
              value={debtors.data?.debtors.data[0]?.customerName ?? "—"}
              small
              onClick={() => setTab("debtors")}
            />
            <DrillCard
              label="فروشندگان"
              value={
                sellers.data ? `${toFa(sellers.data.sellers.data.length)} نفر` : "—"
              }
              small
              onClick={() => setTab("sellers")}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            همه‌ی این اعداد بر اساس بازه‌ی انتخاب‌شده‌ی بالای صفحه‌اند. روی هر
            کارت بزنید تا فهرستِ پشتش با همان بازه باز شود.
          </p>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          {sales.isLoading ? <LoadingState /> : sales.isError ? (
            <ErrorState onRetry={() => sales.refetch()} />
          ) : !sales.data?.invoices.data.length ? (
            <NoData onWiden={widen} />
          ) : (
            <>
              <div className="flex justify-end">
                <ExportButton endpoint="/reports/periodic-sales" params={dates} fileName="فروش" />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <SummaryCard label="فروش ناخالص" value={t(sales.data.summary.totalAmount)} />
                <SummaryCard
                  label="برگشت از فروش"
                  value={t(sales.data.summary.returnsAmount)}
                />
                <SummaryCard label="فروش خالص" value={t(sales.data.summary.netAmount)} />
                <SummaryCard label="تعداد فاکتور" value={toFa(sales.data.summary.invoiceCount)} />
                <SummaryCard label="تعداد مرجوعی" value={toFa(sales.data.summary.returnCount)} />
                <SummaryCard label="میانگین هر فاکتور" value={t(sales.data.summary.averageInvoiceAmount)} />
                {/*
                  تفکیکِ سودِ مدت از بهای کالا. تا وقتی صفر است نشان داده نمی‌شود
                  تا کارتِ خالی صفحه را شلوغ نکند.
                */}
                {sales.data.summary.financeCharge > 0 && (
                  <SummaryCard
                    label="تفاوت فروش مدت‌دار"
                    value={t(sales.data.summary.financeCharge)}
                  />
                )}
              </div>

              {sales.data.chartData.length > 1 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">فروش روزانه</CardTitle>
                  </CardHeader>
                  <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={sales.data.chartData.map((d) => ({
                          ...d,
                          label: faDayLabel(d.date),
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" fontSize={12} />
                        <YAxis fontSize={12} tickFormatter={(v) => money(Number(v) / 1_000_000)} />
                        <Tooltip
                          formatter={(v) => [t(Number(v)), "فروش"]}
                          labelFormatter={(l) => `تاریخ: ${l}`}
                        />
                        <Bar dataKey="amount" fill={CHART_COLOR} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <ScrollTable
                total={{
                  label: "جمع این صفحه",
                  value: t(sum(sales.data.invoices.data.map((i) => i.amount))),
                }}
              >
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                    <TableRow>
                      <TableHead>شماره</TableHead>
                      <TableHead>مشتری</TableHead>
                      <TableHead>فروشنده</TableHead>
                      <TableHead>تاریخ</TableHead>
                      <TableHead className="text-start">مبلغ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.data.invoices.data.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium tabular-nums">{toFa(i.number)}</TableCell>
                        <TableCell>{i.customerName ?? "نقدی گذری"}</TableCell>
                        <TableCell>{i.sellerName ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{faDate(i.createdAt)}</TableCell>
                        <TableCell className="font-bold tabular-nums">{money(i.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>

              <Pagination page={page} lastPage={sales.data.invoices.meta.lastPage} onChange={setPage} />
            </>
          )}
        </TabsContent>

        {/* ۲ — سود */}
        <TabsContent value="profit" className="space-y-4">
          {profit.isLoading ? <LoadingState /> : profit.isError ? (
            <ErrorState onRetry={() => profit.refetch()} />
          ) : !profit.data?.items.data.length ? (
            <NoData onWiden={widen} />
          ) : (
            <>
              <div className="flex justify-end">
                <ExportButton endpoint="/reports/periodic-profit" params={dates} fileName="سود" />
              </div>

              {/*
                حاشیه‌ی کالا و سودِ مدت جدا نشان داده می‌شوند.
                بدونِ تفکیک معلوم نیست پول از خرید و فروشِ قطعه درمی‌آید یا از
                فروشِ مدت‌دار — و آن دو تصمیم‌های کاملاً متفاوتی می‌سازند.
                «فروش کالا» پایه‌ی درصدِ حاشیه است، نه کلِ فاکتور.
              */}
              <div className="grid gap-4 md:grid-cols-4">
                <SummaryCard label="فروش کالا" value={t(profit.data.summary.goodsRevenue)} />
                <SummaryCard label="بهای تمام‌شده" value={t(profit.data.summary.totalCost)} />
                <SummaryCard label="سود کالا" value={t(profit.data.summary.grossProfit)} tone="success" />
                <SummaryCard label="حاشیه سود کالا" value={`٪${toFa(profit.data.summary.profitMarginPercent)}`} />
              </div>

              {profit.data.summary.financeCharge > 0 && (
                <div className="grid gap-4 md:grid-cols-3">
                  <SummaryCard
                    label="تفاوت فروش مدت‌دار"
                    value={t(profit.data.summary.financeCharge)}
                  />
                  <SummaryCard label="فروش کل" value={t(profit.data.summary.totalRevenue)} />
                  <SummaryCard
                    label="سود کل"
                    value={t(profit.data.summary.totalProfit)}
                    tone="success"
                  />
                </div>
              )}

              {profit.data.costIsApproximate && (
                <p className="rounded-md border-e-4 border-e-amber-600 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
                  سود کل از قیمت خرید <b>لحظه‌ی فروش</b> محاسبه شده و دقیق است. اما تفکیک به‌ازای کالا
                  ناچار از <b>آخرین</b> قیمت خرید استفاده می‌کند، چون لجر قیمت خرید هر ردیف را جدا
                  نگه نمی‌دارد. برای مقایسه‌ی کالاها خوب است، برای حسابداری نه.
                </p>
              )}

              <ScrollTable
                total={{
                  label: "جمع سود این صفحه",
                  value: t(sum(profit.data.items.data.map((i) => i.profit))),
                }}
              >
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                    <TableRow>
                      <TableHead>کالا</TableHead>
                      <TableHead className="text-center">فروش‌رفته</TableHead>
                      <TableHead className="text-start">فروش</TableHead>
                      <TableHead className="text-start">بهای خرید</TableHead>
                      <TableHead className="text-start">سود</TableHead>
                      <TableHead className="text-center">حاشیه</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profit.data.items.data.map((i) => (
                      <TableRow key={i.productId}>
                        <TableCell className="font-medium">
                          <div className="max-w-[22rem] truncate">{i.productName}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">{toFa(i.sku)}</div>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{qty(i.quantitySold)}</TableCell>
                        <TableCell className="tabular-nums">{money(i.totalRevenue)}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{money(i.totalCost)}</TableCell>
                        <TableCell className={`font-bold tabular-nums ${i.profit < 0 ? "text-destructive" : "text-emerald-600"}`}>
                          {money(i.profit)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">٪{toFa(i.marginPercent)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>

              <Pagination page={page} lastPage={profit.data.items.meta.lastPage} onChange={setPage} />
            </>
          )}
        </TabsContent>

        {/* ۳ — سهم دسته‌ی مشتری */}
        <TabsContent value="categories" className="space-y-4">
          {byCategory.isLoading ? <LoadingState /> : byCategory.isError ? (
            <ErrorState onRetry={() => byCategory.refetch()} />
          ) : !byCategory.data?.categories.length ? (
            <NoData onWiden={widen} />
          ) : (
            <>
              <div className="flex justify-end">
                <ExportButton
                  endpoint="/reports/sales-by-category"
                  params={dates}
                  fileName="سهم-دسته-مشتری"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <SummaryCard label="فروش کل" value={t(byCategory.data.summary.totalSales)} />
                <SummaryCard
                  label="فروش دسته‌بندی‌شده"
                  value={t(byCategory.data.summary.categorizedSales)}
                  tone="success"
                />
                <SummaryCard
                  label="فروش بدون دسته"
                  value={t(byCategory.data.summary.uncategorizedSales)}
                  tone={
                    byCategory.data.summary.uncategorizedSales > 0 ? "warning" : "default"
                  }
                />
                <SummaryCard
                  label="پرفروش‌ترین دسته"
                  value={byCategory.data.summary.topCategory?.name ?? "—"}
                />
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">سهم هر دسته از فروش</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={byCategory.data.categories}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        fontSize={12}
                        tickFormatter={(v) => `٪${toFa(Number(v))}`}
                      />
                      <YAxis type="category" dataKey="categoryName" width={110} fontSize={12} />
                      <Tooltip
                        formatter={(v) => [`٪${toFa(Number(v))}`, "سهم از فروش"]}
                        labelFormatter={(l) => `دسته: ${l}`}
                      />
                      <Bar dataKey="sharePercent" radius={[0, 4, 4, 0]}>
                        {byCategory.data.categories.map((c) => (
                          <Cell key={c.categoryId ?? "none"} fill={c.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <ScrollTable
                total={{
                  label: "جمع فروش",
                  value: t(sum(byCategory.data.categories.map((c) => c.totalAmount))),
                }}
              >
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                    <TableRow>
                      <TableHead>دسته</TableHead>
                      <TableHead className="text-center">فاکتور</TableHead>
                      <TableHead className="text-start">فروش</TableHead>
                      <TableHead className="text-start">سود</TableHead>
                      <TableHead>سهم از فروش</TableHead>
                      <TableHead className="text-start">میانگین فاکتور</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCategory.data.categories.map((c) => (
                      <TableRow key={c.categoryId ?? "none"}>
                        <TableCell className="font-bold">
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: c.color }}
                            />
                            {c.categoryName}
                          </span>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {toFa(c.invoiceCount)}
                        </TableCell>
                        <TableCell className="font-bold tabular-nums">
                          {money(c.totalAmount)}
                        </TableCell>
                        <TableCell className="tabular-nums text-emerald-600">
                          {money(c.totalProfit)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, c.sharePercent)}%`,
                                  backgroundColor: c.color,
                                }}
                              />
                            </div>
                            <span className="text-xs tabular-nums">
                              ٪{toFa(c.sharePercent)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {money(c.averageInvoiceAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>
            </>
          )}
        </TabsContent>

        {/* ۴ — بدهکاران */}
        <TabsContent value="debtors" className="space-y-4">
          {debtors.isLoading ? <LoadingState /> : debtors.isError ? (
            <ErrorState onRetry={() => debtors.refetch()} />
          ) : !debtors.data?.debtors.data.length ? (
            <NoData />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-4 text-sm">
                  <span>
                    بدهکاران:{" "}
                    <b className="tabular-nums">{toFa(debtors.data.summary.totalDebtors)}</b> نفر
                  </span>
                  <span>
                    مانده‌ی کل:{" "}
                    <b className="tabular-nums text-amber-600">{t(debtors.data.summary.totalCreditBalance)}</b>
                  </span>
                </div>
                <ExportButton endpoint="/reports/debtors" params={{}} fileName="بدهکاران" />
              </div>

              {/* سن بدهی — تفکیک مانده به جاری / سررسید امروز / معوق */}
              <div className="grid gap-4 md:grid-cols-3">
                <SummaryCard label="جاری (سررسید نرسیده)" value={t(debtors.data.summary.current)} />
                <SummaryCard label="سررسید امروز" value={t(debtors.data.summary.dueToday)} tone="warning" />
                <SummaryCard
                  label="معوق (گذشته از سررسید)"
                  value={t(debtors.data.summary.overdue)}
                  tone={debtors.data.summary.overdue > 0 ? "warning" : "default"}
                />
              </div>

              <ScrollTable
                total={{
                  label: "جمع این صفحه",
                  value: t(sum(debtors.data.debtors.data.map((d) => d.creditBalance))),
                }}
              >
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                    <TableRow>
                      <TableHead>مشتری</TableHead>
                      <TableHead>شماره تماس</TableHead>
                      <TableHead>نزدیک‌ترین سررسید</TableHead>
                      <TableHead className="text-start">معوق</TableHead>
                      <TableHead className="text-start">مانده‌ی بدهی</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {debtors.data.debtors.data.map((d) => (
                      <TableRow key={d.customerId}>
                        <TableCell className="font-bold">{d.customerName}</TableCell>
                        <TableCell className="tabular-nums" dir="ltr">
                          {d.phone ? toFa(d.phone) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.nextDueDate ? faDate(d.nextDueDate) : "—"}
                        </TableCell>
                        {/* معوق ستون جداست، نه یک برچسب کنار مبلغ: مدیر این
                            صفحه را برای پیدا کردن همین ستون باز می‌کند. */}
                        <TableCell className="font-bold tabular-nums">
                          {d.overdue > 0 ? (
                            <span className="text-destructive">{money(d.overdue)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-bold tabular-nums text-amber-600">
                          {money(d.creditBalance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>

              <Pagination page={page} lastPage={debtors.data.debtors.meta.lastPage} onChange={setPage} />
            </>
          )}
        </TabsContent>

        {/* ۴ — چک‌ها */}
        <TabsContent value="cheques" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Select value={chequeStatus} onValueChange={setChequeStatus}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UPCOMING">در جریان (سررسید نشده)</SelectItem>
                <SelectItem value="CASHED">وصول‌شده</SelectItem>
                <SelectItem value="BOUNCED">برگشتی</SelectItem>
              </SelectContent>
            </Select>
            <ExportButton
              endpoint="/reports/cheques"
              params={{ status: chequeStatus }}
              fileName="چک‌ها"
            />
          </div>

          {cheques.isLoading ? <LoadingState /> : cheques.isError ? (
            <ErrorState onRetry={() => cheques.refetch()} />
          ) : !cheques.data?.cheques.data.length ? (
            <NoData />
          ) : (
            <>
              <ScrollTable
                total={{
                  label: "جمع این صفحه",
                  value: t(sum(cheques.data.cheques.data.map((c) => c.amount))),
                }}
              >
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                    <TableRow>
                      <TableHead>شماره چک</TableHead>
                      <TableHead>بانک</TableHead>
                      <TableHead>صاحب چک</TableHead>
                      <TableHead>سررسید</TableHead>
                      <TableHead>وضعیت</TableHead>
                      <TableHead className="text-start">مبلغ</TableHead>
                      {canManage && <TableHead className="text-start">عملیات</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cheques.data.cheques.data.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-bold tabular-nums">{toFa(c.number)}</TableCell>
                        <TableCell>{c.bankName ?? "—"}</TableCell>
                        <TableCell>{c.holderName ?? "—"}</TableCell>
                        <TableCell className="tabular-nums text-xs">{faDate(c.dueDate)}</TableCell>
                        <TableCell>
                          <Badge variant={c.status === "BOUNCED" ? "destructive" : "outline"}>
                            {CHEQUE_STATUS_LABELS[c.status] ?? c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold tabular-nums">{money(c.amount)}</TableCell>

                        {canManage && (
                          <TableCell>
                            {/*
                              فقط عملیاتی که از این وضعیت ممکن است نشان داده
                              می‌شود؛ دکمه‌ی غیرفعال یعنی فروشنده باید حدس بزند
                              چرا کار نمی‌کند. سرور هم همین قواعد را دوباره
                              بررسی می‌کند.
                            */}
                            <div className="flex items-center gap-1">
                              {c.status === "IN_HAND" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  disabled={chequeBusy}
                                  onClick={() => deposit.mutate(c.id)}
                                >
                                  به بانک
                                </Button>
                              )}

                              {c.status !== "CASHED" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700"
                                  disabled={chequeBusy}
                                  onClick={() => {
                                    const extra =
                                      c.status === "BOUNCED"
                                        ? " این چک برگشتی است؛ با وصول، بدهی دوباره کم می‌شود."
                                        : "";
                                    if (
                                      !window.confirm(
                                        `چک ${toFa(c.number)} به مبلغ ${money(c.amount)} وصول شد؟${extra}`
                                      )
                                    )
                                      return;
                                    cash.mutate(c.id);
                                  }}
                                >
                                  وصول شد
                                </Button>
                              )}

                              {(c.status === "IN_HAND" || c.status === "DEPOSITED") && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                  disabled={chequeBusy}
                                  onClick={() => {
                                    const reason = window.prompt(
                                      `چک ${toFa(c.number)} برگشت خورد. بدهی ${money(c.amount)} به حساب مشتری برمی‌گردد.\n\nدلیل (اختیاری):`,
                                      "کسر موجودی"
                                    );
                                    // لغوِ پنجره یعنی «نه» — رشته‌ی خالی یعنی «بدون دلیل».
                                    if (reason === null) return;
                                    bounce.mutate({ id: c.id, reason: reason || undefined });
                                  }}
                                >
                                  برگشت خورد
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>

              <Pagination page={page} lastPage={cheques.data.cheques.meta.lastPage} onChange={setPage} />
            </>
          )}
        </TabsContent>

        {/* ۵ — پرفروش / راکد */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Select value={perfType} onValueChange={setPerfType}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TOP_SELLING">پرفروش‌ترین‌ها</SelectItem>
                <SelectItem value="STAGNANT">راکد (موجودی دارد، فروش ندارد)</SelectItem>
              </SelectContent>
            </Select>
            <ExportButton
              endpoint="/reports/product-performance"
              params={{ ...dates, type: perfType }}
              fileName="عملکرد-کالا"
            />
          </div>

          {products.isLoading ? <LoadingState /> : products.isError ? (
            <ErrorState onRetry={() => products.refetch()} />
          ) : !products.data?.products.data.length ? (
            <NoData onWiden={widen} />
          ) : (
            <>
              <ScrollTable>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                    <TableRow>
                      <TableHead>کالا</TableHead>
                      <TableHead className="text-center">موجودی</TableHead>
                      <TableHead className="text-center">فروش‌رفته</TableHead>
                      <TableHead className="text-start">مبلغ فروش</TableHead>
                      <TableHead>آخرین فروش</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.data.products.data.map((p) => (
                      <TableRow key={p.productId}>
                        <TableCell className="font-medium">
                          <div className="max-w-[22rem] truncate">{p.productName}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">{toFa(p.sku)}</div>
                        </TableCell>
                        <TableCell className="text-center font-bold tabular-nums">{qty(p.currentStock)}</TableCell>
                        <TableCell className="text-center font-bold tabular-nums">{qty(p.quantitySold)}</TableCell>
                        <TableCell className="font-bold tabular-nums">{money(p.totalSalesAmount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.lastSoldAt ? faDate(p.lastSoldAt) : "هیچ‌وقت"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>

              <Pagination page={page} lastPage={products.data.products.meta.lastPage} onChange={setPage} />
            </>
          )}
        </TabsContent>

        {/* ۶ — موجودی زیر حد */}
        <TabsContent value="low-stock" className="space-y-4">
          <div className="flex justify-end">
            <ExportButton endpoint="/reports/low-stock" params={{}} fileName="موجودی-زیر-حد" />
          </div>

          {lowStock.isLoading ? <LoadingState /> : lowStock.isError ? (
            <ErrorState onRetry={() => lowStock.refetch()} />
          ) : !lowStock.data?.items.data.length ? (
            <div className="rounded-xl border border-dashed bg-card p-12 text-center">
              <h3 className="text-base font-bold text-emerald-600">وضعیت موجودی مطلوب است</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                هیچ کالایی زیر حد سفارش نیست.
              </p>
            </div>
          ) : (
            <>
              <ScrollTable>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                    <TableRow>
                      <TableHead>کالا</TableHead>
                      <TableHead className="text-center">موجودی فعلی</TableHead>
                      <TableHead className="text-center">حد سفارش</TableHead>
                      <TableHead className="text-center">کسری</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStock.data.items.data.map((i) => (
                      <TableRow key={i.productId}>
                        <TableCell className="font-medium">
                          <div className="max-w-[24rem] truncate">{i.productName}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">{toFa(i.sku)}</div>
                        </TableCell>
                        <TableCell className="text-center font-bold tabular-nums text-destructive">
                          {qty(i.currentStock)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{qty(i.minStock)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="tabular-nums">{qty(i.shortage)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>

              <Pagination page={page} lastPage={lowStock.data.items.meta.lastPage} onChange={setPage} />
            </>
          )}
        </TabsContent>

        {/* ۷ — فروشندگان */}
        <TabsContent value="sellers" className="space-y-4">
          <div className="flex justify-end">
            <ExportButton endpoint="/reports/seller-performance" params={dates} fileName="فروشندگان" />
          </div>

          {sellers.isLoading ? <LoadingState /> : sellers.isError ? (
            <ErrorState onRetry={() => sellers.refetch()} />
          ) : !sellers.data?.sellers.data.length ? (
            <NoData onWiden={widen} />
          ) : (
            <ScrollTable
              total={{
                label: "جمع فروش",
                value: t(sum(sellers.data.sellers.data.map((s) => s.totalSalesAmount))),
              }}
            >
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                  <TableRow>
                    <TableHead>فروشنده</TableHead>
                    <TableHead className="text-center">فاکتور</TableHead>
                    <TableHead className="text-start">فروش کل</TableHead>
                    <TableHead className="text-start">سود</TableHead>
                    <TableHead className="text-start">میانگین فاکتور</TableHead>
                    <TableHead className="text-start">مرجوعی</TableHead>
                    <TableHead className="text-center">باطل‌شده</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellers.data.sellers.data.map((s) => (
                    <TableRow key={s.sellerId}>
                      <TableCell className="font-bold">{s.sellerName}</TableCell>
                      <TableCell className="text-center tabular-nums">{toFa(s.totalInvoices)}</TableCell>
                      <TableCell className="font-bold tabular-nums">{money(s.totalSalesAmount)}</TableCell>
                      <TableCell className="tabular-nums text-emerald-600">{money(s.totalProfit)}</TableCell>
                      <TableCell className="tabular-nums">{money(s.averageInvoiceAmount)}</TableCell>
                      <TableCell className="tabular-nums text-amber-600">
                        {s.returnsAmount > 0 ? money(s.returnsAmount) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={s.cancelledInvoicesCount > 0 ? "destructive" : "secondary"}>
                          {toFa(s.cancelledInvoicesCount)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollTable>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
