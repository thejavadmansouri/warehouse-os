import { describe, expect, it } from "vitest";

import type { SaleCorrectionListRow, SaleReturnListRow } from "./types";
import {
  groupAdjustOperations,
  isStandalone,
  standaloneCorrections,
  standaloneReturns,
  type AdjustOperation,
} from "./adjust-operations";

function ret(over: Partial<SaleReturnListRow> & { id: string }): SaleReturnListRow {
  return {
    number: 1,
    refundMethod: "CREDIT",
    refundAmount: 0,
    reason: "",
    createdAt: "2026-08-01T10:00:00.000Z",
    operationKey: null,
    _count: { lines: 1 },
    ...over,
  };
}

function corr(over: Partial<SaleCorrectionListRow> & { id: string }): SaleCorrectionListRow {
  return {
    number: 1,
    amountAdjust: 0,
    reason: "",
    createdAt: "2026-08-01T10:00:00.000Z",
    operationKey: null,
    _count: { lines: 1 },
    ...over,
  };
}

describe("groupAdjustOperations", () => {
  it("مرجوعی و اصلاحیه‌ی هم‌کلید را یک «عملیات یکپارچه» می‌کند و اختلاف را حساب می‌کند", () => {
    const groups = groupAdjustOperations(
      [
        ret({
          id: "r1",
          operationKey: "op-1",
          refundAmount: 450_000,
          _count: { lines: 3 },
          createdAt: "2026-08-01T10:00:00.000Z",
          reason: "بازگشت و خرید",
        }),
      ],
      [
        corr({
          id: "c1",
          operationKey: "op-1",
          amountAdjust: 260_000,
          _count: { lines: 2 },
          createdAt: "2026-08-01T10:00:01.000Z",
        }),
      ],
    );

    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.refundAmount).toBe(450_000);
    expect(g.amountAdjust).toBe(260_000);
    expect(g.lines).toBe(5);
    expect(g.net).toBe(-190_000); // به نفع مشتری
    expect(g.reason).toBe("بازگشت و خرید");
    // تاریخِ قدیمی‌ترین سند، تاریخِ شروع عملیات است.
    expect(g.createdAt).toBe("2026-08-01T10:00:00.000Z");
  });

  it("اسنادِ بدون operationKey را از عملیات بیرون می‌گذارد", () => {
    const ops = groupAdjustOperations(
      [ret({ id: "r1", operationKey: "op-1", refundAmount: 100 }), ret({ id: "r2" })],
      [corr({ id: "c1", operationKey: "op-1", amountAdjust: 40 }), corr({ id: "c2" })],
    );
    expect(ops).toHaveLength(1);
    expect(ops[0].operationKey).toBe("op-1");
  });

  it("عملیاتِ فقط-مرجوعی و فقط-اصلاحیه هم یکپارچه دیده می‌شوند", () => {
    const ops = groupAdjustOperations(
      [ret({ id: "r1", operationKey: "op-return", refundAmount: 90 })],
      [corr({ id: "c1", operationKey: "op-corr", amountAdjust: -30 })],
    );
    expect(ops).toHaveLength(2);
    const byKey = new Map(ops.map((o: AdjustOperation) => [o.operationKey, o]));
    expect(byKey.get("op-return")!.net).toBe(-90);
    expect(byKey.get("op-corr")!.net).toBe(-30);
  });

  it("چند عملیات به ترتیبِ زمانی مرتب می‌شوند", () => {
    const ops = groupAdjustOperations(
      [
        ret({ id: "r1", operationKey: "op-old", createdAt: "2026-07-01T00:00:00.000Z" }),
        ret({ id: "r2", operationKey: "op-new", createdAt: "2026-08-01T00:00:00.000Z" }),
      ],
      [],
    );
    expect(ops.map((o: AdjustOperation) => o.operationKey)).toEqual(["op-old", "op-new"]);
  });
});

describe("standalone filters", () => {
  it("اسنادِ مستقل جدا می‌شوند", () => {
    const rets = [ret({ id: "r1", operationKey: "op-1" }), ret({ id: "r2" }), ret({ id: "r3", operationKey: "" })];
    const corrs = [corr({ id: "c1", operationKey: "op-1" }), corr({ id: "c2" })];
    expect(standaloneReturns(rets).map((r) => r.id)).toEqual(["r2", "r3"]);
    expect(standaloneCorrections(corrs).map((c) => c.id)).toEqual(["c2"]);
  });

  it("isStandalone با undefined و رشته‌ی خالی هم درست کار می‌کند", () => {
    expect(isStandalone(null)).toBe(true);
    expect(isStandalone(undefined)).toBe(true);
    expect(isStandalone("")).toBe(true);
    expect(isStandalone("op-9")).toBe(false);
  });
});