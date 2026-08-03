"use client";

// کامپوننت مشترک پیش‌نمایش و چاپ لیبل — طبق بخش الف سند افزونه
// دو حالت دارد: mode="location" (لیبل قفسه/موقعیت) و mode="product" (لیبل کالا).
// همیشه آرایه‌ی ids می‌گیرد — حتی برای یک آیتم.
// اگر آرایه یک آیتم داشته باشد، endpoint تک‌آیتمی صدا زده می‌شود؛
// اگر بیش از یک آیتم باشد، endpoint bulk صدا زده می‌شود.
// چاپ با window.print() انجام می‌شود — هیچ کتابخانه‌ی PDF استفاده نمی‌شود.

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, QrCode, Loader2, Package, MapPin } from "lucide-react";

// طبق بخش الف سند افزونه — endpointهای لیبل
import {
  getLocationLabel,
  getProductLabel,
  bulkLocationLabels,
  bulkProductLabels,
  printProductLabelsPdf,
  printAllStockLabelsPdf,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import type { LocationLabel, ProductLabel } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type LabelMode = "location" | "product";

// پیش‌تنظیمات سایز لیبل — متغیر CSS روی کارت اعمال می‌شود
const SIZE_PRESETS = [
  { value: "5x3", label: "۵ × ۳ سانتی‌متر", w: "5cm", h: "3cm", qr: "1.7cm" },
  { value: "4x2", label: "۴ × ۲ سانتی‌متر", w: "4cm", h: "2cm", qr: "1.1cm" },
  { value: "6x4", label: "۶ × ۴ سانتی‌متر", w: "6cm", h: "4cm", qr: "2.5cm" },
] as const;

type SizePreset = (typeof SIZE_PRESETS)[number];

// کارت لیبل موقعیت — طبق بخش الف:
// بالای QR: pathText (کوچک) → QR → barcode (متن مونواسپیس) → name
function LocationLabelCard({
  label,
  preset,
}: {
  label: LocationLabel;
  preset: SizePreset;
}) {
  return (
    <div
      className="label-card flex flex-col items-center justify-between rounded border border-black/25 bg-white p-1.5 text-center"
      style={{ width: preset.w, height: preset.h }}
    >
      {label.pathText ? (
        <p
          className="line-clamp-2 text-[7px] leading-tight text-gray-700"
          dir="rtl"
        >
          {label.pathText}
        </p>
      ) : null}
      <img
        src={label.qrCode}
        alt="QR"
        style={{ width: preset.qr, height: preset.qr }}
        className="object-contain"
      />
      <p
        className="font-mono text-[8px] leading-tight text-gray-800"
        dir="ltr"
      >
        {label.barcode}
      </p>
      <p
        className="line-clamp-1 text-[8px] font-bold leading-tight text-black"
        dir="rtl"
      >
        {label.name}
      </p>
    </div>
  );
}

// کارت لیبل محصول — طبق بخش الف:
// name → brandName/vehicleModelName → QR → sku + barcode (متن مونواسپیس)
function ProductLabelCard({
  label,
  preset,
}: {
  label: ProductLabel;
  preset: SizePreset;
}) {
  const subline = [label.brandName, label.vehicleModelName]
    .filter(Boolean)
    .join(" — ");
  return (
    <div
      className="label-card flex flex-col items-center justify-between rounded border border-black/25 bg-white p-1.5 text-center"
      style={{ width: preset.w, height: preset.h }}
    >
      <div className="flex w-full flex-col items-center">
        <p
          className="line-clamp-1 text-[8px] font-bold leading-tight text-black"
          dir="rtl"
        >
          {label.name}
        </p>
        {subline ? (
          <p
            className="line-clamp-1 text-[7px] leading-tight text-gray-700"
            dir="rtl"
          >
            {subline}
          </p>
        ) : null}
      </div>
      <img
        src={label.qrCode}
        alt="QR"
        style={{ width: preset.qr, height: preset.qr }}
        className="object-contain"
      />
      <div className="flex w-full flex-col items-center">
        <p
          className="font-mono text-[8px] leading-tight text-gray-800"
          dir="ltr"
        >
          {label.sku}
        </p>
        <p
          className="font-mono text-[7px] leading-tight text-gray-600"
          dir="ltr"
        >
          {label.barcode}
        </p>
      </div>
    </div>
  );
}

// اندازه‌های لیبل محصول (میلی‌متر) — با PDF سمت سرور
const PRODUCT_SIZES = [
  { value: "50x30", label: "۵۰ × ۳۰ میلی‌متر", w: 50, h: 30, cols: 3 },
  { value: "40x25", label: "۴۰ × ۲۵ میلی‌متر", w: 40, h: 25, cols: 4 },
  { value: "38x21", label: "۳۸ × ۲۱ میلی‌متر (رول)", w: 38, h: 21, cols: 5 },
  { value: "60x40", label: "۶۰ × ۴۰ میلی‌متر", w: 60, h: 40, cols: 3 },
  { value: "70x50", label: "۷۰ × ۵۰ میلی‌متر", w: 70, h: 50, cols: 2 },
] as const;

export interface LabelPrintDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: LabelMode;
  ids: string[];
  /** تعداد کپیِ پیش‌فرض (مثلاً از نتیجه‌ی انبارگردانی) — فقط mode=product */
  defaultCopies?: number;
  /**
   * حالت موجودی: چاپ به‌تعدادِ هر ردیف. اگر داده شود، به‌جای «تعداد کپیِ یکسان»
   * هر کالا به تعداد quantity خودش چاپ می‌شود (چاپ از موجودیِ واردشده).
   */
  items?: { productId: string; quantity: number }[];
  /** چاپ لیبلِ کل موجودیِ واردشده (هر کالا به تعداد مجموع موجودی‌اش). */
  allStock?: boolean;
}

export function LabelPrintDialog({
  open,
  onOpenChange,
  mode,
  ids,
  defaultCopies = 1,
  items,
  allStock = false,
}: LabelPrintDialogProps) {
  const isAllStock = mode === "product" && allStock;
  const perItem = mode === "product" && !!items && items.length > 0;
  const itemsTotal = perItem ? items!.reduce((s, i) => s + (i.quantity || 0), 0) : 0;
  const [sizeKey, setSizeKey] = React.useState<string>("5x3");
  const sizePreset: SizePreset =
    SIZE_PRESETS.find((s) => s.value === sizeKey) ?? SIZE_PRESETS[0];

  // ---- تنظیمات چاپِ محصول (PDF سمت سرور) ----
  const [copies, setCopies] = React.useState<number>(defaultCopies);
  const [prodSizeKey, setProdSizeKey] = React.useState<string>("50x30");
  const [showName, setShowName] = React.useState(true);
  const [showBarcodeText, setShowBarcodeText] = React.useState(true);
  const [cropMarks, setCropMarks] = React.useState(true);
  const [printing, setPrinting] = React.useState(false);
  const [printErr, setPrintErr] = React.useState<string | null>(null);
  const prodSize =
    PRODUCT_SIZES.find((s) => s.value === prodSizeKey) ?? PRODUCT_SIZES[0];

  React.useEffect(() => {
    if (open) setCopies(defaultCopies);
  }, [open, defaultCopies]);

  // حذف تکراری و خالی — همیشه آرایه‌ی پایدار
  const stableIds = React.useMemo(
    () => Array.from(new Set(ids.filter(Boolean))),
    [ids]
  );

  const isBulk = stableIds.length > 1;
  const enabled = open && stableIds.length > 0;

  // طبق بخش الف سند افزونه — GET /labels/location/:id یا GET /labels/product/:id
  const singleQ = useQuery<LocationLabel | ProductLabel>({
    queryKey: ["label", mode, "single", stableIds[0] ?? "__none__"],
    queryFn: (): Promise<LocationLabel | ProductLabel> =>
      mode === "location"
        ? getLocationLabel(stableIds[0]!)
        : getProductLabel(stableIds[0]!),
    enabled: enabled && !isBulk,
    retry: false,
  });

  // طبق بخش الف سند افزونه — POST /labels/location/bulk یا POST /labels/product/bulk
  const bulkQ = useQuery<Array<LocationLabel | ProductLabel>>({
    queryKey: ["label", mode, "bulk", stableIds.join(",")],
    queryFn: (): Promise<Array<LocationLabel | ProductLabel>> =>
      mode === "location"
        ? bulkLocationLabels(stableIds)
        : bulkProductLabels(stableIds),
    enabled: enabled && isBulk,
    retry: false,
  });

  const isLoading = isBulk ? bulkQ.isLoading : singleQ.isLoading;
  const isError = isBulk ? bulkQ.isError : singleQ.isError;
  const error = isBulk ? bulkQ.error : singleQ.error;
  const refetch = isBulk
    ? () => bulkQ.refetch()
    : () => singleQ.refetch();

  const locationLabels: LocationLabel[] = !enabled
    ? []
    : isBulk
      ? ((bulkQ.data ?? []) as LocationLabel[])
      : singleQ.data
        ? [singleQ.data as LocationLabel]
        : [];

  const productLabels: ProductLabel[] = !enabled
    ? []
    : isBulk
      ? ((bulkQ.data ?? []) as ProductLabel[])
      : singleQ.data
        ? [singleQ.data as ProductLabel]
        : [];

  const labels = mode === "location" ? locationLabels : productLabels;
  const hasLabels = labels.length > 0;

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  // چاپ باکیفیتِ محصول: PDF سمت سرور با تنظیمات → باز شدن در تب جدید
  const handlePdfPrint = async () => {
    setPrintErr(null);
    setPrinting(true);
    try {
      const printOpts = {
        columns: prodSize.cols,
        widthMm: prodSize.w,
        heightMm: prodSize.h,
        showName,
        showBarcodeText,
        cropMarks,
      };
      if (isAllStock) {
        // کل موجودیِ واردشده — سرور خودش جمع می‌زند
        await printAllStockLabelsPdf(printOpts);
      } else {
        // حالت موجودیِ انتخابی: هر کالا به تعداد خودش. وگرنه: تعداد کپیِ یکسان.
        const printItems = perItem
          ? items!.map((i) => ({ productId: i.productId, quantity: i.quantity }))
          : stableIds.map((id) => ({
              productId: id,
              quantity: Math.max(1, Math.min(500, Math.floor(copies) || 1)),
            }));
        await printProductLabelsPdf(printItems, printOpts);
      }
    } catch (e) {
      setPrintErr(
        e instanceof ApiException ? e.message : "ساخت PDF لیبل ناموفق بود"
      );
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        {/*
          استایل چاپ: فقط محتوای داخل .print-area نمایش داده می‌شود.
          هدر/کنترل‌ها/فوتر با کلاس .no-print در چاپ مخفی می‌شوند.
          DialogContent به position:static تبدیل می‌شود تا محتوا در بالای صفحه چاپ شود.
        */}
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            .label-print-area, .label-print-area * { visibility: visible !important; }
            [data-slot="dialog-content"] {
              position: static !important;
              transform: none !important;
              inset: auto !important;
              top: auto !important;
              left: auto !important;
              width: 100% !important;
              max-width: none !important;
              max-height: none !important;
              height: auto !important;
              border: none !important;
              padding: 0 !important;
              margin: 0 !important;
              box-shadow: none !important;
              background: white !important;
              display: block !important;
              overflow: visible !important;
              border-radius: 0 !important;
            }
            [data-slot="dialog-overlay"] { display: none !important; }
            [data-slot="dialog-close"] { display: none !important; }
            .no-print { display: none !important; }
            .label-print-area {
              position: relative !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .label-print-area .label-card {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            @page { margin: 5mm; }
          }
        `}</style>

        <DialogHeader className="no-print">
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            {mode === "location" ? "چاپ لیبل موقعیت" : "چاپ لیبل محصول"}
          </DialogTitle>
          <DialogDescription>
            پیش‌نمایش لیبل‌ها — برای چاپ از دکمه «چاپ» استفاده کنید.
            {stableIds.length > 0 ? ` ${stableIds.length} شناسه دریافت شد.` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* کنترل‌ها */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">سایز لیبل:</span>
            <Select dir="rtl" value={sizeKey} onValueChange={setSizeKey}>
              <SelectTrigger size="sm" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZE_PRESETS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasLabels ? (
            <Badge variant="secondary" className="gap-1">
              {mode === "location" ? (
                <MapPin className="h-3 w-3" />
              ) : (
                <Package className="h-3 w-3" />
              )}
              {labels.length} لیبل
            </Badge>
          ) : null}
        </div>

        {/* تنظیمات چاپِ محصول (PDF باکیفیت سمت سرور) */}
        {mode === "product" ? (
          <div className="no-print grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
            {isAllStock ? (
              <div className="flex items-center gap-2 sm:col-span-2">
                <Badge variant="secondary">کل موجودیِ واردشده</Badge>
                <span className="text-xs text-muted-foreground">
                  هر کالا به تعداد مجموع موجودی‌اش چاپ می‌شود
                </span>
              </div>
            ) : perItem ? (
              <div className="flex items-center gap-2 sm:col-span-2">
                <Badge variant="secondary">به تعداد موجودیِ هر ردیف</Badge>
                <span className="text-xs text-muted-foreground">
                  {items!.length} کالا — مجموع {itemsTotal} لیبل
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  تعداد کپی هر کالا
                </span>
                <Input
                  type="number"
                  min={1}
                  value={copies}
                  onChange={(e) =>
                    setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className="h-8 w-24"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">
                اندازه لیبل
              </span>
              <Select dir="rtl" value={prodSizeKey} onValueChange={setProdSizeKey}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_SIZES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={showName}
                onCheckedChange={(v) => setShowName(Boolean(v))}
              />
              نمایش نام کالا
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={showBarcodeText}
                onCheckedChange={(v) => setShowBarcodeText(Boolean(v))}
              />
              نمایش کد زیر بارکد
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={cropMarks}
                onCheckedChange={(v) => setCropMarks(Boolean(v))}
              />
              خط برش دور لیبل
            </label>
            <div className="text-xs text-muted-foreground sm:col-span-2">
              {isAllStock
                ? "بارکد = کد کالا (SKU)"
                : perItem
                  ? `مجموع ${itemsTotal} لیبل — بارکد = کد کالا (SKU)`
                  : `مجموع ${stableIds.length * copies} لیبل (${stableIds.length} کالا × ${copies}) — بارکد = کد کالا (SKU)`}
            </div>
            {printErr ? (
              <div className="text-xs text-destructive sm:col-span-2">{printErr}</div>
            ) : null}
          </div>
        ) : null}

        {/*
          ناحیه‌ی چاپ: اگر لیبل داریم، این ناحیه در چاپ نمایش داده می‌شود.
          در حالت loading/error/empty، کلاس no-print می‌گیرد تا چاپ خالی نداشته باشیم.
        */}
        <div className={hasLabels && !isAllStock ? "label-print-area" : "no-print"}>
          {isAllStock ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              با زدن «چاپ PDF»، لیبلِ همه‌ی کالاهایی که موجودی دارند (هر کدام به
              تعداد مجموع موجودی‌اش) ساخته و در تب جدید باز می‌شود.
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: stableIds.length || 3 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="rounded border"
                  style={{ width: sizePreset.w, height: sizePreset.h }}
                />
              ))}
            </div>
          ) : isError ? (
            <ErrorState
              message={
                error instanceof ApiException
                  ? error.message
                  : "بارگذاری لیبل‌ها ناموفق بود"
              }
              onRetry={() => refetch()}
            />
          ) : labels.length === 0 ? (
            <EmptyState
              title="لیبلی برای نمایش وجود ندارد"
              description="هیچ شناسه‌ای برای چاپ لیبل دریافت نشد."
              icon={QrCode}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {mode === "location"
                ? locationLabels.map((l) => (
                    <LocationLabelCard
                      key={l.id}
                      label={l}
                      preset={sizePreset}
                    />
                  ))
                : productLabels.map((l) => (
                    <ProductLabelCard
                      key={l.id}
                      label={l}
                      preset={sizePreset}
                    />
                  ))}
            </div>
          )}
        </div>

        <DialogFooter className="no-print">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            بستن
          </Button>
          {mode === "product" ? (
            <Button
              onClick={handlePdfPrint}
              disabled={printing || (!isAllStock && stableIds.length === 0)}
            >
              {printing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              چاپ PDF (کیفیت بالا)
            </Button>
          ) : (
            <Button
              onClick={handlePrint}
              disabled={isLoading || isError || !hasLabels}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              چاپ
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
