"use client";

import * as React from "react";
import { MoreHorizontal, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * الگوی یکدستِ نوار ابزارِ فهرست‌ها:
 *   [جست‌وجو + فیلترها ...]            [شمارنده] [اکشن‌های ثانویه] [اکشن اصلی] [⋯]
 *   [چیپ‌های فیلترِ فعال × ...]                              [پاک کردن همه]
 *
 * فقط چیدمان است — state و منطقِ هر فیلتر در خودِ صفحه می‌ماند.
 */
export function ListToolbar({
  children,
  actions,
  className,
}: {
  /** جست‌وجو و فیلترها — سمتِ شروع (راست در RTL). */
  children?: React.ReactNode;
  /** شمارنده، دکمه‌های ثانویه/اصلی و ListMoreMenu — سمتِ پایان. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** منوی «⋯» برای اکشن‌های کم‌استفاده (خروجی CSV، چاپ، ...). فرزندان: DropdownMenuItem. */
export function ListMoreMenu({
  children,
  label = "اکشن‌های بیشتر",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="size-9 px-0" aria-label={label} title={label}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ActiveFilter {
  key: string;
  /** مثل «دسته: لنت» */
  label: React.ReactNode;
  onRemove: () => void;
}

/** چیپ‌های فیلترِ فعال — هر چیپ جدا حذف می‌شود. وقتی فیلتری نیست چیزی رندر نمی‌شود. */
export function ActiveFilters({
  filters,
  onClearAll,
  className,
}: {
  filters: ActiveFilter[];
  onClearAll?: () => void;
  className?: string;
}) {
  if (!filters.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="text-xs text-muted-foreground">فیلترهای فعال:</span>
      {filters.map((f) => (
        <Badge key={f.key} variant="secondary" className="gap-1 py-1 pe-1 ps-2.5 font-normal">
          {f.label}
          <button
            type="button"
            onClick={f.onRemove}
            className="rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="حذف این فیلتر"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {onClearAll && filters.length > 1 ? (
        <Button variant="link" size="sm" className="h-auto px-1 py-0 text-xs" onClick={onClearAll}>
          پاک کردن همه
        </Button>
      ) : null}
    </div>
  );
}
