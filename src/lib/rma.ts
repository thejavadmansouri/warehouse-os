/**
 * کاردو B2B — مدیریت خدمات پس از فروش، گارانتی و مرجوعی قطعات (RMA)
 */

export const RMA_REASONS = {
  DEFECTIVE: {
    label: "خرابی و نقص فنی قطعه (گارانتی تعویض)",
    description: "قطعه دارای نقص عملکردی، نشتی، خرابی برقی یا تاب‌برداشتگی است.",
  },
  WRONG_ITEM: {
    label: "مغایرت کد فنی یا کالای ارسالی با فاکتور",
    description: "قطعه ارسالی با کد فنی سفارش‌داده‌شده مطابقت ندارد.",
  },
  DAMAGED_IN_SHIPPING: {
    label: "شکستگی یا آسیب‌دیدگی در حین باربری",
    description: "کارتن یا قطعه در مسیر انتقال بار دچار ضربه یا شکستگی شده است.",
  },
  SURPLUS_ORDER: {
    label: "انصراف یا سفارش مازاد همکار (کارتن پلمپ)",
    description: "بسته‌بندی باز نشده و قطعه دست‌نخورده جهت بازگشت به انبار مرکزی است.",
  },
} as const;

export type RmaReasonKey = keyof typeof RMA_REASONS;

export const RMA_STATUS_MAP: Record<
  string,
  { label: string; badgeClass: string; step: number }
> = {
  PENDING: {
    label: "در حال بررسی توسط کارشناس فنی کاردو",
    badgeClass: "bg-amber-500/10 text-amber-700 border-amber-300",
    step: 1,
  },
  APPROVED: {
    label: "تأیید اولیه — لطفاً قطعه را به انبار مرکزی ارسال فرمایید",
    badgeClass: "bg-blue-500/10 text-blue-700 border-blue-300",
    step: 2,
  },
  RECEIVED: {
    label: "دریافت در انبار مرکزی و تأیید اصالت قطعه",
    badgeClass: "bg-purple-500/10 text-purple-700 border-purple-300",
    step: 3,
  },
  REFUNDED: {
    label: "تکمیل شد — مبلغ به کیف پول همکار عودت داده شد",
    badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
    step: 4,
  },
  REJECTED: {
    label: "درخواست مرجوعی رد گردید",
    badgeClass: "bg-rose-500/10 text-rose-700 border-rose-300",
    step: 0,
  },
};
