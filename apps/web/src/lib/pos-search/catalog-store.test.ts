import { describe, it, expect } from "vitest";

import type { PosCatalogRow } from "@/lib/types";
import { emptyCatalog, mergeCatalog, toCatalogItems } from "./catalog-store";

function row(p: Partial<PosCatalogRow> & { id: string; updatedAt: string }): PosCatalogRow {
  return {
    name: "کالا",
    sku: null,
    partNumber: null,
    unit: "عدد",
    isActive: true,
    searchTokens: ["کالا"],
    barcodes: [],
    brand: null,
    vehicleModel: null,
    salePrice: null,
    deleted: false,
    ...p,
  };
}

describe("mergeCatalog", () => {
  it("upserts new rows and advances the cursor to the newest updatedAt", () => {
    const s = mergeCatalog(emptyCatalog(), [
      row({ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }),
      row({ id: "b", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ]);
    expect(s.byId.size).toBe(2);
    expect(s.cursor).toBe("2026-01-02T00:00:00.000Z");
  });

  it("replaces an existing row by id (incremental update)", () => {
    let s = mergeCatalog(emptyCatalog(), [
      row({ id: "a", name: "نام قدیم", updatedAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    s = mergeCatalog(s, [
      row({ id: "a", name: "نام جدید", updatedAt: "2026-01-05T00:00:00.000Z" }),
    ]);
    expect(s.byId.size).toBe(1);
    expect(s.byId.get("a")?.name).toBe("نام جدید");
    expect(s.cursor).toBe("2026-01-05T00:00:00.000Z");
  });

  it("removes rows flagged deleted, but still advances the cursor", () => {
    let s = mergeCatalog(emptyCatalog(), [
      row({ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    s = mergeCatalog(s, [
      row({ id: "a", deleted: true, updatedAt: "2026-01-03T00:00:00.000Z" }),
    ]);
    expect(s.byId.has("a")).toBe(false);
    expect(s.cursor).toBe("2026-01-03T00:00:00.000Z"); // not stuck on the old cursor
  });

  it("treats an inactive row like a deletion", () => {
    let s = mergeCatalog(emptyCatalog(), [row({ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" })]);
    s = mergeCatalog(s, [row({ id: "a", isActive: false, updatedAt: "2026-01-02T00:00:00.000Z" })]);
    expect(s.byId.has("a")).toBe(false);
  });

  it("does not mutate the previous state (immutability)", () => {
    const s1 = mergeCatalog(emptyCatalog(), [row({ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" })]);
    const s2 = mergeCatalog(s1, [row({ id: "b", updatedAt: "2026-01-02T00:00:00.000Z" })]);
    expect(s1.byId.size).toBe(1); // untouched
    expect(s2.byId.size).toBe(2);
  });
});

describe("toCatalogItems", () => {
  it("projects stored rows to the ranking shape", () => {
    const s = mergeCatalog(emptyCatalog(), [
      row({ id: "a", name: "لنت پراید", sku: "1001", salePrice: 500000, updatedAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    const items = toCatalogItems(s);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "a", name: "لنت پراید", sku: "1001", salePrice: 500000 });
  });
});
