/**
 * بزرگ‌نمایی و کنتراستِ رابط — «حالت مغازه».
 *
 * چرا خودمان و نه زوم مرورگر: زوم به نشستِ مرورگر گره خورده، با هر پروفایل و
 * هر دستگاه از نو تنظیم می‌شود، روی برگه‌ی چاپ هم اثر می‌گذارد. اینجا تنظیم
 * روی همان کامپیوترِ پیشخوان می‌ماند و فقط رابط را بزرگ می‌کند، نه فاکتور را.
 *
 * مقدار روی <html> می‌نشیند (`--ui-scale` و `data-contrast`) و globals.css
 * بقیه‌اش را می‌داند؛ هیچ صفحه‌ای لازم نیست از این استور خبر داشته باشد.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * پله‌ها، نه یک عددِ آزاد.
 *
 * فروشنده وسطِ فروش نباید اسلایدر تنظیم کند؛ چند پله که هرکدام یک جهش
 * محسوس باشد کافی است. زیرِ ۱۰۰ هم پله هست (تا ۶۰٪): مانیتورِ کوچکِ صندوق
 * یا خروجیِ پروژکتور گاهی «بزرگ‌ترین» نیست — کاربر باید بتواند کوچک هم کند.
 */
export const UI_SCALES = [0.6, 0.75, 0.85, 1, 1.12, 1.25, 1.4, 1.6] as const;

export const SCALE_LABELS: Record<number, string> = {
  0.6: "۶۰٪",
  0.75: "۷۵٪",
  0.85: "۸۵٪",
  1: "۱۰۰٪",
  1.12: "۱۱۲٪",
  1.25: "۱۲۵٪",
  1.4: "۱۴۰٪",
  1.6: "۱۶۰٪",
};

interface UiScaleState {
  scale: number;
  highContrast: boolean;
  /** تراکم جدول صندوق — عادی / فشرده (۲۰+ قلم) / خیلی فشرده (۲۵+ قلم). */
  posDensity: "normal" | "compact" | "ultra";
  setPosDensity: (d: "normal" | "compact" | "ultra") => void;
  setScale: (s: number) => void;
  bigger: () => void;
  smaller: () => void;
  reset: () => void;
  toggleContrast: () => void;
}

/** نزدیک‌ترین پله به مقدارِ ذخیره‌شده — تا مقدارِ دستیِ خراب قفلمان نکند. */
function stepIndex(scale: number): number {
  let best = 0;
  UI_SCALES.forEach((s, i) => {
    if (Math.abs(s - scale) < Math.abs(UI_SCALES[best] - scale)) best = i;
  });
  return best;
}

export const useUiScale = create<UiScaleState>()(
  persist(
    (set, get) => ({
      scale: 1,
      highContrast: false,
      posDensity: "normal",
      setPosDensity: (d) => set({ posDensity: d }),
      setScale: (s) => set({ scale: s }),
      bigger: () =>
        set({ scale: UI_SCALES[Math.min(stepIndex(get().scale) + 1, UI_SCALES.length - 1)] }),
      smaller: () => set({ scale: UI_SCALES[Math.max(stepIndex(get().scale) - 1, 0)] }),
      reset: () => set({ scale: 1 }),
      toggleContrast: () => set({ highContrast: !get().highContrast }),
    }),
    { name: "kardo-ui-scale" },
  ),
);
