import { describe, expect, it } from "vitest";

import {
  blankDisplayState,
  blankNumberLabel,
  blankTotal,
  canConvert,
  convertBlockedReason,
} from "./blank-quote";

/** حداقلِ ورودیِ محاسبه‌ی وضعیت — بقیه‌ی فیلدهای برگه در این تست اهمیتی ندارند. */
function state(over: Partial<Parameters<typeof blankDisplayState>[0]> = {}) {
  return {
    status: "OPEN" as const,
    displayStatus: "OPEN" as const,
    lineCount: 2,
    unpricedCount: 0,
    unlinkedCount: 0,
    ...over,
  };
}

describe("blankDisplayState", () => {
  it("برگه‌ای که هیچ قلمش قیمت نخورده «قیمت نخورده» است", () => {
    expect(blankDisplayState(state({ lineCount: 3, unpricedCount: 3 }))).toBe("UNPRICED");
  });

  it("قلمِ بدون کالا هم برگه را نیمه‌کاره می‌کند", () => {
    expect(blankDisplayState(state({ unlinkedCount: 1 }))).toBe("PARTIAL");
  });

  it("قیمت‌خورده ولی وصل‌نشده همچنان نیمه‌کاره است", () => {
    expect(blankDisplayState(state({ unpricedCount: 1, unlinkedCount: 1 }))).toBe("PARTIAL");
  });

  it("وقتی همه‌ی اقلام قیمت خورده و وصل شده باشند آماده‌ی تبدیل است", () => {
    expect(blankDisplayState(state())).toBe("READY");
  });

  it("وضعیت ذخیره‌شده بر محاسبه‌ی اقلام مقدم است", () => {
    expect(blankDisplayState(state({ status: "CONVERTED", unpricedCount: 2 }))).toBe("CONVERTED");
    expect(blankDisplayState(state({ status: "CANCELLED" }))).toBe("CANCELLED");
  });

  it("انقضا از سرور می‌آید و بر سایر حالت‌ها مقدم است", () => {
    expect(blankDisplayState(state({ displayStatus: "EXPIRED" }))).toBe("EXPIRED");
    // برگه‌ی تبدیل‌شده حتی اگر منقضی هم شده باشد، «تبدیل شد» می‌ماند.
    expect(blankDisplayState(state({ status: "CONVERTED", displayStatus: "EXPIRED" }))).toBe(
      "CONVERTED",
    );
  });
});

describe("canConvert / convertBlockedReason", () => {
  it("هر دو با هم هم‌خوان‌اند: تبدیل فقط وقتی ممکن است که دلیلی برای منع نباشد", () => {
    const cases = [
      state(),
      state({ unpricedCount: 1 }),
      state({ unlinkedCount: 2 }),
      state({ lineCount: 0 }),
      state({ status: "CONVERTED" }),
      state({ status: "CANCELLED" }),
      state({ displayStatus: "EXPIRED" }),
    ];
    for (const q of cases) {
      expect(canConvert(q)).toBe(convertBlockedReason(q) === null);
    }
  });

  it("دلیل منع، تعداد همان قلم‌های مانع را می‌گوید", () => {
    expect(convertBlockedReason(state({ unlinkedCount: 2 }))).toContain("۲ قلم");
    expect(convertBlockedReason(state({ unpricedCount: 1 }))).toContain("۱ قلم");
  });

  it("مانعِ وصل‌نشدن بر مانعِ قیمت مقدم است (کارِ اصلی مدیر وصل کردن است)", () => {
    expect(convertBlockedReason(state({ unlinkedCount: 1, unpricedCount: 1 }))).toContain(
      "وصل نشده",
    );
  });
});

describe("blankNumberLabel / blankTotal", () => {
  it("سری شماره‌ی سفید پیشوند دارد تا با پیش‌فاکتور عادی قاطی نشود", () => {
    expect(blankNumberLabel(12)).toContain("۱۲");
    expect(blankNumberLabel(12)).not.toBe("۱۲");
  });

  it("تا وقتی قلمِ قیمت‌نخورده هست جمع معنا ندارد", () => {
    expect(blankTotal({ total: 250_000, unpricedCount: 1 })).toBeNull();
    expect(blankTotal({ total: 250_000, unpricedCount: 0 })).toBe(250_000);
  });
});
