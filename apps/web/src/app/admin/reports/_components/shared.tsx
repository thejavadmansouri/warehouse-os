"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, FileSpreadsheet, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { downloadReportExcel } from "@/lib/api";
import { money, toFa } from "@/lib/format";
import { jalaliMonthLength, toGregorian, toJalali } from "@/lib/jalali";

/** رنگ نمودار — از توکن طراحی. `hsl(var(--primary))` اینجا غلط است چون تم oklch است. */
export const CHART_COLOR = "#2563EB";

export type PresetRange = "today" | "yesterday" | "this_week" | "this_month" | "last_month";

export const PRESETS: { id: PresetRange; label: string }[] = [
  { id: "today", label: "امروز" },
  { id: "yesterday", label: "دیروز" },
  { id: "this_week", label: "این هفته" },
  { id: "this_month", label: "این ماه" },
  { id: "last_month", label: "ماه گذشته" },
];

/** آخرین لحظه‌ی همان روزِ محلی — مرزِ بالای بازه. */
function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

/**
 * بازه‌های آماده‌ی گزارش.
 *
 * ⚠️ «ماه» یعنی **ماه شمسی**، نه ماه میلادی.
 *
 * قبلاً این‌جا `start.setDate(1)` و `setMonth(...)` بود — یعنی «این ماه» از یکم
 * ماه میلادی حساب می‌شد. برای مغازه‌ای که ماه مالی‌اش مرداد و شهریور است، گزارش
 * فروش و سودِ ماه از پایه بازه‌ی غلط می‌گرفت و هیچ‌جا هم اعلام نمی‌شد. هفته و
 * روز اما واحدهای مشترک‌اند و همان حساب محلی درست است (هفته از شنبه).
 */
export function presetDates(preset: PresetRange): { startDate: string; endDate: string } {
  const now = new Date();

  switch (preset) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { startDate: start.toISOString(), endDate: endOfDay(now).toISOString() };
    }

    case "yesterday": {
      const day = new Date(now);
      day.setDate(now.getDate() - 1);
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      return { startDate: start.toISOString(), endDate: endOfDay(day).toISOString() };
    }

    case "this_week": {
      // getDay(): یکشنبه ۰ … شنبه ۶. فاصله تا شنبه‌ی گذشته:
      const back = (now.getDay() + 1) % 7;
      const start = new Date(now);
      start.setDate(now.getDate() - back);
      start.setHours(0, 0, 0, 0);
      return { startDate: start.toISOString(), endDate: endOfDay(now).toISOString() };
    }

    case "this_month": {
      const { jy, jm } = toJalali(now);
      return {
        startDate: toGregorian(jy, jm, 1).toISOString(),
        endDate: endOfDay(now).toISOString(),
      };
    }

    case "last_month": {
      const today = toJalali(now);
      // فروردین که برگردیم، اسفندِ سال قبل است.
      const jy = today.jm === 1 ? today.jy - 1 : today.jy;
      const jm = today.jm === 1 ? 12 : today.jm - 1;
      return {
        startDate: toGregorian(jy, jm, 1).toISOString(),
        // طولِ اسفند به کبیسه‌بودنِ سال بستگی دارد؛ jalaliMonthLength خودش می‌داند.
        endDate: endOfDay(toGregorian(jy, jm, jalaliMonthLength(jy, jm))).toISOString(),
      };
    }
  }
}

/** برچسب کوتاه شمسی برای محور نمودار: «۱۲ مرداد» */
export function faDayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fa-IR-u-nu-arabext", {
    day: "numeric",
    month: "long",
  }).format(d);
}

export function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-foreground";

  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {/* مبلغ نباید وسطش بشکند — عدد نصفه در سطر بعد خوانده نمی‌شود. */}
      <p className={`mt-1 whitespace-nowrap text-xl font-bold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </Card>
  );
}

/**
 * کارتِ «یک نگاه» — عدد به‌علاوه‌ی یک درِ ورودی.
 *
 * تفاوتش با `SummaryCard` همین کلیک است. کارتی که فقط عدد نشان می‌دهد، کاربر را
 * می‌گذارد وسطِ راه: «۳ مشتری معوق» را می‌بیند و بعد باید خودش دنبالِ فهرستش
 * بگردد. اینجا کلیک همان فهرست را با همان بازه‌ی تاریخ باز می‌کند.
 */
export function DrillCard({
  label,
  value,
  hint,
  tone,
  small,
  onClick,
}: {
  label: string;
  value: string;
  /** یک خط توضیحِ ریز زیر عدد — تعداد، درصد، یا معنیِ عدد. */
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
  /** برای مقادیرِ متنی (نام کالا/مشتری) که با فونتِ درشتِ عددی بد می‌شکنند. */
  small?: boolean;
  onClick: () => void;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-lg border bg-card p-4 text-start transition-colors
                 hover:border-primary hover:bg-primary/5
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <p className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        <ChevronLeft className="size-3.5 opacity-0 transition-opacity group-hover:opacity-70" />
      </p>
      <p
        className={`mt-1 whitespace-nowrap tabular-nums ${toneClass} ${
          small ? "truncate text-base font-semibold" : "text-xl font-bold"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </button>
  );
}

/** ردیف جمع، چسبیده به پایین جدول — نه انتهای اسکرول. */
export function StickyTotal({ label, value }: { label: string; value: string }) {
  return (
    <div className="sticky bottom-0 flex items-center justify-between border-t bg-muted/90 p-3 text-sm font-bold backdrop-blur">
      <span>{label}</span>
      <span className="tabular-nums text-base">{value}</span>
    </div>
  );
}

export function Pagination({
  page,
  lastPage,
  onChange,
}: {
  page: number;
  lastPage: number;
  onChange: (p: number) => void;
}) {
  if (lastPage <= 1) return null;
  return (
    <div className="mt-2 flex items-center justify-between border-t pt-4">
      <div className="text-xs text-muted-foreground">
        صفحه <span className="font-bold tabular-nums">{toFa(page)}</span> از{" "}
        <span className="font-bold tabular-nums">{toFa(lastPage)}</span>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronRight className="ms-1 size-4" />
          قبلی
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => onChange(page + 1)}
        >
          بعدی
          <ChevronLeft className="me-1 size-4" />
        </Button>
      </div>
    </div>
  );
}

export function ExportButton({
  endpoint,
  params,
  fileName,
}: {
  endpoint: string;
  params: Record<string, unknown>;
  fileName: string;
}) {
  const [busy, setBusy] = React.useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadReportExcel(endpoint, params, fileName);
        } catch {
          toast.error("گرفتن خروجی اکسل ناموفق بود");
        } finally {
          setBusy(false);
        }
      }}
    >
      <FileSpreadsheet className="ms-2 size-4 text-emerald-600" />
      {busy ? "در حال آماده‌سازی…" : "خروجی اکسل"}
    </Button>
  );
}

/** حالت خالی معنادار — با راه خروج، نه فقط یک جمله. */
export function NoData({ onWiden }: { onWiden?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 p-12 text-center">
      <h3 className="text-base font-bold">در این بازه چیزی ثبت نشده است</h3>
      <p className="mb-6 mt-1 max-w-sm text-sm text-muted-foreground">
        می‌توانید بازه‌ی زمانی را بازتر کنید تا داده‌ی بیشتری ببینید.
      </p>
      {onWiden && (
        <Button variant="outline" onClick={onWiden}>
          <RefreshCw className="ms-2 size-4" />
          نمایش «این ماه»
        </Button>
      )}
    </div>
  );
}

export const sum = (rows: number[]) => rows.reduce((a, b) => a + b, 0);
export const t = (n: number) => `${money(n)} ریال`;
