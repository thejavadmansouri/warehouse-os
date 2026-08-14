"use client";

import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/money-input";
import { money, parseNum, qty, toFa } from "@/lib/format";
import { discountToRial, type DiscountInput as DiscountValue } from "../_lib/discount";
import { DiscountField } from "./discount-input";

export interface PosLine {
  key: string;
  productId: string;
  productName: string;
  unit: string;
  locationId: string;
  locationPath: string;
  available: number;
  // قفسه‌اش حذف/غیرفعال شده ولی جنس رویش مانده — فروختنی هست، ولی باید نشان داده شود.
  stranded?: boolean;
  quantity: number;
  unitPrice: number;
  discount: DiscountValue;
  /**
   * این ردیف جزو فاکتور هست یا نه.
   *
   * تیک‌برداشتن ردیف را حذف نمی‌کند، فقط از فاکتور بیرونش می‌گذارد — نه در جمع
   * می‌آید و نه ثبت می‌شود. مشتری سرِ پیشخوان مدام نظرش عوض می‌شود («این را
   * نمی‌خواهم… نه، بگذار باشد») و حذف‌کردن یعنی دوباره اسکن‌کردن.
   */
  included: boolean;
}

/**
 * حرکت بین خانه‌های جدول با جهت‌ها.
 *
 * فروشنده تعداد را می‌زند و باید بدون برداشتن دست از کیبورد برود روی قیمت.
 * هر خانه‌ی ورودی با `data-cell="ردیف:ستون"` علامت خورده و جابه‌جایی از روی
 * همین صفت انجام می‌شود — نه با ref، که برای جدولی با تعداد ردیف متغیر یعنی
 * یک آرایه‌ی ref که باید دستی نگه داشته شود.
 *
 * چیدمان راست‌به‌چپ است، پس فلشِ چپ یعنی ستون بعدی.
 */
const CELL_COLUMNS = 3;

function moveCell(e: React.KeyboardEvent<HTMLInputElement>) {
  const from = e.currentTarget.dataset.cell;
  if (!from) return;

  const [row, col] = from.split(":").map(Number);

  const toScan = () => document.getElementById("pos-scan")?.focus();
  const toCell = (r: number, c: number) => {
    const el = document.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`);
    el?.focus();
    el?.select();
  };

  /**
   * Enter = «این ردیف تمام شد» ⇒ برگشت به نوار بارکد. آنجا اگر بارکد بعدی زده
   * نشود و باز Enter بخورد، طبق منطقِ صفحه می‌رود روی تسویه. stopPropagation
   * لازم است تا این Enter مستقیم به هندلرِ سراسری (تسویه) نرسد؛ اول باید فوکوس
   * به بارکد برگردد.
   */
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    toScan();
    return;
  }

  /**
   * Tab = زنجیره‌ی رو به جلو: تعداد → قیمت → بارکد. Shift+Tab عکسش. حرکتِ بین
   * تعداد و قیمت فقط با Tab است، نه Enter — تا ریتمِ «Tab تعداد، Tab قیمت,
   * Enter بارکدِ بعدی» ثابت بماند.
   */
  if (e.key === "Tab") {
    e.preventDefault();
    e.stopPropagation();
    if (!e.shiftKey) {
      if (col === 0) toCell(row, 1); // تعداد → قیمت
      else toScan(); // قیمت → بارکد
    } else {
      if (col === 1) toCell(row, 0); // قیمت → تعداد
      else toScan(); // تعداد → بارکد
    }
    return;
  }

  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  if (!keys.includes(e.key)) return;

  /**
   * فلش افقی فقط وقتی خانه را عوض می‌کند که نشانگر به لبه رسیده باشد — وگرنه
   * حرکت داخل خودِ عدد غیرممکن می‌شود و ویرایش یک قیمت هفت‌رقمی عذاب‌آور.
   */
  const el = e.currentTarget;
  const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
  const atEnd =
    el.selectionStart === el.value.length && el.selectionEnd === el.value.length;

  let target: string | null = null;
  if (e.key === "ArrowLeft" && atEnd) target = `${row}:${col + 1}`;
  else if (e.key === "ArrowRight" && atStart) target = `${row}:${col - 1}`;
  else if (e.key === "ArrowDown") target = `${row + 1}:${col}`;
  else if (e.key === "ArrowUp") target = `${row - 1}:${col}`;

  if (!target) return;

  const [tr, tc] = target.split(":").map(Number);
  if (tc < 0 || tc >= CELL_COLUMNS || tr < 0) return;

  const next = document.querySelector<HTMLInputElement>(
    `[data-cell="${target}"]`
  );
  if (!next) return;

  e.preventDefault();
  // جلوی هندلرِ سراسریِ صفحه را بگیر، وگرنه همین فلش ردیفِ فعال را هم عوض می‌کند.
  e.stopPropagation();
  next.focus();
  next.select();
}

/** مبلغ ردیف پیش از تخفیف. */
export const lineGross = (l: PosLine) => l.quantity * l.unitPrice;
/** تخفیف ردیف به ریال، محدودشده به مبلغ خودِ ردیف. */
export const lineDiscount = (l: PosLine) => discountToRial(l.discount, lineGross(l));
/** مبلغ ردیف پس از تخفیف — همان چیزی که سرور در subtotal جمع می‌زند. */
export const lineNet = (l: PosLine) => lineGross(l) - lineDiscount(l);

/**
 * جدول ردیف‌های فاکتور.
 *
 * جدا از صفحه نگه داشته شده تا بشود بدون لاگین و بدون سرور رندرش کرد و چیدمانش
 * را با داده‌ی واقعی‌نما سنجید — عرضِ ستون قیمت و تخفیف با اعداد هفت‌رقمیِ فارسی
 * چیزی است که فقط با دیدن معلوم می‌شود.
 */
export function LineItems({
  lines,
  activeRow,
  errorLine,
  onActivate,
  onPatch,
  onRemove,
}: {
  lines: PosLine[];
  activeRow: number;
  errorLine: number | null;
  onActivate: (i: number) => void;
  onPatch: (i: number, patch: Partial<PosLine>) => void;
  onRemove: (i: number) => void;
}) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-6">
        <div className="rounded-full bg-muted/50 p-4">
          <span className="text-3xl">🛒</span>
        </div>
        <div>
          <p className="text-lg font-medium text-foreground">فاکتور جدید</p>
          <p className="mt-1 text-sm text-muted-foreground">
            برای شروع:
          </p>
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>• بارکد کالا را اسکن کنید</p>
          <p>• یا نام / کد کالا را جستجو کنید</p>
        </div>
        <div className="mt-2 rounded-lg bg-primary/10 px-4 py-2 text-sm text-primary">
          فیلد جستجو همیشه آماده است — شروع کنید
        </div>
      </div>
    );
  }

  return (
    // table-fixed عمدی است: با چیدمان خودکار، نامِ بلندِ کالا ستون‌های عددی را
    // می‌فشرد تا جایی که قیمت هفت‌رقمی بریده می‌شود. حالا عرض ستون‌ها ثابت است و
    // نام کالا truncate می‌شود. min-w هم هست تا در پنجره‌ی باریک به‌جای له‌شدن,
    // جدول افقی اسکرول شود.
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[720px] table-fixed text-sm">
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <tr className="text-muted-foreground">
            <th className="w-10 p-2" />
            <th className="p-2 text-start font-medium">کالا</th>
            <th className="w-32 p-2 text-start font-medium">تعداد</th>
            <th className="w-36 p-2 text-start font-medium whitespace-nowrap">
              قیمت واحد <span className="font-normal opacity-70">(ریال)</span>
            </th>
            <th className="w-32 p-2 text-start font-medium">تخفیف</th>
            {/* جمع آخرین ستون قبل از حذف است؛ در چیدمان راست‌به‌چپ اولین چیزی
                است که با سرریز افقی بریده می‌شود، پس عرض کل باید جا شود. */}
            <th className="w-36 p-2 text-end font-medium">جمع</th>
            <th className="w-10 p-2" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const gross = lineGross(l);
            const disc = lineDiscount(l);
            const isLowStock = l.available > 0 && l.available <= 5;
            const isOutOfStock = l.available === 0 && l.locationId;

            return (
              <tr
                key={l.key}
                onClick={() => onActivate(i)}
                className={`border-t border-e-2 align-top transition-colors ${
                  errorLine === i
                    ? "border-e-destructive bg-destructive/10"
                    : activeRow === i
                      ? "border-e-primary bg-primary/10"
                      : "border-e-transparent"
                } ${
                  // ردیفِ کنارگذاشته کم‌رنگ می‌شود، ولی خوانا می‌ماند — باید
                  // بشود بدون تیک‌زدن دوباره فهمید چه بوده.
                  l.included ? "" : "opacity-45"
                }`}
              >
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={l.included}
                    onChange={(e) => onPatch(i, { included: e.target.checked })}
                    /* کلیک روی چک‌باکس نباید ردیف را هم فعال کند. */
                    onClick={(e) => e.stopPropagation()}
                    className="size-4 cursor-pointer accent-primary"
                    aria-label={`${l.productName} در فاکتور`}
                  />
                </td>

                <td className="p-2">
                  <div className="truncate font-medium">{l.productName}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs">
                    {l.locationId ? (
                      <>
                        <span className="truncate text-sky-700 dark:text-sky-400">
                          {l.locationPath}
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className={`font-medium ${
                          isOutOfStock
                            ? "text-destructive"
                            : isLowStock
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400"
                        }`}>
                          موجودی {qty(l.available)}
                        </span>
                        {isLowStock && !isOutOfStock && (
                          <span className="rounded bg-amber-600/10 px-1 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-600/10 dark:text-amber-400">
                            کم
                          </span>
                        )}
                        {isOutOfStock && (
                          <span className="rounded bg-destructive/10 px-1 py-0.5 text-[10px] font-medium text-destructive">
                            ناموجود
                          </span>
                        )}
                        {l.stranded && (
                          <span
                            title="قفسه‌ی این جنس حذف شده — همین‌طور فروخته می‌شود؛ بهتر است به یک قفسه‌ی معتبر منتقلش کنی."
                            className="rounded bg-orange-500/10 px-1 py-0.5 text-[10px] font-medium text-orange-600 dark:bg-orange-500/10 dark:text-orange-400"
                          >
                            قفسه حذف‌شده
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="rounded bg-amber-600/10 px-1.5 py-0.5 font-medium text-amber-600 dark:bg-amber-600/10 dark:text-amber-400">
                        در سیستم ثبت نشده
                      </span>
                    )}
                    {errorLine === i && (
                      <span className="ms-1 rounded bg-destructive px-1.5 py-0.5 font-medium text-white">
                        موجودی کافی نیست
                      </span>
                    )}
                  </div>
                </td>

                <td className="p-2">
                  {/*
                    دکمه‌های ±: تغییر یکی‌یکی رایج‌ترین کار روی این ستون است و
                    با ماوس نباید یعنی «کلیک، انتخاب متن، تایپ». خانه‌ی عدد هم
                    سرِ جایش می‌ماند چون تعدادِ ۲۴ را کسی با ۲۴ کلیک نمی‌زند.
                  */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPatch(i, { quantity: Math.max(1, l.quantity - 1) });
                      }}
                      className="flex size-8 shrink-0 items-center justify-center rounded-md border
                                 text-muted-foreground hover:border-primary hover:text-primary
                                 disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-primary"
                      disabled={l.quantity <= 1}
                      aria-label="کم کردن"
                    >
                      <Minus className="size-3.5" />
                    </button>

                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    className="h-10 text-center text-base tabular-nums"
                    value={toFa(l.quantity)}
                    /*
                      با فوکوس، کل محتوا انتخاب می‌شود.

                      بدون این، تعدادِ پیش‌فرضِ ۱ سرِ جایش می‌ماند و فروشنده‌ای
                      که «۲» می‌زند «۱۲» می‌گیرد — خطایی که تا لحظه‌ی تحویل جنس
                      دیده نمی‌شود.
                    */
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={moveCell}
                    data-cell={`${i}:0`}
                    onChange={(e) =>
                      onPatch(i, { quantity: Math.max(1, parseNum(e.target.value)) })
                    }
                  />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPatch(i, { quantity: l.quantity + 1 });
                      }}
                      className="flex size-8 shrink-0 items-center justify-center rounded-md border
                                 text-muted-foreground hover:border-primary hover:text-primary
                                 focus:outline-none focus:ring-1 focus:ring-primary"
                      aria-label="زیاد کردن"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </td>

                <td className="p-2">
                  {/*
                    بدون برچسبِ absolute روی فیلد: صفحه راست‌به‌چپ است و `end` روی
                    لبه‌ی چپ می‌نشیند — همان‌جا که عددِ dir=ltr شروع می‌شود و روی هم
                    می‌افتند. واحد در سربرگ ستون آمده است.
                  */}
                  <MoneyInput
                    selectOnFocus
                    placeholder="قیمت را وارد کنید"
                    className={`h-10 text-left text-base font-semibold tabular-nums ${
                      l.unitPrice
                        ? ""
                        : "border-amber-600/60 bg-amber-600/10 placeholder:text-xs placeholder:font-normal placeholder:text-amber-600"
                    }`}
                    value={l.unitPrice}
                    onChange={(n) => onPatch(i, { unitPrice: n })}
                    onKeyDown={moveCell}
                    data-cell={`${i}:1`}
                  />
                </td>

                <td className="p-2">
                  <DiscountField
                    compact
                    value={l.discount}
                    base={gross}
                    onChange={(d) => onPatch(i, { discount: d })}
                  />
                </td>

                <td className="p-2 text-end">
                  <div className="text-base font-bold tabular-nums text-primary">
                    {money(lineNet(l))}
                  </div>
                  {disc > 0 && (
                    <div className="text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                      <span className="text-muted-foreground line-through">{money(gross)}</span>
                      {" "}− {money(disc)}
                    </div>
                  )}
                </td>

                <td className="p-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => onRemove(i)}
                    className="focus:outline-none focus:ring-1 focus:ring-destructive"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
