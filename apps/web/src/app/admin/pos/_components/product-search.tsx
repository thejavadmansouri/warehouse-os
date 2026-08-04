"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MapPin, Send } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { locateProducts } from "@/lib/api";
import { qty, toFa } from "@/lib/format";
import type { LocateResult } from "@/lib/types";

/**
 * جست‌وجوی زنده‌ی کالا در صندوق فروش.
 *
 * برخلاف قبل، همان لحظه‌ی تایپ نتیجه می‌آید و هر نتیجه می‌گوید موجود است یا نه:
 *  - موجود → علامت سبز + آدرس قفسه + دکمه‌ی «ارسال به کارگر».
 *  - ناموجود → برچسب خاکستریِ «ناموجود».
 *
 * از /products/locate استفاده می‌کند که کالا و خلاصه‌ی موجودی را یک‌جا می‌دهد،
 * پس افزودن به سبد دیگر یک رفت‌وبرگشتِ جدا برای موجودی لازم ندارد.
 */
export function ProductSearch({
  open,
  onPick,
  onSendToWorker,
  onClose,
}: {
  open: boolean;
  onPick: (r: LocateResult) => void;
  onSendToWorker: (r: LocateResult) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    // تأخیرِ کوتاه — آن‌قدر که هر ضربه‌ی کلید یک درخواست نزند، ولی «زنده» حس شود.
    const t = setTimeout(() => setDebounced(q), 120);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const enabled = open && debounced.trim().length > 1;
  const results = useQuery({
    queryKey: ["pos-locate", debounced],
    queryFn: () => locateProducts(debounced),
    enabled,
    // نتیجه‌ی قبلی سرِ جایش می‌ماند تا لیست هنگام تایپ پرش/پلک نزند.
    placeholderData: keepPreviousData,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">جست‌وجوی کالا</DialogTitle>
        </DialogHeader>

        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="نام کالا، کد یا شماره فنی…"
        />

        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
          {enabled && results.isFetching && (results.data?.length ?? 0) === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              در حال جست‌وجو…
            </p>
          )}

          {enabled && !results.isFetching && (results.data?.length ?? 0) === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              کالایی پیدا نشد
            </p>
          )}

          {results.data?.map((r) => (
            <ResultRow
              key={r.id}
              result={r}
              onPick={() => onPick(r)}
              onSendToWorker={() => onSendToWorker(r)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultRow({
  result: r,
  onPick,
  onSendToWorker,
}: {
  result: LocateResult;
  onPick: () => void;
  onSendToWorker: () => void;
}) {
  const inStock = r.totalStock > 0;
  const shelf = r.locations[0]?.path || r.locations[0]?.name || "";

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-right transition-colors ${
        inStock ? "hover:border-primary hover:bg-primary/5" : "opacity-70"
      }`}
    >
      <button
        type="button"
        onClick={inStock ? onPick : undefined}
        disabled={!inStock}
        className="min-w-0 flex-1 text-right focus:outline-none disabled:cursor-not-allowed"
      >
        <span className="flex items-center gap-2">
          {inStock ? (
            <span className="size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          ) : (
            <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
          )}
          <span className="truncate font-medium">{r.name}</span>
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          کد {toFa(r.sku ?? "—")}
        </span>

        {inStock ? (
          <span className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{shelf}</span>
            <span className="shrink-0 text-muted-foreground">
              · موجودی {qty(r.totalStock)}
              {r.locations.length > 1 && ` (${toFa(r.locations.length)} مکان)`}
            </span>
          </span>
        ) : (
          <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            ناموجود
          </span>
        )}
      </button>

      {inStock && (
        <button
          type="button"
          onClick={onSendToWorker}
          title="ارسال آدرس این کالا به کارگر"
          className="flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs
                     text-muted-foreground hover:border-primary hover:text-primary
                     focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <Send className="size-3.5" />
          به کارگر
        </button>
      )}
    </div>
  );
}
