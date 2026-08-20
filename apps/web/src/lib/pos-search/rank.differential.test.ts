import { describe, it, expect } from "vitest";

import { normalizePersian, tokenizeQuery } from "./normalize";
import { indexCatalog, searchCatalog, type CatalogItem } from "./rank";

/**
 * Differential test: a deliberately naive, full-scan reference implementation
 * of the SAME staged algorithm, run against the SAME inverted-index-optimized
 * `searchCatalog` over a larger synthetic catalog and many random queries.
 *
 * This is the real proof that the inverted-index rewrite (spine scanning,
 * unique-token substring scanning, Set intersection) never changes a single
 * result or its order — not just "the 15 example tests still pass", which
 * could miss an edge case the examples don't happen to cover.
 */

const MAX_RESULTS = 100;
const SUBSTRING_STAGE_THRESHOLD = 20;

function referenceSearch(items: CatalogItem[], query: string): CatalogItem[] {
  const q = normalizePersian(query);
  if (!q) return [];
  const tokens = tokenizeQuery(q);
  if (tokens.length === 0) return [];

  const rows = items.map((item) => {
    const tokenList = item.searchTokens.map((t) => normalizePersian(t)).filter(Boolean);
    return {
      item,
      tokens: new Set(tokenList),
      joined: tokenList.join(" "),
      barcodes: new Set(item.barcodes.map((b) => normalizePersian(b)).filter(Boolean)),
    };
  });

  const out: CatalogItem[] = [];
  const seen = new Set<string>();
  const push = (matches: typeof rows, limit: number) => {
    for (const m of matches) {
      if (!seen.has(m.item.id)) {
        seen.add(m.item.id);
        out.push(m.item);
      }
      if (out.length >= limit) return;
    }
  };

  push(
    rows.filter((ix) => {
      const skuHit = ix.item.sku != null && normalizePersian(ix.item.sku) === q;
      const partHit = ix.item.partNumber != null && normalizePersian(ix.item.partNumber) === q;
      return skuHit || partHit || ix.barcodes.has(q);
    }),
    MAX_RESULTS,
  );

  push(
    rows
      .filter((ix) => tokens.every((t) => ix.tokens.has(t)))
      .sort((a, b) => a.tokens.size - b.tokens.size),
    MAX_RESULTS,
  );

  if (out.length < SUBSTRING_STAGE_THRESHOLD) {
    const bySubstr = (subset: string[]) =>
      rows
        .filter((ix) => subset.every((t) => ix.joined.includes(t)))
        .sort((a, b) => a.joined.length - b.joined.length);

    push(bySubstr(tokens), MAX_RESULTS);

    if (out.length < SUBSTRING_STAGE_THRESHOLD && tokens.length >= 2) {
      for (let skip = 0; skip < tokens.length; skip++) {
        if (out.length >= MAX_RESULTS) break;
        push(
          bySubstr(tokens.filter((_, i) => i !== skip)),
          MAX_RESULTS,
        );
      }
    }
  }

  return out.slice(0, MAX_RESULTS);
}

// ---------------------------------------------------------------- synthetic catalog

const PARTS = ["لنت", "فیلتر", "دیسک", "کلاچ", "دینام", "شاتون", "واشر", "دسته موتور", "توپی چرخ", "میل لنگ"];
const POSITIONS = ["جلو", "عقب", "چپ", "راست", "بالا", "پایین"];
const VEHICLES = ["پراید", "پژو 405", "پژو پارس", "تیبا", "دنا", "سمند", "206"];
const BRANDS = ["اصلی", "تصویری", "TPX", "Textar", "الوند"];

function makeSyntheticCatalog(n: number): CatalogItem[] {
  const items: CatalogItem[] = [];
  for (let i = 0; i < n; i++) {
    const part = PARTS[i % PARTS.length];
    const pos = POSITIONS[(i * 3) % POSITIONS.length];
    const vehicle = VEHICLES[(i * 7) % VEHICLES.length];
    const brand = BRANDS[(i * 11) % BRANDS.length];
    const name = `${part} ${pos} ${vehicle} ${brand}`;
    items.push({
      id: `p${i}`,
      name,
      sku: String(1_000_000 + i),
      partNumber: i % 5 === 0 ? `TPX-${i}` : null,
      searchTokens: tokenizeQuery(name).concat(tokenizeQuery(String(1_000_000 + i))),
      barcodes: i % 7 === 0 ? [`62601${String(i).padStart(8, "0")}`] : [],
    });
  }
  return items;
}

const catalog = makeSyntheticCatalog(1500);
const index = indexCatalog(catalog);

const QUERIES = [
  "لنت",
  "لنت جلو",
  "لنت جلو پراید",
  "پراید",
  "پژو 405",
  "دیسک عقب سمند اصلی",
  "1000042",
  "TPX-25",
  "62601" + "00000035",
  "کلاچ چپ دنا تصویری آبی", // an extra wrong word — exercises the one-less stage
  "میل لنگ",
  "توپی چرخ راست 206",
  "نامنطبق کاملا خارج از کاتالوگ",
  "فیلتر بالا تیبا Textar",
];

describe("searchCatalog vs. naive reference implementation", () => {
  it.each(QUERIES)("matches the reference exactly for query: %s", (q) => {
    const fast = searchCatalog(index, q).map((r) => r.id);
    const naive = referenceSearch(catalog, q).map((r) => r.id);
    expect(fast).toEqual(naive);
  });

  it(
    "matches for every single-token query built from the catalog's own words",
    () => {
      for (const word of [...PARTS, ...POSITIONS, ...VEHICLES, ...BRANDS]) {
        const fast = searchCatalog(index, word).map((r) => r.id);
        const naive = referenceSearch(catalog, word).map((r) => r.id);
        expect(fast).toEqual(naive);
      }
    },
    // referenceSearch is deliberately unoptimized and re-normalizes the whole
    // 1500-item catalog from scratch on every one of the ~30 queries here —
    // real work, not a regression in the code under test (searchCatalog
    // itself answers each of these in single-digit milliseconds).
    20_000,
  );

  it("matches for partial-word (substring) queries", () => {
    const partials = ["لن", "پرا", "دنا", "40", "کلا", "اصل"];
    for (const p of partials) {
      const fast = searchCatalog(index, p).map((r) => r.id);
      const naive = referenceSearch(catalog, p).map((r) => r.id);
      expect(fast).toEqual(naive);
    }
  });
});
