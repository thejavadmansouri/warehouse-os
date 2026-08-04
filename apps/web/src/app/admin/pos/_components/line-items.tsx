"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money, parseNum, qty, toFa } from "@/lib/format";
import { discountToToman, type DiscountInput as DiscountValue } from "../_lib/discount";
import { DiscountField } from "./discount-input";

export interface PosLine {
  key: string;
  productId: string;
  productName: string;
  unit: string;
  locationId: string;
  locationPath: string;
  available: number;
  quantity: number;
  unitPrice: number;
  discount: DiscountValue;
}

/** مبلغ ردیف پیش از تخفیف. */
export const lineGross = (l: PosLine) => l.quantity * l.unitPrice;
/** تخفیف ردیف به تومان، محدودشده به مبلغ خودِ ردیف. */
export const lineDiscount = (l: PosLine) => discountToToman(l.discount, lineGross(l));
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
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-muted-foreground">برای شروع، بارکد کالا را اسکن کنید</p>
        <p className="text-sm text-muted-foreground">
          یا با <kbd className="rounded border px-1.5 py-0.5 text-xs">F3</kbd> جست‌وجو کنید
        </p>
      </div>
    );
  }

  return (
    // table-fixed عمدی است: با چیدمان خودکار، نامِ بلندِ کالا ستون‌های عددی را
    // می‌فشرد تا جایی که قیمت هفت‌رقمی بریده می‌شود. حالا عرض ستون‌ها ثابت است و
    // نام کالا truncate می‌شود. min-w هم هست تا در پنجره‌ی باریک به‌جای له‌شدن،
    // جدول افقی اسکرول شود.
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[900px] table-fixed text-sm">
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <tr className="text-muted-foreground">
            <th className="p-2 text-start font-medium">کالا</th>
            <th className="w-24 p-2 text-start font-medium">تعداد</th>
            <th className="w-48 p-2 text-start font-medium whitespace-nowrap">
              قیمت واحد <span className="font-normal opacity-70">(تومان)</span>
            </th>
            <th className="w-44 p-2 text-start font-medium">تخفیف</th>
            <th className="w-44 p-2 text-end font-medium">جمع</th>
            <th className="w-12 p-2" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const gross = lineGross(l);
            const disc = lineDiscount(l);
            return (
              <tr
                key={l.key}
                onClick={() => onActivate(i)}
                className={`border-t border-e-2 align-top transition-colors ${
                  errorLine === i
                    ? "border-e-destructive bg-destructive/10"
                    : activeRow === i
                      ? "border-e-primary bg-primary/5"
                      : "border-e-transparent"
                }`}
              >
                <td className="p-2">
                  <div className="truncate font-medium">{l.productName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {l.locationPath} · موجودی {qty(l.available)}
                    {errorLine === i && (
                      <span className="ms-2 text-destructive">موجودی کافی نیست</span>
                    )}
                  </div>
                </td>

                <td className="p-2">
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    className="h-10 text-center text-base tabular-nums"
                    value={toFa(l.quantity)}
                    onChange={(e) =>
                      onPatch(i, { quantity: Math.max(1, parseNum(e.target.value)) })
                    }
                  />
                </td>

                <td className="p-2">
                  {/*
                    بدون برچسبِ absolute روی فیلد: صفحه راست‌به‌چپ است و `end` روی
                    لبه‌ی چپ می‌نشیند — همان‌جا که عددِ dir=ltr شروع می‌شود و روی هم
                    می‌افتند. واحد در سربرگ ستون آمده است.
                  */}
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    placeholder="قیمت را وارد کنید"
                    className={`h-10 text-left text-base font-semibold tabular-nums ${
                      l.unitPrice
                        ? ""
                        : "border-amber-500 bg-amber-50 placeholder:text-xs placeholder:font-normal placeholder:text-amber-600 dark:bg-amber-950/30"
                    }`}
                    value={l.unitPrice ? money(l.unitPrice) : ""}
                    onChange={(e) => onPatch(i, { unitPrice: parseNum(e.target.value) })}
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
                  <div className="text-base font-bold tabular-nums">{money(lineNet(l))}</div>
                  {disc > 0 && (
                    <div className="text-[11px] tabular-nums text-muted-foreground line-through">
                      {money(gross)}
                    </div>
                  )}
                </td>

                <td className="p-2">
                  <Button variant="ghost" size="icon" onClick={() => onRemove(i)}>
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
