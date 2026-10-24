"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * چیپِ نواری پایین سبد — «جمع اقلام»، «تخفیف ردیف‌ها»، «تخفیف فاکتور».
 *
 * سه عددِ کنارِ هم فقط وقتی قابلِ مقایسه‌اند که هم‌عرض و هم‌قد باشند. قبلاً یکی
 * به‌اندازه‌ی محتوایش کش می‌آمد و آن یکی (با ورودیِ تخفیف) بلندتر بود، پس چشم
 * بین «جمع» و «تخفیف» نمی‌توانست خط بکشد. ارتفاع و چیدمان اینجاست تا هر سه
 * دقیقاً یک شکل باشند و شکلِ محتوا (متن یا ورودی) هم داخلشان یکسان بماند.
 */
const TONES = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-amber-600 dark:text-amber-400",
  primary: "text-primary",
} as const;

export function SummaryChip({
  label,
  tone = "default",
  title,
  className,
  children,
}: {
  label: string;
  tone?: keyof typeof TONES;
  title?: string;
  className?: string;
  /** مقدارِ عددی؛ یا یک ورودیِ فشرده که همان ارتفاع را می‌گیرد. */
  children: React.ReactNode;
}) {
  return (
    <div
      title={title}
      className={cn(
        "flex h-[2.625rem] min-w-0 flex-col justify-center gap-0.5 rounded-md border bg-background px-2",
        className,
      )}
    >
      <span className="truncate text-[10px] leading-none text-muted-foreground">
        {label}
      </span>
      <div
        className={cn(
          "min-w-0 truncate text-[13px] font-bold leading-none tabular-nums",
          TONES[tone],
        )}
      >
        {children}
      </div>
    </div>
  );
}
