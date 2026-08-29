"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getPosCatalog } from "@/lib/api";

import {
  type CatalogState,
  emptyCatalog,
  mergeCatalog,
  toCatalogItems,
} from "./catalog-store";
import { indexCatalog, searchCatalog, type CatalogItem, type CatalogIndex } from "./rank";

const PAGE_SIZE = 2000;
const MAX_PAGES = 200; // guard against a bad server count -> infinite loop
const REFRESH_MS = 3 * 60 * 1000; // fold in changes every 3 minutes

export interface PosCatalog {
  /** true once the first full load has finished — until then, fall back to server search. */
  ready: boolean;
  /** rows currently held in memory (for a "N products loaded" hint). */
  count: number;
  /** Instant local search. Empty array until [ready]. */
  search: (query: string) => CatalogItem[];
}

/**
 * Loads the POS catalog into memory once, then keeps it fresh incrementally, so
 * product search is instant with no per-keystroke network call — the reason
 * Holoo feels instant and our server search lagged.
 *
 * Deliberately in-memory (not IndexedDB) for v1: ~33k lean rows is a few MB and
 * a couple of seconds over the shop LAN. Until the load finishes, callers use
 * the server search, so there is never a dead search box during warm-up.
 */
export function usePosCatalog(): PosCatalog {
  const [state, setState] = useState<CatalogState>(emptyCatalog);
  const [ready, setReady] = useState(false);

  // The built index is derived from state; rebuilt only when state changes,
  // never per keystroke.
  const index = useMemo<CatalogIndex>(
    () => indexCatalog(toCatalogItems(state)),
    [state],
  );

  // Keep the latest cursor in a ref so the refresh timer reads it without being
  // re-created every time the catalog changes. Synced in an effect (not during
  // render, which React now flags as unsafe for refs) — a one-tick-later
  // update is harmless since the ref is only read later, asynchronously, by
  // the interval/focus handlers below.
  const cursorRef = useRef<string | null>(null);
  useEffect(() => {
    cursorRef.current = state.cursor;
  }, [state.cursor]);

  const loadingRef = useRef(false);

  /** Pulls every page changed since [since] and folds them in. */
  const pull = useCallback(async (since: string | undefined) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      let page = 1;
      let hasMore = true;
      const batches: Awaited<ReturnType<typeof getPosCatalog>>["products"][] = [];
      while (hasMore && page <= MAX_PAGES) {
        const res = await getPosCatalog(page, PAGE_SIZE, since);
        batches.push(res.products);
        hasMore = res.hasMore;
        page = res.page + 1;
      }
      const rows = batches.flat();
      if (rows.length > 0) {
        setState((prev) => mergeCatalog(prev, rows));
      }
    } finally {
      loadingRef.current = false;
    }
  }, []);

  /*
   * First full load, with retry.
   *
   * The old version awaited `pull` and only then set `ready`. If that first
   * pull threw — a server restart, a Windows box waking from sleep, one bad
   * response — `setReady(true)` was never reached, so `search()` returned an
   * empty array *forever* and the only cure was reloading the page. A seller
   * just sees "live search is dead" with no way back.
   *
   * Now a failure is retried with backoff, and the catch is unconditional so
   * the promise can never reject unhandled.
   */
  useEffect(() => {
    let alive = true;
    let attempt = 0;

    const load = async () => {
      while (alive) {
        try {
          await pull(undefined);
          if (alive) setReady(true);
          return;
        } catch {
          attempt += 1;
          if (!alive) return;
          // 1s, 2s, 4s … capped — a shop LAN blip should cost seconds, not a shift.
          const wait = Math.min(1000 * 2 ** (attempt - 1), 30_000);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [pull]);

  // Periodic incremental refresh + a refresh when the tab regains focus (the
  // seller comes back to the POS after doing something else).
  useEffect(() => {
    // A failed refresh must never become an unhandled rejection — the catalog
    // simply stays as it is until the next tick, and search keeps working.
    const tick = () => {
      void pull(cursorRef.current ?? undefined).catch(() => {});
    };
    const id = window.setInterval(tick, REFRESH_MS);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [pull]);

  const search = useCallback(
    (query: string): CatalogItem[] => (ready ? searchCatalog(index, query) : []),
    [ready, index],
  );

  return { ready, count: state.byId.size, search };
}
