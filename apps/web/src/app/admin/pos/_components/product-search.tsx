"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MapPin, Send } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { locateProducts } from "@/lib/api";
import { qty, toFa, rial } from "@/lib/format";
import type { LocateResult } from "@/lib/types";
import { EditablePrice } from "./inline-results";

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
  initialQuery = "",
  canManagePrice,
  onSavePrice,
  onPick,
  onSendToWorker,
  onClose,
}: {
  open: boolean;
  /** متنی که فروشنده در نوار بالا زده بود — بدون تایپ دوباره ادامه می‌دهد. */
  initialQuery?: string;
  canManagePrice?: boolean;
  onSavePrice?: (productId: string, field: "sale" | "manager", value: number) => void;
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

  /*
   * با باز شدن، متنِ نوارِ بالا را می‌آورد (تا فروشنده دوباره تایپ نکند) و با
   * بسته شدن پاکش می‌کند — تطبیقِ state در رندر (به ازایِ open و initialQuery)
   * به‌جای effect.
   */
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevInitialQuery, setPrevInitialQuery] = useState(initialQuery);
  if (open !== prevOpen || initialQuery !== prevInitialQuery) {
    setPrevOpen(open);
    setPrevInitialQuery(initialQuery);
    if (open) {
      setQ(initialQuery);
      setDebounced(initialQuery);
    } else {
      setQ("");
      setDebounced("");
    }
  }

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
              canManage={canManagePrice}
              onSavePrice={onSavePrice}
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
  canManage,
  onSavePrice,
  onPick,
  onSendToWorker,
}: {
  result: LocateResult;
  canManage?: boolean;
  onSavePrice?: (productId: string, field: "sale" | "manager", value: number) => void;
  onPick: () => void;
  onSendToWorker: () => void;
}) {
  const inStock = r.totalStock > 0;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-right transition-colors ${
        inStock ? "hover:border-primary hover:bg-primary/5" : "hover:border-amber-600/60 hover:bg-amber-600/10"
      }`}
    >
      {/*
        کالای ناموجود هم قابل انتخاب است. در دوره‌ی راه‌اندازی، جنس در انبار هست
        ولی هنوز وارد نرم‌افزار نشده — بستنِ فروش یعنی نرم‌افزار جلوی کار را بگیرد.
      */}
      <button
        type="button"
        onClick={onPick}
        className="min-w-0 flex-1 text-right focus:outline-none"
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

        {/* چهارگانه‌ی قیمت — همه در یک ردیف و هم‌تراز، هر کدام با رنگِ خودش.
            بهای خرید/۱۵٪/مدیر فقط برای مدیر؛ فروشنده فقط فروش را می‌بیند. */}
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          {canManage && r.purchasePrice != null && (
            <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] tabular-nums text-sky-700 dark:text-sky-300" title="بهای خرید">
              <span className="opacity-70">خرید</span>
              {rial(r.purchasePrice)}
            </span>
          )}
          <EditablePrice
            productId={r.id}
            field="sale"
            label="فروش"
            value={r.salePrice}
            canManage={canManage}
            onSave={onSavePrice}
          />
          {canManage && r.suggestedPrice != null && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] tabular-nums text-amber-700 dark:text-amber-300" title="قیمت پیشنهادی — خرید + ۱۵٪ سود">
              <span className="opacity-70">۱۵٪</span>
              {rial(r.suggestedPrice)}
            </span>
          )}
          {canManage && (
            <EditablePrice
              productId={r.id}
              field="manager"
              label="مدیر"
              value={r.managerPrice}
              canManage={canManage}
              onSave={onSavePrice}
            />
          )}
        </span>

        {inStock ? (
          <div className="mt-1 space-y-0.5">
            {r.locations.map((loc) => (
              <div
                key={loc.locationId}
                className="flex items-start gap-1.5 text-xs leading-5"
              >
                <MapPin className="mt-1 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="min-w-0 flex-1 break-words text-emerald-700 dark:text-emerald-400">
                  {loc.path || loc.name}
                  {loc.stranded ? (
                    <span className="mr-1.5 whitespace-nowrap rounded bg-amber-600/10 px-1 text-[10px] text-amber-600 dark:text-amber-400">
                      قفسه حذف‌شده
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                  {qty(loc.quantity)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className="mt-1 inline-block rounded bg-amber-600/10 px-1.5 py-0.5 text-xs text-amber-600 dark:bg-amber-600/10 dark:text-amber-400">
            در سیستم ثبت نشده — قابل فروش
          </span>
        )}
      </button>

      <div className="flex shrink-0 items-center gap-2">
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
    </div>
  );
}
