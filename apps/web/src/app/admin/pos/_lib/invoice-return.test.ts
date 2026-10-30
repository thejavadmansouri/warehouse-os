import { describe, expect, it } from "vitest";

import type { PosLine } from "../_components/line-items";
import { NO_DISCOUNT } from "./discount";
import { returnDraft, returningStateOf } from "./invoice-return";
import type { ReturnableInvoice } from "@/lib/types";
import type { CartDoc } from "./carts";

type Returning = Extract<CartDoc, { type: "return" }>;

const doc: Returning = {
  type: "return",
  invoiceId: "inv-1",
  invoiceNumber: 42,
  lines: {
    a: { saleLogId: "a", returnable: 3, effectiveUnitPrice: 1000 },
    b: { saleLogId: "b", returnable: 1, effectiveUnitPrice: 250 },
  },
  isOpenAccount: false,
  hasCustomer: true,
  cashRefundable: 2500,
};

function line(over: Partial<PosLine> & { key: string }): PosLine {
  return {
    productId: "p-" + over.key,
    productName: "کالا " + over.key,
    unit: "عدد",
    locationId: "loc-1",
    locationPath: "انبار/۱",
    available: 3,
    quantity: 0,
    unitPrice: 1000,
    discount: NO_DISCOUNT,
    included: true,
    restock: true,
    ...over,
  };
}

describe("returnDraft", () => {
  it("ردیفِ صفر اصلاً ارسال نمی‌شود", () => {
    const d = returnDraft(doc, [line({ key: "a" }), line({ key: "b" })]);
    expect(d.lines).toEqual([]);
    expect(d.refundAmount).toBe(0);
  });

  it("مبلغ از قیمتِ مؤثرِ سرور حساب می‌شود، نه از قیمتِ ردیفِ سبد", () => {
    const d = returnDraft(doc, [
      // قیمتِ دستکاری‌شده‌ی سبد باید نادیده گرفته شود.
      line({ key: "a", quantity: 2, unitPrice: 999_999 }),
    ]);
    expect(d.lines).toEqual([{ saleLogId: "a", quantity: 2, restock: true }]);
    expect(d.refundAmount).toBe(2000);
  });

  it("تعدادِ بیشتر از قابل‌برگشت به سقف بریده می‌شود", () => {
    const d = returnDraft(doc, [line({ key: "a", quantity: 99 })]);
    expect(d.lines[0].quantity).toBe(3);
    expect(d.refundAmount).toBe(3000);
  });

  it("معیوب هم برمی‌گردد ولی با پرچمِ خودش", () => {
    const d = returnDraft(doc, [line({ key: "b", quantity: 1, restock: false })]);
    expect(d.lines).toEqual([{ saleLogId: "b", quantity: 1, restock: false }]);
    expect(d.refundAmount).toBe(250);
  });

  it("ردیفِ تیک‌برداشته و ردیفِ بیگانه کنار گذاشته می‌شوند", () => {
    const d = returnDraft(doc, [
      line({ key: "a", quantity: 2, included: false }),
      line({ key: "ghost", quantity: 5 }),
    ]);
    expect(d.lines).toEqual([]);
  });
});

describe("returningStateOf", () => {
  it("سقفِ نقد از پاسخِ سرور تا سندِ سبد می‌رسد — نگهبانِ صندوق همان‌جاست", () => {
    const data = {
      invoice: {
        id: "inv-9",
        number: 9,
        status: "CONFIRMED",
        total: 1_000,
        paidAmount: 400,
        dueAmount: 600,
        customer: { id: "c1", firstName: "الف", fullName: "الف ب" },
      },
      lines: [],
      returnable: true,
      isOpenAccount: false,
      customerBalance: 0,
      cashRefundable: 400,
      accountId: null,
    } as ReturnableInvoice;

    expect(returningStateOf(data).cashRefundable).toBe(400);
  });
});
