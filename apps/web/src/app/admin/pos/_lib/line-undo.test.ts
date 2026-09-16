import { describe, expect, it } from "vitest";

import type { PosLine } from "../_components/line-items";
import { applyUndoAdd } from "./line-undo";

function line(name: string, qty = 1): PosLine {
  return {
    key: name,
    productId: name,
    productName: name,
    unit: "عدد",
    locationId: "",
    locationPath: "",
    available: 0,
    quantity: qty,
    unitPrice: 1000,
    discount: { mode: "amount", value: 0 },
    included: true,
  };
}

describe("applyUndoAdd", () => {
  it("ردیفِ نو حذف می‌شود", () => {
    const lines = [line("لنت"), line("روغن")];
    const res = applyUndoAdd(lines, { lineKey: "روغن", prevQuantity: 0 });

    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].productName).toBe("لنت");
    expect(res.removedIndex).toBe(1);
  });

  it("افزودن به ردیفِ موجود به مقدارِ قبلی برمی‌گردد", () => {
    const l = line("لنت", 1);
    const res = applyUndoAdd([l, line("روغن")], { lineKey: "لنت", prevQuantity: 1 });

    expect(res.lines).toHaveLength(2);
    expect(res.lines[0].quantity).toBe(1);
    expect(res.removedIndex).toBeNull();
  });

  it("نشانه‌ی کهنه (ردیفِ حذف‌شده) بی‌اثر است", () => {
    const lines = [line("لنت")];
    const res = applyUndoAdd(lines, { lineKey: "پاک‌شده", prevQuantity: 0 });

    expect(res.lines).toBe(lines);
    expect(res.removedIndex).toBeNull();
  });

  it("بدون نشانه، هیچ تغییر نمی‌کند", () => {
    const lines = [line("لنت")];
    const res = applyUndoAdd(lines, null);

    expect(res.lines).toBe(lines);
    expect(res.removedIndex).toBeNull();
  });
});
