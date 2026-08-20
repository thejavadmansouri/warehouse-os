"use client";

import { History, Lock, LockOpen, User, X } from "lucide-react";

import { money, toFa } from "@/lib/format";
import type { CustomerCategory } from "@/lib/types";
import { CustomerCategoryBadge } from "@/components/customer-category-badge";

/**
 * چیپ «مشتری جاری» کنار نوار اسکن.
 *
 * فروشنده با یک نگاه بداند فاکتوری که دارد می‌بندد برای چه کسی است: نام،
 * شماره‌ی اصلی، دسته، چند فاکتور امروز گرفته و مانده‌ی کلش چقدر است.
 * کلیک روی نام پرونده را در تب جدا باز می‌کند (فوکوس اسکن دست نمی‌خورد).
 *
 * دکمه‌ی **قفل** تعیین می‌کند مشتری بعد از ثبتِ فاکتور روی تب بماند یا نه: قفل =
 * می‌ماند (برای مشتریِ حساب‌بازی که پشت‌سرهم می‌خرد)، باز = بعد از ثبت به «نقدیِ
 * گذری» برمی‌گردد. دکمه‌ی × — یا Ctrl+Shift+X — کلاً جدایش می‌کند.
 */
export function CurrentCustomerChip({
  name,
  primaryPhone,
  category,
  totalDue,
  todayCount,
  loading,
  locked,
  onToggleLock,
  onOpen,
  onShowToday,
  onClear,
}: {
  name: string;
  /** شماره‌ی اصلی مشتری — همانی که در پرونده «اصلی» است. */
  primaryPhone?: string | null;
  /** دسته‌ی مشتری — badge رنگی. اختیاری. */
  category?: CustomerCategory | null;
  totalDue: number;
  todayCount: number;
  loading: boolean;
  /** آیا مشتری به این تب قفل است (بعد از ثبت می‌ماند). */
  locked: boolean;
  onToggleLock: () => void;
  onOpen: () => void;
  /** باز کردن دیالوگ «خریدهای امروزِ همین مشتری». */
  onShowToday: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className="flex h-12 min-w-0 max-w-64 items-center gap-2 rounded-md border bg-card px-3"
      title="مشتریِ قفل‌شده — بعد از ثبت فاکتور می‌ماند"
    >
      <User className="size-4 shrink-0 text-muted-foreground" />

      <div className="min-w-0">
        {/* خط اول: نام + دسته + قفل + تاریخچه */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpen}
            title={
              primaryPhone
                ? `باز کردن پرونده — ${toFa(primaryPhone)}`
                : "باز کردن پرونده"
            }
            className="flex min-w-0 items-center gap-1"
          >
            <span
              title={name}
              className="max-w-36 truncate text-sm font-semibold hover:underline"
            >
              {name}
            </span>
          </button>

          {category && <CustomerCategoryBadge category={category} />}

          <button
            type="button"
            onClick={onToggleLock}
            title={
              locked
                ? "قفل است — بعد از ثبت روی تب می‌ماند. کلیک: باز کن"
                : "باز است — بعد از ثبت جدا می‌شود. کلیک: قفل کن"
            }
            aria-pressed={locked}
            className={`shrink-0 rounded p-0.5 transition-colors ${
              locked
                ? "text-primary hover:text-primary/80"
                : "text-muted-foreground/60 hover:text-foreground"
            }`}
          >
            {locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={onShowToday}
            title="خریدهای امروزِ این مشتری — با اقلام"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <History className="size-4" />
          </button>
        </div>

        {/* خط دوم: شماره + امروز + مانده — شماره همانی است که اول کوچک می‌شود تا
            «امروز» و «مانده» تا آخرین لحظه دیده شوند. */}
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
          {primaryPhone && (
            <span className="min-w-0 flex-1 truncate" dir="ltr">
              {toFa(primaryPhone)}
            </span>
          )}
          <span className="whitespace-nowrap">
            امروز: {loading ? "…" : toFa(todayCount)} فاکتور
          </span>
          <span
            className={`whitespace-nowrap font-semibold ${
              totalDue > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
            title={totalDue > 0 ? "مانده‌ی حساب" : "بستانکار"}
          >
            {money(totalDue)}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onClear}
        title="جدا کردن مشتری از این فاکتور"
        className="shrink-0 self-start pt-0.5 text-muted-foreground transition-colors hover:text-destructive"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
