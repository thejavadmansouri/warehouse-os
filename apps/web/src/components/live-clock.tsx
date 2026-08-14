"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * ساعت و تاریخ شمسیِ زنده.
 *
 * روی هر فاکتور و رسیدی که ثبت می‌شود تاریخ می‌خورد؛ فروشنده باید بدون
 * برگشتن به ویندوز بداند الان چه تاریخی است.
 *
 * تا قبل از mount هیچ زمانی رندر نمی‌شود. سرور و مرورگر هیچ‌وقت روی یک ثانیه
 * نیستند، و رندرِ زمان در HTML سرور یعنی خطای hydration در هر بار بارگذاری.
 * جای خالی هم‌عرض نگه داشته می‌شود تا با آمدن ساعت، چیدمان نپرد.
 */
export function LiveClock({
  variant = "full",
}: {
  variant?: "full" | "compact";
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // اولین زمان با تأخیر صفر — setStateِ همزمان در بدنه‌ی effect ممنوع است
    // (react-hooks/set-state-in-effect)؛ عملاً همان فریم اول است.
    const first = setTimeout(() => setNow(new Date()), 0);
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
    };
  }, []);

  if (!now) {
    return (
      <div
        className={`h-10 ${variant === "full" ? "w-44" : "w-32"}`}
        aria-hidden
      />
    );
  }

  const time = new Intl.DateTimeFormat("fa-IR-u-nu-arabext", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);

  const date = new Intl.DateTimeFormat(
    "fa-IR-u-nu-arabext",
    variant === "full"
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : { year: "2-digit", month: "2-digit", day: "2-digit" }
  ).format(now);

  return (
    <div className="flex h-10 items-center gap-2 rounded-full bg-muted/60 px-3 leading-none">
      <Clock className="size-4 shrink-0 text-primary" />
      <div className="flex flex-col items-start gap-0.5 leading-none">
        {/* tabular-nums لازم است، وگرنه با هر تیکِ ثانیه عرضِ ساعت می‌لرزد. */}
        <span className="text-base font-bold tabular-nums">{time}</span>
        <span className="text-[11px] text-muted-foreground">{date}</span>
      </div>
    </div>
  );
}
