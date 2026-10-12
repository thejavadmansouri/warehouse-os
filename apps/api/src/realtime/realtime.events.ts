/**
 * قرارداد رویدادهای realtime.
 *
 * قانون طلایی: این رویدادها فقط «اعلان» هستند، نه حاملِ داده. روی سوکت هیچ
 * قیمت/هزینه/اطلاعات حساسی نمی‌رود — فقط «چه اتفاقی افتاد» و چند شناسه‌ی سبک تا
 * کلاینت بداند کدام کوئری را دوباره بگیرد. خودِ داده از همان endpointِ REST که
 * guard و scope دارد دوباره fetch می‌شود. این‌طوری کانال realtime هیچ‌وقت مسیرِ
 * نشتِ داده‌ی نقش‌ها نمی‌شود.
 */
export type RealtimeEventType =
  | 'sale.created'
  | 'sale.canceled'
  | 'stock.changed'
  | 'receipt.created'
  | 'payout.created'
  | 'payment.reversed'
  | 'payment.recomposed'
  | 'return.created'
  | 'correction.created'
  | 'work-task.progress'
  | 'open-account.created'
  | 'open-account.settled'
  | 'cheque.updated'
  | 'shortage.created'
  | 'shortage.updated'
  | 'online-order.created'
  | 'online-order.decided'
  /** فاکتور خرید ثبت یا باطل شد — موجودی، بدهی تأمین‌کننده و قیمت خرید عوض شده. */
  | 'purchase.changed'
  /** مشخصات تأمین‌کننده ساخته/ویرایش شد. */
  | 'supplier.changed'
  /** مشخصات مشتری (نام، شماره، سقف اعتبار، دسته…) ساخته/ویرایش شد. */
  | 'customer.changed'
  /** کالا یا قیمتش ساخته/ویرایش/حذف شد. */
  | 'product.changed';

export interface RealtimeEvent {
  type: RealtimeEventType;
  /** شناسه‌های سبک برای refetchِ هدفمند — هیچ‌وقت قیمت/PII اینجا نگذارید. */
  warehouseId?: string | null;
  customerId?: string | null;
  invoiceId?: string | null;
  productId?: string | null;
  /** Task که پیشرفتش عوض شده — فقط id، جزئیات از REST می‌آید. */
  taskId?: string | null;
  /** سفارش سایت — فقط شناسه، خودِ سفارش از REST گرفته می‌شود. */
  orderId?: string | null;
  purchaseId?: string | null;
  supplierId?: string | null;
  /** زمان تولید رویداد (ISO) — سرور پر می‌کند اگر خالی باشد. */
  at?: string;
}
