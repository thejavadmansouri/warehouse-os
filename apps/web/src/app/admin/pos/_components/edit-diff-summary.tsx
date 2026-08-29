"use client";

import { money, toFa, qty } from "@/lib/format";

export interface EditDiffRow {
  productName: string;
  oldQuantity: number;
  newQuantity: number;
  oldUnitPrice: number; // ریال، عدد صحیح
  newUnitPrice: number; // ریال، عدد صحیح
  unit: string; // واحد فارسی، مثل «عدد»
}

/** ردیفِ فقط عددیِ «قدیم —> جدید» برای یک سلول که تغییر کرده است. */
function ChangedValue({
  oldValue,
  newValue,
  increased,
}: {
  oldValue: string;
  newValue: string;
  increased: boolean;
}) {
  return (
    <span className="whitespace-nowrap">
      <span className={increased ? "text-warning" : "text-success"}>
        <span className="text-muted-foreground line-through">{oldValue} </span>
        <span className="font-bold">← {newValue}</span>
      </span>
    </span>
  );
}

export function EditDiffSummary({
  rows,
  netAdjust,
  invoiceNumber,
}: {
  rows: EditDiffRow[];
  /** مجموع اثر مالی به ریال؛ مثبت = مشتری بدهکارتر می‌شود */
  netAdjust: number;
  /** شماره‌ی فاکتوری که اصلاح می‌شود */
  invoiceNumber: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-base text-muted-foreground">
        چیزی تغییر نکرده
      </p>
    );
  }

  const clarifier =
    netAdjust > 0
      ? "به بدهی مشتری اضافه می‌شود"
      : netAdjust < 0
        ? "از بدهی مشتری کم می‌شود"
        : "بدهی مشتری عوض نمی‌شود";
  const sign =
    netAdjust > 0 ? "+" : netAdjust < 0 ? "−" : "";
  const toneClass =
    netAdjust > 0
      ? "text-warning"
      : netAdjust < 0
        ? "text-success"
        : "text-card-foreground";

  return (
    <div className="rounded-lg border bg-card p-3 text-card-foreground">
      {/* سربرگ */}
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-bold">اصلاح فاکتور {toFa(invoiceNumber)}</h3>
        <span className="text-sm text-muted-foreground">
          ‏{toFa(rows.length)} ردیف
        </span>
      </div>

      {/* ردیف‌ها */}
      <div className="divide-y divide-border">
        {rows.map((r) => {
          if (r.newQuantity === 0) {
            return (
              <div
                key={r.productName}
                className="flex items-center gap-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-base text-muted-foreground line-through">
                  {r.productName}
                </span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-destructive">
                  حذف
                </span>
              </div>
            );
          }

          const qtyChanged = r.oldQuantity !== r.newQuantity;
          const priceChanged = r.oldUnitPrice !== r.newUnitPrice;
          const unit = r.unit ? ` ${r.unit}` : "";

          return (
            <div
              key={r.productName}
              className="flex items-center gap-3 py-2.5 text-base"
            >
              <span className="min-w-0 flex-1 truncate">{r.productName}</span>

              {/* تعداد */}
              <span className="shrink-0 text-end">
                {qtyChanged ? (
                  <ChangedValue
                    oldValue={qty(r.oldQuantity)}
                    newValue={qty(r.newQuantity) + unit}
                    increased={r.newQuantity > r.oldQuantity}
                  />
                ) : (
                  <span className="text-muted-foreground tabular-nums">
                    {qty(r.oldQuantity)}
                    {unit}
                  </span>
                )}
              </span>

              {/* قیمت واحد */}
              <span className="w-36 shrink-0 text-end">
                {priceChanged ? (
                  <ChangedValue
                    oldValue={money(r.oldUnitPrice)}
                    newValue={money(r.newUnitPrice)}
                    increased={r.newUnitPrice > r.oldUnitPrice}
                  />
                ) : (
                  <span className="text-muted-foreground tabular-nums">
                    {money(r.oldUnitPrice)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* پانوشتِ اثر مالی */}
      <div className="mt-3 border-t pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-base">اثر مالی این اصلاح</span>
          <span className={`text-lg font-bold tabular-nums ${toneClass}`}>
            {sign}
            {money(Math.abs(netAdjust))}
          </span>
        </div>
        <p className="mt-1 text-end text-sm text-muted-foreground">{clarifier}</p>
      </div>
    </div>
  );
}