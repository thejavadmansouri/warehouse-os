import { FixedAccount, VoucherSourceType } from '@prisma/client';

/** برچسب فارسیِ حساب‌ها — فقط برای صفحه‌ی مدیر (دفتر روزنامه) و گزارشِ تطبیق. */
export const ACCOUNT_LABELS: Record<FixedAccount, string> = {
  CASH: 'صندوق',
  BANK: 'بانک',
  CHEQUES: 'چک‌های دریافتی',
  CUSTOMERS: 'حساب مشتریان',
  REFUND_PAYABLE: 'بازپرداخت مشتری',
  SUPPLIERS: 'حساب تأمین‌کنندگان',
  SALES: 'فروش',
  SALES_RETURN: 'برگشت از فروش',
  DISCOUNT: 'تخفیف',
  INVENTORY: 'موجودی انبار',
  COGS: 'بهای تمام‌شده',
  FINANCE_CHARGE: 'درآمد فروش مدت‌دار',
};

export const SOURCE_LABELS: Record<VoucherSourceType, string> = {
  SALE_INVOICE: 'فاکتور فروش',
  SALE_CANCEL: 'ابطال فاکتور',
  RECEIPT: 'دریافت وجه',
  SALE_RETURN: 'مرجوعی',
  SALE_CORRECTION: 'اصلاحیه',
  PURCHASE_INVOICE: 'فاکتور خرید',
  PURCHASE_CANCEL: 'ابطال فاکتور خرید',
  CHEQUE_DEPOSIT: 'سپردن چک به بانک',
  CHEQUE_BOUNCED: 'برگشت چک',
  CHEQUE_CASHED: 'وصول چک',
  CUSTOMER_PAYOUT: 'پرداخت به مشتری',
  PAYMENT_REVERSAL: 'برگشت پرداخت',
  PAYMENT_RECOMPOSE: 'اصلاح نحوهٔ پرداخت',
};
