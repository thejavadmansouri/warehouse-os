"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowRightLeft,
  AlertCircle,
  History,
} from "lucide-react";

import { getInventoryLogs, getLocations, transferStock } from "@/lib/api";
import type { InventoryTransferDto } from "@/lib/types";
import { ApiException } from "@/lib/api-error-messages";
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
import { ProductSearchSelect } from "@/components/product-search-select";
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

const ALLOWED: Array<"ADMIN" | "MANAGER" | "STAFF"> = [
  "ADMIN",
  "MANAGER",
  "STAFF",
];

/** داخلِ صفحه‌ی «موجودی» سرتیترِ خودش را نشان نمی‌دهد. */
export function InventoryTransferPanel({ embedded }: { embedded?: boolean } = {}) {
  const hasRole = useAuthStore((s) => s.hasRole);
  const canManage = hasRole(...ALLOWED);

  if (!canManage) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          compact={embedded}
          title="انتقال بین قفسه‌ها"
          description="جابجایی موجودی بین موقعیت‌ها"
          icon={ArrowLeftRight}
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>دسترسی غیرمجاز</AlertTitle>
          <AlertDescription>
            انتقال موجودی فقط برای مدیر کل، مدیر و کاربر مجاز است.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact={embedded}
        title="انتقال بین قفسه‌ها"
        description="جابجایی موجودی از یک موقعیت به موقعیت دیگر"
        icon={ArrowLeftRight}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <TransferForm />
        </div>
        <div className="lg:col-span-3">
          <RecentTransfers />
        </div>
      </div>
    </div>
  );
}

// ----- فرم انتقال -----
function TransferForm() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [productId, setProductId] = React.useState<string>("");
  const [productLabel, setProductLabel] = React.useState<string>("");
  const [fromLocationId, setFromLocationId] = React.useState<string>("");
  const [toLocationId, setToLocationId] = React.useState<string>("");
  const [quantity, setQuantity] = React.useState<string>("");
  const [formError, setFormError] = React.useState<string | null>(null);

  // بارگذاری موقعیت‌ها — طبق بخش ۶.۶ — GET /locations
  const locationsQ = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => getLocations(),
  });

  const resetForm = () => {
    setProductId("");
    setProductLabel("");
    setFromLocationId("");
    setToLocationId("");
    setQuantity("");
    setFormError(null);
  };

  // طبق بخش ۶.۷ — POST /inventory-transfer
  const transferMut = useMutation({
    mutationFn: (dto: InventoryTransferDto) => transferStock(dto),
    onSuccess: () => {
      toast({
        title: "انتقال ثبت شد",
        description: `${formatNumber(Number(quantity))} عدد با موفقیت منتقل شد.`,
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
          : "انتقال ناموفق بود. دوباره تلاش کنید.";
      toast({
        title: "خطا",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!productId) {
      setFormError("محصول را انتخاب کنید.");
      return;
    }
    if (!fromLocationId) {
      setFormError("موقعیت مبدأ را انتخاب کنید.");
      return;
    }
    if (!toLocationId) {
      setFormError("موقعیت مقصد را انتخاب کنید.");
      return;
    }
    if (fromLocationId === toLocationId) {
      setFormError("موقعیت مبدأ و مقصد نمی‌توانند یکسان باشند.");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError("تعداد باید عددی بزرگتر از صفر باشد.");
      return;
    }
    setFormError(null);
    transferMut.mutate({
      productId,
      fromLocationId,
      toLocationId,
      quantity: qty,
    });
  };

  const locationOptions = locationsQ.data ?? [];

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowRightLeft className="h-4 w-4 text-accent" />
          فرم انتقال
        </CardTitle>
        <CardDescription>
          محصول، مبدأ، مقصد و تعداد را وارد کنید.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="t-product">محصول</Label>
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="t-from">موقعیت مبدأ</Label>
          <Select
            value={fromLocationId}
            onValueChange={(v) => setFromLocationId(v)}
            disabled={locationsQ.isLoading}
          >
            <SelectTrigger id="t-from" className="w-full">
              <SelectValue
                placeholder={
                  locationsQ.isLoading
                    ? "در حال بارگذاری..."
                    : "انتخاب مبدأ"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {locationOptions
                .filter((l) => l.id !== toLocationId)
                .map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                    {l.code ? ` — ${l.code}` : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="t-to">موقعیت مقصد</Label>
          <Select
            value={toLocationId}
            onValueChange={(v) => setToLocationId(v)}
            disabled={locationsQ.isLoading}
          >
            <SelectTrigger id="t-to" className="w-full">
              <SelectValue
                placeholder={
                  locationsQ.isLoading
                    ? "در حال بارگذاری..."
                    : "انتخاب مقصد"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {locationOptions
                .filter((l) => l.id !== fromLocationId)
                .map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                    {l.code ? ` — ${l.code}` : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {fromLocationId && toLocationId ? (
            <span className="text-xs text-emerald-600">
              از «{locationOptions.find((l) => l.id === fromLocationId)?.name ?? "—"}»
              {" "}به{" "}
              «{locationOptions.find((l) => l.id === toLocationId)?.name ?? "—"}»
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="t-qty">تعداد</Label>
          <Input
            id="t-qty"
            type="number"
            min={1}
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="مثال: 5"
          />
        </div>

        {formError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={transferMut.isPending}
          >
            <ArrowLeftRight className="h-4 w-4" />
            {transferMut.isPending ? "در حال انتقال..." : "انتقال"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={resetForm}
            disabled={transferMut.isPending}
          >
            پاک کردن
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ----- آخرین انتقال‌ها -----
function RecentTransfers() {
  // طبق بخش ۶.۷ — GET /inventory/logs?action=TRANSFER
  const q = useQuery({
    queryKey: ["inventory", "logs", { action: "TRANSFER", limit: 10 }],
    queryFn: () =>
      getInventoryLogs({ action: "TRANSFER", limit: 10 }),
    refetchInterval: 30_000,
  });

  const items = q.data?.items ?? [];

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-accent" />
          آخرین انتقال‌ها
        </CardTitle>
        <CardDescription>
          ۱۰ تراکنش اختی از نوع «انتقال»
        </CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <LoadingState label="در حال بارگذاری..." />
        ) : q.isError ? (
          <ErrorState
            message="بارگذاری انتقال‌های اخیر ناموفق بود."
            onRetry={() => q.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="انتقالی ثبت نشده"
            description="هنوز هیچ انتقالی انجام نشده است."
            icon={ArrowLeftRight}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>محصول</TableHead>
                  <TableHead>موقعیت</TableHead>
                  <TableHead>عملیات</TableHead>
                  <TableHead className="text-end">تعداد</TableHead>
                  <TableHead>تاریخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span className="truncate">
                          {log.product?.name ?? "محصول حذف‌شده"}
                        </span>
                        {log.product?.sku ? (
                          <span className="text-xs text-muted-foreground">
                            {log.product.sku}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.location?.name ?? "—"}
                    </TableCell>
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
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function InventoryTransferPage() {
  return <InventoryTransferPanel />;
}
