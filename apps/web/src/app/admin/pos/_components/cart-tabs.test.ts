import { describe, expect, it } from "vitest";

import { tabName } from "./cart-tabs";

describe("نامِ تبِ فاکتور", () => {
  it("نامِ کوتاه دست‌نخورده می‌ماند", () => {
    expect(tabName("رضا نوری", "رضا")).toBe("رضا نوری");
  });

  it("نامِ بلند به نام کوچک برمی‌گردد، نه به برشِ وسطِ کلمه", () => {
    expect(tabName("محمدرضا کریمی", "محمدرضا")).toBe("محمدرضا");
  });

  it("نام کوچکِ بلند بریده می‌شود", () => {
    expect(tabName("عبدالرحمان نوری", "عبدالرحمان")).toBe("عبدالرحم…");
  });

  it("بدون نام کوچک، از نامِ کامل می‌برد", () => {
    expect(tabName("شرکت بازرگانی پارس")).toBe("شرکت باز…");
  });

  it("هیچ خروجی‌ای از ۹ کاراکتر (۸ + «…») بلندتر نیست", () => {
    const samples = [
      ["محمدرضا کریمی", "محمدرضا"],
      ["عبدالرحمان نوری", "عبدالرحمان"],
      ["شرکت بازرگانی پارس خودرو", "شرکت"],
      ["a".repeat(80), "b".repeat(80)],
    ] as const;
    for (const [full, first] of samples) {
      expect(tabName(full, first).length).toBeLessThanOrEqual(9);
    }
  });

  it("ورودیِ خالی یا فاصله‌دار برنامه را نمی‌شکند", () => {
    expect(tabName("", "")).toBe("");
    expect(tabName("  رضا  ", null)).toBe("رضا");
  });
});
