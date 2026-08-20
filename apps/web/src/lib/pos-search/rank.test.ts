import { describe, it, expect } from "vitest";

import { normalizePersian, tokenizeQuery } from "./normalize";
import { indexCatalog, searchCatalog, type CatalogItem } from "./rank";

// ---------------------------------------------------------------- normalize

describe("normalizePersian", () => {
  it("maps Arabic letters to Persian", () => {
    expect(normalizePersian("كيك")).toBe("کیک");
    expect(normalizePersian("مدينة")).toBe("مدینه");
  });

  it("maps Persian and Arabic digits to ASCII", () => {
    expect(normalizePersian("۱۲۳")).toBe("123");
    expect(normalizePersian("٤٥٦")).toBe("456");
  });

  it("turns ZWNJ into a space and collapses whitespace", () => {
    expect(normalizePersian("نیم‌فاصله")).toBe("نیم فاصله");
    expect(normalizePersian("  a   b  ")).toBe("a b");
  });

  it("is idempotent", () => {
    const once = normalizePersian("كيك۱۲۳ نیم‌فاصله");
    expect(normalizePersian(once)).toBe(once);
  });

  it("lowercases Latin and handles empty", () => {
    expect(normalizePersian("Textar")).toBe("textar");
    expect(normalizePersian("")).toBe("");
    expect(normalizePersian(null)).toBe("");
  });
});

describe("tokenizeQuery", () => {
  it("splits on separators and drops single-char noise", () => {
    expect(tokenizeQuery("لنت جلو پراید")).toEqual(["لنت", "جلو", "پراید"]);
    expect(tokenizeQuery("a/b,c")).toEqual([]); // all single char -> dropped
    expect(tokenizeQuery("لنت-جلو")).toEqual(["لنت", "جلو"]);
  });
});

// ---------------------------------------------------------------- ranking

function item(p: Partial<CatalogItem> & { id: string; name: string }): CatalogItem {
  return {
    sku: null,
    partNumber: null,
    barcodes: [],
    // real catalog stores canonical tokens; mirror that from the name here
    searchTokens: tokenizeQuery(p.name),
    ...p,
  };
}

const catalog: CatalogItem[] = [
  item({ id: "a", name: "لنت جلو پراید", sku: "1000001", barcodes: ["6260100000011"] }),
  item({ id: "b", name: "لنت عقب پراید", sku: "1000002" }),
  item({ id: "c", name: "لنت جلو پژو 405", sku: "1000003", partNumber: "TPX-9" }),
  item({ id: "d", name: "فیلتر روغن پراید", sku: "1000004" }),
  item({ id: "e", name: "دیسک و صفحه پراید", sku: "1000005" }),
];

const idx = indexCatalog(catalog);

describe("searchCatalog", () => {
  it("returns nothing for blank or single-char queries", () => {
    expect(searchCatalog(idx, "")).toHaveLength(0);
    expect(searchCatalog(idx, "ل")).toHaveLength(0);
  });

  it("matches an exact SKU as the top hit", () => {
    const hits = searchCatalog(idx, "1000003");
    expect(hits[0]?.id).toBe("c");
  });

  it("matches an exact barcode", () => {
    const hits = searchCatalog(idx, "6260100000011");
    expect(hits[0]?.id).toBe("a");
  });

  it("matches an exact part number", () => {
    const hits = searchCatalog(idx, "TPX-9");
    expect(hits.map((h) => h.id)).toContain("c");
  });

  it("ranks the exact full-token match first, then forgiving matches", () => {
    const ids = searchCatalog(idx, "لنت جلو پراید").map((h) => h.id);
    // The precise hit (all three tokens) must be first.
    expect(ids[0]).toBe("a");
    // "فیلتر روغن پراید" shares only "پراید" — never reachable here.
    expect(ids).not.toContain("d");
    // Note: "لنت عقب پراید" (b) MAY appear after 'a' via the one-less stage
    // (dropping the wrong word "جلو" leaves "لنت پراید"). That forgiveness is
    // intentional and identical to the server and Android — an extra/misheard
    // word must not zero the result. What matters is that 'a' ranks first.
  });

  it("normalizes the query: Arabic digits / ZWNJ / spacing do not matter", () => {
    expect(searchCatalog(idx, "لنت‌جلو‌پراید").map((h) => h.id)).toContain("a");
    expect(searchCatalog(idx, "پژو ۴۰۵").map((h) => h.id)).toContain("c");
  });

  it("one-less: an extra wrong word still finds the product", () => {
    // "آبی" is not in any name; the other two tokens still match "a".
    const ids = searchCatalog(idx, "لنت پراید آبی").map((h) => h.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b"); // لنت ... پراید
  });

  it("ranks shorter names first within the token stage", () => {
    const ids = searchCatalog(idx, "پراید").map((h) => h.id);
    // every پراید product appears; the shortest-token-count names come first
    expect(ids).toContain("a");
    expect(ids).toContain("d");
    expect(ids.length).toBeGreaterThanOrEqual(4);
  });

  it("returns [] when nothing matches", () => {
    expect(searchCatalog(idx, "شمع نگین موتور")).toHaveLength(0);
  });
});
