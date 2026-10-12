"use client";

// کامپوننت مشترک پیش‌نمایش و چاپ لیبل — طبق بخش الف سند افزونه
// دو حالت دارد: mode="location" (لیبل قفسه/موقعیت) و mode="product" (لیبل کالا).
// همیشه آرایه‌ی ids می‌گیرد — حتی برای یک آیتم.
// اگر آرایه یک آیتم داشته باشد، endpoint تک‌آیتمی صدا زده می‌شود؛
// اگر بیش از یک آیتم باشد، endpoint bulk صدا زده می‌شود.
// چاپ با window.print() انجام می‌شود — هیچ کتابخانه‌ی PDF استفاده نمی‌شود.

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, QrCode, Loader2, Package, MapPin, Download } from "lucide-react";
import { toast } from "sonner";

import { isDesktop } from "@/lib/desktop";
import {
  ROLL_MEDIA_WIDTH_MM,
  matchRollPreset,
  rollColumns,
} from "@/lib/label-roll-presets";
import {
  directPrintLocationLabels,
  directPrintProductLabels,
  resolveLabelPrinterList,
  resolveSavedLabelPrinterName,
} from "@/lib/label-direct-print";

// طبق بخش الف سند افزونه — endpointهای لیبل
import {
  getLocationLabel,
  getProductLabel,
  bulkLocationLabels,
  bulkProductLabels,
  printProductLabelsPdf,
  printAllStockLabelsPdf,
  printLocationHalfSheetLabels,
  getLabelSettings,
  downloadRollLabelsPdf,
  downloadRollLocationLabelsPdf,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { toFa } from "@/lib/format";
import {
  PAGE_MARGIN_MM,
  LABEL_GAP_MM,
  PAPERS,
  columnsFor,
  labelsPerSheet,
  halfSheetWidthMm,
  halfSheetHeightMm,
  type LabelPaper,
} from "@/lib/label-sheet";
import type { LabelSettings, LocationLabel, ProductLabel } from "@/lib/types";
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
import { BarcodeSvg } from "./barcode-svg";
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
  // wMm/hMm همان اندازه‌اند، فقط عددی — چیدنِ ستون‌ها روی کاغذ حساب می‌خواهد
  // و «5cm» رشته است.
  { value: "5x3", label: "۵ × ۳ سانتی‌متر", w: "5cm", h: "3cm", qr: "1.7cm", wMm: 50, hMm: 30 },
  { value: "4x2", label: "۴ × ۲ سانتی‌متر", w: "4cm", h: "2cm", qr: "1.1cm", wMm: 40, hMm: 20 },
  { value: "6x4", label: "۶ × ۴ سانتی‌متر", w: "6cm", h: "4cm", qr: "2.5cm", wMm: 60, hMm: 40 },
  /*
   * لیبل ۲×۳ — هر دو جهت، چون «۲ در ۳» هر دو را می‌تواند یعنی.
   *
   * کارتِ لیبل عمودی چیده شده (نام بالا، QR وسط، کد پایین)، پس حالتِ ایستاده
   * هم درست درمی‌آید. QR در ایستاده به عرض محدود است و در خوابیده به ارتفاع —
   * برای همین دو عددِ متفاوت دارند و نه یکی.
   */
  { value: "3x2", label: "۳ × ۲ سانتی‌متر (خوابیده)", w: "3cm", h: "2cm", qr: "0.9cm", wMm: 30, hMm: 20 },
  { value: "2x3", label: "۲ × ۳ سانتی‌متر (ایستاده)", w: "2cm", h: "3cm", qr: "1.3cm", wMm: 20, hMm: 30 },
  /*
   * نیم‌برگ — ابعادش در زمانِ رندر از کاغذِ انتخابی حساب می‌شود (wMm/hMm صفرِ
   * جایشان را پر می‌کنند). لیبل دقیقاً نیمی از کاغذ است: A5 → دو لیبلِ A6.
   * هدفِ این حالت چاپِ بارکدِ قفسه با کاغذِ ساده است — نه لیبلِ حرارتی.
   */
  { value: "half", label: "نیم‌برگ — هر برگه ۲ لیبل", w: "0cm", h: "0cm", qr: "4cm", wMm: 0, hMm: 0 },
] as const;

const PAPER_OPTIONS: LabelPaper[] = ["A4", "A5", "A6"];

/*
 * نوعِ ریزشده از `as const` خیلی تنگ است — بعد از جایگزینیِ ابعادِ نیم‌برگ
 * (مثلاً w: "148mm") دیگر جایی ندارد. این نوعِ باز، هر دو شکل را می‌پذیرد.
 */
interface SizePreset {
  value: string;
  label: string;
  w: string;
  h: string;
  qr: string;
  wMm: number;
  hMm: number;
}

// پیکسلِ چاپ: مرورگر CSS px را با ۹۶px بر اینچ چاپ می‌کند.
const PRINT_PX_PER_MM = 96 / 25.4;

/**
 * کارت لیبل موقعیت.
 *
 * محتوای کارت: نام (بالا) → مسیر (اگر جا باشد) → QR → بارکد خطی CODE128 → پایین.
 * دو کد چون دو نوع اسکنر: دوربینِ گوشی QR را از دور می‌خواند و اسکنرِ لیزریِ
 * معمولی فقط CODE128 را. مقدارِ CODE128 همان `location.barcode` است که
 * resolve با آن قفسه را پیدا می‌کند.
 *
 * ارتفاعِ کارت محدود است (۲ تا ۴ سانتی‌متر) و هر دو کد باید داخلش بمانند؛ برای
 * همین ارتفاعِ میله‌ها و اندازهٔ QR از روی بودجهٔ عمودیِ کارت حساب می‌شود و اگر
 * جا تنگ بود، مسیر (pathText) حذف می‌شود — نه یکی از کدها.
 */
function LocationLabelCard({
  label,
  preset,
}: {
  label: LocationLabel;
  preset: SizePreset;
}) {
  /*
   * نیم‌برگ: کارتِ بزرگِ تمام‌نیمِ کاغذ (A5 → دو A6) و «کیوآر-محور» — ۸۰٪ کارت
   * کیوآر کد و باقی آدرسِ لوکیشن (نام + مسیر). همین چیدمان سمت سرور چاپ می‌شود،
   * پس پیش‌نمایش و خروجی یکی‌اند.
   */
  const isBig = preset.value === "half";
  if (isBig) {
    const cardPx = preset.hMm * PRINT_PX_PER_MM;
    const padPx = Math.round(4 * PRINT_PX_PER_MM);
    const availPx = Math.max(30, cardPx - padPx * 2);
    const qrPx = Math.max(30, Math.round(availPx * 0.8));
    const addressPx = availPx - qrPx;
    const namePx = Math.max(11, Math.min(20, Math.round(addressPx * 0.55)));
    const pathPx = Math.max(8, Math.round(namePx * 0.72));
    return (
      <div
        className="label-card flex flex-col items-center justify-start overflow-hidden rounded border border-black/25 bg-white p-1 text-center"
        style={{ width: preset.w, height: preset.h }}
      >
        <img
          src={label.qrCode}
          alt="QR قفسه"
          style={{ width: qrPx, height: qrPx, marginTop: padPx }}
          className="object-contain"
        />
        <div
          className="flex w-full flex-col items-center justify-center"
          style={{ height: addressPx, gap: 3 }}
        >
          <p
            className="w-full truncate font-bold leading-tight text-black"
            style={{ fontSize: namePx }}
            dir="rtl"
          >
            {label.name}
          </p>
          <p
            className="w-full truncate leading-tight text-gray-600"
            style={{ fontSize: pathPx }}
            dir="rtl"
          >
            {label.pathText}
          </p>
        </div>
      </div>
    );
  }

  // رول قفسه (مثل 100200_big): QR چپ + عدد درشت راست — همان خروجی چاپ مستقیم/PDF.
  const padPx = Math.round(2.2 * PRINT_PX_PER_MM);
  const gapPx = Math.round(2 * PRINT_PX_PER_MM);
  const cardH = preset.hMm * PRINT_PX_PER_MM;
  const cardW = preset.wMm * PRINT_PX_PER_MM;
  const qrPx = Math.max(
    Math.round(7 * PRINT_PX_PER_MM),
    Math.min(cardH - padPx * 2, Math.round(cardW * 0.55)),
  );
  const num = label.shortNum || label.code;
  const numPx = Math.max(14, Math.min(28, Math.round(preset.hMm * 0.72)));

  return (
    <div
      className="label-card flex flex-row items-center overflow-hidden rounded border border-black/25 bg-white"
      style={{
        width: preset.w,
        height: preset.h,
        padding: padPx,
        gap: gapPx,
        direction: "ltr",
      }}
    >
      <img
        src={label.qrCode}
        alt="QR قفسه"
        style={{ width: qrPx, height: qrPx, flex: "0 0 auto" }}
        className="object-contain"
      />
      <p
        className="min-w-0 flex-1 truncate text-center font-extrabold leading-none text-black"
        style={{ fontSize: numPx }}
        dir="ltr"
      >
        {num}
      </p>
    </div>
  );
}

// کارت لیبل محصول — طبق بخش الف:
// name → brandName/vehicleModelName → QR → sku + barcode (متن مونواسپیس)
function ProductLabelCard({
  label,
  preset,
  footerText,
}: {
  label: ProductLabel;
  preset: SizePreset;
  footerText: string | null;
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
      {/*
        بارکد خطی، نه QR.
        چاپِ کالا سمت سرور CODE128 می‌زند؛ تا دیروز پیش‌نمایش QR نشان می‌داد و
        با خروجی نمی‌خواند. پیش‌نمایشی که دروغ بگوید از نداشتنش بدتر است.
      */}
      <BarcodeSvg
        value={label.barcode}
        height={26}
        className="h-auto w-[92%] object-contain"
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
        {footerText ? (
          <p className="line-clamp-1 text-[7px] font-semibold leading-tight text-black" dir="rtl">
            {footerText}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * پیش‌نمایش «چاپ مستقیم (حرارتی)» — همان چیزی که از رول بیرون می‌آید، با
 * ابعاد واقعی میلی‌متری.
 *
 * صفِ چاپ دقیقاً مثل `buildProductTsplPayload` ساخته می‌شود: هر کالا به تعداد
 * کپیِ خودش تکرار می‌شود و بعد به گروه‌های «تکهٔ رول» تقسیم می‌شود — هر تکه
 * `cols` لیبل کنار هم (مثلاً رول ۱۰۵ با لیبل ۵۱ → دو لیبل ۵۱×۳۲ در هر تکه).
 * اگر رول تک‌ستونه باشد، همان گرید ساده با ابعاد واقعی می‌ماند.
 */
function ProductThermalPreview({
  labels,
  copies,
  perItem,
  items,
  settings,
}: {
  labels: ProductLabel[];
  copies: number;
  perItem: boolean;
  items?: { productId: string; quantity: number }[];
  settings?: LabelSettings | null;
}) {
  const wMm = settings?.widthMm ?? 50;
  const hMm = settings?.heightMm ?? 30;
  const mediaMm = settings?.mediaWidthMm ?? ROLL_MEDIA_WIDTH_MM;
  const cols = rollColumns(wMm, mediaMm);
  const twoUp = cols >= 2;

  // صفِ چاپ — دقیقاً همان منطق handleDirectPrint.
  const queue: ProductLabel[] = [];
  for (const l of labels) {
    const qty = perItem
      ? (items!.find((i) => i.productId === l.id)?.quantity ?? 1)
      : Math.max(1, Math.min(500, Math.floor(copies) || 1));
    for (let c = 0; c < qty; c++) queue.push(l);
  }

  const preset: SizePreset = {
    value: "thermal",
    label: "",
    w: `${wMm}mm`,
    h: `${hMm}mm`,
    qr: "0cm",
    wMm,
    hMm,
  };

  if (!twoUp) {
    return (
      <div className="label-grid grid grid-cols-2 gap-3 sm:grid-cols-3">
        {queue.map((l, i) => (
          <ProductLabelCard
            key={`${l.id}-${i}`}
            label={l}
            preset={preset}
            footerText={null}
          />
        ))}
      </div>
    );
  }

  // تکه‌های رول — هر تکه `cols` لیبل کنار هم (خانه‌ی آخر اگر صف فرد بود خالی).
  const pieces: ProductLabel[][] = [];
  for (let i = 0; i < queue.length; i += cols) {
    pieces.push(queue.slice(i, i + cols));
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        هر تکهٔ رول {toFa(mediaMm)}×{toFa(hMm)} میلی‌متر — {toFa(cols)} لیبل{" "}
        {toFa(wMm)}×{toFa(hMm)} کنار هم · هر کپی = یک تکهٔ رول
      </div>
      <div className="flex flex-wrap items-start gap-4">
        {pieces.map((piece, pi) => (
          <div
            key={pi}
            className="flex overflow-hidden rounded border-2 border-dashed border-gray-400 bg-white"
            style={{ width: `${mediaMm}mm` }}
          >
            {Array.from({ length: cols }).map((_, slot) =>
              piece[slot] ? (
                <ProductLabelCard
                  key={`${piece[slot].id}-${pi}-${slot}`}
                  label={piece[slot]}
                  preset={preset}
                  footerText={null}
                />
              ) : (
                <div
                  key={`empty-${pi}-${slot}`}
                  className="bg-gray-100"
                  style={{ width: `${wMm}mm`, height: `${hMm}mm` }}
                />
              ),
            )}
          </div>
        ))}
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
  /*
   * ۲×۳ سانتی — هر دو جهت، چون «۲ در ۳» هر دو را می‌تواند یعنی و لیبلِ اشتباه
   * یعنی یک رول کاغذِ دورریز.
   *
   * `cols` روی A4 حساب شده: عرض مفید ۲۰۰ میلی‌متر با فاصله‌ی ۴ میلی‌متری.
   */
  { value: "30x20", label: "۳۰ × ۲۰ میلی‌متر (خوابیده)", w: 30, h: 20, cols: 5 },
  { value: "20x30", label: "۲۰ × ۳۰ میلی‌متر (ایستاده)", w: 20, h: 30, cols: 6 },
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
  /** کاغذی که لیبل‌ها رویش چاپ می‌شوند. چیدمان خودش را با آن وفق می‌دهد. */
  const [paper, setPaper] = React.useState<LabelPaper>("A4");

  /*
   * نیم‌برگ: ابعادِ لیبل از کاغذِ انتخابی می‌آید — دقیقاً نیمی از کاغذ.
   * A5 → دو لیبلِ ۱۴۸×۱۰۵ (همان A6). کاغذ عوض شود، لیبل هم عوض می‌شود.
   */
  const isHalfSheet = sizeKey === "half";
  const sizePreset: SizePreset = React.useMemo(() => {
    const found =
      SIZE_PRESETS.find((s) => s.value === sizeKey) ?? SIZE_PRESETS[0];
    if (found.value !== "half") return found;
    const wMm = halfSheetWidthMm(paper);
    const hMm = halfSheetHeightMm(paper);
    return { ...found, w: `${wMm}mm`, h: `${hMm}mm`, wMm, hMm };
  }, [sizeKey, paper]);

  /*
   * ستون‌ها از روی کاغذ و اندازه‌ی لیبل حساب می‌شوند، نه ثابت.
   *
   * شبکه‌ی روی صفحه واکنش‌گراست (۲ یا ۳ ستون بسته به پهنای پنجره) و به کاغذ
   * ربطی ندارد؛ چیزی که روی کاغذ می‌رود با این عدد در استایلِ چاپ قفل می‌شود.
   * نیم‌برگ همیشه یک ستون است و هر برگه دقیقاً دو لیبل (نیمِ بالا و نیمِ پایین).
   */
  const printColumns = isHalfSheet
    ? 1
    : columnsFor(paper, sizePreset.wMm);
  const perSheet = isHalfSheet
    ? Math.max(1, Math.floor(PAPERS[paper].heightMm / halfSheetHeightMm(paper)))
    : labelsPerSheet(paper, sizePreset.wMm, sizePreset.hMm);

  // ---- تنظیمات چاپِ محصول (PDF سمت سرور) ----
  const [copies, setCopies] = React.useState<number>(defaultCopies);
  const [prodSizeKey, setProdSizeKey] = React.useState<string>("50x30");
  /** اگر کاربر خودش سایزی را انتخاب کرد، دیگر به «همان تنظیمات» برنگرد. */
  const [pdfSizeTouched, setPdfSizeTouched] = React.useState(false);
  const [showName, setShowName] = React.useState(true);
  const [showBarcodeText, setShowBarcodeText] = React.useState(true);
  const [cropMarks, setCropMarks] = React.useState(true);
  const [printing, setPrinting] = React.useState(false);
  const [printErr, setPrintErr] = React.useState<string | null>(null);
  const [directPrinting, setDirectPrinting] = React.useState(false);
  const [directErr, setDirectErr] = React.useState<string | null>(null);
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

  /*
   * چاپِ نیم‌برگ — مسیرِ سمتِ سرور.
   * چاپِ داخلِ دیالوگ (visibility روی صفحهٔ ادمین) اندازهٔ کاغذ را تضمین
   * نمی‌کند و کاربر لیبلِ کوچک می‌گرفت. این مسیر صفحهٔ مستقلی با @page ثابت
   * می‌سازد: A5 → دقیقاً دو لیبلِ A6 در هر برگه.
   */
  // متن زیر هر لیبل — از تنظیمات چاپِ مدیر می‌آید و فقط برای پیش‌نمایش است؛
  // خودِ چاپِ PDF سمت سرور همین متن را از تنظیمات ذخیره‌شده می‌خواند.
  const settingsQ = useQuery({
    queryKey: ["label-settings"],
    queryFn: getLabelSettings,
    // قفسه هم به تنظیمات نیاز دارد: هم برای اندازهٔ رولِ PDF و هم برای چاپ مستقیم.
    enabled: open,
    retry: false,
  });
  const footerText = settingsQ.data?.footerText ?? null;

  /*
   * «همان تنظیمات چاپ» — اندازه‌ی PDF با تنظیمات ذخیره‌شده‌ی مدیر یکی می‌شود
   * (مثلاً ۵۱×۳۲ روی رول ۱۰۵ → دو ستون) تا خروجی PDF مثل پیش‌نمایش حرارتی باشد.
   */
  const settingsSize = React.useMemo(() => {
    const s = settingsQ.data;
    if (!s) return null;
    return {
      value: "settings" as const,
      label: `همان تنظیمات چاپ (${toFa(s.widthMm)} × ${toFa(s.heightMm)})`,
      w: s.widthMm,
      h: s.heightMm,
      cols: rollColumns(s.widthMm, ROLL_MEDIA_WIDTH_MM),
    };
  }, [settingsQ.data]);

  // وقتی تنظیمات لود شد و کاربر دست نزده، پیش‌فرض روی «همان تنظیمات» می‌رود.
  React.useEffect(() => {
    if (settingsQ.data && !pdfSizeTouched) setProdSizeKey("settings");
  }, [settingsQ.data, pdfSizeTouched]);

  const pdfSize =
    prodSizeKey === "settings" && settingsSize ? settingsSize : prodSize;

  /*
   * قفسه: اندازه فقط از «تنظیمات چاپ» می‌آید (رول همیشه ۱۰۰mm).
   * کاربر سایز را آنجا انتخاب می‌کند، نه داخل دیالوگ چاپ.
   */
  const locSize = React.useMemo(() => {
    const s = settingsQ.data;
    return s
      ? { w: s.widthMm, h: s.heightMm, gap: s.gapMm }
      : { w: 30, h: 20, gap: 2 };
  }, [settingsQ.data]);
  const locMediaMm = ROLL_MEDIA_WIDTH_MM;
  const locCols = rollColumns(locSize.w, locMediaMm);
  const locPresetLabel =
    matchRollPreset(locSize.w, locSize.h)?.label ??
    `${toFa(locSize.w)}×${toFa(locSize.h)} میلی‌متر`;
  const locPreviewPreset: SizePreset = {
    value: "roll",
    label: locPresetLabel,
    w: `${locSize.w}mm`,
    h: `${locSize.h}mm`,
    qr: "0cm",
    wMm: locSize.w,
    hMm: locSize.h,
  };

  // پرینتر — از اپ ویندوزی یا از فهرست سرور (مرورگر)
  const [printerName, setPrinterName] = React.useState("");
  const [printerHost, setPrinterHost] = React.useState("");
  const printersQ = useQuery({
    queryKey: ["label-printers", isDesktop() ? "desktop" : "server"],
    queryFn: resolveLabelPrinterList,
    enabled: open,
    retry: false,
  });
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const name = await resolveSavedLabelPrinterName(settingsQ.data);
      if (!alive) return;
      setPrinterName(name);
      setPrinterHost(settingsQ.data?.printerHost ?? "");
    })();
    return () => {
      alive = false;
    };
  }, [open, settingsQ.data]);

  const printerChoice = {
    printerName: printerName || null,
    printerHost: printerHost.trim() || null,
    printerPort: settingsQ.data?.printerPort ?? 9100,
  };

  const [locDirectPrinting, setLocDirectPrinting] = React.useState(false);
  const [locDirectErr, setLocDirectErr] = React.useState<string | null>(null);
  const handleLocationDirectPrint = async () => {
    setLocDirectErr(null);
    setLocDirectPrinting(true);
    try {
      const s = settingsQ.data;
      if (!s) throw new Error("تنظیمات چاپ در دسترس نیست");
      const res = await directPrintLocationLabels({
        labels: locationLabels,
        settings: s,
        printer: printerChoice,
      });
      toast.success(
        `${toFa(res.printed)} لیبل قفسه چاپ شد` +
          (res.via === "server" ? " (از سرور)" : ""),
      );
    } catch (e) {
      setLocDirectErr(
        e instanceof ApiException
          ? e.message
          : e instanceof Error
            ? e.message
            : "چاپ مستقیم ناموفق بود",
      );
    } finally {
      setLocDirectPrinting(false);
    }
  };

  // PDF رولِ قفسه — فایل دانلود می‌شود (هر صفحه = یک تکهٔ رول، Scale=100%).
  const [locRollPrinting, setLocRollPrinting] = React.useState(false);
  const [locRollErr, setLocRollErr] = React.useState<string | null>(null);
  const handleLocationRollDownload = async () => {
    setLocRollErr(null);
    setLocRollPrinting(true);
    try {
      const s = settingsQ.data;
      if (!s) throw new Error("تنظیمات چاپ در دسترس نیست");
      await downloadRollLocationLabelsPdf(
        {
          ids: stableIds,
          widthMm: locSize.w,
          heightMm: locSize.h,
          mediaWidthMm: locMediaMm,
        },
        `kardo-roll-location-${locSize.w}x${locSize.h}-on-${locMediaMm}mm.pdf`,
      );
    } catch (e) {
      setLocRollErr(
        e instanceof ApiException ? e.message : "ساخت PDF رول ناموفق بود",
      );
    } finally {
      setLocRollPrinting(false);
    }
  };

  const [halfSheetPrinting, setHalfSheetPrinting] = React.useState(false);
  const [halfSheetErr, setHalfSheetErr] = React.useState<string | null>(null);
  const handleHalfSheetPrint = async () => {
    setHalfSheetErr(null);
    setHalfSheetPrinting(true);
    try {
      await printLocationHalfSheetLabels(stableIds, {
        paper: paper === "A6" ? "A6" : paper, // A6 → یک لیبلِ تمام‌صفحه
        cutGuide: true,
      });
    } catch (e) {
      setHalfSheetErr(
        e instanceof ApiException ? e.message : "ساخت برگهٔ چاپ ناموفق بود"
      );
    } finally {
      setHalfSheetPrinting(false);
    }
  };

  /** چاپ مستقیم کالا — اپ ویندوزی یا مرورگر (از طریق API سرور). */
  const handleDirectPrint = async () => {
    setDirectErr(null);
    setDirectPrinting(true);
    try {
      const settings = settingsQ.data;
      if (!settings) throw new Error("تنظیمات چاپ در دسترس نیست");
      if (isAllStock) {
        throw new Error("برای کل موجودی از «دانلود PDF رول» استفاده کن");
      }
      const res = await directPrintProductLabels({
        labels: productLabels,
        settings,
        copies,
        perItem,
        items,
        printer: printerChoice,
      });
      toast.success(
        `${toFa(res.printed)} لیبل روی پرینتر حرارتی چاپ شد` +
          (res.via === "server" ? " (از سرور)" : ""),
      );
    } catch (e) {
      setDirectErr(
        e instanceof ApiException
          ? e.message
          : e instanceof Error
            ? e.message
            : "چاپ مستقیم ناموفق بود",
      );
    } finally {
      setDirectPrinting(false);
    }
  };

  // چاپ باکیفیتِ محصول: PDF سمت سرور با تنظیمات → باز شدن در تب جدید
  const handlePdfPrint = async () => {
    setPrintErr(null);
    setPrinting(true);
    try {
      const printOpts = {
        columns: pdfSize.cols,
        widthMm: pdfSize.w,
        heightMm: pdfSize.h,
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

  /*
   * دانلود PDF رول حرارتی: هر صفحه = یک تکه‌ی رول (عرض رول × ارتفاع لیبل)
   * با چند لیبل کنار هم — همان چیزی که پرینتر حرارتی می‌خواهد. چاپ از
   * Adobe/Edge با Scale=100% و بدون هدر/فوتر. حالت «کل موجودی» هم پشتیبانی
   * می‌شود (items خالی می‌رود و سرور خودش جمع می‌زند).
   */
  const [rollPrinting, setRollPrinting] = React.useState(false);
  const [rollErr, setRollErr] = React.useState<string | null>(null);
  const handleRollDownload = async () => {
    setRollErr(null);
    setRollPrinting(true);
    try {
      const settings = settingsQ.data;
      if (!settings) throw new Error("تنظیمات چاپ در دسترس نیست");
      const w = settings.widthMm;
      const h = settings.heightMm;
      const media = ROLL_MEDIA_WIDTH_MM;
      const cols = rollColumns(w, media);
      const opts = {
        widthMm: w,
        heightMm: h,
        mediaWidthMm: media,
        showName,
        showBarcodeText,
        footerText: settings.footerText ?? undefined,
      };
      if (isAllStock || perItem) {
        // کل موجودی یا تعدادِ هر ردیف — سرور خودش می‌شمارد
        await downloadRollLabelsPdf(opts, `kardo-roll-${w}x${h}-on-${media}mm.pdf`);
      } else {
        const printItems = stableIds.map((id) => ({
          productId: id,
          quantity: Math.max(1, Math.min(500, Math.floor(copies) || 1)),
        }));
        await downloadRollLabelsPdf(
          { ...opts, items: printItems },
          `kardo-roll-${w}x${h}-on-${media}mm.pdf`,
        );
      }
      toast.success(
        `PDF رول ساخته شد — ${toFa(cols)} لیبل در هر تکهٔ ${toFa(media)} میلی‌متری. چاپ با Scale=۱۰۰٪ و بدون هدر/فوتر.`,
      );
    } catch (e) {
      setRollErr(e instanceof Error ? e.message : "ساخت PDF رول ناموفق بود");
    } finally {
      setRollPrinting(false);
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
            /*
              اندازه‌ی کاغذ از انتخابِ کاربر می‌آید، نه پیش‌فرضِ مرورگر.
              بدون این، هر کسی که در دیالوگِ چاپِ ویندوز A5 می‌گذاشت، چیدمانِ
              A4 را روی A5 می‌گرفت و ستونِ آخر بریده می‌شد.
              نیم‌برگ حاشیه‌ی صفر می‌خواهد — لیبل دقیقاً نیمی از کاغذ است و
              هر میلی‌مترِ حاشیه، لیبلِ دوم را از برگه می‌اندازد.
            */
            @page { size: ${paper}; margin: ${isHalfSheet ? 0 : PAGE_MARGIN_MM}mm; }

            /*
              شبکه‌ی چاپ، نه شبکه‌ی صفحه. روی صفحه ستون‌ها با پهنای پنجره عوض
              می‌شوند؛ روی کاغذ باید دقیقاً همان تعدادی باشد که جا می‌شود.
              نیم‌برگ: هر ردیف دقیقاً نیمِ کاغذ، بدونِ فاصله — دو لیبل در هر برگه.
            */
            .label-print-area .label-grid {
              display: grid !important;
              grid-template-columns: repeat(${printColumns}, ${sizePreset.w}) !important;
              ${isHalfSheet
                ? `grid-auto-rows: ${sizePreset.h} !important;
                   gap: 0 !important;`
                : `gap: ${LABEL_GAP_MM}mm !important;
                   justify-content: start !important;`}
            }
          }
        `}</style>

        <DialogHeader className="no-print">
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            {mode === "location" ? "چاپ لیبل موقعیت" : "چاپ لیبل محصول"}
          </DialogTitle>
          <DialogDescription>
            {mode === "location"
              ? "پیش‌نمایش رول قفسه — PDF رول مثل فایل ۱۰۰۲۰۰؛ سایز از تنظیمات چاپ."
              : "پیش‌نمایش لیبل‌ها — برای چاپ از دکمه‌های پایین استفاده کنید."}
            {stableIds.length > 0
              ? ` ${toFa(stableIds.length)} شناسه دریافت شد.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {/* کنترل‌ها — برای قفسه فقط خلاصهٔ تنظیمات؛ سایز را از صفحهٔ لیبل‌ها عوض کن */}
        {mode === "location" ? (
          <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-foreground">
                رول {toFa(locMediaMm)}mm
              </span>
              <Badge variant="secondary">{locPresetLabel}</Badge>
              <span className="text-muted-foreground">
                {toFa(locCols)} برچسب در هر ردیف · QR + عدد درشت
              </span>
            </div>
            {hasLabels ? (
              <Badge variant="secondary" className="gap-1">
                <MapPin className="h-3 w-3" />
                {toFa(labels.length)} لیبل
              </Badge>
            ) : null}
          </div>
        ) : (
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">کاغذ:</span>
              <div className="flex gap-1">
                {PAPER_OPTIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPaper(p)}
                    className={`h-8 rounded-md border px-3 text-xs font-medium transition-colors ${
                      paper === p
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:border-primary hover:text-primary"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {toFa(printColumns)} ستون · {toFa(perSheet)} لیبل در هر برگه
              </span>
            </div>
            {hasLabels ? (
              <Badge variant="secondary" className="gap-1">
                <Package className="h-3 w-3" />
                {labels.length} لیبل
              </Badge>
            ) : null}
          </div>
        )}

        {/* پرینتر — مشترک موقعیت و کالا */}
        <div className="no-print grid gap-2 rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-2">
          <div className="sm:col-span-2 text-muted-foreground">
            {mode === "location"
              ? "اندازه از تنظیمات چاپ است. چاپ مستقیم TSPL خام به پرینتر می‌فرستد — هم از مرورگر (پرینتر سرور/شبکه) هم از اپ ویندوزی."
              : "چاپ مستقیم TSPL به پرینتر حرارتی — مرورگر از طریق سرور، اپ ویندوزی از روی همین PC."}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">پرینتر</span>
            <select
              dir="rtl"
              className="h-8 flex-1 rounded-md border bg-background px-2"
              value={printerName}
              onChange={(e) => setPrinterName(e.target.value)}
            >
              <option value="">
                {isDesktop()
                  ? "پیش‌فرض ویندوز / تنظیمات اپ"
                  : "از تنظیمات چاپ سرور"}
              </option>
              {(printersQ.data ?? []).map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                  {p.isDefault ? " (پیش‌فرض)" : ""}
                  {p.source === "server" ? " · سرور" : ""}
                </option>
              ))}
            </select>
          </div>
          {!isDesktop() ? (
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-muted-foreground">IP شبکه</span>
              <Input
                dir="ltr"
                className="h-8"
                placeholder="مثلاً 192.168.1.50"
                value={printerHost}
                onChange={(e) => setPrinterHost(e.target.value)}
              />
            </div>
          ) : null}
          {locDirectErr || locRollErr || directErr ? (
            <p className="text-destructive sm:col-span-2">
              {locDirectErr ?? locRollErr ?? directErr}
            </p>
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
              <Select
                dir="rtl"
                value={prodSizeKey}
                onValueChange={(v) => {
                  setPdfSizeTouched(true);
                  setProdSizeKey(v);
                }}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="settings">
                    {settingsSize ? settingsSize.label : "همان تنظیمات چاپ"}
                  </SelectItem>
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
          ) : mode === "location" ? (
            <div className="label-grid grid grid-cols-2 gap-3 sm:grid-cols-3">
              {locationLabels.map((l) => (
                <LocationLabelCard
                  key={l.id}
                  label={l}
                  preset={locPreviewPreset}
                />
              ))}
            </div>
          ) : (
            <ProductThermalPreview
              labels={productLabels}
              copies={copies}
              perItem={perItem}
              items={items}
              settings={settingsQ.data}
            />
          )}
        </div>

        <DialogFooter className="no-print flex flex-col items-stretch gap-1">
          {halfSheetErr ? (
            <div className="text-center text-xs text-destructive">{halfSheetErr}</div>
          ) : null}
          {rollErr ? (
            <div className="text-center text-xs text-destructive">{rollErr}</div>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            بستن
          </Button>
          {mode === "product" ? (
            <React.Fragment>
              {!isAllStock ? (
                <Button
                  onClick={handleDirectPrint}
                  disabled={directPrinting || !hasLabels}
                >
                  {directPrinting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4" />
                  )}
                  چاپ مستقیم روی پرینتر
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={handleRollDownload}
                disabled={
                  rollPrinting ||
                  (!isAllStock && stableIds.length === 0)
                }
              >
                {rollPrinting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                دانلود PDF رول
              </Button>
              <Button
                variant="ghost"
                onClick={handlePdfPrint}
                disabled={printing || (!isAllStock && stableIds.length === 0)}
              >
                {printing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                PDF برگه‌ای (A4)
              </Button>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <Button
                onClick={handleLocationDirectPrint}
                disabled={locDirectPrinting || !hasLabels}
              >
                {locDirectPrinting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                چاپ مستقیم روی پرینتر
              </Button>
              <Button
                variant="outline"
                onClick={handleLocationRollDownload}
                disabled={locRollPrinting || !hasLabels}
              >
                {locRollPrinting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                دانلود PDF رول
              </Button>
              <Button
                variant="ghost"
                onClick={handleHalfSheetPrint}
                disabled={
                  halfSheetPrinting || isLoading || isError || !hasLabels
                }
              >
                {halfSheetPrinting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                نیم‌برگ A5
              </Button>
            </React.Fragment>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
