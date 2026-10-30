/**
 * کاردو B2B — موتور لجستیک و ارسال بار استان کرمان
 * مدیریت مقاصد، باربری‌های میدان ترمینال کرمان، بارنامه، بیجک و پیک شهری
 */

export const KERMAN_CITIES = [
  "کرمان",
  "رفسنجان",
  "سیرجان",
  "بم",
  "جیرفت",
  "زرند",
  "شهربابک",
  "بافت",
  "بردسیر",
  "کهنوج",
  "راور",
  "انار",
  "عنبرآباد",
  "منوجان",
  "رودبار جنوب",
  "قلعه‌گنج",
  "فاریاب",
  "ریگان",
  "فهرج",
  "نرماشیر",
  "ارزوئیه",
  "کوهبنان",
] as const;

export type KermanCity = (typeof KERMAN_CITIES)[number];

export const CARRIER_OPTIONS = [
  {
    name: "باربری پیام شمس کرمان",
    phone: "034-32110001",
    hub: "میدان ترمینال (بلوار شهید صدوقی)",
    description: "ارسال روزانه به کلیه شهرستان‌های شمال و جنوب استان کرمان",
  },
  {
    name: "باربری پیشتاز کرمان",
    phone: "034-32120002",
    hub: "میدان ترمینال کرمان",
    description: "تخصصی قطعات یدکی و کارتن‌های سنگین، تحویل ۲۴ ساعته",
  },
  {
    name: "باربری امید کرمان",
    phone: "034-32130003",
    hub: "شهرک صنعتی خضراء کرمان",
    description: "ارسال به جیرفت، کهنوج و بم با بارنامه معتبر",
  },
  {
    name: "اتوبوسرانی پایانه مسافربری آدینه",
    phone: "034-32150004",
    hub: "ترمینال جدید کرمان",
    description: "ارسال فوری با انبار توشه اتوبوس (تحویل در همان روز)",
  },
  {
    name: "پیک اکسپرس درون‌شهری کرمان",
    phone: "034-33200000",
    hub: "انبار مرکزی کاردو کرمان",
    description: "تحویل فوری ظرف ۳ ساعت در محدوده شهر کرمان",
  },
  {
    name: "تحویل حضوری در انبار مرکزی",
    phone: "034-33200001",
    hub: "کرمان، بلوار جمهوری، انبار مرکزی کاردو",
    description: "دریافت توسط نماینده یا راننده همکار با ارائه کارت شناسایی",
  },
] as const;

export const SHIPMENT_STATUS_MAP: Record<
  string,
  { label: string; badgeClass: string; stepIndex: number }
> = {
  PREPARING: {
    label: "در حال بسته‌بندی در انبار مرکزی",
    badgeClass: "bg-amber-500/10 text-amber-700 border-amber-300",
    stepIndex: 1,
  },
  HANDED_TO_CARRIER: {
    label: "تحویل باربری گردید (صادرشده)",
    badgeClass: "bg-blue-500/10 text-blue-700 border-blue-300",
    stepIndex: 2,
  },
  DELIVERED: {
    label: "تحویل همکار شد",
    badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
    stepIndex: 3,
  },
  CANCELLED: {
    label: "لغو ارسال",
    badgeClass: "bg-rose-500/10 text-rose-700 border-rose-300",
    stepIndex: 0,
  },
};

export const FREIGHT_PAYMENT_LABELS: Record<string, string> = {
  PAY_ON_DELIVERY: "پس‌کرایه (پرداخت کرایه به باربری در مقصد)",
  PREPAID: "پیش‌کرایه (محاسبه و تسویه روی فاکتور)",
  FREE_SHIPPING: "ارسال رایگان کاردو",
};
