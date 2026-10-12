"use client";

/**
 * جدول اقلام فاکتور خرید — همان چیدمان و حرکتِ کیبوردِ صندوق فروش.
 *
 * کالا از نوار اسکن بالا اضافه می‌شود؛ اینجا فقط تعداد و قیمت واحد ویرایش
 * می‌شود (Tab بین خانه‌ها، Enter برگشت به نوار اسکن).
 */

import { Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/money-input";
import { money, toFa } from "@/lib/format";
import { unitLabel } from "@/lib/currency";

export interface PurchaseRow {
  key: string;
  productId: string | null;
  productName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
}

export function emptyRow(): PurchaseRow {
  return {
    key: Math.random().toString(36).slice(2),
    productId: null,
    productName: "",
    unit: null,
    quantity: 1,
    unitPrice: 0,
    discount: 0,
  };
}

export const rowNet = (r: PurchaseRow) =>
  Math.max(0, r.quantity * r.unitPrice - r.discount);

function parseFaInt(raw: string): number {
  const n = Number(
    raw
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/\D/g, ""),
  );
  return Number.isFinite(n) ? n : 0;
}

/** حرکت بین خانه‌ها — کپیِ منطقِ POS. */
function moveCell(e: React.KeyboardEvent<HTMLInputElement>) {
  const from = e.currentTarget.dataset.cell;
  if (!from) return;
  const [row, col] = from.split(":").map(Number);
  const toScan = () => document.getElementById("purchase-scan")?.focus();
  const toCell = (r: number, c: number) => {
    const el = document.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`);
    el?.focus();
    el?.select();
  };

  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    toScan();
    return;
  }
  if (e.key === "Tab") {
    e.preventDefault();
    e.stopPropagation();
    if (!e.shiftKey) {
      if (col === 0) toCell(row, 1);
      else toScan();
    } else {
      if (col === 1) toCell(row, 0);
      else toScan();
    }
    return;
  }

  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  if (!keys.includes(e.key)) return;
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
  const [, tc] = target.split(":").map(Number);
  if (tc < 0 || tc >= 2) return;
  const next = document.querySelector<HTMLInputElement>(`[data-cell="${target}"]`);
  if (!next) return;
  e.preventDefault();
  e.stopPropagation();
  next.focus();
  next.select();
}

export function PurchaseLines({
  rows,
  activeRow,
  onActivate,
  onPatch,
  onRemove,
}: {
  rows: PurchaseRow[];
  activeRow: number;
  onActivate: (i: number) => void;
  onPatch: (i: number, patch: Partial<PurchaseRow>) => void;
  onRemove: (i: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-medium">فاکتور خرید جدید</p>
        <p className="text-sm text-muted-foreground">
          نام کالا را در نوار بالا بنویس — اگر نبود همان لحظه ساخته می‌شود
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="pos-lines w-full min-w-[740px] table-fixed text-sm">
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <tr className="text-muted-foreground">
            <th className="w-9 px-1 py-1 text-center text-xs font-medium">#</th>
            <th className="px-2 py-1 text-start text-xs font-medium">کالا</th>
            <th className="w-20 px-2 py-1 text-start text-xs font-medium">تعداد</th>
            <th className="w-36 px-2 py-1 text-start text-xs font-medium whitespace-nowrap">
              قیمت واحد <span className="font-normal opacity-70">({unitLabel()})</span>
            </th>
            <th className="w-32 px-2 py-1 text-end text-xs font-medium">جمع</th>
            <th className="w-8 px-1.5 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.key}
              onClick={() => onActivate(i)}
              data-row-active={activeRow === i}
              className={`border-t border-e-2 align-middle transition-colors ${
                activeRow === i ? "border-e-primary bg-primary/[0.03]" : "border-e-transparent"
              }`}
            >
              <td className="px-1 py-0.5 text-center text-xs tabular-nums text-muted-foreground">
                {toFa(i + 1)}
              </td>
              <td className="col-mint px-2 py-0.5">
                <span className="block truncate text-base font-bold leading-snug">
                  {r.productName}
                </span>
                {r.unit ? (
                  <span className="text-xs text-muted-foreground">{r.unit}</span>
                ) : null}
              </td>
              <td className="px-2 py-0.5">
                <Input
                  data-cell={`${i}:0`}
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  className="h-8 text-center"
                  value={toFa(r.quantity)}
                  onFocus={() => onActivate(i)}
                  onChange={(e) => onPatch(i, { quantity: parseFaInt(e.target.value) })}
                  onKeyDown={moveCell}
                />
              </td>
              <td className="px-2 py-0.5">
                <MoneyInput
                  data-cell={`${i}:1`}
                  value={r.unitPrice}
                  selectOnFocus
                  className="h-8"
                  onFocus={() => onActivate(i)}
                  onChange={(n) => onPatch(i, { unitPrice: n })}
                  onKeyDown={moveCell}
                />
              </td>
              <td className="px-2 py-0.5 text-end font-medium tabular-nums">
                {money(rowNet(r))}
              </td>
              <td className="px-1.5 py-0.5">
                <button
                  type="button"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="حذف ردیف"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(i);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
