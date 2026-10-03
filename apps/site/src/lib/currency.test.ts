import { describe, expect, it } from "vitest";
import { convert, setCurrencyConfig, toDisplay, unitLabel } from "./currency";

describe("currency", () => {
  it("convert: ریال → تومان رقم آخر را از دست می‌دهد", () => {
    expect(convert(100_000, "RIAL", "TOMAN")).toBe(10_000);
    expect(convert(123_456, "RIAL", "TOMAN")).toBe(12_346);
  });

  it("convert: تومان → ریال ده برابر می‌شود", () => {
    expect(convert(10_000, "TOMAN", "RIAL")).toBe(100_000);
  });

  it("همان واحد دست‌نخورده می‌ماند", () => {
    expect(convert(50_000, "RIAL", "RIAL")).toBe(50_000);
  });

  it("toDisplay با تنظیمِ پیش‌فرض تبدیل نمی‌کند", () => {
    setCurrencyConfig({ stored: "RIAL", panel: "RIAL" });
    expect(toDisplay(7_500)).toBe(7_500);
  });

  it("unitLabel برچسب فارسی می‌دهد", () => {
    expect(unitLabel("RIAL")).toBe("ریال");
    expect(unitLabel("TOMAN")).toBe("تومان");
  });
});
