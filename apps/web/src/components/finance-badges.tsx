import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  balanceKind,
  BALANCE,
  BALANCE_BADGE_CLASS,
  payStatus,
  PAY_STATUS,
} from "@/lib/finance";

/**
 * نشانِ مانده — تنها راهِ نشان‌دادنِ ماندهٔ مشتری در کلِ برنامه.
 *
 * مصرف‌کنندگان: حساب‌بازهای صندوق (F3)، پنل فاکتورهای مشتری، کارت حساب.
 * معوق فقط برای بدهکار معنا دارد؛ طلبکار هرگز معوق نمی‌شود.
 */
export function BalanceBadge({
  amount,
  overdue = false,
  className,
}: {
  amount: number;
  overdue?: boolean;
  className?: string;
}) {
  if (amount > 0 && overdue) {
    return (
      <Badge variant="outline" className={cn("font-medium", PAY_STATUS.overdue.cls, className)}>
        {PAY_STATUS.overdue.label}
      </Badge>
    );
  }
  const kind = balanceKind(amount);
  return (
    <Badge variant="outline" className={cn("font-medium", BALANCE_BADGE_CLASS[kind], className)}>
      {BALANCE[kind].label}
    </Badge>
  );
}

/** رنگِ متنِ عدد مانده — برای سلول‌های جدول، هم‌زبان با نشان. */
export function balanceTextClass(amount: number | null | undefined): string {
  return BALANCE[balanceKind(amount)].text;
}

/**
 * نشانِ وضعیت پرداختِ فاکتور — پرداخت کامل / نسیه / معوق.
 * فاکتورِ باطل نشانِ پرداخت نمی‌گیرد (نشانِ «باطل» کارِ StatusBadge است).
 */
export function InvoicePayBadge({
  invoice,
  now,
  className,
}: {
  invoice: {
    total?: number | null;
    dueAmount?: number | null;
    status?: string | null;
    dueDate?: string | null;
  };
  now?: Date;
  className?: string;
}) {
  const key = payStatus(invoice, now);
  if (key === "void") return null;
  return (
    <Badge variant="outline" className={cn("font-medium", PAY_STATUS[key].cls, className)}>
      {PAY_STATUS[key].label}
    </Badge>
  );
}
