"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Send, Package, AlertTriangle } from "lucide-react";

import { qty, toFa, rial } from "@/lib/format";
import { MoneyInput } from "@/components/money-input";
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
  | { kind: "unknown"; id: string; nameSegments: HighlightSegment[]; name: string; sku: string | null; salePrice: number | null; purchasePrice?: number | null; suggestedPrice?: number | null; managerPrice?: number | null };

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
  canManagePrice,
  onSavePrice,
  onPick,
  onSendToWorker,
  onHover,
}: {
  rows: SearchResultRow[];
  highlight: number;
  loading: boolean;
  /** id of the row currently resolving a fresh-stock fetch, if any. */
  pickingId: string | null;
  /** مدیر می‌تواند قیمتِ فروش و قیمتِ مدیر را همین‌جا ویرایش و ذخیره کند. */
  canManagePrice?: boolean;
  onSavePrice?: (productId: string, field: "sale" | "manager", value: number) => void;
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
        const salePrice = known ? known.salePrice : row.kind === "unknown" ? row.salePrice : null;
        const sku = known ? known.sku : row.kind === "unknown" ? row.sku : null;
        const purchasePrice = known ? known.purchasePrice : row.kind === "unknown" ? row.purchasePrice : null;
        const suggestedPrice = known ? known.suggestedPrice : row.kind === "unknown" ? row.suggestedPrice : null;
        const managerPrice = known ? known.managerPrice : row.kind === "unknown" ? row.managerPrice : null;
        const isPicking = pickingId === row.id;
        const active = i === highlight;

        return (
          <div
            key={row.id}
            data-row
            onMouseEnter={() => onHover(i)}
            className={`rounded-md text-right transition-colors ${
              active ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted/50"
            } ${isPicking ? "opacity-60" : ""}`}
          >
            {/*
              ردیفِ یک‌سطریِ فشرده — همه‌چیز در یک سطر:
                [وضعیت] نام کالا · قیمت‌ها · موجودی
              ~۳۲px به‌ازای هر کالا؛ به‌جای ۴–۶ نتیجه، ۱۲–۱۵ نتیجه در یک نگاه.
              آدرسِ قفسه‌ها پایین سطرِ ردیفِ انتخاب‌شده باز می‌شود.
            */}
            <div className="flex items-center gap-2 px-2 py-1.5">
              <button
                type="button"
                onClick={() => onPick(row)}
                disabled={pickingId !== null}
                className="flex min-w-0 flex-1 items-center gap-2 text-right focus:outline-none disabled:cursor-wait"
              >
                {known && (
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${
                      inStock ? (lowStock ? "bg-amber-600" : "bg-emerald-600") : "bg-muted-foreground/40"
                    }`}
                    aria-hidden
                  />
                )}
                <span
                  className="min-w-0 flex-1 truncate font-semibold text-sm"
                  title={
                    known
                      ? sku
                        ? `${known.name} — کد ${toFa(sku)}`
                        : known.name
                      : row.kind === "unknown"
                        ? row.name
                        : ""
                  }
                >
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
              </button>

              {/*
                چهارگانه‌ی قیمت — فشرده، همان‌سطر، بیرونِ دکمه‌ی افزودن تا دو عنصرِ
                تعاملی داخل هم نیفتند (ویرایشِ قیمت نباید کالا به سبد بیندازد):
                  خرید (آبی) · فروش (سبز) · ۱۵٪ (کهربایی) · مدیر (بنفش)
                بهای خرید/۱۵٪/مدیر فقط برای مدیر می‌آید؛ فروشنده فقط فروش را می‌بیند.
              */}
              {canManagePrice && purchasePrice != null && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] tabular-nums text-sky-700 dark:text-sky-300" title="بهای خرید">
                  <span className="opacity-70">خرید</span>
                  {rial(purchasePrice)}
                </span>
              )}
              <EditablePrice
                compact
                productId={row.id}
                field="sale"
                label="فروش"
                value={salePrice}
                canManage={canManagePrice}
                onSave={onSavePrice}
                disabled={isPicking}
              />
              {canManagePrice && suggestedPrice != null && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] tabular-nums text-amber-700 dark:text-amber-300" title="قیمت پیشنهادی — خرید + ۱۵٪ سود">
                  <span className="opacity-70">۱۵٪</span>
                  {rial(suggestedPrice)}
                </span>
              )}
              {canManagePrice && (
                <EditablePrice
                  compact
                  productId={row.id}
                  field="manager"
                  label="مدیر"
                  value={managerPrice}
                  canManage={canManagePrice}
                  onSave={onSavePrice}
                  disabled={isPicking}
                />
              )}

              {/* موجودی — انتهای سطر */}
              {known ? (
                inStock ? (
                  <span className={`flex shrink-0 items-center gap-1 text-[11px] font-medium ${
                    lowStock ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {lowStock ? <AlertTriangle className="size-3" /> : <Package className="size-3" />}
                    موجودی {qty(known.totalStock)}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                    <Package className="size-3" />
                    بدون موجودی
                  </span>
                )
              ) : (
                // "unknown" (local-search) row — stock is checked fresh only
                // at the moment of picking, so no possibly-stale number here.
                <span className="shrink-0 text-[11px] text-muted-foreground">برای موجودی انتخاب کنید</span>
              )}

              {/* ارسال به کارگر — فقط روی ردیفِ انتخاب‌شده، آیکون‌فقط تا ردیف فشرده بماند */}
              {known && inStock && active && (
                <button
                  type="button"
                  onClick={() => onSendToWorker(known)}
                  title="ارسال آدرس این کالا به کارگر"
                  className="flex shrink-0 items-center rounded-md border p-1 text-muted-foreground hover:border-primary hover:text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <Send className="size-3.5" />
                </button>
              )}
            </div>

            {/* آدرسِ قفسه‌ها — فقط روی ردیفِ انتخاب‌شده باز می‌شود تا لیست فشرده بماند؛
                با ↓ که به ردیف می‌رسد، جای کالا همان‌جا دیده می‌شود. */}
            {active && known && inStock && known.locations.length > 0 && (
              <div className="space-y-0.5 border-t border-dashed px-2 pb-1.5 pt-1">
                {known.locations.map((loc) => (
                  <div
                    key={loc.locationId}
                    className="flex items-start gap-1.5 text-[11px] leading-4"
                  >
                    <MapPin className="mt-0.5 size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="min-w-0 flex-1 break-words text-foreground">
                      {loc.path || loc.name}
                      {loc.stranded ? (
                        <span className="mr-1 whitespace-nowrap rounded bg-amber-600/10 px-1 text-[10px] text-amber-600 dark:text-amber-400">
                          قفسه حذف‌شده
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      {qty(loc.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * قیمتِ ویرایش‌پذیر در نتیجه‌ی جستجو — برای هر دو قیمتِ «فروش» و «مدیر».
 *
 * برای فروشنده فقط نمایش است (سبز برای فروش، بنفش برای مدیر وقتی مدیر خودش
 * ردیف را می‌بیند)؛ برای مدیر یک دکمه است که با کلیک به فیلد پولی تبدیل می‌شود
 * و Enter/blur ذخیره را صدا می‌زند (Esc لغو). عمداً بیرونِ دکمه‌ی افزودن است —
 * دو عنصر تعاملی نباید داخل هم باشند.
 */
export function EditablePrice({
  productId,
  field,
  label,
  value,
  canManage,
  onSave,
  disabled,
  compact,
}: {
  productId: string;
  field: "sale" | "manager";
  label: string;
  value: number | null | undefined;
  canManage?: boolean;
  onSave?: (productId: string, field: "sale" | "manager", value: number) => void;
  disabled?: boolean;
  /** حالتِ فشرده برای ردیفِ یک‌سطریِ جست‌وجوی زنده — چیپ و ورودیِ کوچک‌تر. */
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);

  const start = () => {
    setDraft(value ?? 0);
    setEditing(true);
  };
  const commit = () => {
    if (draft != null) onSave?.(productId, field, draft);
    setEditing(false);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(null);
  };

  const tone =
    field === "sale"
      ? "border-emerald-500/30 bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/20 dark:text-emerald-400"
      : "border-violet-500/30 bg-violet-600/10 text-violet-600 hover:bg-violet-600/20 dark:text-violet-400";
  const chipTone = tone.replace(/ hover:[^\s]+/, "");
  // فشرده: چیپ‌های کوچک‌تر (۱۰px) و ورودیِ باریک‌تر؛ عادی: همان شکلِ قبلی.
  const chipPad = compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]";

  if (!editing) {
    if (value == null) {
      if (!canManage) return null;
      return (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          title={`ثبت ${label === "مدیر" ? "قیمتِ مدیر" : "قیمت فروش"} برای این کالا`}
          className={`inline-flex items-center gap-1 rounded-md border border-dashed ${chipPad} font-semibold tabular-nums text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50 ${disabled ? "cursor-wait" : ""}`}
        >
          {label}
          <span className="opacity-60">بدون قیمت</span>
        </button>
      );
    }
    if (!canManage || !onSave) {
      return (
        <span className={`inline-flex items-center gap-1 rounded-md border ${chipPad} font-semibold tabular-nums ${chipTone}`}>
          <span className="opacity-70">{label}</span>
          {rial(value)}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        title={`ویرایش ${label === "مدیر" ? "قیمتِ مدیر" : "قیمت فروش"}`}
        className={`inline-flex items-center gap-1 rounded-md border ${chipPad} font-semibold tabular-nums transition-colors ${tone} disabled:opacity-50 ${disabled ? "cursor-wait" : ""}`}
      >
        <span className="opacity-70">{label}</span>
        {rial(value)}
      </button>
    );
  }

  return (
    <MoneyInput
      value={draft ?? 0}
      onChange={setDraft}
      selectOnFocus
      autoFocus
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      className={`${compact ? "h-6 w-28" : "h-7 w-32"} rounded text-right text-sm font-bold tabular-nums`}
    />
  );
}
