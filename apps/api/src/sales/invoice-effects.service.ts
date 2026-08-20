import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/** اثرِ اسنادِ جبرانی روی ردیف‌های یک فاکتور. */
export interface LineEffects {
  /** تعدادِ مرجوعی‌شده، به کلید saleLogId. */
  returnedQty: Map<string, number>;
  /** دلتای تعداد از اصلاحیه‌ها (جمعِ همه‌ی اصلاحیه‌های همان ردیف). */
  correctedQty: Map<string, number>;
  /** آخرین قیمتِ تصحیح‌شده — آخرین اصلاحیه حرفِ آخر را می‌زند. */
  correctedPrice: Map<string, number>;
}

/**
 * حسابِ «الان واقعاً چه مانده» روی فاکتورها و ردیف‌هایشان.
 *
 * فاکتور و لاگِ انبار append-only هستند: نه `total` عوض می‌شود نه `quantity`.
 * هر تغییری (مرجوعی، اصلاحیه) سندِ جداگانه‌ای کنارشان می‌سازد. پس هر جایی که
 * می‌خواهد عددِ امروز را نشان دهد باید همین دلتاها را روی عددِ اصلی سوار کند.
 *
 * چرا سرویسِ جدا: پرونده‌ی حساب باز، برگه‌ی چاپیِ حساب، و صورت‌حسابِ مشتری هر سه
 * به همین حساب نیاز دارند. با سه نسخه‌ی کپی‌شده، اولین تغییر در قاعده روی یکی
 * اعمال می‌شد و روی دو تای دیگر نه — و سه کاغذ با سه عدد از یک مغازه بیرون
 * می‌رفت.
 */
@Injectable()
export class InvoiceEffectsService {
  constructor(private prisma: PrismaService) {}

  /**
   * اثرِ اسناد روی مبلغِ هر فاکتور: اصلاحیه‌ها مثبت/منفی، مرجوعی‌ها منفی.
   * خروجی دلتاست، نه مبلغِ نهایی — `total + delta` می‌شود آنچه باید بدهد.
   */
  async deltaByInvoice(invoiceIds: string[]): Promise<Map<string, number>> {
    if (invoiceIds.length === 0) return new Map();

    const [returns, corrections] = await Promise.all([
      this.prisma.saleReturn.groupBy({
        by: ['invoiceId'],
        where: { invoiceId: { in: invoiceIds } },
        _sum: { refundAmount: true },
      }),
      this.prisma.saleCorrection.groupBy({
        by: ['invoiceId'],
        where: { invoiceId: { in: invoiceIds } },
        _sum: { amountAdjust: true },
      }),
    ]);

    const delta = new Map<string, number>();
    for (const c of corrections) {
      delta.set(c.invoiceId, c._sum.amountAdjust ?? 0);
    }
    for (const r of returns) {
      delta.set(
        r.invoiceId,
        (delta.get(r.invoiceId) ?? 0) - (r._sum.refundAmount ?? 0),
      );
    }
    return delta;
  }

  /** همان حساب، اما ردیف‌به‌ردیف — برای نمایشِ «چند تا برگشت، الان چند تاست». */
  async lineEffects(saleLogIds: string[]): Promise<LineEffects> {
    const empty: LineEffects = {
      returnedQty: new Map(),
      correctedQty: new Map(),
      correctedPrice: new Map(),
    };
    if (saleLogIds.length === 0) return empty;

    const [returnedRows, correctionRows] = await Promise.all([
      this.prisma.saleReturnLine.groupBy({
        by: ['saleLogId'],
        where: { saleLogId: { in: saleLogIds } },
        _sum: { quantity: true },
      }),
      this.prisma.saleCorrectionLine.findMany({
        where: { saleLogId: { in: saleLogIds } },
        orderBy: { createdAt: 'asc' },
        select: {
          saleLogId: true,
          oldQuantity: true,
          newQuantity: true,
          newUnitPrice: true,
        },
      }),
    ]);

    const returnedQty = new Map(
      returnedRows.map((r) => [r.saleLogId, r._sum.quantity ?? 0]),
    );

    const correctedQty = new Map<string, number>();
    const correctedPrice = new Map<string, number>();
    for (const c of correctionRows) {
      correctedQty.set(
        c.saleLogId,
        (correctedQty.get(c.saleLogId) ?? 0) + (c.newQuantity - c.oldQuantity),
      );
      correctedPrice.set(c.saleLogId, c.newUnitPrice);
    }

    return { returnedQty, correctedQty, correctedPrice };
  }
}
