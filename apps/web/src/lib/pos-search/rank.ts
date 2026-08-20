import { normalizePersian, tokenizeQuery } from "./normalize";

/**
 * Local POS product search — the same staged ranking the server's
 * `/products/locate` uses and the Android `OfflineCatalogSearch` uses, so a
 * query on the cached catalog returns exactly what the server would.
 *
 * Stages (each fills up to MAX_RESULTS, deduped, in order):
 *   1. exact code   — sku / partNumber / barcode equals the whole query
 *   2. token-set    — every query token is contained in the product's tokens
 *   3. substring    — every query token is a substring of the joined tokens
 *   4. one-less     — drop one query token and retry substring (an extra/wrong
 *                     word must not zero the result)
 *
 * Stages 3-4 only run while fewer than SUBSTRING_STAGE_THRESHOLD hits exist, so
 * a precise query is not diluted by loose matches.
 *
 * PERFORMANCE: candidates are found through inverted indexes (exact-code maps,
 * token -> items, and a scan over the small set of UNIQUE catalog tokens for
 * substring matching) instead of scanning every catalog item on every stage.
 * On a real parts catalog this matters a lot — words like "پراید"/"لنت" are
 * shared by thousands of rows, so the unique-token list is far smaller than
 * the item count. Every candidate list is restored to original catalog order
 * (via `order`) before the score sort, so results are byte-identical to a
 * naive full-scan implementation — see rank.test.ts's differential test.
 */

export interface CatalogItem {
  id: string;
  name: string;
  sku: string | null;
  partNumber: string | null;
  /** Canonical tokens the server stored (name + sku + partNumber). */
  searchTokens: string[];
  /** Normalized barcodes for exact-code matching. */
  barcodes: string[];
  salePrice?: number | null;
  unit?: string | null;
  brandName?: string | null;
  vehicleModelName?: string | null;
}

const MAX_RESULTS = 100;
const SUBSTRING_STAGE_THRESHOLD = 20;

/** One catalog item, pre-split for search. Built once per catalog load. */
export interface IndexedItem {
  item: CatalogItem;
  tokens: Set<string>;
  joined: string;
  barcodes: Set<string>;
  /** Position in the original items array — the tie-break that keeps output
   *  order identical to a plain linear scan regardless of which inverted
   *  index path found the item. */
  order: number;
}

/** The built search index — see [indexCatalog]. */
export interface CatalogIndex {
  items: IndexedItem[];
  bySku: Map<string, IndexedItem[]>;
  byPartNumber: Map<string, IndexedItem[]>;
  byBarcode: Map<string, IndexedItem[]>;
  /** exact catalog token -> items that carry it, in original order. */
  tokenToItems: Map<string, IndexedItem[]>;
  /** every distinct catalog token — scanned (not the item list) for substring stages. */
  uniqueTokens: string[];
}

/** Build the reusable index. Do this once when the catalog is (re)loaded. */
export function indexCatalog(items: CatalogItem[]): CatalogIndex {
  const indexed: IndexedItem[] = items.map((item, order) => {
    const tokenList = item.searchTokens.map((t) => normalizePersian(t)).filter(Boolean);
    return {
      item,
      tokens: new Set(tokenList),
      joined: tokenList.join(" "),
      barcodes: new Set(item.barcodes.map((b) => normalizePersian(b)).filter(Boolean)),
      order,
    };
  });

  const bySku = new Map<string, IndexedItem[]>();
  const byPartNumber = new Map<string, IndexedItem[]>();
  const byBarcode = new Map<string, IndexedItem[]>();
  const tokenToItems = new Map<string, IndexedItem[]>();

  const addTo = (map: Map<string, IndexedItem[]>, key: string, ix: IndexedItem) => {
    const arr = map.get(key);
    if (arr) arr.push(ix);
    else map.set(key, [ix]);
  };

  for (const ix of indexed) {
    if (ix.item.sku != null) {
      const k = normalizePersian(ix.item.sku);
      if (k) addTo(bySku, k, ix);
    }
    if (ix.item.partNumber != null) {
      const k = normalizePersian(ix.item.partNumber);
      if (k) addTo(byPartNumber, k, ix);
    }
    for (const b of ix.barcodes) addTo(byBarcode, b, ix);
    for (const t of ix.tokens) addTo(tokenToItems, t, ix);
  }

  return {
    items: indexed,
    bySku,
    byPartNumber,
    byBarcode,
    tokenToItems,
    uniqueTokens: [...tokenToItems.keys()],
  };
}

/** Returns ranked catalog items (empty for a blank / single-char query). */
export function searchCatalog(index: CatalogIndex, query: string): CatalogItem[] {
  const q = normalizePersian(query);
  if (!q) return [];
  const tokens = tokenizeQuery(q);
  if (tokens.length === 0) return [];

  const out: CatalogItem[] = [];
  const seen = new Set<string>();

  const push = (matches: IndexedItem[], limit: number) => {
    for (const m of matches) {
      if (!seen.has(m.item.id)) {
        seen.add(m.item.id);
        out.push(m.item);
      }
      if (out.length >= limit) return;
    }
  };

  // 1) exact code — sku / partNumber / barcode equals the whole query
  push(
    [...(index.bySku.get(q) ?? []), ...(index.byPartNumber.get(q) ?? []), ...(index.byBarcode.get(q) ?? [])].sort(
      (a, b) => a.order - b.order,
    ),
    MAX_RESULTS,
  );

  // 2) full token-set containment
  push(byTokens(index, tokens), MAX_RESULTS);

  // 3) substring
  if (out.length < SUBSTRING_STAGE_THRESHOLD) {
    push(bySubstring(index, tokens), MAX_RESULTS);

    // 4) one-less
    if (out.length < SUBSTRING_STAGE_THRESHOLD && tokens.length >= 2) {
      for (let skip = 0; skip < tokens.length; skip++) {
        if (out.length >= MAX_RESULTS) break;
        const subset = tokens.filter((_, i) => i !== skip);
        push(bySubstring(index, subset), MAX_RESULTS);
      }
    }
  }

  return out.slice(0, MAX_RESULTS);
}

/**
 * Every query token is one of the product's tokens. Scans only the smallest
 * per-token candidate list (the "spine") instead of the whole catalog, then
 * confirms the other tokens by O(1) Set lookups.
 */
function byTokens(index: CatalogIndex, tokens: string[]): IndexedItem[] {
  let spine: IndexedItem[] | null = null;
  for (const t of tokens) {
    const arr = index.tokenToItems.get(t);
    if (!arr || arr.length === 0) return []; // a required token doesn't exist anywhere -> no match possible
    if (!spine || arr.length < spine.length) spine = arr;
  }
  if (!spine) return [];

  return spine
    .filter((ix) => tokens.every((t) => ix.tokens.has(t)))
    .sort((a, b) => a.tokens.size - b.tokens.size || a.order - b.order);
}

/**
 * Every query token is a substring of at least one of the item's catalog
 * tokens. For each query token, only the (typically far smaller) list of
 * UNIQUE catalog tokens is scanned for `.includes()`, not every item.
 */
function bySubstring(index: CatalogIndex, tokens: string[]): IndexedItem[] {
  if (tokens.length === 0) return [];

  const perTokenSets = tokens.map((t) => substringCandidates(index, t));
  if (perTokenSets.some((s) => s.size === 0)) return [];

  // Intersect smallest-first so each step filters against the fewest items.
  perTokenSets.sort((a, b) => a.size - b.size);
  let result = perTokenSets[0];
  for (let i = 1; i < perTokenSets.length; i++) {
    const other = perTokenSets[i];
    const next = new Set<IndexedItem>();
    for (const ix of result) if (other.has(ix)) next.add(ix);
    result = next;
  }

  return [...result]
    .sort((a, b) => a.order - b.order) // restore original catalog order first...
    .sort((a, b) => a.joined.length - b.joined.length); // ...so this stable sort's ties match it
}

function substringCandidates(index: CatalogIndex, token: string): Set<IndexedItem> {
  const out = new Set<IndexedItem>();
  for (const catalogToken of index.uniqueTokens) {
    if (catalogToken.includes(token)) {
      for (const ix of index.tokenToItems.get(catalogToken)!) out.add(ix);
    }
  }
  return out;
}
