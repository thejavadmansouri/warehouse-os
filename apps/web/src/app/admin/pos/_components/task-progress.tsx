"use client";

import { toFa } from "@/lib/format";
import type { WorkTask } from "@/lib/types";

/**
 * نوار پیشرفتِ کارِ کارگر — «۱۲/۲۰ آیتم — ۶۰٪».
 *
 * هم در پنل «کارهای انبار» و هم به‌صورت فشرده روی ردیفِ فاکتور استفاده می‌شود.
 * سبز عمدی است: مدیر بدون خواندن متن از فاصله دور هم می‌فهمد کار جلو رفته.
 */
export function TaskProgressBar({
  task,
  compact,
}: {
  task: WorkTask;
  compact?: boolean;
}) {
  const pct =
    task.totalItems > 0
      ? Math.round((task.doneItems / task.totalItems) * 100)
      : 0;
  const label = `${toFa(task.doneItems)} / ${toFa(task.totalItems)} آیتم — ${toFa(pct)}٪`;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5" title={label}>
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {toFa(pct)}٪
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        {task.status === "COMPLETED" && (
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            تکمیل شد
          </span>
        )}
        {task.status === "CANCELLED" && (
          <span className="font-medium text-destructive">لغو شد</span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
