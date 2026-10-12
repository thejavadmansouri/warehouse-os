/**
 * عرض تکهٔ رول در چاپ — از فایل موفق 100200_big (۱۰۴mm)، نه دقیقاً ۱۰۰.
 * کاربر فقط اندازهٔ برچسب را انتخاب می‌کند؛
 * تعداد ستون = floor(ROLL_MEDIA_WIDTH_MM / widthMm) و سلول‌ها مساوی تقسیم می‌شوند.
 */
export const ROLL_MEDIA_WIDTH_MM = 104;

export type RollStickerPreset = {
  id: string;
  /** عرض هر برچسب در جهت عرض رول (میلی‌متر) */
  widthMm: number;
  /** ارتفاع برچسب / پیشروی رول (میلی‌متر) */
  heightMm: number;
  /** فاصلهٔ فیزیکی بین برچسب‌ها (GAP) */
  gapMm: number;
  /** عنوان کوتاه برای دکمه */
  label: string;
  /** توضیح یک‌خطی */
  hint: string;
};

export const ROLL_STICKER_PRESETS: RollStickerPreset[] = [
  {
    id: "30x20-3up",
    widthMm: 30,
    heightMm: 20,
    gapMm: 2,
    label: "۳ × ۲ سانتی",
    hint: "سه برچسب کنار هم روی رول ۱۰ سانتی (۳۰×۲۰ میلی‌متر)",
  },
  {
    id: "20x30-5up",
    widthMm: 20,
    heightMm: 30,
    gapMm: 2,
    label: "۲ × ۳ سانتی",
    hint: "پنج برچسب کنار هم — عرض ۲ و طول ۳ سانتی‌متر",
  },
  {
    id: "34x25-3up",
    widthMm: 34,
    heightMm: 25,
    gapMm: 2,
    label: "مثل ۱۰۰۲۰۰ (≈۳.۵×۲.۵)",
    hint: "سه برچسب مساوی روی رول ۱۰۴×۲۵mm — همان فایل موفق",
  },
  {
    id: "33x25-3up",
    widthMm: 33,
    heightMm: 25,
    gapMm: 2,
    label: "۳.۳ × ۲.۵ سانتی",
    hint: "سه برچسب کنار هم روی رول ۱۰۴mm",
  },
  {
    id: "50x25-2up",
    widthMm: 50,
    heightMm: 25,
    gapMm: 2,
    label: "۵ × ۲.۵ سانتی",
    hint: "دو برچسب کنار هم روی رول ۱۰ سانتی",
  },
  {
    id: "50x30-2up",
    widthMm: 50,
    heightMm: 30,
    gapMm: 2,
    label: "۵ × ۳ سانتی",
    hint: "دو برچسب کنار هم (لیبل کالای رایج)",
  },
  {
    id: "104x30-1up",
    widthMm: 104,
    heightMm: 30,
    gapMm: 2,
    label: "تمام‌عرض رول",
    hint: "یک برچسب به عرض کل تکهٔ رول (۱۰۴mm)",
  },
];

export function rollColumns(widthMm: number, mediaWidthMm = ROLL_MEDIA_WIDTH_MM): number {
  return Math.max(1, Math.floor(mediaWidthMm / Math.max(1, widthMm)));
}

export function matchRollPreset(
  widthMm: number,
  heightMm: number,
): RollStickerPreset | null {
  return (
    ROLL_STICKER_PRESETS.find(
      (p) => p.widthMm === widthMm && p.heightMm === heightMm,
    ) ?? null
  );
}
