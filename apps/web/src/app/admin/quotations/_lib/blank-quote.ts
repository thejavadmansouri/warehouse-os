import { toFa } from "@/lib/format";
import type { BlankQuotation } from "@/lib/types";

/**
 * وضعیتِ قابل‌نمایشِ یک برگه‌ی سفید.
 *
 * عمداً از `status` سرور جدا محاسبه می‌شود:
 *
 *  • «منقضی» وضعیت ذخیره‌شده نیست (سرور آن را از `validUntil` حساب می‌کند) و
 *    برگه‌های بدون تاریخ هیچ‌وقت منقضی نمی‌شوند.
 *  • مهم‌ترین حالتِ این فیچر `PARTIAL` است: برگه‌ای که بعضی قلم‌هایش قیمت نخورده
 *    یا به کالا وصل نشده. این همان چیزی است که قفلِ تبدیل را توضیح می‌دهد و
 *    اگر پنل آن را نشان ندهد، مدیر نمی‌فهمد چرا دکمه خاموش است.
 */
export type BlankDisplayState =
  | "UNPRICED"
  | "PARTIAL"
  | "READY"
  | "CONVERTED"
  | "CANCELLED"
  | "EXPIRED";

type BlankStateInput = Pick<
  BlankQuotation,
  "status" | "displayStatus" | "unpricedCount" | "unlinkedCount" | "lineCount"
>;

export function blankDisplayState(q: BlankStateInput): BlankDisplayState {
  if (q.status === "CONVERTED") return "CONVERTED";
  if (q.status === "CANCELLED") return "CANCELLED";
  if (q.displayStatus === "EXPIRED") return "EXPIRED";

  const nothingPriced = q.lineCount > 0 && q.unpricedCount === q.lineCount;
  if (nothingPriced) return "UNPRICED";

  if (q.unpricedCount > 0 || q.unlinkedCount > 0) return "PARTIAL";
  return "READY";
}

/** آیا همه‌ی اقلام قیمت خورده و به کالا وصل شده‌اند؟ (تنها شرطِ پنل) */
export function canConvert(q: BlankStateInput): boolean {
  if (q.status === "CONVERTED" || q.status === "CANCELLED") return false;
  if (q.displayStatus === "EXPIRED") return false;
  return q.lineCount > 0 && q.unpricedCount === 0 && q.unlinkedCount === 0;
}

/**
 * دلیلِ خاموشیِ دکمه‌ی تبدیل — همان چیزی که کنار دکمه نوشته می‌شود.
 * `null` یعنی مانعی نیست (سرور هم مستقل همین را چک می‌کند).
 */
export function convertBlockedReason(q: BlankStateInput): string | null {
  if (q.status === "CONVERTED") return "این برگه قبلاً تبدیل شده است";
  if (q.status === "CANCELLED") return "این برگه لغو شده است";
  if (q.displayStatus === "EXPIRED") return "اعتبار این برگه تمام شده است";
  if (q.lineCount === 0) return "این برگه قلمی ندارد";
  if (q.unlinkedCount > 0) return `${toFa(q.unlinkedCount)} قلم هنوز به کالای واقعی وصل نشده`;
  if (q.unpricedCount > 0) return `${toFa(q.unpricedCount)} قلم هنوز قیمت نهایی نخورده`;
  return null;
}

/**
 * شماره‌ی برگه با پیشوند.
 *
 * سری شماره‌ی برگه‌ی سفید از پیش‌فاکتور عادی جداست، پس بدون پیشوند دو
 * «پیش‌فاکتور ۱۲» وجود داشت و هیچ‌کس نمی‌دانست کدام کدام است.
 */
export function blankNumberLabel(n: number): string {
  return `سفید ${toFa(n)}`;
}

/** جمعِ قطعی؛ `null` یعنی معنا ندارد چون هنوز قلمی قیمت نخورده. */
export function blankTotal(q: Pick<BlankQuotation, "total" | "unpricedCount">): number | null {
  return q.unpricedCount > 0 ? null : q.total;
}

export const BLANK_STATE_STYLE: Record<
  BlankDisplayState,
  { label: string; className: string }
> = {
  UNPRICED: { label: "قیمت نخورده", className: "border-amber-600 text-amber-700" },
  PARTIAL: { label: "نیمه‌کاره", className: "border-amber-600 text-amber-700" },
  READY: { label: "آماده‌ی تبدیل", className: "border-emerald-600 text-emerald-700" },
  CONVERTED: { label: "تبدیل شد", className: "border-primary text-primary" },
  CANCELLED: { label: "لغو شد", className: "border-destructive text-destructive" },
  EXPIRED: { label: "منقضی", className: "border-amber-600 text-amber-700" },
};
