import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * نشانِ وضعیت — یک منبعِ واحد برای رنگ و برچسبِ وضعیت‌ها در کلِ برنامه.
 *
 * تا حالا هر صفحه خودش وضعیت را به رنگ و متن نگاشت می‌کرد (یک‌جا «باطل شده»
 * قرمز، جای دیگر خاکستری). این کامپوننت آن نگاشت را قطعی می‌کند.
 */
type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

const toneClass: Record<Tone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/15 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-info/30 bg-info/10 text-info",
  neutral: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/30 bg-primary/10 text-primary",
};

type Entry = readonly [label: string, tone: Tone];

const MAPS: Record<string, Record<string, Entry>> = {
  invoice: {
    // فاکتورِ جاریِ یک حساب باز — هنوز تسویه نشده. بدونِ این، فهرستِ فاکتورها
    // کلمه‌ی خامِ «OPEN» را نشان می‌داد.
    OPEN: ["حساب باز", "warning"],
    CONFIRMED: ["تأیید شده", "success"],
    CANCELLED: ["باطل شده", "danger"],
  },
  quotation: {
    ACTIVE: ["فعال", "info"],
    CONVERTED: ["تبدیل به فاکتور", "success"],
    CANCELLED: ["باطل شده", "neutral"],
    EXPIRED: ["منقضی", "neutral"],
  },
  /*
   * این نگاشت با enumِ واقعیِ دیتابیس یکی است: IN_HAND | DEPOSITED | CASHED |
   * BOUNCED. قبلاً SETTLED و CANCELLED داشت که اصلاً وجود ندارند، و DEPOSITED و
   * CASHED را نداشت — یعنی چکِ وصول‌شده کلمه‌ی خامِ «CASHED» را نشان می‌داد.
   */
  cheque: {
    IN_HAND: ["نزد ما", "info"],
    DEPOSITED: ["به بانک سپرده شد", "warning"],
    CASHED: ["وصول شد", "success"],
    BOUNCED: ["برگشت خورد", "danger"],
  },
};

export function StatusBadge({
  kind,
  status,
  className,
}: {
  kind: "invoice" | "quotation" | "cheque";
  status: string;
  className?: string;
}) {
  const [label, tone] = MAPS[kind]?.[status] ?? [status, "neutral"];
  return (
    <Badge variant="outline" className={cn("font-medium", toneClass[tone], className)}>
      {label}
    </Badge>
  );
}
