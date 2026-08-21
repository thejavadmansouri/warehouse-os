import { beforeEach, describe, expect, it } from "vitest";

import {
  convert,
  currencyConfig,
  fromDisplay,
  setCurrencyConfig,
  toDisplay,
  unitLabel,
} from "./currency";
import { amount, money } from "./format";

beforeEach(() => {
  // هر تست از حالتِ پیش‌فرض شروع می‌کند — پیکربندی ماژول‌سطح است و نشت می‌کند.
  setCurrencyConfig({ stored: "RIAL", panel: "RIAL" });
});

describe("convert", () => {
  it("وقتی دو واحد یکی‌اند دست نمی‌زند", () => {
    expect(convert(185_000, "RIAL", "RIAL")).toBe(185_000);
    expect(convert(18_500, "TOMAN", "TOMAN")).toBe(18_500);
  });

  it("ریال به تومان تقسیم بر ده است", () => {
    expect(convert(185_000, "RIAL", "TOMAN")).toBe(18_500);
  });

  it("تومان به ریال ضرب در ده است", () => {
    expect(convert(18_500, "TOMAN", "RIAL")).toBe(185_000);
  });

  it("ریالِ غیرمضربِ ده گرد می‌شود", () => {
    expect(convert(185_005, "RIAL", "TOMAN")).toBe(18_501);
    expect(convert(185_004, "RIAL", "TOMAN")).toBe(18_500);
  });
});

describe("پیکربندی پیش‌فرض", () => {
  it("پیش از رسیدنِ تنظیمات هیچ تبدیلی انجام نمی‌دهد", () => {
    // مهم‌ترین تست فایل: بدترین حالتِ «تنظیمات نرسیده» باید رفتار قبلی باشد،
    // نه عددی که ده برابر روی صفحه می‌نشیند.
    expect(currencyConfig()).toEqual({ stored: "RIAL", panel: "RIAL" });
    expect(toDisplay(185_000)).toBe(185_000);
    expect(fromDisplay(185_000)).toBe(185_000);
  });
});

describe("نمایش تومان روی داده‌ی ریالی", () => {
  beforeEach(() => setCurrencyConfig({ stored: "RIAL", panel: "TOMAN" }));

  it("عدد را یک‌دهم نشان می‌دهد", () => {
    expect(toDisplay(185_000)).toBe(18_500);
  });

  it("آنچه کاربر تایپ کرده را به واحد ذخیره برمی‌گرداند", () => {
    expect(fromDisplay(18_500)).toBe(185_000);
  });

  it("رفت و برگشت مقدار را حفظ می‌کند", () => {
    for (const v of [0, 10, 5_000, 185_000, 2_147_483_640]) {
      expect(fromDisplay(toDisplay(v))).toBe(v);
    }
  });

  it("برچسب واحد را عوض می‌کند", () => {
    expect(unitLabel()).toBe("تومان");
    expect(amount(185_000)).toBe("۱۸٬۵۰۰ تومان");
  });

  it("money هم تبدیل می‌کند ولی واحد نمی‌چسباند", () => {
    expect(money(185_000)).toBe("۱۸٬۵۰۰");
  });
});

describe("جمعِ فاکتور", () => {
  beforeEach(() => setCurrencyConfig({ stored: "RIAL", panel: "TOMAN" }));

  /*
   * قاعده‌ای که در توضیح `convert` نوشته شده اینجا اثبات می‌شود: اگر اول جمع
   * بزنی و بعد تبدیل کنی، عددِ پایینِ فاکتور با جمعِ ستونِ بالا نمی‌خواند و
   * مشتری با ماشین‌حساب پیدایش می‌کند.
   */
  it("اول تبدیل، بعد جمع — تا ستون فاکتور بخواند", () => {
    const linesInRial = [185_005, 185_005, 185_005];

    const perLine = linesInRial.map(toDisplay);
    const sumOfConverted = perLine.reduce((a, b) => a + b, 0);
    const convertedSum = toDisplay(linesInRial.reduce((a, b) => a + b, 0));

    expect(perLine).toEqual([18_501, 18_501, 18_501]);
    expect(sumOfConverted).toBe(55_503);
    // همان اختلافی که قاعده برای جلوگیری‌اش وجود دارد.
    expect(convertedSum).toBe(55_502);
    expect(sumOfConverted).not.toBe(convertedSum);
  });
});

describe("نمایش ریال روی داده‌ی تومانی", () => {
  it("اگر داده مهاجرت کند، همان منطق برعکس کار می‌کند", () => {
    setCurrencyConfig({ stored: "TOMAN", panel: "RIAL" });
    expect(toDisplay(18_500)).toBe(185_000);
    expect(unitLabel()).toBe("ریال");
  });
});
