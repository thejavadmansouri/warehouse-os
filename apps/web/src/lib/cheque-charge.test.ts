import { describe, expect, it } from "vitest";

import {
  bpToPercent,
  computeChequeCharge,
  percentToBp,
  suggestMonths,
} from "./cheque-charge";

/*
 * این تست‌ها عمداً همان اعدادِ تستِ سرور را دارند
 * (apps/api/src/common/cheque-charge.spec.ts). اگر روزی یکی از دو طرف عوض شود،
 * یکی از این دو مجموعه می‌شکند — و همین تنها محافظِ «عددِ روی صفحه = عددِ روی
 * فاکتور» است، چون کد مشترک نیست.
 */
describe("computeChequeCharge", () => {
  it("ماهانه ساده حساب می‌شود، نه مرکب", () => {
    expect(
      computeChequeCharge({ base: 100_000_000, rateBp: 200, months: 3, mode: "MONTHLY" }),
    ).toBe(6_000_000);
  });

  it("حالتِ ثابت به مدت کاری ندارد", () => {
    expect(
      computeChequeCharge({ base: 100_000_000, rateBp: 500, months: 9, mode: "FLAT" }),
    ).toBe(5_000_000);
  });

  it("نرخِ اعشاری با پایه‌ی هزارم بدونِ خطای ممیز کار می‌کند", () => {
    expect(
      computeChequeCharge({ base: 33_333_333, rateBp: 250, months: 2, mode: "MONTHLY" }),
    ).toBe(1_666_667);
  });

  it("ورودیِ بی‌معنا صفر می‌دهد، نه NaN", () => {
    expect(computeChequeCharge({ base: 0, rateBp: 200, months: 3, mode: "MONTHLY" })).toBe(0);
    expect(computeChequeCharge({ base: 1000, rateBp: 0, months: 3, mode: "MONTHLY" })).toBe(0);
    expect(computeChequeCharge({ base: 1000, rateBp: 200, months: 0, mode: "MONTHLY" })).toBe(0);
  });

  it("نرخِ فاجعه‌بار در سقفِ مبلغِ پایه می‌ماند", () => {
    expect(
      computeChequeCharge({ base: 10_000_000, rateBp: 25_000, months: 3, mode: "MONTHLY" }),
    ).toBe(10_000_000);
  });
});

describe("suggestMonths", () => {
  const from = new Date("2026-08-18T00:00:00Z");

  it("روز را به ماهِ گردشده تبدیل می‌کند", () => {
    expect(suggestMonths("2026-11-16T00:00:00Z", from)).toBe(3);
    expect(suggestMonths("2026-09-17T00:00:00Z", from)).toBe(1);
  });

  it("سررسیدِ گذشته صفر است", () => {
    expect(suggestMonths("2026-08-10T00:00:00Z", from)).toBe(0);
  });
});

describe("تبدیل درصد و پایه‌ی هزارم", () => {
  it("رفت و برگشت عدد را عوض نمی‌کند", () => {
    for (const p of [0, 1, 2.5, 5, 12.75]) {
      expect(Number(bpToPercent(percentToBp(p)))).toBe(p);
    }
  });

  it("ورودیِ خراب صفر می‌شود", () => {
    expect(percentToBp("abc")).toBe(0);
    expect(percentToBp(-3)).toBe(0);
  });
});
