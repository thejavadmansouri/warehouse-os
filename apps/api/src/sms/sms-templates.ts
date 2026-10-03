/**
 * قالب‌های پیامک — کلید، عنوان، و متنِ پیش‌فرض.
 *
 * همه‌ی این‌ها **اطلاع‌رسانی درباره‌ی معامله‌ی خودِ همان مشتری‌اند**، نه تبلیغ.
 * این تفکیک در ایران عملی است نه سلیقه‌ای: پیامکِ تبلیغاتی کند و فیلترشدنی است،
 * و اعتبار پنل را هم می‌سوزاند.
 *
 * متن در دیتابیس نگهداری می‌شود (`SmsTemplate`) و مدیر می‌تواند عوضش کند؛
 * این‌ها فقط مقدارِ اولیه‌اند. هر قالب با `isActive` خاموش می‌شود.
 */
export interface SmsTemplateSeed {
  key: string;
  title: string;
  body: string;
  /** متغیرهایی که این قالب می‌شناسد — برای راهنمای مدیر و اعتبارسنجی. */
  vars: string[];
}

/**
 * متغیرها با `{name}` نوشته می‌شوند.
 *
 * مبالغ **به تومان** جای‌گذاری می‌شوند نه ریال: مشتری پیامک را می‌خواند و
 * تومان می‌فهمد. تبدیل یک‌جا در `renderTemplate` انجام می‌شود تا هیچ قالبی
 * نتواند این را اشتباه کند.
 */
export const SMS_TEMPLATES: SmsTemplateSeed[] = [
  {
    key: 'cheque_due_reminder',
    title: 'یادآوری سررسید چک',
    body: '{customer} عزیز، چک شماره {chequeNumber} به مبلغ {amount} تومان در تاریخ {dueDate} سررسید می‌شود. {shop}',
    vars: ['customer', 'chequeNumber', 'amount', 'dueDate', 'shop'],
  },
  {
    key: 'debt_reminder',
    title: 'یادآوری بدهی',
    body: '{customer} عزیز، مانده حساب شما {balance} تومان است. {shop}',
    vars: ['customer', 'balance', 'shop'],
  },
  {
    key: 'invoice_due_reminder',
    title: 'یادآوری سررسید فاکتور',
    body: '{customer} عزیز، فاکتور {invoiceNumber} به مبلغ {amount} تومان در تاریخ {dueDate} سررسید می‌شود. {shop}',
    vars: ['customer', 'invoiceNumber', 'amount', 'dueDate', 'shop'],
  },
  {
    /*
     * تنها پیامکی که مشتری دوستش دارد: سند است، نه طلبکاری. و بیشتر از همه
     * جلوی اختلافِ حساب را می‌گیرد.
     */
    key: 'receipt_confirmation',
    title: 'رسید دریافت وجه',
    body: 'مبلغ {amount} تومان دریافت شد. مانده حساب: {balance} تومان. با تشکر — {shop}',
    vars: ['amount', 'balance', 'shop'],
  },
  {
    key: 'invoice_created',
    title: 'ثبت فاکتور',
    body: '{customer} عزیز، فاکتور {invoiceNumber} به مبلغ {amount} تومان ثبت شد. {shop}',
    vars: ['customer', 'invoiceNumber', 'amount', 'shop'],
  },
  {
    key: 'account_settled',
    title: 'تسویه حساب باز',
    body: '{customer} عزیز، حساب شما تسویه شد. با تشکر — {shop}',
    vars: ['customer', 'shop'],
  },
  {
    /*
     * تنها قالبی که خرج نیست، درآمد است.
     *
     * از «کسری محصول» می‌آید: مشتری چیزی خواست و نداشتیم و شناسه‌اش ذخیره شد.
     * حالا که رسیده، خبرش کن.
     */
    key: 'shortage_arrived',
    title: 'کالای درخواستی رسید',
    body: '{customer} عزیز، {product} که درخواست کرده بودید موجود شد. {shop}',
    vars: ['customer', 'product', 'shop'],
  },
];

/** جای‌گذاری متغیرها. متغیرِ ناشناخته دست‌نخورده می‌ماند تا در پیش‌نمایش دیده شود. */
export function renderTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === null || value === undefined || value === ''
      ? whole
      : String(value);
  });
}
