import { money, rial } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * نمایشِ مبلغ با لحنِ معنایی.
 *
 * تا حالا رنگِ مبلغ همه‌جا دستی زده می‌شد (`text-amber-600` برای بدهی،
 * `text-emerald-600` برای دریافت). این کامپوننت آن تصمیم را یک‌جا می‌کند تا
 * «بدهی» و «بستانکاری» در کلِ برنامه یک رنگ داشته باشند و با تمِ تیره هم بخوانند.
 */
type MoneyTone = "default" | "due" | "positive" | "muted" | "danger";

const toneClass: Record<MoneyTone, string> = {
  default: "",
  due: "text-warning",
  positive: "text-success",
  muted: "text-muted-foreground",
  danger: "text-destructive",
};

export function Money({
  value,
  tone = "default",
  withUnit = false,
  className,
}: {
  value?: number | null;
  tone?: MoneyTone;
  /** واحد «ریال» هم چاپ شود. */
  withUnit?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", toneClass[tone], className)}>
      {withUnit ? rial(value) : money(value)}
    </span>
  );
}
