"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  PackagePlus,
  PackageMinus,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Printer,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { LabelPrintDialog } from "@/components/labels/label-print-dialog";

import {
  getCurrentStock,
  getLocations,
  stockIn,
  stockOut,
} from "@/lib/api";
import type { InventoryOperationDto } from "@/lib/types";
import { ApiException } from "@/lib/api-error-messages";
import { useAuthStore } from "@/lib/auth-store";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import {
  LoadingState,
  EmptyState,
  ErrorState,
} from "@/components/states";
import { ProductSearchSelect } from "@/components/product-search-select";
import { DataTablePagination } from "@/components/data-table-pagination";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Textarea } from "@/components/ui/textarea";
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

const PAGE_SIZE = 20;
const ALLOWED: Array<"ADMIN" | "MANAGER" | "STAFF"> = [
  "ADMIN",
  "MANAGER",
  "STAFF",
];

/** داخلِ صفحه‌ی «موجودی» سرتیترِ خودش را نشان نمی‌دهد. */
export function InventoryPanel({ embedded }: { embedded?: boolean } = {}) {
  const hasRole = useAuthStore((s) => s.hasRole);
  const canManage = hasRole(...ALLOWED);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact={embedded}
        title="موجودی انبار"
        description="مشاهده موجودی فعلی و ثبت ورود/خروج دستی"
        icon={Boxes}
      />

      <Tabs defaultValue="stock" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="stock">موجودی فعلی</TabsTrigger>
          <TabsTrigger value="manual">ورود/خروج دستی</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <CurrentStockTab />
        </TabsContent>

        <TabsContent value="manual">
          {canManage ? (
            <ManualOperationTab />
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>دسترسی غیرمجاز</AlertTitle>
              <AlertDescription>
                ثبت ورود/خروج فقط برای مدیر کل، مدیر و کاربر مجاز است.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ----- تب موجودی فعلی -----
function CurrentStockTab() {
  const [page, setPage] = React.useState(1);
  // طبق بخش ۶.۷ — GET /inventory/current-stock?page=&limit= (پاسخ { data, meta })
  const stockQ = useQuery({
    queryKey: ["inventory", "current-stock", page, PAGE_SIZE],
    queryFn: () => getCurrentStock(page, PAGE_SIZE),
  });

  const meta = stockQ.data?.meta;
  const rows = stockQ.data?.data ?? [];
  const totalPages = meta?.totalPages ?? 1;

  // انتخاب ردیف‌ها برای چاپ لیبل (کلید = productId-locationId)
  const [selected, setSelected] = React.useState<
    Map<string, { productId: string; quantity: number }>
  >(new Map());
  const rowKey = (r: (typeof rows)[number]) => `${r.productId}-${r.locationId}`;
  const toggleRow = (r: (typeof rows)[number]) =>
    setSelected((prev) => {
      const n = new Map(prev);
      const k = rowKey(r);
      if (n.has(k)) n.delete(k);
      else n.set(k, { productId: r.productId, quantity: r.quantity });
      return n;
    });
  const visibleKeys = rows.map(rowKey);
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));
  const someSelected = !allSelected && visibleKeys.some((k) => selected.has(k));
  const toggleAll = (checked: boolean) =>
    setSelected((prev) => {
      const n = new Map(prev);
      for (const r of rows) {
        if (checked) n.set(rowKey(r), { productId: r.productId, quantity: r.quantity });
        else n.delete(rowKey(r));
      }
      return n;
    });

  // دیالوگ چاپ: یا آیتم‌های انتخابی، یا کل موجودی
  const [printOpen, setPrintOpen] = React.useState(false);
  const [printItems, setPrintItems] = React.useState<
    { productId: string; quantity: number }[]
  >([]);
  const [printAll, setPrintAll] = React.useState(false);

  const openSelectedPrint = () => {
    setPrintAll(false);
    setPrintItems(Array.from(selected.values()));
    setPrintOpen(true);
  };
  const openRowPrint = (r: (typeof rows)[number]) => {
    setPrintAll(false);
    setPrintItems([{ productId: r.productId, quantity: r.quantity }]);
    setPrintOpen(true);
  };
  const openAllPrint = () => {
    setPrintItems([]);
    setPrintAll(true);
    setPrintOpen(true);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">لیست موجودی</CardTitle>
          <CardDescription>
            مجموع{" "}
            <Badge variant="secondary" className="ms-1">
              {formatNumber(meta?.total ?? 0)}
            </Badge>{" "}
            رکورد
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 ? (
            <Button size="sm" onClick={openSelectedPrint}>
              <Printer className="h-4 w-4" />
              چاپ لیبل ({formatNumber(selected.size)})
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={openAllPrint}>
            <Printer className="h-4 w-4" />
            چاپ لیبل کل موجودی
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {stockQ.isLoading ? (
          <LoadingState label="در حال بارگذاری موجودی..." />
        ) : stockQ.isError ? (
          <ErrorState
            message="بارگذاری موجودی ناموفق بود."
            onRetry={() => stockQ.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="موجودی‌ای ثبت نشده"
            description="هنوز هیچ رکورد موجودی در سیستم وجود ندارد."
            icon={Boxes}
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={(v) => toggleAll(Boolean(v))}
                        aria-label="انتخاب همه"
                      />
                    </TableHead>
                    <TableHead className="w-[38%]">محصول</TableHead>
                    <TableHead>موقعیت</TableHead>
                    <TableHead className="text-end">تعداد</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`${row.productId}-${row.locationId}`}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(`${row.productId}-${row.locationId}`)}
                          onCheckedChange={() => toggleRow(row)}
                          aria-label="انتخاب ردیف"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="truncate">
                            {row.product?.name ?? "محصول حذف‌شده"}
                          </span>
                          {row.product?.sku ? (
                            <span className="text-xs text-muted-foreground">
                              {row.product.sku}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{row.location?.name ?? "—"}</span>
                          {row.location?.code ? (
                            <span className="text-xs text-muted-foreground">
                              کد: {row.location.code}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-end">
                        <span
                          dir="ltr"
                          className={`inline-block text-3xl font-bold tabular-nums tracking-tight ${
                            row.quantity > 0
                              ? "text-foreground"
                              : "text-muted-foreground/60"
                          }`}
                        >
                          {formatNumber(row.quantity)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {row.quantity > 0 ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-9"
                            title="چاپ لیبل به تعداد موجودی"
                            onClick={() => openRowPrint(row)}
                          >
                            <Printer className="size-5" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DataTablePagination
              page={page}
              totalPages={totalPages}
              onChange={(p) => setPage(p)}
            />
          </>
        )}
      </CardContent>

      <LabelPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        mode="product"
        ids={printItems.map((i) => i.productId)}
        items={printAll ? undefined : printItems}
        allStock={printAll}
      />
    </Card>
  );
}

// ----- تب ورود/خروج دستی -----
function ManualOperationTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [productId, setProductId] = React.useState<string>("");
  const [productLabel, setProductLabel] = React.useState("");
  const [locationId, setLocationId] = React.useState<string>("");
  const [quantity, setQuantity] = React.useState<string>("");
  const [note, setNote] = React.useState<string>("");
  const [formError, setFormError] = React.useState<string | null>(null);

  // بارگذاری موقعیت‌ها — طبق بخش ۶.۶ — GET /locations
  const locationsQ = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => getLocations(),
  });

  const resetForm = () => {
    setProductId("");
    setProductLabel("");
    setLocationId("");
    setQuantity("");
    setNote("");
    setFormError(null);
  };

  // طبق بخش ۶.۷ — POST /inventory (IN) و POST /inventory/out (OUT)
  const inMut = useMutation({
    mutationFn: (dto: InventoryOperationDto) => stockIn(dto),
    onSuccess: () => {
      toast({
        title: "ورود ثبت شد",
        description: `${formatNumber(Number(quantity))} عدد به موجودی اضافه شد.`,
      });
      queryClient.invalidateQueries({
        queryKey: ["inventory", "current-stock"],
      });
      queryClient.invalidateQueries({ queryKey: ["inventory", "logs"] });
      resetForm();
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiException
          ? e.message
          : "ثبت ورود ناموفق بود. دوباره تلاش کنید.";
      toast({
        title: "خطا",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const outMut = useMutation({
    mutationFn: (dto: InventoryOperationDto) => stockOut(dto),
    onSuccess: () => {
      toast({
        title: "خروج ثبت شد",
        description: `${formatNumber(Number(quantity))} عدد از موجودی کسر شد.`,
      });
      queryClient.invalidateQueries({
        queryKey: ["inventory", "current-stock"],
      });
      queryClient.invalidateQueries({ queryKey: ["inventory", "logs"] });
      resetForm();
    },
    onError: (e: unknown) => {
      // INSUFFICIENT_STOCK با available برمی‌گردد — پیام فارسی شامل موجودی فعلی است
      const msg =
        e instanceof ApiException
          ? e.message
          : "ثبت خروج ناموفق بود. دوباره تلاش کنید.";
      toast({
        title: "خطا",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const validate = (): InventoryOperationDto | null => {
    if (!productId) {
      setFormError("محصول را انتخاب کنید.");
      return null;
    }
    if (!locationId) {
      setFormError("موقعیت را انتخاب کنید.");
      return null;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError("تعداد باید عددی بزرگتر از صفر باشد.");
      return null;
    }
    setFormError(null);
    return {
      productId,
      locationId,
      quantity: qty,
      note: note.trim() || undefined,
    };
  };

  const handleIn = () => {
    const dto = validate();
    if (dto) inMut.mutate(dto);
  };
  const handleOut = () => {
    const dto = validate();
    if (dto) outMut.mutate(dto);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">ثبت ورود/خروج دستی</CardTitle>
        <CardDescription>
          محصول و موقعیت را انتخاب کنید و سپس تعداد را وارد کنید.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="product">محصول</Label>
            <ProductSearchSelect
              value={productId}
              onChange={(p) => {
                setProductId(p?.id ?? "");
                setProductLabel(p?.name ?? "");
              }}
              placeholder="انتخاب محصول..."
            />
            {productId ? (
              <span className="text-xs text-muted-foreground">
                انتخاب‌شده: {productLabel || productId}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="location">موقعیت</Label>
            <Select
              value={locationId}
              onValueChange={(v) => setLocationId(v)}
              disabled={locationsQ.isLoading}
            >
              <SelectTrigger id="location" className="w-full">
                <SelectValue
                  placeholder={
                    locationsQ.isLoading
                      ? "در حال بارگذاری..."
                      : "انتخاب موقعیت"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {locationsQ.isLoading ? (
                  <SelectItem value="__loading" disabled>
                    در حال بارگذاری...
                  </SelectItem>
                ) : locationsQ.isError ? (
                  <SelectItem value="__error" disabled>
                    خطا در بارگذاری موقعیت‌ها
                  </SelectItem>
                ) : (locationsQ.data ?? []).length === 0 ? (
                  <SelectItem value="__empty" disabled>
                    موقعیتی ثبت نشده
                  </SelectItem>
                ) : (
                  (locationsQ.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                      {l.code ? ` — ${l.code}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="qty">تعداد</Label>
            <Input
              id="qty"
              type="number"
              min={1}
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="مثال: 10"
            />
          </div>

          <div className="flex flex-col gap-2 md:col-span-1">
            <Label htmlFor="note">یادداشت (اختیاری)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="توضیح کوتاه..."
              maxLength={200}
            />
          </div>
        </div>

        {formError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={handleIn}
            disabled={inMut.isPending || outMut.isPending}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {inMut.isPending ? (
              <ArrowDownToLine className="h-4 w-4 animate-pulse" />
            ) : (
              <PackagePlus className="h-4 w-4" />
            )}
            {inMut.isPending ? "در حال ثبت..." : "ثبت ورود"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleOut}
            disabled={inMut.isPending || outMut.isPending}
          >
            {outMut.isPending ? (
              <ArrowUpFromLine className="h-4 w-4 animate-pulse" />
            ) : (
              <PackageMinus className="h-4 w-4" />
            )}
            {outMut.isPending ? "در حال ثبت..." : "ثبت خروج"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={resetForm}
            disabled={inMut.isPending || outMut.isPending}
          >
            پاک کردن فرم
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

