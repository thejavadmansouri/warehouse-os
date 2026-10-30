export const ORDER_STATUS: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "ink" }
> = {
  PROFORMA: { label: "پیش‌فاکتور", tone: "amber" },
  AWAITING_CREDIT_APPROVAL: { label: "در انتظار تأیید اعتباری", tone: "amber" },
  APPROVED_CREDIT: { label: "اعتباری تأییدشده", tone: "ink" },
  PAID: { label: "پرداخت‌شده", tone: "green" },
  CANCELLED: { label: "لغو‌شده", tone: "red" },
  EXPIRED: { label: "منقضی", tone: "red" },
};

export function statusLabel(status: string): string {
  return ORDER_STATUS[status]?.label ?? status;
}

export const INQUIRY_STATUS: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "ink" }
> = {
  PENDING: { label: "در انتظار قیمت‌گذاری", tone: "amber" },
  ANSWERED: { label: "قیمت‌گذاری شده (آماده سفارش)", tone: "green" },
  CONVERTED: { label: "تبدیل به پیش‌فاکتور", tone: "ink" },
  REJECTED: { label: "رد شده", tone: "red" },
};

export function inquiryStatusLabel(status: string): string {
  return INQUIRY_STATUS[status]?.label ?? status;
}

export const WALLET_TX_LABEL: Record<string, string> = {
  TOPUP_ONLINE: "شارژ آنلاین",
  TOPUP_MANUAL: "شارژ دستی",
  PURCHASE: "خرید",
  REFUND: "برگشت وجه",
  ADJUST: "اصلاح",
};

/** قواعد نمایش مبلغ کیف پول: مثبت سبز، منفی قرمز */
export function walletAmountTone(amount: number): "green" | "red" {
  return amount >= 0 ? "green" : "red";
}
