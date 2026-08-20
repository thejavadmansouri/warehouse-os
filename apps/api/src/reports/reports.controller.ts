import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import * as XLSX from 'xlsx';
import { Roles } from '../auth/roles.decorator';

import { ReportsService } from './reports.service';
import type { RangeQuery } from './reports.service';


/**
 * برچسب ستون‌ها. فایل اکسل دست حسابدار می‌رود، پس سرستون باید فارسی باشد
 * نه نام فیلد انگلیسی.
 */
const COLUMN_LABELS: Record<string, string> = {
  number: 'شماره فاکتور',
  invoiceNumber: 'شماره فاکتور',
  createdAt: 'تاریخ',
  dueDate: 'سررسید',
  lastInvoiceAt: 'آخرین فاکتور',
  lastSoldAt: 'آخرین فروش',
  customerName: 'مشتری',
  sellerName: 'فروشنده',
  holderName: 'صاحب چک',
  bankName: 'بانک',
  phone: 'شماره تماس',
  productName: 'نام کالا',
  sku: 'کد کالا',
  amount: 'مبلغ (ریال)',
  itemCount: 'تعداد اقلام',
  quantitySold: 'تعداد فروش',
  totalRevenue: 'فروش (ریال)',
  totalCost: 'بهای خرید (ریال)',
  profit: 'سود (ریال)',
  totalProfit: 'سود (ریال)',
  marginPercent: 'حاشیه سود ٪',
  creditBalance: 'مانده بدهی (ریال)',
  currentStock: 'موجودی',
  minStock: 'حد سفارش',
  shortage: 'کسری',
  totalSalesAmount: 'مبلغ فروش (ریال)',
  totalInvoices: 'تعداد فاکتور',
  totalSalesAmountSum: 'فروش کل (ریال)',
  averageInvoiceAmount: 'میانگین فاکتور (ریال)',
  cancelledInvoicesCount: 'فاکتور باطل‌شده',
  status: 'وضعیت',
  // گزارش سهم دسته‌ی مشتری — totalProfit از بالا می‌آید
  categoryName: 'دسته مشتری',
  totalAmount: 'مبلغ فروش (ریال)',
  invoiceCount: 'تعداد فاکتور',
  sharePercent: 'سهم از فروش ٪',
};

/** ستون‌هایی که برای کاربر نهایی معنا ندارند. */
const HIDDEN_COLUMNS = new Set(['id', 'productId', 'customerId', 'sellerId', 'color']);

const STATUS_LABELS: Record<string, string> = {
  IN_HAND: 'نزد ما',
  DEPOSITED: 'به بانک ارائه شده',
  CASHED: 'وصول شده',
  BOUNCED: 'برگشتی',
  CONFIRMED: 'تأیید شده',
  CANCELLED: 'باطل شده',
};

/** تاریخ‌ها به رشته‌ی شمسی تبدیل می‌شوند، وگرنه اکسل عدد سریال خام نشان می‌دهد. */
function faDate(d: Date): string {
  return new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function prepareRows(rows: unknown[]): Record<string, unknown>[] {
  return (rows as Record<string, unknown>[]).map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (HIDDEN_COLUMNS.has(key)) continue;
      const label = COLUMN_LABELS[key] ?? key;
      if (value instanceof Date) out[label] = faDate(value);
      else if (typeof value === 'string' && STATUS_LABELS[value]) out[label] = STATUS_LABELS[value];
      else out[label] = value;
    }
    return out;
  });
}

/**
 * هر گزارش با format=excel فایل xlsx می‌دهد.
 * صفحه‌بندی برای خروجی برداشته می‌شود (سقف ۱۰٬۰۰۰ ردیف) — گزارشی که فقط
 * صفحه‌ی جاری را صادر کند بی‌فایده است.
 */
function toExcel(res: Response, rows: unknown[], sheet: string) {
  const ws = XLSX.utils.json_to_sheet(prepareRows(rows));
  ws['!views'] = [{ RTL: true }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${sheet}.xlsx"`);
  return res.send(buf);
}

const EXPORT_LIMIT = 10_000;


/** گزارش‌ها فقط برای مدیر — فروشنده به سود و عملکرد بقیه دسترسی ندارد. */
@Controller('reports')
export class ReportsController {

  constructor(private readonly service: ReportsService) {}


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('periodic-sales')
  async periodicSales(@Query() q: RangeQuery & { format?: string }, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.periodicSales({ ...q, limit: q.format === 'excel' ? EXPORT_LIMIT : q.limit });
    if (q.format === 'excel') return toExcel(res, r.invoices.data, 'sales');
    return r;
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('periodic-profit')
  async periodicProfit(@Query() q: RangeQuery & { format?: string }, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.periodicProfit({ ...q, limit: q.format === 'excel' ? EXPORT_LIMIT : q.limit });
    if (q.format === 'excel') return toExcel(res, r.items.data, 'profit');
    return r;
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('debtors')
  async debtors(@Query() q: RangeQuery & { format?: string }, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.debtors({ ...q, limit: q.format === 'excel' ? EXPORT_LIMIT : q.limit });
    if (q.format === 'excel') return toExcel(res, r.debtors.data, 'debtors');
    return r;
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('cheques')
  async cheques(@Query() q: RangeQuery & { status?: string; format?: string }, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.cheques({ ...q, limit: q.format === 'excel' ? EXPORT_LIMIT : q.limit });
    if (q.format === 'excel') return toExcel(res, r.cheques.data, 'cheques');
    return r;
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('product-performance')
  async productPerformance(@Query() q: RangeQuery & { type?: string; format?: string }, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.productPerformance({ ...q, limit: q.format === 'excel' ? EXPORT_LIMIT : q.limit });
    if (q.format === 'excel') return toExcel(res, r.products.data, 'products');
    return r;
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('low-stock')
  async lowStock(@Query() q: RangeQuery & { format?: string }, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.lowStock({ ...q, limit: q.format === 'excel' ? EXPORT_LIMIT : q.limit });
    if (q.format === 'excel') return toExcel(res, r.items.data, 'low-stock');
    return r;
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('suspicious-prices')
  async suspiciousPrices(@Query() q: RangeQuery & { format?: string }, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.suspiciousPrices({ ...q, limit: q.format === 'excel' ? EXPORT_LIMIT : q.limit });
    if (q.format === 'excel') return toExcel(res, r.items.data, 'suspicious-prices');
    return r;
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('seller-performance')
  async sellerPerformance(@Query() q: RangeQuery & { format?: string }, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.sellerPerformance({ ...q, limit: q.format === 'excel' ? EXPORT_LIMIT : q.limit });
    if (q.format === 'excel') return toExcel(res, r.sellers.data, 'sellers');
    return r;
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('sales-by-category')
  async salesByCategory(@Query() q: RangeQuery & { format?: string }, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.salesByCategory({ ...q });
    if (q.format === 'excel') return toExcel(res, r.categories, 'sales-by-category');
    return r;
  }
}
