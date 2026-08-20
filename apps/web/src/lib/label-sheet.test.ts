import { describe, expect, it } from "vitest";

import {
  PAPERS,
  PAGE_MARGIN_MM,
  LABEL_GAP_MM,
  columnsFor,
  labelsPerSheet,
} from "./label-sheet";

/** آیا این تعداد ستون واقعاً در عرضِ مفیدِ کاغذ جا می‌شود؟ */
function fits(paper: keyof typeof PAPERS, widthMm: number, cols: number) {
  const usable = PAPERS[paper].widthMm - 2 * PAGE_MARGIN_MM;
  return cols * widthMm + (cols - 1) * LABEL_GAP_MM <= usable;
}

describe("columnsFor", () => {
  it("روی A4 با لیبلِ ۵ سانتی سه ستون می‌دهد", () => {
    expect(columnsFor("A4", 50)).toBe(3);
  });

  it("همان لیبل روی کاغذِ کوچک‌تر ستونِ کم‌تری می‌گیرد", () => {
    expect(columnsFor("A5", 50)).toBe(2);
    expect(columnsFor("A6", 50)).toBe(1);
  });

  it("لیبلِ باریک‌تر ستونِ بیشتری جا می‌شود", () => {
    expect(columnsFor("A4", 40)).toBe(4);
    expect(columnsFor("A6", 40)).toBe(2);
  });

  it("هر ترکیبِ کاغذ و اندازه واقعاً جا می‌شود — نه یک ستون بیشتر", () => {
    /*
     * این همان چیزی است که مهم است: عددِ برگشتی نباید از لبه بزند، و نباید یک
     * ستونِ ممکن را هم هدر بدهد. هر دو سمت بررسی می‌شود.
     */
    for (const paper of ["A4", "A5", "A6"] as const) {
      for (const w of [40, 50, 60]) {
        const n = columnsFor(paper, w);
        expect(fits(paper, w, n), `${paper} ${w}mm → ${n}`).toBe(true);
        expect(fits(paper, w, n + 1), `${paper} ${w}mm → ${n + 1}`).toBe(false);
      }
    }
  });

  it("لیبلِ پهن‌تر از کاغذ باز هم یک ستون است، نه صفر", () => {
    // صفر ستون یعنی برگه‌ی خالی — بدتر از لیبلِ بریده.
    expect(columnsFor("A6", 200)).toBe(1);
  });
});

describe("labelsPerSheet", () => {
  it("تعدادِ لیبلِ هر برگه را می‌دهد تا بشود گفت چند کاغذ لازم است", () => {
    // A4: ۳ ستون × ۶ ردیف (۲۸۷ میلی‌متر مفید ÷ ۳۴)
    expect(labelsPerSheet("A4", 50, 30)).toBe(3 * 8);
    // A6 با همان لیبل: یک ستون و جای خیلی کم‌تر
    expect(labelsPerSheet("A6", 50, 30)).toBe(1 * 4);
  });
});
