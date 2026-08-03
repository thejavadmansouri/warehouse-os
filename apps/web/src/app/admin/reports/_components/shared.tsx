"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, FileSpreadsheet, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { downloadReportExcel } from "@/lib/api";
import { money, toFa } from "@/lib/format";

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

/** بازه‌ها. هفته در ایران از شنبه شروع می‌شود. */
export function presetDates(preset: PresetRange): { startDate: string; endDate: string } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (preset) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "yesterday":
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "this_week": {
      // getDay(): یکشنبه ۰ … شنبه ۶. فاصله تا شنبه‌ی گذشته:
      const back = (now.getDay() + 1) % 7;
      start.setDate(now.getDate() - back);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "this_month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "last_month":
      start.setMonth(now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return { startDate: start.toISOString(), endDate: end.toISOString() };
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
export const t = (n: number) => `${money(n)} تومان`;
