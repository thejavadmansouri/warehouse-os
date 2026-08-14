"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";

import type { Product } from "@/lib/types";
import { money, qty as faQty, toFa } from "@/lib/format";
import { MoneyInput } from "@/components/money-input";
import { ProductPicker } from "@/components/product-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** یک ردیفِ در حال ویرایش روی فرم. */
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

/**
 * جمعِ خالصِ یک ردیف.
 *
 * ⚠️ همان ترتیبی که سرور دارد (`purchases.service.ts`):
 *   جمع ردیف = تعداد × قیمت واحد − تخفیف ردیف
 * اگر این دو از هم جدا بیفتند، عددی که حسابدار روی صفحه می‌بیند با عددی که ثبت
 * می‌شود فرق می‌کند — و او به کدام اعتماد کند؟
 */
export const rowNet = (r: PurchaseRow) =>
  Math.max(0, r.quantity * r.unitPrice - r.discount);


export function PurchaseLines({
  rows,
  onChange,
}: {
  rows: PurchaseRow[];
  onChange: (rows: PurchaseRow[]) => void;
}) {
  const patch = (key: string, p: Partial<PurchaseRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const remove = (key: string) =>
    onChange(rows.length === 1 ? [emptyRow()] : rows.filter((r) => r.key !== key));

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[38%]">کالا</TableHead>
            <TableHead className="w-[12%]">تعداد</TableHead>
            <TableHead className="w-[20%]">قیمت خرید (ریال)</TableHead>
            <TableHead className="w-[16%]">تخفیف ردیف</TableHead>
            <TableHead className="w-[14%]">جمع</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell>
                <ProductPicker
                  value={r.productId}
                  placeholder="جست‌وجوی کالا…"
                  onChange={(id, p: Product | null) =>
                    patch(r.key, {
                      productId: id,
                      productName: p?.name ?? "",
                      unit: p?.unit ?? null,
                    })
                  }
                />
              </TableCell>

              <TableCell>
                <Input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  className="text-center"
                  value={toFa(r.quantity)}
                  onChange={(e) => {
                    const n = Number(
                      e.target.value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
                        .replace(/\D/g, ""),
                    );
                    patch(r.key, { quantity: Number.isFinite(n) ? n : 0 });
                  }}
                />
                {r.unit ? (
                  <span className="mt-1 block text-center text-xs text-muted-foreground">
                    {r.unit}
                  </span>
                ) : null}
              </TableCell>

              <TableCell>
                <MoneyInput
                  value={r.unitPrice}
                  onChange={(n) => patch(r.key, { unitPrice: n })}
                  selectOnFocus
                  placeholder="۰"
                />
              </TableCell>

              <TableCell>
                <MoneyInput
                  value={r.discount}
                  onChange={(n) => patch(r.key, { discount: n })}
                  placeholder="۰"
                />
              </TableCell>

              <TableCell className="whitespace-nowrap font-medium">
                {money(rowNet(r))}
              </TableCell>

              <TableCell>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="حذف ردیف"
                  onClick={() => remove(r.key)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-3 flex items-center justify-between">
        <Button type="button" variant="outline" onClick={() => onChange([...rows, emptyRow()])}>
          افزودن ردیف
        </Button>
        <span className="text-sm text-muted-foreground">
          {faQty(rows.filter((r) => r.productId).length)} قلم
        </span>
      </div>
    </div>
  );
}
