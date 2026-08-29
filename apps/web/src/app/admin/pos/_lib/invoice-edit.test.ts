import { describe, expect, it } from "vitest";

import type { PosLine } from "../_components/line-items";
import { NO_DISCOUNT } from "./discount";
import { diffEdit, diffNotes } from "./invoice-edit";
import type { CartDoc } from "./carts";

function line(over: Partial<PosLine> & { key: string }): PosLine {
  return {
    productId: "p-" + over.key,
    productName: "کالا " + over.key,
    unit: "عدد",
    locationId: "loc-1",
    locationPath: "انبار/۱",
    available: 10,
    quantity: 1,
    unitPrice: 1000,
    discount: NO_DISCOUNT,
    included: true,
    ...over,
  };
}

const editing: Extract<CartDoc, { type: "correction" }> = {
  type: "correction",
  invoiceId: "inv-1",
  invoiceNumber: 42,
  originals: {
    a: { saleLogId: "a", quantity: 2, unitPrice: 1000, note: "رنگ مشکی" },
    b: { saleLogId: "b", quantity: 5, unitPrice: 300, note: "" },
  },
};

describe("diffEdit", () => {
  it("ردیفِ دست‌نخورده در اصلاحیه نمی‌آید", () => {
    const d = diffEdit(editing, [
      line({ key: "a", quantity: 2, unitPrice: 1000 }),
      line({ key: "b", quantity: 5, unitPrice: 300 }),
    ]);
    expect(d.changed).toEqual([]);
    expect(d.added).toEqual([]);
  });

  it("تغییرِ تعداد و تغییرِ قیمت هر دو گرفته می‌شوند", () => {
    const d = diffEdit(editing, [
      line({ key: "a", quantity: 3, unitPrice: 1000 }),
      line({ key: "b", quantity: 5, unitPrice: 350 }),
    ]);
    expect(d.changed).toEqual([
      { saleLogId: "a", newQuantity: 3, newUnitPrice: 1000 },
      { saleLogId: "b", newQuantity: 5, newUnitPrice: 350 },
    ]);
  });

  it("ردیفِ حذف‌شده یا تیک‌برداشته، تعدادِ صفر می‌شود", () => {
    const gone = diffEdit(editing, [line({ key: "a", quantity: 2, unitPrice: 1000 })]);
    expect(gone.changed).toEqual([{ saleLogId: "b", newQuantity: 0, newUnitPrice: 300 }]);

    const unticked = diffEdit(editing, [
      line({ key: "a", quantity: 2, unitPrice: 1000 }),
      line({ key: "b", quantity: 5, unitPrice: 300, included: false }),
    ]);
    expect(unticked.changed).toEqual([{ saleLogId: "b", newQuantity: 0, newUnitPrice: 300 }]);
  });

  it("تخفیفِ ردیف در قیمتِ واحد تا می‌شود", () => {
    // ۲ عدد × ۱۰۰۰ با ۲۰۰ ریال تخفیفِ ردیف ⇒ عملاً ۹۰۰ ریال هر عدد.
    const d = diffEdit(editing, [
      line({
        key: "a",
        quantity: 2,
        unitPrice: 1000,
        discount: { mode: "amount", value: 200 },
      }),
      line({ key: "b", quantity: 5, unitPrice: 300 }),
    ]);
    expect(d.changed).toEqual([{ saleLogId: "a", newQuantity: 2, newUnitPrice: 900 }]);
  });

  it("ردیفِ تازه جدا از تغییرها برمی‌گردد", () => {
    const d = diffEdit(editing, [
      line({ key: "a", quantity: 2, unitPrice: 1000 }),
      line({ key: "b", quantity: 5, unitPrice: 300 }),
      line({ key: "new-1", quantity: 4, unitPrice: 750 }),
    ]);
    expect(d.changed).toEqual([]);
    expect(d.added.map((l) => l.key)).toEqual(["new-1"]);
  });
});

describe("diffNotes", () => {
  it("توضیحِ دست‌نخورده در فهرست نمی‌آید", () => {
    expect(
      diffNotes(editing, [
        line({ key: "a", note: "رنگ مشکی" }),
        line({ key: "b" }),
      ]),
    ).toEqual([]);
  });

  it("توضیحِ عوض‌شده و توضیحِ تازه هر دو می‌آیند", () => {
    expect(
      diffNotes(editing, [
        line({ key: "a", note: "رنگ سفید" }),
        line({ key: "b", note: "گارانتی ۶ ماه" }),
      ]),
    ).toEqual([
      { saleLogId: "a", lineNote: "رنگ سفید" },
      { saleLogId: "b", lineNote: "گارانتی ۶ ماه" },
    ]);
  });

  it("خالی‌کردنِ توضیح یعنی پاک‌کردنش، نه دست‌نخورده", () => {
    expect(diffNotes(editing, [line({ key: "a", note: "   " })])).toEqual([
      { saleLogId: "a", lineNote: undefined },
    ]);
  });

  it("ردیفِ حذف‌شده توضیحش هم با خودش می‌رود", () => {
    // «a» در سبد نیست ⇒ نباید در فهرستِ توضیح‌ها بیاید.
    expect(diffNotes(editing, [line({ key: "b" })])).toEqual([]);
  });
});
