"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  getChequesReport,
  getDebtors,
  getLowStock,
  getPeriodicProfit,
  getPeriodicSales,
  getProductPerformance,
  getSellerPerformance,
} from "@/lib/api";
import { faDate, money, qty, toFa } from "@/lib/format";

import {
  CHART_COLOR,
  ExportButton,
  NoData,
  Pagination,
  PRESETS,
  presetDates,
  StickyTotal,
  SummaryCard,
  faDayLabel,
  sum,
  t,
  type PresetRange,
} from "./_components/shared";

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
  const [tab, setTab] = React.useState("sales");
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
    enabled: tab === "sales",
  });
  const profit = useQuery({
    queryKey: ["rep", "profit", dates, page],
    queryFn: () => getPeriodicProfit({ ...dates, page, limit }),
    enabled: tab === "profit",
  });
  const debtors = useQuery({
    queryKey: ["rep", "debtors", page],
    queryFn: () => getDebtors({ page, limit }),
    enabled: tab === "debtors",
  });
  const cheques = useQuery({
    queryKey: ["rep", "cheques", chequeStatus, page],
    queryFn: () => getChequesReport({ status: chequeStatus, page, limit }),
    enabled: tab === "cheques",
  });
  const products = useQuery({
    queryKey: ["rep", "products", perfType, dates, page],
    queryFn: () => getProductPerformance({ ...dates, type: perfType, page, limit }),
    enabled: tab === "products",
  });
  const lowStock = useQuery({
    queryKey: ["rep", "low-stock", page],
    queryFn: () => getLowStock({ page, limit }),
    enabled: tab === "low-stock",
  });
  const sellers = useQuery({
    queryKey: ["rep", "sellers", dates, page],
    queryFn: () => getSellerPerformance({ ...dates, page, limit }),
    enabled: tab === "sellers",
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
        <TabsList className="grid h-auto grid-cols-2 gap-1 p-1 md:grid-cols-4 lg:grid-cols-7">
          <TabsTrigger value="sales" className="py-2 text-xs">فروش</TabsTrigger>
          <TabsTrigger value="profit" className="py-2 text-xs">سود</TabsTrigger>
          <TabsTrigger value="debtors" className="py-2 text-xs">بدهکاران</TabsTrigger>
          <TabsTrigger value="cheques" className="py-2 text-xs">چک‌ها</TabsTrigger>
          <TabsTrigger value="products" className="py-2 text-xs">پرفروش/راکد</TabsTrigger>
          <TabsTrigger value="low-stock" className="py-2 text-xs">موجودی زیر حد</TabsTrigger>
          <TabsTrigger value="sellers" className="py-2 text-xs">فروشندگان</TabsTrigger>
        </TabsList>

        {/* ۱ — فروش دوره‌ای */}
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
                <SummaryCard label="مبلغ کل فروش" value={t(sales.data.summary.totalAmount)} />
                <SummaryCard label="تعداد فاکتور" value={toFa(sales.data.summary.invoiceCount)} />
                <SummaryCard label="میانگین هر فاکتور" value={t(sales.data.summary.averageInvoiceAmount)} />
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

              <div className="grid gap-4 md:grid-cols-4">
                <SummaryCard label="فروش کل" value={t(profit.data.summary.totalRevenue)} />
                <SummaryCard label="بهای تمام‌شده" value={t(profit.data.summary.totalCost)} />
                <SummaryCard label="سود ناخالص" value={t(profit.data.summary.grossProfit)} tone="success" />
                <SummaryCard label="حاشیه سود" value={`٪${toFa(profit.data.summary.profitMarginPercent)}`} />
              </div>

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

        {/* ۳ — بدهکاران */}
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
                      <TableHead>آخرین فاکتور</TableHead>
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
                        <TableCell className="text-xs text-muted-foreground">{faDate(d.lastInvoiceAt)}</TableCell>
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
