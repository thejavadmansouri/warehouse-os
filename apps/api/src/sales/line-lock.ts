import { Prisma } from '@prisma/client';

/**
 * قفلِ سطرِ فاکتور با `SELECT … FOR UPDATE`.
 *
 * دو عملیاتِ هم‌زمان روی **یک** فاکتور (دو مرجوعی، دو اصلاحیه، یا مرجوعی و
 * اصلاحیه) هر دو سقفِ «قابل‌برگشت» را از `lineBalances` می‌خوانند. بدون قفل،
 * هر دو می‌توانند همان مانده را ببینند و هر دو از سقف رد شوند — مثلاً ۱۰ قلمِ
 * فروخته‌شده دوبار کامل برگردد.
 *
 * چون هر `saleLogId` فقط به یک فاکتور تعلق دارد، قفل‌کردنِ خودِ فاکتور همه‌ی
 * رقابت‌های «روی همان ردیف» را هم سریال می‌کند؛ لازم نیست ردیف‌ها جدا قفل
 * شوند. قفل‌ها برای موجودیِ انبار همچنان با `inLockOrder` و به ترتیبِ ثابتِ
 * پروژه گرفته می‌شوند — این قفل فقط بخشِ سند/حساب است.
 */
export interface LockedInvoice {
  id: string;
  number: number;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
  /** سررسیدِ بخش نسیه — هنگام اصلاح پرداخت ممکن است ست یا پاک شود. */
  dueDate: Date | null;
  customerId: string | null;
  warehouseId: string;
  accountId: string | null;
  /** برای قاعدهٔ دسترسی: صندوق‌دار فقط فاکتورهای همین روز را اصلاح می‌کند. */
  createdAt: Date;
}

export async function lockInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<LockedInvoice | null> {
  const rows = await tx.$queryRaw<LockedInvoice[]>`
    SELECT id, number, status, subtotal, discount, total, "paidAmount",
           "dueAmount", "dueDate", "customerId", "warehouseId", "accountId",
           "createdAt"
    FROM "SaleInvoice"
    WHERE id = ${invoiceId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}
