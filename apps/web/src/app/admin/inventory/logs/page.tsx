"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Filter, X } from "lucide-react";

import { getInventoryLogs, getLocations } from "@/lib/api";
import { ProductPicker } from "@/components/product-picker";
import type {
  InventoryAction,
  InventoryLogsQuery,
  Location,
} from "@/lib/types";
import { useAuthStore } from "@/lib/auth-store";
import { useToast } from "@/hooks/use-toast";
import {
  formatDateTime,
  formatNumber,
  ACTION_LABELS,
  ACTION_BADGE_CLASS,
} from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import {
  LoadingState,
  EmptyState,
  ErrorState,
} from "@/components/states";
import { DataTablePagination } from "@/components/data-table-pagination";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ALLOWED: Array<"ADMIN" | "MANAGER"> = ["ADMIN", "MANAGER"];
const PAGE_SIZE = 25;

const ACTION_OPTIONS: InventoryAction[] = [
  "IN",
  "OUT",
  "TRANSFER",
  "ADJUST",
  "SALE",
  "RETURN",
  "COUNT",
];

// تبدیل تاریخ input[type=date] (YYYY-MM-DD) به ISO برای ارسال به بک‌اند
function toIsoStart(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}
function toIsoEnd(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T23:59:59`);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export default function InventoryLogsPage() {
  const hasRole = useAuthStore((s) => s.hasRole);
  const canView = hasRole(...ALLOWED);
  const { toast } = useToast();

  // فیلترهای فرم (ورودی کاربر)
  const [action, setAction] = React.useState<string>("ALL");
  const [productId, setProductId] = React.useState<string>("ALL");
  const [locationId, setLocationId] = React.useState<string>("ALL");
  const [fromDate, setFromDate] = React.useState<string>("");
  const [toDate, setToDate] = React.useState<string>("");
  const [page, setPage] = React.useState(1);

  // فیلترهای اعمال‌شده (که به query رفته‌اند)
  const [applied, setApplied] = React.useState<InventoryLogsQuery>({
    page: 1,
    limit: PAGE_SIZE,
  });

  // بارگذاری گزینه‌های فیلتر — طبق بخش ۶.۳ و ۶.۶
  // (محصول دیگر اینجا بارگذاری نمی‌شود؛ ProductPicker خودش از سرور جست‌وجو می‌کند.)
  const locationsQ = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => getLocations(),
  });

  // طبق بخش ۶.۷ — GET /inventory/logs (پاسخ کلید items دارد)
  const logsQ = useQuery({
    queryKey: ["inventory", "logs", applied],
    queryFn: () => getInventoryLogs(applied),
    enabled: canView,
  });

  const applyFilters = () => {
    const next: InventoryLogsQuery = {
      page: 1,
      limit: PAGE_SIZE,
    };
    if (action !== "ALL") next.action = action as InventoryAction;
    if (productId !== "ALL") next.productId = productId;
    if (locationId !== "ALL") next.locationId = locationId;
    const from = toIsoStart(fromDate);
    const to = toIsoEnd(toDate);
    if (from) next.from = from;
    if (to) next.to = to;
    setApplied(next);
    setPage(1);
    toast({
      title: "فیلتر اعمال شد",
      description: "نتیجه با فیلترهای انتخابی به‌روزرسانی شد.",
    });
  };

  const clearFilters = () => {
    setAction("ALL");
    setProductId("ALL");
    setLocationId("ALL");
    setFromDate("");
    setToDate("");
    setApplied({ page: 1, limit: PAGE_SIZE });
    setPage(1);
  };

  // وقتی صفحه عوض می‌شود، applied را با صفحه جدید به‌روزرسانی می‌کنیم
  React.useEffect(() => {
    setApplied((prev) => ({ ...prev, page }));
  }, [page]);

  const total = logsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (logsQ.data?.limit ?? PAGE_SIZE)));
  const items = logsQ.data?.items ?? [];

  if (!canView) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="لاگ‌های موجودی"
          description="تاریخچه تراکنش‌های انبار"
          icon={ClipboardList}
        />
        <Alert variant="destructive">
          <AlertTitle>دسترسی غیرمجاز</AlertTitle>
          <AlertDescription>
            مشاهده لاگ‌ها فقط برای مدیر کل و مدیر مجاز است.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="لاگ‌های موجودی"
        description="تاریخچه ورود، خروج، انتقال و شمارش‌های انبار"
        icon={ClipboardList}
      />

      {/* نوار فیلتر */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4 text-accent" />
            فیلترها
          </CardTitle>
          <CardDescription>
            حداقل یکی از فیلدها را پر کنید و سپس «اعمال فیلتر» را بزنید.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-action">نوع عملیات</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger id="f-action" className="w-full">
                  <SelectValue placeholder="همه عملیات‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">همه عملیات‌ها</SelectItem>
                  {ACTION_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACTION_LABELS[a] ?? a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-product">محصول</Label>
              {/*
                فهرست کشویی جای خود را به جست‌وجوی سمت سرور داد: اندپوینت
                محصولات صفحه‌بندی‌شده است و این فهرست فقط ۵۰ کالای اول را
                داشت — یعنی فیلتر برای بقیه‌ی کاتالوگ بی‌اثر بود.
              */}
              <ProductPicker
                id="f-product"
                value={productId === "ALL" ? null : productId}
                onChange={(id) => setProductId(id ?? "ALL")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-location">موقعیت</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger id="f-location" className="w-full">
                  <SelectValue placeholder="همه موقعیت‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">همه موقعیت‌ها</SelectItem>
                  {(locationsQ.data ?? []).map((l: Location) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                      {l.code ? ` — ${l.code}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-from">از تاریخ</Label>
              <Input
                id="f-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-to">تا تاریخ</Label>
              <Input
                id="f-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button type="button" onClick={applyFilters} className="flex-1">
                <Filter className="h-4 w-4" />
                اعمال فیلتر
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={clearFilters}
                title="پاک کردن فیلترها"
              >
                <X className="h-4 w-4" />
                پاک‌سازی
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* جدول لاگ‌ها */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">تراکنش‌ها</CardTitle>
          <CardDescription>
            مجموع{" "}
            <Badge variant="secondary" className="ms-1">
              {formatNumber(total)}
            </Badge>{" "}
            لاگ
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsQ.isLoading ? (
            <LoadingState label="در حال بارگذاری لاگ‌ها..." />
          ) : logsQ.isError ? (
            <ErrorState
              message="بارگذاری لاگ‌ها ناموفق بود."
              onRetry={() => logsQ.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="لاگی یافت نشد"
              description="هیچ تراکنشی با این فیلترها پیدا نشد."
              icon={ClipboardList}
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="min-w-[180px]">محصول</TableHead>
                      <TableHead>موقعیت</TableHead>
                      <TableHead>عملیات</TableHead>
                      <TableHead className="text-end">تعداد</TableHead>
                      <TableHead className="min-w-[160px]">یادداشت</TableHead>
                      <TableHead>کاربر</TableHead>
                      <TableHead className="min-w-[140px]">تاریخ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {log.product?.name ?? "محصول حذف‌شده"}
                            </span>
                            {log.product?.sku ? (
                              <span className="text-xs text-muted-foreground">
                                {log.product.sku}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{log.location?.name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              ACTION_BADGE_CLASS[log.action] ?? ""
                            }
                          >
                            {ACTION_LABELS[log.action] ?? log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end font-medium">
                          {formatNumber(log.quantity)}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground">
                          {log.note ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {log.user?.fullName ??
                            log.user?.username ??
                            "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <DataTablePagination
                page={applied.page ?? 1}
                totalPages={totalPages}
                onChange={(p) => setPage(p)}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
