"use client";

/**
 * جدول اقلام فاکتور خرید — سبک POS.
 *
 * سه چیز که این جدول را از یک فرم معمولی جدا می‌کند:
 *
 * ۱. **ردیف فعال.** آخرین ردیفِ در حال کار با ته‌رنگ مشخص دیده می‌شود؛
 *    حسابدار همیشه می‌داند Enter بعدی کجا می‌نشیند.
 *
 * ۲. **افزودن سریع کالای جدید.** اگر کالا در کاتالوگ نبود، همان‌جا دیالوگ
 *    سریع باز می‌شود؛ محصول تازه بلافاصله به همان ردیف بسته می‌شود و قیمتِ
 *    خریدی که کاربر داخل دیالوگ زده روی همان ردیف می‌نشیند.
 *
 * ۳. **زمینه‌ی هر کالا.** قیمت خرید قبلی، قیمت فروش و موجودی زیر کالای
 *    انتخاب‌شده می‌آید تا عددِ روی برگه با حافظه‌ی سیستم مقایسه شود.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PackagePlus, Trash2 } from "lucide-react";

import type { Product } from "@/lib/types";
import { money, qty as faQty, toFa } from "@/lib/format";
import { getProductByBarcode, getProductPrices, getProductStock } from "@/lib/api";
import { MoneyInput } from "@/components/money-input";
import { ProductPicker } from "@/components/product-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unitLabel } from "@/lib/currency";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QuickAddProductDialog } from "./quick-add-product-dialog";

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

/** قیمت خرید قبلی + قیمت فروش + موجودی — زیر کالای انتخاب‌شده. */
function ProductContext({ productId }: { productId: string }) {
  const pricesQ = useQuery({
    queryKey: ["purchase-product", productId, "prices"],
    queryFn: () => getProductPrices(productId),
    staleTime: 30_000,
  });
  const stockQ = useQuery({
    queryKey: ["purchase-product", productId, "stock"],
    queryFn: () => getProductStock(productId),
    staleTime: 30_000,
  });
  const latest = pricesQ.data?.[0];
  const stock = stockQ.data?.reduce((sum, item) => sum + item.quantity, 0) ?? null;
  if (!latest && stock === null) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>خرید قبلی: {latest?.purchasePrice != null ? money(latest.purchasePrice) : "—"}</span>
      <span>فروش: {latest?.salePrice != null ? money(latest.salePrice) : "—"}</span>
      <span>موجودی: {stock === null ? "…" : faQty(stock)}</span>
    </div>
  );
}

export function PurchaseLines({
  rows,
  onChange,
}: {
  rows: PurchaseRow[];
  onChange: (rows: PurchaseRow[]) => void;
}) {
  // ردیفی که کاربر همین حالا رویش کار می‌کند — برای نوار POS و مقصدِ «افزودن سریع».
  const [activeKey, setActiveKey] = React.useState<string | null>(rows[0]?.key ?? null);
  // دیالوگ افزودن سریع: null یعنی بسته.
  const [quickAdd, setQuickAdd] = React.useState<{ rowKey: string; barcode?: string; suggestedName?: string } | null>(null);
  // ورودی بارکدخوان — اسکن یا تایپ بارکد.
  const [scan, setScan] = React.useState("");
  const [scanning, setScanning] = React.useState(false);

  const patch = (key: string, p: Partial<PurchaseRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const remove = (key: string) =>
    onChange(rows.length === 1 ? [emptyRow()] : rows.filter((r) => r.key !== key));

  const addRow = () => {
    const row = emptyRow();
    onChange([...rows, row]);
    setActiveKey(row.key);
  };

  /** محصول تازه از دیالوگ سریع → بستن به ردیف + قیمت خریدش. */
  const handleQuickCreated = (p: Product, rowKey: string) => {
    patch(rowKey, {
      productId: p.id,
      productName: p.name,
      unit: p.unit ?? null,
      ...(p.purchasePrice != null && p.purchasePrice > 0 ? { unitPrice: p.purchasePrice } : {}),
    });
    setActiveKey(rowKey);
  };

  /**
   * اسکن/تایپ بارکد.
   *
   * کالا پیدا شد → به اولین ردیفِ خالی می‌نشیند (یا ردیف تازه می‌سازد) و
   * تعدادش یکی زیاد می‌شود — همان رفتار صندوق فروش.
   * پیدا نشد → دیالوگ افزودن سریع با همین بارکد باز می‌شود تا کالا همان‌جا
   * ساخته شود و بعد به ردیف بندد.
   */
  const handleScan = async () => {
    const code = scan.trim();
    if (!code || scanning) return;
    setScanning(true);
    try {
      const p = await getProductByBarcode(code);
      const emptyIndex = rows.findIndex((r) => !r.productId);
      const target = emptyIndex >= 0 ? rows[emptyIndex] : null;
      if (target) {
        patch(target.key, {
          productId: p.id,
          productName: p.name,
          unit: p.unit ?? null,
          quantity: target.quantity + 1,
        });
        setActiveKey(target.key);
      } else {
        const row = emptyRow();
        onChange([...rows, { ...row, productId: p.id, productName: p.name, unit: p.unit ?? null, quantity: 1 }]);
        setActiveKey(row.key);
      }
      setScan("");
    } catch {
      // کالا نیست — افزودن سریع با همین بارکد.
      const target = rows.find((r) => !r.productId) ?? rows[rows.length - 1];
      setQuickAdd({ rowKey: target.key, barcode: code });
      setScan("");
    } finally {
      setScanning(false);
    }
  };

  // آخرین ردیف خالی را فعال نشان بده تا Enter/Tab طبیعی پیش برود.
  const activeIndex = rows.findIndex((r) => r.key === activeKey);

  return (
    <div className="overflow-x-auto">
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); handleScan(); }}>
        <Input
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          placeholder="اسکن یا تایپ بارکد و Enter…"
          aria-label="اسکن یا تایپ بارکد"
        />
        <Button type="submit" variant="outline" className="h-9" disabled={!scan.trim() || scanning}>
          {scanning ? "…" : "افزودن"}
        </Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 bg-muted/40 text-center">#</TableHead>
            <TableHead className="w-[36%] bg-muted/40">کالا / شرح</TableHead>
            <TableHead className="w-[11%] bg-muted/40 text-center">تعداد</TableHead>
            <TableHead className="w-[18%] bg-muted/40">قیمت واحد ({unitLabel()})</TableHead>
            <TableHead className="w-[13%] bg-muted/40">تخفیف</TableHead>
            <TableHead className="w-[14%] bg-muted/40">مبلغ ردیف</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((r, index) => {
            const isActive = r.key === activeKey;
            return (
              <TableRow
                key={r.key}
                onFocus={() => setActiveKey(r.key)}
                data-active={isActive ? "true" : undefined}
                className={isActive ? "bg-primary/[0.04]" : undefined}
              >
                <TableCell className="text-center text-xs text-muted-foreground">
                  {toFa(index + 1)}
                </TableCell>

                <TableCell>
                  <ProductPicker
                    value={r.productId}
                    placeholder="جست‌وجوی کالا…"
                    onChange={(id, p: Product | null) => {
                      patch(r.key, {
                        productId: id,
                        productName: p?.name ?? "",
                        unit: p?.unit ?? null,
                      });
                      // کالای جدید پیدا شد؛ ردیف بعدی آماده‌ی ورود باشد.
                      if (id && index === rows.length - 1) {
                        const next = emptyRow();
                        onChange([...rows.map((x) => (x.key === r.key ? { ...x, productId: id, productName: p?.name ?? "", unit: p?.unit ?? null } : x)), next]);
                        setActiveKey(next.key);
                      }
                    }}
                  />
                  {r.productId ? <ProductContext productId={r.productId} /> : null}
                </TableCell>

                <TableCell>
                  <Input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    className="text-center"
                    value={toFa(r.quantity)}
                    onFocus={() => setActiveKey(r.key)}
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

                <TableCell className="whitespace-nowrap bg-muted/20 font-medium">
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
            );
          })}
        </TableBody>
      </Table>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-9" onClick={addRow}>
            افزودن ردیف
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-1.5"
            onClick={() => {
              const target = (activeIndex >= 0 ? rows[activeIndex] : rows[rows.length - 1]) ?? emptyRow();
              setQuickAdd({ rowKey: target.key });
            }}
          >
            <PackagePlus className="size-4 text-primary" />
            کالای جدید نیست؟
          </Button>
        </div>
        <span className="text-sm text-muted-foreground">
          {faQty(rows.filter((r) => r.productId).length)} قلم
        </span>
      </div>

      <QuickAddProductDialog
        open={!!quickAdd}
        onOpenChange={(v) => { if (!v) setQuickAdd(null); }}
        barcode={quickAdd?.barcode}
        suggestedName={quickAdd?.suggestedName}
        defaultPurchasePrice={quickAdd ? rows.find((r) => r.key === quickAdd.rowKey)?.unitPrice : undefined}
        onCreated={(p) => quickAdd && handleQuickCreated(p, quickAdd.rowKey)}
      />
    </div>
  );
}
