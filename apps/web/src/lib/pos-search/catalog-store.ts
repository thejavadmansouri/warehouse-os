import type { PosCatalogRow } from "@/lib/types";

import type { CatalogItem } from "./rank";

/**
 * Pure catalog-merge logic, kept out of React so it can be unit-tested.
 *
 * The client keeps the full catalog in memory as a Map by id. An incremental
 * refresh (rows changed since the last `updatedAt`) is folded in with these
 * rules:
 *   - a row marked `deleted` is removed
 *   - any other row upserts (replaces the previous version by id)
 * The newest `updatedAt` seen becomes the cursor for the next refresh.
 */

export interface CatalogState {
  byId: Map<string, PosCatalogRow>;
  /** ISO timestamp of the newest row folded in — the next `updatedSince`. */
  cursor: string | null;
}

export function emptyCatalog(): CatalogState {
  return { byId: new Map(), cursor: null };
}

/** Folds a batch of rows into the state, returning a NEW state (immutable). */
export function mergeCatalog(state: CatalogState, rows: PosCatalogRow[]): CatalogState {
  const byId = new Map(state.byId);
  let cursor = state.cursor;

  for (const row of rows) {
    if (row.deleted || !row.isActive) {
      byId.delete(row.id);
    } else {
      byId.set(row.id, row);
    }
    // Track the high-water mark regardless of delete/upsert — a deletion still
    // advances time, and missing it would re-pull the same delete forever.
    if (!cursor || row.updatedAt > cursor) cursor = row.updatedAt;
  }

  return { byId, cursor };
}

/** Projects the stored rows to the shape the ranking engine indexes. */
export function toCatalogItems(state: CatalogState): CatalogItem[] {
  const items: CatalogItem[] = [];
  for (const r of state.byId.values()) {
    items.push({
      id: r.id,
      name: r.name,
      sku: r.sku,
      partNumber: r.partNumber,
      searchTokens: r.searchTokens,
      barcodes: r.barcodes,
      salePrice: r.salePrice,
      unit: r.unit,
      brandName: r.brand,
      vehicleModelName: r.vehicleModel,
    });
  }
  return items;
}
