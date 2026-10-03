import { Controller, Get, Param, Query } from '@nestjs/common';
import { FixedAccount, Prisma, Role, VoucherSourceType } from '@prisma/client';

import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PostingService } from './posting.service';
import { ACCOUNT_LABELS, SOURCE_LABELS } from './labels';
import { ReconciliationService } from './reconciliation.service';

/** هر سند در پاسخ — سرصفحه + خطوطِ برچسب‌خورده + لینکِ فاکتورِ مبدأ (اگر باشد). */
type VoucherOut = {
  id: string;
  number: number;
  sourceType: VoucherSourceType;
  sourceId: string;
  sourceLabel: string;
  note: string | null;
  userId: string | null;
  createdAt: Date;
  reversesVoucherId: string | null;
  /** فاکتوری که این سند به آن برمی‌گردد — برای مرجوعی/اصلاحیه از سندِ خودشان. */
  invoiceId: string | null;
  lines: {
    account: FixedAccount;
    accountLabel: string;
    amount: number;
    debit: number;
    credit: number;
    customerId: string | null;
    note: string | null;
  }[];
};

type RawVoucher = {
  id: string;
  number: number;
  sourceType: VoucherSourceType;
  sourceId: string;
  note: string | null;
  userId: string | null;
  createdAt: Date;
  reversesVoucherId: string | null;
  lines: {
    account: FixedAccount;
    amount: number;
    customerId: string | null;
    note: string | null;
  }[];
};

/**
 * دفتر روزنامه — ساده، فقط ADMIN/MANAGER.
 *
 * UI صندوق‌دار هرگز به این‌جا نمی‌رسد؛ این صفحه برای مدیری است که می‌خواهد
 * «چی به چی» را ببیند: هر سند با خطوط بدهکار/بستانکار و لینک به سندِ مبدأ.
 */
@Controller('vouchers')
@Roles(Role.ADMIN, Role.MANAGER)
export class VouchersController {
  constructor(
    private prisma: PrismaService,
    private posting: PostingService,
    private reconciliation: ReconciliationService,
  ) {}

  /**
   * گزارشِ تطبیقِ سندری — مانده‌ی هر حساب از سندها در برابر مدلِ عملیاتی.
   *
   * روی دیتابیسِ «نقطهٔ شروعِ پاک» (همه‌ی اکشن‌ها سند دارند) باید همیشه سبز
   * باشد؛ اختلافِ غیرصفر یعنی پستینگِ یک اکشن از فرمولش جدا افتاده.
   */
  @Get('reconcile')
  async reconcileReport() {
    return this.reconciliation.reconcile();
  }

  @Get()
  async list(
    @Query('sourceType') sourceType?: string,
    @Query('sourceId') sourceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where: Prisma.VoucherWhereInput = {};
    if (sourceType) where.sourceType = sourceType as VoucherSourceType;
    if (sourceId) where.sourceId = sourceId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.voucher.findMany({
        where,
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.voucher.count({ where }),
    ]);

    return {
      data: await this.toOut(data),
      meta: { total, page: Math.max(Number(page) || 1, 1), limit: take },
    };
  }

  /** سندِ یک منبع — «چی به چی»: از هر عدد تا فاکتور/رسیدِ مبدأ و برعکس. */
  @Get('source/:sourceType/:sourceId')
  async bySource(
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
  ) {
    const v = await this.prisma.voucher.findFirst({
      where: {
        sourceType: sourceType as VoucherSourceType,
        sourceId,
      },
      include: {
        lines: true,
        reversesVoucher: { include: { lines: true } },
        reversedBy: { include: { lines: true } },
      },
    });
    if (!v) return null;
    const [out] = await this.toOut([v]);
    return out;
  }

  /**
   * همه‌ی سندهایی که به یک فاکتور برمی‌گردند — «از فاکتور به سندهایش».
   *
   * فروش و ابطالش (sourceId = خودِ فاکتور)، مرجوعی‌ها و اصلاحیه‌هایش (از سندِ
   * خودشان)، و رسیدهایی که به این فاکتور تخصیص خورده‌اند. ترتیبِ زمانی صعودی —
   * همان ترتیبی که ردِ مالی اتفاق افتاده.
   */
  @Get('by-invoice/:invoiceId')
  async byInvoice(@Param('invoiceId') invoiceId: string) {
    const [saleRows, returns, corrections, allocations, reversals] =
      await Promise.all([
        this.prisma.voucher.findMany({
          where: {
            sourceType: {
              in: [
                VoucherSourceType.SALE_INVOICE,
                VoucherSourceType.SALE_CANCEL,
              ],
            },
            sourceId: invoiceId,
          },
          include: { lines: true },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.saleReturn.findMany({
          where: { invoiceId },
          select: { id: true },
        }),
        this.prisma.saleCorrection.findMany({
          where: { invoiceId },
          select: { id: true },
        }),
        this.prisma.receiptAllocation.findMany({
          where: { invoiceId },
          select: { receiptId: true },
        }),
        this.prisma.paymentReversal.findMany({
          where: { invoiceId },
          select: { id: true },
        }),
      ]);

    const returnIds = returns.map((r) => r.id);
    const correctionIds = corrections.map((c) => c.id);
    const receiptIds = [...new Set(allocations.map((a) => a.receiptId))];
    const reversalIds = reversals.map((r) => r.id);

    const [returnRows, correctionRows, receiptRows, reversalRows] =
      await Promise.all([
        returnIds.length
          ? this.prisma.voucher.findMany({
              where: {
                sourceType: VoucherSourceType.SALE_RETURN,
                sourceId: { in: returnIds },
              },
              include: { lines: true },
              orderBy: { createdAt: 'asc' },
            })
          : Promise.resolve([]),
        correctionIds.length
          ? this.prisma.voucher.findMany({
              where: {
                sourceType: VoucherSourceType.SALE_CORRECTION,
                sourceId: { in: correctionIds },
              },
              include: { lines: true },
              orderBy: { createdAt: 'asc' },
            })
          : Promise.resolve([]),
        receiptIds.length
          ? this.prisma.voucher.findMany({
              where: {
                sourceType: VoucherSourceType.RECEIPT,
                sourceId: { in: receiptIds },
              },
              include: { lines: true },
              orderBy: { createdAt: 'asc' },
            })
          : Promise.resolve([]),
        reversalIds.length
          ? this.prisma.voucher.findMany({
              where: {
                sourceType: VoucherSourceType.PAYMENT_REVERSAL,
                sourceId: { in: reversalIds },
              },
              include: { lines: true },
              orderBy: { createdAt: 'asc' },
            })
          : Promise.resolve([]),
      ]);

    const rows = [
      ...saleRows,
      ...returnRows,
      ...correctionRows,
      ...receiptRows,
      ...reversalRows,
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return this.toOut(rows);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const v = await this.prisma.voucher.findUnique({
      where: { id },
      include: {
        lines: true,
        reversesVoucher: { include: { lines: true } },
        reversedBy: { include: { lines: true } },
      },
    });
    if (!v) return null;
    const [out] = await this.toOut([v]);
    return out;
  }

  /**
   * تبدیلِ سندهای خام به خروجیِ برچسب‌خورده + پیوندِ فاکتورِ مبدأ.
   *
   * پیوندِ فاکتور برای مرجوعی/اصلاحیه از خودِ سندِ مرجوعی/اصلاحیه می‌آید —
   * `sourceId`ِ سندِ مالی، شناسه‌ی مرجوعی است نه شناسه‌ی فاکتور. با دو کوئریِ
   * دسته‌ای (نه N+1) برای کل صفحه حل می‌شود.
   */
  private async toOut(rows: RawVoucher[]): Promise<VoucherOut[]> {
    if (!rows.length) return [];

    const returnIds = rows
      .filter((r) => r.sourceType === VoucherSourceType.SALE_RETURN)
      .map((r) => r.sourceId);
    const correctionIds = rows
      .filter((r) => r.sourceType === VoucherSourceType.SALE_CORRECTION)
      .map((r) => r.sourceId);
    const reversalIds = rows
      .filter((r) => r.sourceType === VoucherSourceType.PAYMENT_REVERSAL)
      .map((r) => r.sourceId);

    const [returns, corrections, reversals] = await Promise.all([
      returnIds.length
        ? this.prisma.saleReturn.findMany({
            where: { id: { in: returnIds } },
            select: { id: true, invoiceId: true },
          })
        : Promise.resolve([]),
      correctionIds.length
        ? this.prisma.saleCorrection.findMany({
            where: { id: { in: correctionIds } },
            select: { id: true, invoiceId: true },
          })
        : Promise.resolve([]),
      reversalIds.length
        ? this.prisma.paymentReversal.findMany({
            where: { id: { in: reversalIds } },
            select: { id: true, invoiceId: true },
          })
        : Promise.resolve([]),
    ]);

    const invoiceByReturn = new Map(returns.map((r) => [r.id, r.invoiceId]));
    const invoiceByCorrection = new Map(
      corrections.map((c) => [c.id, c.invoiceId]),
    );
    const invoiceByReversal = new Map(
      reversals.map((r) => [r.id, r.invoiceId]),
    );

    return rows.map((v) => {
      const invoiceId =
        v.sourceType === VoucherSourceType.SALE_RETURN
          ? (invoiceByReturn.get(v.sourceId) ?? null)
          : v.sourceType === VoucherSourceType.SALE_CORRECTION
            ? (invoiceByCorrection.get(v.sourceId) ?? null)
            : v.sourceType === VoucherSourceType.PAYMENT_REVERSAL
              ? (invoiceByReversal.get(v.sourceId) ?? null)
              : v.sourceType === VoucherSourceType.SALE_INVOICE ||
                  v.sourceType === VoucherSourceType.SALE_CANCEL
                ? v.sourceId
                : null;

      return {
        ...v,
        sourceLabel: SOURCE_LABELS[v.sourceType] ?? v.sourceType,
        invoiceId,
        lines: v.lines.map((l) => ({
          ...l,
          accountLabel: ACCOUNT_LABELS[l.account] ?? l.account,
          debit: l.amount > 0 ? l.amount : 0,
          credit: l.amount < 0 ? -l.amount : 0,
        })),
      };
    });
  }
}
