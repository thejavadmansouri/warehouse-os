/**
 * سبدِ خالص (تعویض) — منطقِ محض، بیرون از React.
 *
 * مشتری جنسِ خریدِ قبلی را پس می‌دهد و جنسِ نو می‌برد. دو دسته ردیف داریم که
 * در یک سبد دیده می‌شوند: ردیف‌هایِ **برگشتی** (قرمز؛ قیمت از خودِ فاکتورِ
 * مبدأ می‌آید و فقط تعداد انتخاب می‌شود) و ردیف‌هایِ **فروشِ نو** (قیمت دستِ
 * فروشنده است). ثبتِ نهایی یک درخواستِ اتمیک است: `POST /sales/net`.
 */

/** یک ردیفِ برگشتیِ انتخاب‌شده — به ردیفِ SALE فاکتورِ مبدأ قفل است. */
export interface NetReturnRow {
  key: string;
  invoiceId: string;
  invoiceNumber: number;
  saleLogId: string;
  productId: string;
  productName: string;
  unit: string;
  /** چندتایش برمی‌گردد — همیشه بین ۰ و سقف. */
  qty: number;
  /** سقفِ برگشت = فروخته − مرجوعیِ قبلی (از سرور). */
  max: number;
  /** قیمتِ مؤثرِ هر واحد — از سرور؛ دستِ فروشنده نیست. */
  unitPrice: number;
  restock: boolean;
}

/** یک ردیفِ فروشِ نوِ سبدِ خالص. */
export interface NetSaleRow {
  key: string;
  productId: string;
  productName: string;
  unit: string;
  qty: number;
  unitPrice: number;
}

/** تعدادِ خواسته‌شده به سقف بریده می‌شود — همان چیزی که سرور هم چک می‌کند. */
export function clampReturnQty(raw: number, max: number): number {
  const n = Math.floor(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(n, max));
}

export function saleRowsTotal(rows: NetSaleRow[]): number {
  return rows.reduce((s, r) => s + r.qty * r.unitPrice, 0);
}

export function returnRowsTotal(rows: NetReturnRow[]): number {
  return rows.reduce(
    (s, r) => s + clampReturnQty(r.qty, r.max) * r.unitPrice,
    0,
  );
}

/** خالصِ قابلِ دریافت از مشتری — مثبت یعنی باید بگیریم؛ منفی یعنی باید بدهیم. */
export function netOf(sale: number, refund: number): number {
  return sale - refund;
}

export interface NetPayload {
  returns: { invoiceId: string; lines: { saleLogId: string; quantity: number; restock: boolean }[] }[];
  saleTotal: number;
  refundTotal: number;
  net: number;
}

/**
 * چیزی که واقعاً به `/sales/net` می‌رود.
 *
 * ردیفِ صفر حذف می‌شود و هر تعداد به سقف بریده می‌شود؛ مرجوعی‌های هر فاکتور
 * زیر همان فاکتور گروه می‌خورند و ترتیبِ فاکتورها ثابت است (مرتب‌سازیِ متنی —
 * دو سبدِ هم‌زمان با فاکتورهایِ مشترک نباید به deadlock برسند).
 */
export function buildNetPayload(
  returns: NetReturnRow[],
  sales: NetSaleRow[],
): NetPayload {
  const byInvoice = new Map<string, NetReturnRow[]>();
  for (const r of returns) {
    const qty = clampReturnQty(r.qty, r.max);
    if (qty <= 0) continue;
    const list = byInvoice.get(r.invoiceId) ?? [];
    list.push(r);
    byInvoice.set(r.invoiceId, list);
  }

  const groups = [...byInvoice.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([invoiceId, rows]) => ({
      invoiceId,
      lines: rows.map((r) => ({
        saleLogId: r.saleLogId,
        quantity: clampReturnQty(r.qty, r.max),
        restock: r.restock,
      })),
    }));

  const saleTotal = saleRowsTotal(sales);
  const refundTotal = returnRowsTotal(returns);
  return {
    returns: groups,
    saleTotal,
    refundTotal,
    net: netOf(saleTotal, refundTotal),
  };
}

/** چند فاکتورِ گوناگون زیر بارِ برگشت هستند — برای نمایشِ «برگشت از N فاکتور». */
export function countSourceInvoices(returns: NetReturnRow[]): number {
  return new Set(returns.filter((r) => r.qty > 0).map((r) => r.invoiceId)).size;
}
