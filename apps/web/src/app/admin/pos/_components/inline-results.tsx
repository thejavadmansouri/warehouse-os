"use client";

import { useEffect, useRef } from "react";
import { MapPin, Send, Package, AlertTriangle } from "lucide-react";

import { qty, toFa, rial } from "@/lib/format";
import type { LocateResult } from "@/lib/types";

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
  results,
  highlight,
  loading,
  onPick,
  onSendToWorker,
  onHover,
}: {
  results: LocateResult[];
  highlight: number;
  loading: boolean;
  onPick: (r: LocateResult) => void;
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

  if (!loading && results.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute inset-x-0 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-lg
                 border bg-popover p-1 shadow-lg"
    >
      {loading && results.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          در حال جست‌وجو…
        </p>
      )}

      {results.map((r, i) => {
        const inStock = r.totalStock > 0;
        const lowStock = r.totalStock > 0 && r.totalStock <= 5;
        const shelf = r.locations[0]?.path || r.locations[0]?.name || "";

        return (
          <div
            key={r.id}
            data-row
            onMouseEnter={() => onHover(i)}
            className={`flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-right transition-colors ${
              i === highlight ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted/50"
            }`}
          >
            <button
              type="button"
              onClick={() => onPick(r)}
              className="min-w-0 flex-1 text-right focus:outline-none"
            >
              {/* ردیف اول: نام + قیمت + وضعیت موجودی */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${
                      inStock
                        ? lowStock
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                        : "bg-muted-foreground/40"
                    }`}
                    aria-hidden
                  />
                  <span className="truncate font-semibold text-sm">{r.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {!!r.salePrice && (
                    <span className="text-sm font-bold tabular-nums text-blue-700 dark:text-blue-400">
                      {rial(r.salePrice)}
                    </span>
                  )}
                </div>
              </div>

              {/* ردیف دوم: اطلاعات فنی + موجودی */}
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                  <span className="truncate">
                    کد {toFa(r.sku ?? "—")}
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
                  {inStock ? (
                    <span className={`flex items-center gap-1 text-xs font-medium ${
                      lowStock
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}>
                      {lowStock ? (
                        <AlertTriangle className="size-3" />
                      ) : (
                        <Package className="size-3" />
                      )}
                      موجودی {qty(r.totalStock)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <Package className="size-3" />
                      بدون موجودی
                    </span>
                  )}
                </div>
              </div>


            </button>

            {inStock && (
              <button
                type="button"
                onClick={() => onSendToWorker(r)}
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
