import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';

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
 * لاگِ انبار append-only است: `quantity` هیچ ردیفی عوض نمی‌شود و هر تغییری
 * (مرجوعی، اصلاحیه) حرکتِ جبرانیِ خودش را کنارش می‌سازد. پس `lineEffects` که
 * روی ردیف‌ها کار می‌کند همیشه باید دلتاها را سوار کند.
 *
 * ⚠️ ولی خودِ **سندِ فاکتور** append-only نیست: اصلاحیه و مرجوعیِ اعتباری
 * `subtotal`/`total` را در جا به‌روز می‌کنند. برای همین `deltaByInvoice`
 * عمداً فقط مرجوعیِ نقد/کارت را برمی‌گرداند — توضیحِ کاملش روی همان متد.
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
   * اثرِ مرجوعی‌های **نقد/کارت** روی مبلغِ هر فاکتور (منفی).
   * خروجی دلتاست، نه مبلغِ نهایی — `total + delta` می‌شود ارزشِ کالای مانده.
   *
   * مرجوعیِ اعتباری اینجا نیست چون خودش `total` را کم کرده؛ اصلاحیه هم نیست
   * چون `total` را در جا به‌روز می‌کند.
   */
  async deltaByInvoice(invoiceIds: string[]): Promise<Map<string, number>> {
    if (invoiceIds.length === 0) return new Map();

    /*
     * ⚠️ فقط مرجوعیِ **نقد/کارت** — نه اعتباری و نه اصلاحیه.
     *
     * این اسناد رفتارِ متفاوتی با فاکتور دارند و یکی‌گرفتنشان باعثِ
     * دوباره‌شماری می‌شد:
     *
     *   • مرجوعیِ **اعتباری** خودِ `total` فاکتور را در جا کم می‌کند
     *     (returns.service) چون بدهی را کم می‌کند. پس نباید اینجا دوباره
     *     به‌عنوان دلتا برگردد.
     *
     *   • مرجوعیِ **نقد/کارت** به `total` دست نمی‌زند: پول از صندوق برگشته و
     *     مبلغِ قابلِ‌پرداختِ فاکتور عوض نشده. فقط اثرش باید همین‌جا به‌صورت
     *     دلتا اضافه شود تا «ارزشِ کالای مانده» درست دربیاید.
     *
     *   • اصلاحیه اما `subtotal` و `total` را **در جا** به‌روز می‌کند
     *     (corrections.service — هر دو شاخه، هرجا amountAdjust ≠ 0). یعنی
     *     `invoice.total` از قبل مبلغِ اصلاح‌شده است. برگرداندنِ دوباره‌ی
     *     `amountAdjust` به‌عنوان دلتا، آن را دو بار روی عدد می‌نشاند.
     *
     * نمونه‌ی واقعی که این را لو داد: فروشِ ۵×۱۰۰۰ نسیه، اصلاح به ۸ ⇒
     * بدهیِ واقعی ۸۰۰۰، `invoice.total` هم ۸۰۰۰ (درست)، ولی `total + delta`
     * برابرِ ۱۱۰۰۰ درمی‌آمد — یعنی صورتحسابِ مشتری ۳۰۰۰ بیشتر از واقع.
     * دفترِ مشتری همیشه درست بود؛ فقط همین مسیرِ نمایشی غلط بود.
     *
     * ⚠️ اگر روزی corrections از به‌روزکردنِ فاکتور دست بردارد (بازگشت به
     * append-onlyِ کامل)، اصلاحیه باید دوباره به این دلتا اضافه شود.
     */
    const returns = await this.prisma.saleReturn.groupBy({
      by: ['invoiceId'],
      where: {
        invoiceId: { in: invoiceIds },
        refundMethod: { not: PaymentMethod.CREDIT },
      },
      _sum: { refundAmount: true },
    });

    const delta = new Map<string, number>();
    for (const r of returns) {
      delta.set(r.invoiceId, -(r._sum.refundAmount ?? 0));
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
