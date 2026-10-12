"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getPosCatalog } from "@/lib/api";
import type { PosCatalogRow } from "@/lib/types";
import { subscribeLiveEvent } from "@/lib/use-live-events";

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
  /** Update a product's prices in the in-memory cache (after a POS save). */
  updateProductPrices: (
    productId: string,
    patch: { salePrice?: number | null; managerPrice?: number | null },
  ) => void;
  /** کالای تازه‌ساخته را همان لحظه در کش محلی بگذار — بدون رفرش صفحه. */
  upsertLocal: (row: PosCatalogRow) => void;
  /** کش را از سرور تازه کن (بعد از ساخت/ویرایش کالا). */
  refreshNow: () => void;
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
  // فقط به byId وابسته — جلو رفتنِ cursor به‌تنهایی نباید ایندکسِ ۳۳ هزار
  // ردیفی را از نو بسازد.
  const byId = state.byId;
  const index = useMemo<CatalogIndex>(
    () => indexCatalog(toCatalogItems({ byId, cursor: null })),
    [byId],
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
      let serverTime: string | undefined;
      const batches: Awaited<ReturnType<typeof getPosCatalog>>["products"][] = [];
      while (hasMore && page <= MAX_PAGES) {
        const res = await getPosCatalog(page, PAGE_SIZE, since);
        serverTime ??= res.serverTime;
        batches.push(res.products);
        hasMore = res.hasMore;
        page = res.page + 1;
      }
      const rows = batches.flat();
      if (rows.length > 0 || serverTime) {
        setState((prev) => {
          const next = rows.length > 0 ? mergeCatalog(prev, rows) : prev;
          // زمان سرور cursor است، نه updatedAtِ کالا — تا کالایی که فقط
          // موجودی/قیمتش عوض شده هر بار دوباره نیاید.
          if (serverTime && (!next.cursor || serverTime > next.cursor)) {
            return { byId: next.byId, cursor: serverTime };
          }
          return next;
        });
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

    /*
     * کالا/قیمت یا فاکتور خرید جای دیگری عوض شد → sync افزایشی همان لحظه (فقط
     * ردیف‌های تغییرکرده). stock.changed عمداً اینجا نیست: هر فروش یعنی ساختِ
     * دوباره‌ی ایندکس کل کاتالوگ، و موجودی اینجا فقط برای ترتیبِ نتایج است —
     * عددِ واقعی لحظه‌ی انتخاب تازه گرفته می‌شود؛ چرخه‌ی ۳ دقیقه‌ای کافی است.
     */
    let liveTimer: number | undefined;
    const onLive = () => {
      if (liveTimer) return;
      liveTimer = window.setTimeout(() => {
        liveTimer = undefined;
        tick();
      }, 1000);
    };
    const unsubs = ["product.changed", "purchase.changed"].map(
      (t) => subscribeLiveEvent(t, onLive),
    );

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      if (liveTimer) window.clearTimeout(liveTimer);
      unsubs.forEach((u) => u());
    };
  }, [pull]);

  const search = useCallback(
    (query: string): CatalogItem[] => (ready ? searchCatalog(index, query) : []),
    [ready, index],
  );

  /**
   * به‌روزرسانیِ قیمت‌های یک کالا در کشِ محلی، بدونِ انتظارِ refresh.
   *
   * وقتی مدیر قیمتِ فروش یا قیمتِ مدیر را مستقیم در نتیجه‌ی جستجو عوض و ذخیره
   * می‌کند، این همان لحظه عددِ ردیف را اصلاح می‌کند تا سرچِ محلی هم قیمتِ تازه
   * را نشان دهد (وگرنه تا refresh بعدی یا ریلود، عددِ کهنه می‌ماند). cursor
   * دست نمی‌خورد — چون این یک ویرایشِ محلی است، نه یک ردیفِ تازه‌ی sync؛ تغییرِ
   * واقعی سرور هم در refresh بعدی از راهِ updatedAt می‌آید.
   */
  const updateProductPrices = useCallback(
    (productId: string, patch: { salePrice?: number | null; managerPrice?: number | null }) => {
      setState((prev) => {
        const cur = prev.byId.get(productId);
        if (!cur) return prev;
        const byId = new Map(prev.byId);
        byId.set(productId, { ...cur, ...patch });
        return { byId, cursor: prev.cursor };
      });
    },
    [],
  );

  const upsertLocal = useCallback((row: PosCatalogRow) => {
    setState((prev) => mergeCatalog(prev, [row]));
  }, []);

  const refreshNow = useCallback(() => {
    void pull(cursorRef.current ?? undefined).catch(() => {});
  }, [pull]);

  return {
    ready,
    count: state.byId.size,
    search,
    updateProductPrices,
    upsertLocal,
    refreshNow,
  };
}
