/*
 * قیمت‌گذاری — تنها منبع حقیقت:
 *
 *   قیمت پایه محصول
 *   × (۱ − تخفیف پله‌ای بر اساس تعداد)
 *   × (۱ − تخفیف طبقه مشتری)
 *   × (۱ − تخفیف اختصاصی مشتری)
 *
 * همه مبلغ‌ها «تومان» و صحیح‌اند — هیچ‌جا float پول نگه نمی‌داریم.
 */

export type PricingProduct = {
  price: number; // قیمت پایه (تومان)
  volumePrices: { qtyFrom: number; discountPercent: number }[];
};

export type PricingContext = {
  tierDiscountPercent: number; // از طبقه
  customerDiscountPercent: number; // تخفیف اختصاصی
};

export type LinePricing = {
  unitPrice: number;
  discountPercent: number; // مجموع درصد اعمال‌شده
  lineTotal: number;
};

export function volumeDiscountFor(product: PricingProduct, qty: number): number {
  // بزرگ‌ترین پله‌ای که تعداد به آن رسیده است
  let best = 0;

  for (const vp of product.volumePrices) {
    if (qty >= vp.qtyFrom && vp.discountPercent > best) best = vp.discountPercent;
  }

  return best;
}

export function priceLine(
  product: PricingProduct,
  qty: number,
  ctx: PricingContext,
): LinePricing {
  const vol = volumeDiscountFor(product, qty);
  const totalPct = Math.min(90, vol + ctx.tierDiscountPercent + ctx.customerDiscountPercent);

  // گرد کردن به تومان — نمایش و ذخیره همیشه یک عدد
  const unitPrice = Math.max(0, Math.round(product.price * (1 - totalPct / 100)));
  const lineTotal = unitPrice * qty;

  return { unitPrice, discountPercent: totalPct, lineTotal };
}

/** اعتبار قابل استفاده: سقف − بدهی اعتباری باز */
export function availableCredit(
  creditLimit: number,
  openCredit: number,
): number {
  return Math.max(0, creditLimit - openCredit);
}
