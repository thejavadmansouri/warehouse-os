import { Injectable } from '@nestjs/common';
import { FixedAccount, Prisma, VoucherSourceType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/** یک خطِ سند: حساب ثابت + مبلغ علامت‌دار (مثبت = بدهکار، منفی = بستانکار). */
export interface VoucherLineInput {
  account: FixedAccount;
  /** مثبت = بدهکار، منفی = بستانکار — همان قرارداد CustomerLedger. */
  amount: number;
  /** تفصیلیِ ساده‌ی حساب CUSTOMERS — بدون سرفصل تفصیلی. */
  customerId?: string | null;
  note?: string | null;
}

export interface PostVoucherInput {
  sourceType: VoucherSourceType;
  /** شناسه‌ی سندِ مبدأ (SaleInvoice.id / Receipt.id / …) — لینک «چی به چی». */
  sourceId: string;
  /**
   * کلید یکتای idempotency. اکشن‌هایی که کلیدِ خودشان را دارند (فاکتور/رسید/…)
   * همان کلید با پیشوندِ نوع استفاده می‌شود؛ ارسالِ دوباره‌ی همان اکشن سندِ
   * دوباره نمی‌سازد (الگوی SaleInvoice/Receipt).
   */
  idempotencyKey: string;
  lines: VoucherLineInput[];
  note?: string | null;
  userId?: string | null;
  /** سندی که این سند معکوسِ آن است (ابطال). null برای سندهای عادی. */
  reversesVoucherId?: string | null;
}

/**
 * لایه‌ی سند خودکار — «سند پشت صحنه، زبان ساده روی صحنه».
 *
 * تنها وظیفه: نوشتن یک سندِ دوبلانتریِ موازنه‌شده داخل **همان تراکنشِ** اکشنِ
 * مبدأ. هیچ مانده‌ای از این‌جا نمایش داده نمی‌شود — مانده‌ی نمایشی همچنان فقط
 * از CustomerLedger می‌آید (قانونِ «یک منبعِ حقیقت»).
 *
 * دو قانونِ سخت:
 * ۱. **موازنه‌ی اجباری** — جمعِ مبلغ خطوط باید صفر باشد؛ وگرنه کل اکشن می‌شکند.
 *    (این یک خطای برنامه‌نویسی است، نه ورودیِ کاربر — پس خطای داخلی می‌دهد و
 *    تراکنشِ مبدأ را هم با خودش برمی‌گرداند.)
 * ۲. **idempotency** — کلیدِ تکراری سندِ دوباره نمی‌سازد؛ همان سندِ قبلی برمی‌گردد.
 *
 * اصلاح = سند معکوس (`reversesVoucherId`)، نه دست‌کاریِ سندِ قبلی.
 */
@Injectable()
export class PostingService {
  constructor(private prisma: PrismaService) {}

  async post(
    tx: Prisma.TransactionClient,
    input: PostVoucherInput,
  ): Promise<{ id: string; number: number }> {
    if (!input.lines.length) {
      throw new Error('VOUCHER_EMPTY: سندی بدون خط معنا ندارد');
    }

    let sum = 0;
    for (const l of input.lines) {
      if (!Number.isFinite(l.amount) || !Number.isInteger(l.amount)) {
        throw new Error(
          `VOUCHER_INVALID_AMOUNT: مبلغِ خطِ ${l.account} باید عدد صحیحِ ریال باشد`,
        );
      }
      sum += l.amount;
    }

    if (sum !== 0) {
      throw new Error(
        `VOUCHER_UNBALANCED: جمعِ خطوطِ سند ${input.sourceType}/${input.sourceId} = ${sum} (باید صفر باشد)`,
      );
    }

    // ارسالِ دوباره‌ی همان اکشن: سندِ قبلی برمی‌گردد، دوباره ساخته نمی‌شود.
    const existing = await tx.voucher.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, number: true },
    });
    if (existing) return existing;

    const voucher = await tx.voucher.create({
      data: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        note: input.note ?? null,
        userId: input.userId ?? null,
        reversesVoucherId: input.reversesVoucherId ?? null,
      },
      select: { id: true, number: true },
    });

    await tx.voucherLine.createMany({
      data: input.lines.map((l) => ({
        voucherId: voucher.id,
        account: l.account,
        amount: l.amount,
        customerId: l.customerId ?? null,
        note: l.note ?? null,
      })),
    });

    return voucher;
  }

  /**
   * آخرین قیمتِ خریدِ هر کالا — مبنایِ بهای تمام‌شده (COGS) در سندها.
   *
   * همان قراردادِ `calculateProfit` در فروش: تازه‌ترین ردیفِ ProductPriceِ
   * دارای قیمت خرید. کالایی که قیمت خرید ندارد در Map نمی‌آید و آن قلم در
   * پا‌یِ COGSِ سند ثبت نمی‌شود (فاز ۰ ممیزیِ قیمت‌ها این حالت را به صفر
   * می‌رساند؛ تا آن موقع سندِ بدونِ آن قلم همچنان موازنه است).
   */
  async latestPurchasePrices(
    tx: Prisma.TransactionClient,
    productIds: string[],
  ): Promise<Map<string, number>> {
    const ids = [...new Set(productIds)];
    if (!ids.length) return new Map();

    const rows = await tx.productPrice.findMany({
      where: { productId: { in: ids }, purchasePrice: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { productId: true, purchasePrice: true },
    });

    const latest = new Map<string, number>();
    for (const r of rows) {
      if (!latest.has(r.productId) && r.purchasePrice != null) {
        latest.set(r.productId, r.purchasePrice);
      }
    }
    return latest;
  }

  /** سندِ یک منبع — لینک «چی به چی» برای صفحه‌ی دفتر روزنامه. */
  async findBySource(sourceType: VoucherSourceType, sourceId: string) {
    return this.prisma.voucher.findFirst({
      where: { sourceType, sourceId },
      include: {
        lines: true,
        reversesVoucher: { include: { lines: true } },
        reversedBy: { include: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
