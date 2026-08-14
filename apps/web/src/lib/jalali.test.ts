import { describe, expect, it } from "vitest";

import {
  faToEn,
  formatJalali,
  isLeapJalaliYear,
  isValidJalali,
  jalaliMonthLength,
  toFaDigits,
  toGregorian,
  toJalali,
} from "./jalali";

/** ساخت تاریخِ محلی با ساعتِ صفر — بدون وابستگی به UTC. */
function localDate(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

/** اجزای (سال، ماه، روز) یک Date به‌صورت محلی. */
function parts(d: Date): [number, number, number] {
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

describe("تبدیل‌های پایه", () => {
  it("۱ فروردین ۱۴۰۰ برابر ۲۰۲۱-۰۳-۲۱ است", () => {
    expect(parts(toGregorian(1400, 1, 1))).toEqual([2021, 3, 21]);
    expect(toJalali(localDate(2021, 3, 21))).toEqual({ jy: 1400, jm: 1, jd: 1 });
  });

  it("نوروز ۱۴۰۴ برابر ۲۰۲۵-۰۳-۲۱ است", () => {
    expect(parts(toGregorian(1404, 1, 1))).toEqual([2025, 3, 21]);
  });

  it("ساعتِ روز روی مرزِ تاریخ اثر ندارد (نرمال به ۰۰:۰۰:۰۰)", () => {
    expect(toJalali(new Date(2021, 2, 21, 23, 59, 59))).toEqual({
      jy: 1400,
      jm: 1,
      jd: 1,
    });
  });
});

describe("سال کبیسه", () => {
  it("۱۴۰۳ کبیسه است و ۲۹ و ۳۰ اسفند هر دو معتبرند", () => {
    expect(isLeapJalaliYear(1403)).toBe(true);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(isValidJalali(1403, 12, 29)).toBe(true);
    expect(isValidJalali(1403, 12, 30)).toBe(true);
    expect(parts(toGregorian(1403, 12, 29))).toEqual([2025, 3, 19]);
    expect(parts(toGregorian(1403, 12, 30))).toEqual([2025, 3, 20]);
  });

  it("۱۴۰۴ کبیسه نیست و ۳۰ اسفند نامعتبر است", () => {
    expect(isLeapJalaliYear(1404)).toBe(false);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(isValidJalali(1404, 12, 29)).toBe(true);
    expect(isValidJalali(1404, 12, 30)).toBe(false);
    expect(() => toGregorian(1404, 12, 30)).toThrow();
  });
});

describe("طول ماه‌ها و اعتبارسنجی", () => {
  it("ماه‌های ۱ تا ۶ سی‌ویک‌روزه‌اند", () => {
    for (let jm = 1; jm <= 6; jm += 1) {
      expect(jalaliMonthLength(1404, jm)).toBe(31);
    }
  });

  it("ماه‌های ۷ تا ۱۱ سی‌روزه‌اند", () => {
    for (let jm = 7; jm <= 11; jm += 1) {
      expect(jalaliMonthLength(1404, jm)).toBe(30);
    }
  });

  it("ماه و روزِ بیرون از محدوده نامعتبرند", () => {
    expect(isValidJalali(1404, 0, 1)).toBe(false);
    expect(isValidJalali(1404, 13, 1)).toBe(false);
    expect(isValidJalali(1404, 1, 0)).toBe(false);
    expect(isValidJalali(1404, 1, 32)).toBe(false);
  });

  it("سالِ بیرون از محدوده‌ی پشتیبانی‌شده نامعتبر است", () => {
    expect(isValidJalali(-62, 1, 1)).toBe(false);
    expect(isValidJalali(3178, 1, 1)).toBe(false);
  });
});

describe("فرمت جلالی و ارقام", () => {
  it("۱۲ مرداد ۱۴۰۴ → «۱۴۰۴/۰۵/۱۲»", () => {
    expect(formatJalali(localDate(2025, 8, 3))).toBe("۱۴۰۴/۰۵/۱۲");
  });

  it("تبدیل ارقام فارسی/عربی → انگلیسی و برعکس", () => {
    expect(faToEn("۱۴۰۴/۰۵/۱۲")).toBe("1404/05/12");
    expect(faToEn("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(toFaDigits("1404")).toBe("۱۴۰۴");
  });
});

describe("رفت‌وبرگشت ۲۰۰۰ روز متوالی", () => {
  it("toJalali(toGregorian(x)) برابر خود x می‌ماند", () => {
    const start = localDate(2021, 1, 1);
    for (let i = 0; i < 2000; i += 1) {
      const d = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + i,
      );
      const j = toJalali(d);
      expect(parts(toGregorian(j.jy, j.jm, j.jd))).toEqual(parts(d));
    }
  });
});
