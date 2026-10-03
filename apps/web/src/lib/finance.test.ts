import { describe, expect, it } from "vitest";

import { balanceKind, BALANCE, payStatus, PAY_STATUS } from "./finance";

describe("دیکشنری مالی — balanceKind", () => {
  it("مثبت = بدهکار، منفی = طلبکار، صفر = تسویه", () => {
    expect(balanceKind(1_000)).toBe("debtor");
    expect(balanceKind(-1)).toBe("creditor");
    expect(balanceKind(0)).toBe("settled");
    expect(balanceKind(null)).toBe("settled");
    expect(balanceKind(undefined)).toBe("settled");
  });

  it("واژه‌های تأییدشده — بدهکار/طلبکار، نه بستانکار", () => {
    expect(BALANCE.debtor.label).toBe("بدهکار");
    expect(BALANCE.creditor.label).toBe("طلبکار");
    expect(BALANCE.settled.label).toBe("تسویه");
  });
});

describe("دیکشنری مالی — payStatus", () => {
  const now = new Date("2026-09-01T10:00:00");

  it("ماندهٔ صفر = پرداخت کامل", () => {
    expect(payStatus({ total: 100, dueAmount: 0 }, now)).toBe("paid");
    expect(payStatus({ total: 100, dueAmount: null }, now)).toBe("paid");
  });

  it("بدهی با سررسید آینده = نسیه", () => {
    expect(
      payStatus({ dueAmount: 500, dueDate: "2026-09-05T00:00:00" }, now),
    ).toBe("credit");
  });

  it("بدهی با سررسید دیروز = معوق؛ سررسیدِ امروز هنوز معوق نیست", () => {
    expect(
      payStatus({ dueAmount: 500, dueDate: "2026-08-31T23:59:59" }, now),
    ).toBe("overdue");
    expect(
      payStatus({ dueAmount: 500, dueDate: "2026-09-01T00:00:00" }, now),
    ).toBe("credit");
  });

  it("بدهی بدون سررسید = نسیه (معوق فقط با تاریخ معنا دارد)", () => {
    expect(payStatus({ dueAmount: 500, dueDate: null }, now)).toBe("credit");
  });

  it("فاکتور باطل = void — نشانِ پرداخت نمی‌گیرد", () => {
    expect(payStatus({ dueAmount: 500, status: "CANCELLED" }, now)).toBe("void");
    expect(payStatus({ dueAmount: 0, status: "CANCELLED" }, now)).toBe("void");
  });

  it("برچسب‌های تأییدشده", () => {
    expect(PAY_STATUS.paid.label).toBe("پرداخت کامل");
    expect(PAY_STATUS.credit.label).toBe("نسیه");
    expect(PAY_STATUS.overdue.label).toBe("معوق");
  });
});
