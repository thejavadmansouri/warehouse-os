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
  | 'return.created';

export interface RealtimeEvent {
  type: RealtimeEventType;
  /** شناسه‌های سبک برای refetchِ هدفمند — هیچ‌وقت قیمت/PII اینجا نگذارید. */
  warehouseId?: string | null;
  customerId?: string | null;
  invoiceId?: string | null;
  productId?: string | null;
  /** زمان تولید رویداد (ISO) — سرور پر می‌کند اگر خالی باشد. */
  at?: string;
}
