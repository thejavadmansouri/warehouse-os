/**
 * قیمت‌گذاریِ برگشت — مشترک بین مرجوعیِ مستقل و عملیاتِ یکپارچه (adjust).
 *
 * قاعده‌ی طلایی: **قیمتِ برگشت = چیزی که مشتری واقعاً پرداخته** — قیمتِ فروشِ
 * همان ردیف منهای سهمِ نسبتیِ تخفیفِ کلِ فاکتور؛ نه قیمتِ امروزِ کالا و نه
 * قیمتِ خامِ ردیف. اگر این دو محاسبه در دو جا کپی می‌شدند، عددِ پیش‌نمایشِ
 * فروشنده با عددِ ثبت‌شده فرق می‌کرد.
 */

/**
 * «کلِ مؤثر» یک ردیف: جمعِ ردیف پس از تخفیفِ ردیفی، منهای سهمِ نسبتیِ تخفیفِ
 * کلِ فاکتور. همان چیزی که در `subtotal` فاکتور جمع شده.
 */
export function effectiveTotal(
  unitPrice: number,
  lineDiscount: number,
  sold: number,
  invoiceSubtotal: number,
  invoiceDiscount: number,
): number {
  const lineNet = unitPrice * sold - lineDiscount;
  if (invoiceSubtotal <= 0 || invoiceDiscount <= 0) return lineNet;
  // سهمِ تخفیفِ فاکتور، به نسبتِ خالصِ همین ردیف.
  const share = Math.round((invoiceDiscount * lineNet) / invoiceSubtotal);
  return lineNet - share;
}

/** مبلغِ برگشتیِ برگرداندنِ q واحد از یک ردیف، با گردکردنِ سازگار. */
export function refundFor(effTotal: number, sold: number, qty: number) {
  const lineRefund = sold > 0 ? Math.round((effTotal * qty) / sold) : 0;
  const unitRefund = qty > 0 ? Math.round(lineRefund / qty) : 0;
  return { lineRefund, unitRefund };
}
