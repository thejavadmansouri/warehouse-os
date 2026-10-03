"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  compact,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  className?: string;
  /**
   * صفحه داخلِ صفحه‌ی دیگری (مثلاً یک تبِ کارتابل) رندر شده: عنوان و توضیح را
   * میزبان می‌گوید، پس فقط دکمه‌ها می‌مانند. بدون این، دو سرتیتر روی هم می‌نشیند.
   */
  compact?: boolean;
}) {

  if (compact) {
    // چیزی برای نشان‌دادن نیست اگر دکمه‌ای هم نباشد.
    if (!actions) return null;
    return (
      <div className={cn("flex items-center justify-end gap-2", className)}>
        {actions}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <div className="mt-0.5 rounded-xl bg-primary/10 p-2.5 text-primary">
            <Icon className="h-7 w-7" />
          </div>
        ) : null}
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
