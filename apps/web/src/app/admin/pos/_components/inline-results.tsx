"use client";

import { useEffect, useRef } from "react";
import { Loader2, MapPin, Send, Package, AlertTriangle } from "lucide-react";

import { qty, toFa, rial } from "@/lib/format";
import type { LocateResult } from "@/lib/types";
import type { HighlightSegment } from "@/lib/pos-search/highlight";

/**
 * One live-search row.
 *
 * "known" rows carry stock/location straight from the server (today's
 * fallback search, still used until the local catalog finishes loading).
 * "unknown" rows come from the instant LOCAL catalog search, which never
 * carries stock — caching stock client-side would mean selling off a number
 * that can go stale. Picking an "unknown" row triggers a fresh fetch (see
 * `pickingId`) before it can join the cart.
 */
export type SearchResultRow =
  | { kind: "known"; id: string; nameSegments: HighlightSegment[]; result: LocateResult }
  | { kind: "unknown"; id: string; nameSegments: HighlightSegment[]; name: string; sku: string | null; salePrice: number | null };

/**
 * نتایج زنده‌ی جست‌وجو، همان زیر نوار اسکن.
 *
 * قبلاً برای دیدن نتیجه باید دیالوگ F3 باز می‌شد. حالا فروشنده تایپ می‌کند و
 * نتیجه همان‌جا می‌آید — بدون تعویض زمینه، بدون یک کلید اضافه.
 *
 * `highlight === -1` یعنی «هنوز هیچ ردیفی انتخاب نشده». این عمدی و مهم است:
 * بارکدخوان تندتند تایپ می‌کند و آخرش Enter می‌زند. اگر ردیف اول از پیش
 * انتخاب بود، همان Enter کالای اشتباهی را به سبد می‌انداخت. تا وقتی فروشنده
 * دستی ↓ نزده، Enter مسیر بارکد را می‌رود.
 */
export function InlineResults({
  rows,
  highlight,
  loading,
  pickingId,
  onPick,
  onSendToWorker,
  onHover,
}: {
  rows: SearchResultRow[];
  highlight: number;
  loading: boolean;
  /** id of the row currently resolving a fresh-stock fetch, if any. */
  pickingId: string | null;
  onPick: (r: SearchResultRow) => void;
  onSendToWorker: (r: LocateResult) => void;
  onHover: (i: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // ردیفِ انتخاب‌شده همیشه در دید بماند، وقتی با ↑↓ از لبه رد می‌شود.
  useEffect(() => {
    if (highlight < 0) return;
    listRef.current
      ?.querySelectorAll("[data-row]")
      [highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  if (!loading && rows.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute inset-x-0 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-lg
                 border bg-popover p-1 shadow-lg"
    >
      {loading && rows.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          در حال جست‌وجو…
        </p>
      )}

      {rows.map((row, i) => {
        const known = row.kind === "known" ? row.result : null;
        const inStock = !!known && known.totalStock > 0;
        const lowStock = !!known && known.totalStock > 0 && known.totalStock <= 5;
        const shelf = known ? known.locations[0]?.path || known.locations[0]?.name || "" : "";
        const salePrice = known ? known.salePrice : row.kind === "unknown" ? row.salePrice : null;
        const sku = known ? known.sku : row.kind === "unknown" ? row.sku : null;
        const isPicking = pickingId === row.id;

        return (
          <div
            key={row.id}
            data-row
            onMouseEnter={() => onHover(i)}
            className={`flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-right transition-colors ${
              i === highlight ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted/50"
            } ${isPicking ? "opacity-60" : ""}`}
          >
            <button
              type="button"
              onClick={() => onPick(row)}
              disabled={pickingId !== null}
              className="min-w-0 flex-1 text-right focus:outline-none disabled:cursor-wait"
            >
              {/* ردیف اول: نام + قیمت + وضعیت موجودی */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {known && (
                    <span
                      className={`size-2.5 shrink-0 rounded-full ${
                        inStock ? (lowStock ? "bg-amber-600" : "bg-emerald-600") : "bg-muted-foreground/40"
                      }`}
                      aria-hidden
                    />
                  )}
                  <span className="truncate font-semibold text-sm">
                    {row.nameSegments.map((seg, si) =>
                      seg.matched ? (
                        <mark
                          key={si}
                          className="rounded-sm bg-transparent px-0 text-destructive dark:text-red-400"
                        >
                          {seg.text}
                        </mark>
                      ) : (
                        <span key={si}>{seg.text}</span>
                      ),
                    )}
                  </span>
                  {isPicking && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {!!salePrice && (
                    <span className="text-sm font-bold tabular-nums text-primary">
                      {rial(salePrice)}
                    </span>
                  )}
                </div>
              </div>

              {/* ردیف دوم: اطلاعات فنی + موجودی */}
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                  <span className="truncate">
                    کد {toFa(sku ?? "—")}
                  </span>
                  {shelf && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="size-3" />
                        {shelf}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {known ? (
                    inStock ? (
                      <span className={`flex items-center gap-1 text-xs font-medium ${
                        lowStock ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {lowStock ? <AlertTriangle className="size-3" /> : <Package className="size-3" />}
                        موجودی {qty(known.totalStock)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <Package className="size-3" />
                        بدون موجودی
                      </span>
                    )
                  ) : (
                    // "unknown" (local-search) row — stock is checked fresh only
                    // at the moment of picking, so no possibly-stale number here.
                    <span className="text-xs text-muted-foreground">برای موجودی انتخاب کنید</span>
                  )}
                </div>
              </div>
            </button>

            {known && inStock && (
              <button
                type="button"
                onClick={() => onSendToWorker(known)}
                title="ارسال آدرس این کالا به کارگر"
                className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1.5 text-xs
                           text-muted-foreground hover:border-primary hover:text-primary
                           focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <Send className="size-3.5" />
                به کارگر
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
