import { describe, expect, it } from "vitest";

import type { PosLine } from "../_components/line-items";
import { NO_DISCOUNT } from "./discount";
import {
  adjustDraft,
  adjustNetQty,
  invoiceToAdjustLines,
  offQtyToReturnQty,
} from "./invoice-adjust";
import type { CartDoc } from "./carts";
import type { AdjustableInvoice } from "@/lib/types";

type Adjusting = Extract<CartDoc, { type: "adjust" }>;

/** سناریوی واقعی: لنت ۱۰ (قیمت ۱۰۰هزار)، روغن ۱ (۲۰۰هزار)، چراغ ۵ (۵۰هزار). */
const doc: Adjusting = {
  type: "adjust",
  invoiceId: "inv-1",
  invoiceNumber: 42,
  invoiceTotal: 1_450_000,
  paidAmount: 1_450_000,
  originals: {
    a: {
      saleLogId: "a",
      sold: 10,
      alreadyReturned: 0,
      outstanding: 10,
      oldUnitPrice: 100_000,
      effectiveUnitPrice: 100_000,
      returnable: 10,
    },
    b: {
      saleLogId: "b",
      sold: 1,
      alreadyReturned: 0,
      outstanding: 1,
      oldUnitPrice: 200_000,
      effectiveUnitPrice: 200_000,
      returnable: 1,
    },
    c: {
      saleLogId: "c",
      sold: 5,
      alreadyReturned: 0,
      outstanding: 5,
      oldUnitPrice: 50_000,
      effectiveUnitPrice: 50_000,
      returnable: 5,
    },
  },
  isOpenAccount: false,
  hasCustomer: true,
};

function line(over: Partial<PosLine> & { key: string }): PosLine {
  return {
    productId: "p-" + over.key,
    productName: "کالا " + over.key,
    unit: "عدد",
    locationId: "loc-1",
    locationPath: "انبار/۱",
    available: 10,
    quantity: 0,
    unitPrice: 100_000,
    discount: NO_DISCOUNT,
    included: true,
    restock: true,
    ...over,
  };
}

describe("invoiceToAdjustLines", () => {
  const data: AdjustableInvoice = {
    invoice: {
      id: "inv-1",
      number: 42,
      status: "CONFIRMED",
      total: 1_450_000,
      paidAmount: 1_450_000,
      dueAmount: 0,
      customer: { id: "c1", firstName: "رضا", lastName: "", fullName: "رضا" },
    },
    adjustable: true,
    isOpenAccount: false,
    lines: [
      {
        saleLogId: "a",
        product: { id: "p1", name: "لنت", unit: "عدد" },
        location: { id: "l1", name: "قفسه", code: "A1", path: "انبار/قفسه" },
        sold: 10,
        alreadyReturned: 0,
        correctedBy: 0,
        returnable: 10,
        oldQuantity: 10,
        oldUnitPrice: 100_000,
        effectiveUnitPrice: 100_000,
      },
    ],
  };

  it("ردیف‌ها را با سقفِ قابل‌برگشت و قیمتِ فعلی می‌سازد", () => {
    const rows = invoiceToAdjustLines(data);
    expect(rows[0]).toMatchObject({
      key: "a",
      available: 10,
      quantity: 0,
      unitPrice: 100_000,
      outstanding: 10,
      effectiveUnitPrice: 100_000,
    });
  });
});

describe("adjustDraft", () => {
  /*
   * «قیمتِ ردیف» در حالتِ adjust از قیمتِ فعلیِ فاکتور پر می‌شود؛ دست‌نزدن به
   * آن یعنی دقیقاً همان oldUnitPrice. این helper سه ردیف با قیمت‌های متفاوت را
   * همان‌طور می‌سازد تا ردیفِ «دست‌نخورده» تغییرِ قیمت دیده نشود.
   */
  it("بدون هیچ تغییری، اختلاف صفر و هیچ سندی نیست", () => {
    const d = adjustDraft(doc, [
      line({ key: "a", unitPrice: 100_000 }),
      line({ key: "b", unitPrice: 200_000 }),
      line({ key: "c", unitPrice: 50_000 }),
    ]);
    expect(d.returns).toEqual([]);
    expect(d.changes).toEqual([]);
    expect(d.additions).toEqual([]);
    expect(d.net).toBe(0);
    expect(d.notes).toEqual([]);
  });

  it("مرجوعیِ ۳ چراغ با قیمتِ مؤثرِ سرور حساب می‌شود", () => {
    const d = adjustDraft(doc, [
      line({ key: "a", unitPrice: 100_000 }),
      line({ key: "b", unitPrice: 200_000 }),
      line({ key: "c", quantity: 3, unitPrice: 50_000 }),
    ]);
    expect(d.returns).toEqual([{ saleLogId: "c", quantity: 3, restock: true }]);
    expect(d.refundAmount).toBe(150_000);
    expect(d.net).toBe(-150_000);
  });

  it("معیوب با پرچمِ خودش می‌رود و مبلغ از قیمتِ مؤثرِ فاکتور حساب می‌شود", () => {
    const d = adjustDraft(doc, [
      line({ key: "c", quantity: 2, restock: false, unitPrice: 50_000 }),
    ]);
    expect(d.returns).toEqual([{ saleLogId: "c", quantity: 2, restock: false }]);
    expect(d.refundAmount).toBe(100_000);
  });

  it("برگشتیِ بیشتر از سقف به سقف بریده می‌شود", () => {
    const d = adjustDraft(doc, [
      line({ key: "c", quantity: 99, unitPrice: 50_000 }),
    ]);
    expect(d.returns[0].quantity).toBe(5);
    expect(d.refundAmount).toBe(250_000);
  });

  it("تغییر قیمتِ ردیفِ موجود سندِ changes می‌سازد", () => {
    const d = adjustDraft(doc, [line({ key: "a", quantity: 0, unitPrice: 120_000 })]);
    expect(d.changes).toEqual([{ saleLogId: "a", newQuantity: 10, newUnitPrice: 120_000 }]);
    expect(d.changesAdjust).toBe(200_000);
    expect(d.net).toBe(200_000);
  });

  it("قلمِ تازه‌ی افزوده‌شده سندِ additions می‌سازد و در اختلاف می‌آید", () => {
    const d = adjustDraft(doc, [
      line({ key: "a" }),
      line({
        key: "new-1",
        productId: "p9",
        productName: "کاسه‌نمد",
        quantity: 2,
        unitPrice: 30_000,
      }),
    ]);
    expect(d.additions).toEqual([
      { productId: "p9", locationId: "loc-1", quantity: 2, unitPrice: 30_000 },
    ]);
    expect(d.additionsAmount).toBe(60_000);
    expect(d.net).toBe(60_000);
  });

  it("سناریوی کامل: ۳ چراغ و ۳ لنت برمی‌گردد، ۲ کاسه‌نمد و ۱ سرسیلندر اضافه می‌شود", () => {
    const d = adjustDraft(doc, [
      line({ key: "a", quantity: 3, unitPrice: 100_000 }), // ۳ لنت برمی‌گردد
      line({ key: "b", unitPrice: 200_000 }),              // روغن دست نمی‌خورد
      line({ key: "c", quantity: 3, unitPrice: 50_000 }),  // ۳ چراغ برمی‌گردد
      line({ key: "new-1", productId: "p9", productName: "کاسه‌نمد", quantity: 2, unitPrice: 30_000 }),
      line({ key: "new-2", productId: "p8", productName: "سرسیلندر", quantity: 1, unitPrice: 200_000 }),
    ]);
    expect(d.returns).toEqual([
      { saleLogId: "a", quantity: 3, restock: true },
      { saleLogId: "c", quantity: 3, restock: true },
    ]);
    expect(d.refundAmount).toBe(450_000); // ۳×۱۰۰ + ۳×۵۰
    expect(d.additionsAmount).toBe(260_000); // ۲×۳۰ + ۱×۲۰۰
    // اختلاف = ۲۶۰ − ۴۵۰ = −۱۹۰ (به نفع مشتری)
    expect(d.net).toBe(-190_000);
  });

  it("برگشت + تصحیحِ قیمت روی همان ردیف: برگشت با قیمتِ مؤثر، قیمتِ تازه روی مانده", () => {
    const d = adjustDraft(doc, [
      line({ key: "c", quantity: 2, unitPrice: 60_000 }),
    ]);
    // ۲ چراغ برمی‌گردد (۲×۵۰هزار) و ۳ مانده با قیمتِ تازه ۶۰هزار (۳×۱۰هزار).
    expect(d.returns).toEqual([{ saleLogId: "c", quantity: 2, restock: true }]);
    expect(d.refundAmount).toBe(100_000);
    expect(d.changes).toEqual([{ saleLogId: "c", newQuantity: 3, newUnitPrice: 60_000 }]);
    expect(d.changesAdjust).toBe(30_000);
    expect(d.net).toBe(30_000 - 100_000);
  });

  it("عوض‌شدنِ توضیحِ ردیف، سندِ مالی نمی‌سازد و در notes می‌آید", () => {
    const d = adjustDraft(doc, [
      line({ key: "a", unitPrice: 100_000, note: "لنت جلو" }),
      line({ key: "b", unitPrice: 200_000 }),
      line({ key: "c", unitPrice: 50_000 }),
    ]);
    expect(d.returns).toEqual([]);
    expect(d.changes).toEqual([]);
    expect(d.net).toBe(0);
    expect(d.notes).toEqual([{ saleLogId: "a", lineNote: "لنت جلو" }]);
  });

  it("offQtyToReturnQty — عدد = تعدادِ خالص", () => {
    // مانده ۵: زدن ۳ ⇒ ۲ برمی‌گردد؛ زدن صفر ⇒ برگشتِ کامل؛ زدن ۷ ⇒ همه برمی‌گردد و ۲ قلمِ تازه.
    expect(offQtyToReturnQty(5, 3)).toEqual({ returnQty: 2, overflow: 0 });
    expect(offQtyToReturnQty(5, 0)).toEqual({ returnQty: 5, overflow: 0 });
    expect(offQtyToReturnQty(5, 7)).toEqual({ returnQty: 0, overflow: 2 });
  });

  it("adjustNetQty — مانده منهای برگشتیِ همین جلسه", () => {
    expect(adjustNetQty(line({ key: "c", quantity: 2, outstanding: 5 }))).toBe(3);
    expect(adjustNetQty(line({ key: "c", quantity: 5, outstanding: 5 }))).toBe(0);
  });

  it("ردیفِ تیک‌براشته‌شده‌ی تازه فرستاده نمی‌شود", () => {
    const d = adjustDraft(doc, [
      line({ key: "new-1", productId: "p9", quantity: 2, unitPrice: 30_000, included: false }),
    ]);
    expect(d.additions).toEqual([]);
    expect(d.net).toBe(0);
  });
});
