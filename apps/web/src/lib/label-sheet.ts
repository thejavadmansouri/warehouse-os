/**
 * چیدنِ لیبل روی کاغذِ A4/A5/A6.
 *
 * چرا حساب می‌شود و ثابت نیست: عرضِ لیبل انتخابی است (۴، ۵ یا ۶ سانتی‌متر) و
 * عرضِ کاغذ هم. سه ستونی که روی A4 جا می‌شود، روی A6 از لبه بیرون می‌زند و
 * مرورگر ستونِ آخر را می‌بُرد — و این را فقط بعد از چاپ روی کاغذ می‌فهمی، وقتی
 * ده برگه هدر رفته.
 */

export type LabelPaper = "A4" | "A5" | "A6";

export interface PaperSpec {
  /** عرضِ کاغذ به میلی‌متر (عمودی). */
  widthMm: number;
  heightMm: number;
  label: string;
}

export const PAPERS: Record<LabelPaper, PaperSpec> = {
  A4: { widthMm: 210, heightMm: 297, label: "A4" },
  A5: { widthMm: 148, heightMm: 210, label: "A5" },
  A6: { widthMm: 105, heightMm: 148, label: "A6" },
};

/** حاشیه‌ی کاغذ در چاپ — همان عددی که در `@page` می‌رود. */
export const PAGE_MARGIN_MM = 5;

/** فاصله‌ی بین لیبل‌ها. ثابت و برحسب میلی‌متر تا چیدمانِ چاپ قابل‌پیش‌بینی بماند. */
export const LABEL_GAP_MM = 4;

/**
 * بیشترین تعداد ستونی که با این عرضِ لیبل روی این کاغذ جا می‌شود.
 *
 * `n` ستون یعنی `n × عرض + (n−1) × فاصله` که باید در عرضِ مفید بگنجد؛ حلِ آن
 * برای n می‌شود همین فرمول. دستِ‌کم یک ستون برمی‌گردد: لیبلی که از خودِ کاغذ
 * پهن‌تر است به‌هرحال بریده می‌شود، ولی صفر ستون یعنی صفحه‌ی خالی.
 */
export function columnsFor(paper: LabelPaper, labelWidthMm: number): number {
  const usable = PAPERS[paper].widthMm - 2 * PAGE_MARGIN_MM;
  const n = Math.floor((usable + LABEL_GAP_MM) / (labelWidthMm + LABEL_GAP_MM));
  return Math.max(1, n);
}

/**
 * تعدادِ لیبل در هر برگه — برای اینکه پیش از چاپ بشود گفت «۳ برگه می‌شود».
 * فروشنده باید بداند چند کاغذ در دستگاه بگذارد.
 */
export function labelsPerSheet(
  paper: LabelPaper,
  labelWidthMm: number,
  labelHeightMm: number,
): number {
  const cols = columnsFor(paper, labelWidthMm);
  const usableH = PAPERS[paper].heightMm - 2 * PAGE_MARGIN_MM;
  const rows = Math.max(
    1,
    Math.floor((usableH + LABEL_GAP_MM) / (labelHeightMm + LABEL_GAP_MM)),
  );
  return cols * rows;
}
