"use client";

import { cn } from "@/lib/utils";
import type { CustomerCategory } from "@/lib/types";

/**
 * نشانِ رنگی دسته‌ی مشتری — در لیست، چیپ POS و پرونده استفاده می‌شود.
 *
 * رنگ از خودِ دسته می‌آید (مقدار HEX). برای خوانایی، متن روی پس‌زمینه‌ی
 * ۱۵٪ همان رنگ با تیره‌کردنِ رنگِ متن نمایش داده می‌شود — بدون محاسبه‌ی
 * contrast پیچیده، برای هر رنگی خواناترینِ ممکن.
 */
export function CustomerCategoryBadge({
  category,
  className,
}: {
  category: Pick<CustomerCategory, "name" | "color">;
  className?: string;
}) {
  const color = category.color || "#64748b";

  return (
    <span
      className={cn(
        "inline-flex max-w-40 items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        className
      )}
      style={{
        backgroundColor: `${color}22`,
        color,
      }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="truncate">{category.name}</span>
    </span>
  );
}
