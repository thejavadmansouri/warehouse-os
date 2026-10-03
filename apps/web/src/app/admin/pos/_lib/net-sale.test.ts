import { describe, expect, it } from "vitest";

import {
  buildNetPayload,
  clampReturnQty,
  netOf,
  returnRowsTotal,
  saleRowsTotal,
  type NetReturnRow,
  type NetSaleRow,
} from "./net-sale";

function ret(partial: Partial<NetReturnRow>): NetReturnRow {
  return {
    key: "k",
    invoiceId: "inv-1",
    invoiceNumber: 10,
    saleLogId: "log-1",
    productId: "p-1",
    productName: "لنت",
    unit: "عدد",
    qty: 1,
    max: 5,
    unitPrice: 100_000,
    restock: true,
    ...partial,
  };
}

function sale(partial: Partial<NetSaleRow>): NetSaleRow {
  return {
    key: "s-1",
    productId: "p-1",
    productName: "لنت",
    unit: "عدد",
    qty: 1,
    unitPrice: 100_000,
    ...partial,
  };
}

describe("clampReturnQty", () => {
  it("میان ۰ و سقف نگه می‌دارد", () => {
    expect(clampReturnQty(3, 5)).toBe(3);
    expect(clampReturnQty(7, 5)).toBe(5);
    expect(clampReturnQty(-2, 5)).toBe(0);
    expect(clampReturnQty(2.9, 5)).toBe(2);
    expect(clampReturnQty(Number.NaN, 5)).toBe(0);
  });
});

describe("جمع‌های زنده", () => {
  it("جمع فروشِ نو را می‌دهد", () => {
    expect(saleRowsTotal([sale({ qty: 2, unitPrice: 100_000 })])).toBe(200_000);
  });

  it("جمع برگشت را با سقفِ هر ردیف حساب می‌کند", () => {
    expect(
      returnRowsTotal([
        ret({ qty: 4, max: 3, unitPrice: 100_000 }), // به ۳ بریده می‌شود
        ret({ qty: 1, max: 1, unitPrice: 200_000 }),
      ]),
    ).toBe(500_000);
  });

  it("خالص = فروش − برگشت", () => {
    expect(netOf(750_000, 400_000)).toBe(350_000);
    expect(netOf(100_000, 400_000)).toBe(-300_000);
  });
});

describe("buildNetPayload", () => {
  it("ردیف‌های صفر را حذف و هر فاکتور را جدا می‌کند", () => {
    const payload = buildNetPayload(
      [
        ret({ invoiceId: "b", qty: 2, max: 2, saleLogId: "l1", unitPrice: 100_000 }),
        ret({ invoiceId: "a", qty: 0, saleLogId: "l0" }), // صفر — بیرون
        ret({ invoiceId: "b", qty: 5, max: 5, saleLogId: "l2", unitPrice: 50_000 }),
      ],
      [sale({ qty: 3, unitPrice: 200_000 })],
    );

    // فاکتورِ a هیچ ردیفِ مؤثری ندارد — گروهِ خالی سمتِ سرور رد می‌شود (ArrayMinSize).
    expect(payload.returns).toEqual([
      {
        invoiceId: "b",
        lines: [
          { saleLogId: "l1", quantity: 2, restock: true },
          { saleLogId: "l2", quantity: 5, restock: true },
        ],
      },
    ]);
    expect(payload.saleTotal).toBe(600_000);
    expect(payload.refundTotal).toBe(450_000);
    expect(payload.net).toBe(150_000);
  });

  it("تعدادِ بیشتر از سقف را در همان payload بریده نگه می‌دارد", () => {
    const payload = buildNetPayload(
      [ret({ qty: 10, max: 4, saleLogId: "l1" })],
      [],
    );
    expect(payload.returns[0].lines[0]).toEqual({
      saleLogId: "l1",
      quantity: 4,
      restock: true,
    });
    expect(payload.refundTotal).toBe(400_000);
  });
});
