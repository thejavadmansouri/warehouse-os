import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChequeStatus, LedgerEntryType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { EventsGateway } from '../realtime/events.gateway';

/** وضعیت‌هایی که هنوز پول نشده‌اند — از این‌ها می‌شود به وصول یا برگشت رفت. */
const PENDING: ChequeStatus[] = [ChequeStatus.IN_HAND, ChequeStatus.DEPOSITED];

/**
 * چرخه‌ی چک — وصول، برگشت، سپردن به بانک.
 *
 * قاعده‌ی مالیِ کل این کلاس یک جمله است: **بدهی در لحظه‌ی گرفتنِ چک کم شده**
 * (تصمیمِ اولِ حساب‌باز). پس:
 *
 *   - سپردن به بانک و وصولِ عادی هیچ اثر مالی ندارند؛ فقط وضعیت عوض می‌شود.
 *     پولی که قرار بود بیاید، از همان روزِ گرفتنِ چک در حساب لحاظ شده.
 *   - برگشت اثر مالی دارد: بدهی باید برگردد.
 *   - وصولِ چکی که قبلاً برگشت خورده، اثرِ آن برگشت را خنثی می‌کند.
 *
 * دفتر append-only است، پس هیچ ردیفی پاک یا ویرایش نمی‌شود؛ خنثی‌کردن یعنی
 * ردیفِ قرینه. مانده‌ی خودِ فاکتورها (`dueAmount`) هم کنارش هماهنگ می‌شود، چون
 * تفکیکِ سنیِ بدهکاران از آن می‌خواند نه از دفتر.
 */
@Injectable()
export class ChequesService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private realtime: EventsGateway,
  ) {}

  /**
   * چک با مسیرش. چک یا بابتِ یک فاکتور است (`payment`) یا بابتِ رسیدی که بدهیِ
   * قبلی را تسویه کرده (`receiptPayment`) — مبلغ و مشتری از همان مسیر می‌آیند،
   * چون خودِ `Cheque` نه مبلغ دارد نه مشتری.
   */
  private async load(tx: Prisma.TransactionClient, id: string) {
    const cheque = await tx.cheque.findUnique({
      where: { id },
      include: {
        payment: {
          select: {
            amount: true,
            invoice: {
              select: {
                id: true,
                number: true,
                customerId: true,
                total: true,
                paidAmount: true,
                dueAmount: true,
              },
            },
          },
        },
        receiptPayment: {
          select: {
            amount: true,
            receipt: {
              select: {
                id: true,
                number: true,
                customerId: true,
                allocations: {
                  orderBy: { createdAt: 'asc' },
                  select: { invoiceId: true, amount: true },
                },
              },
            },
          },
        },
      },
    });

    if (!cheque) {
      throw new NotFoundException({
        error: 'CHEQUE_NOT_FOUND',
        message: 'چک پیدا نشد',
      });
    }

    const amount = cheque.payment?.amount ?? cheque.receiptPayment?.amount ?? 0;
    const customerId =
      cheque.payment?.invoice.customerId ??
      cheque.receiptPayment?.receipt.customerId ??
      null;

    if (!customerId) {
      // چکِ بی‌مشتری یعنی داده‌ی خراب؛ بدهیِ کسی را نمی‌شود جابه‌جا کرد.
      throw new BadRequestException({
        error: 'CHEQUE_HAS_NO_CUSTOMER',
        message: 'این چک به هیچ مشتری وصل نیست',
      });
    }

    return { cheque, amount, customerId };
  }

  /**
   * جابه‌جاییِ مانده‌ی فاکتورها به‌اندازه‌ی مبلغِ چک.
   *
   * `direction: 'restore'` یعنی بدهی برگردد (برگشتِ چک) و `'apply'` یعنی دوباره
   * تسویه شود (وصولِ چکِ برگشتی).
   *
   * چرا فقط دفتر کافی نیست: مانده‌ی کل از دفتر می‌آید، ولی «جاری/سررسید/معوق» از
   * `SaleInvoice.dueAmount` خوانده می‌شود. اگر این هماهنگ نشود، چکِ برگشتی
   * مانده را بالا می‌برد ولی در هیچ سطلِ سنی دیده نمی‌شود.
   */
  private async shiftInvoiceDue(
    tx: Prisma.TransactionClient,
    ctx: Awaited<ReturnType<ChequesService['load']>>,
    direction: 'restore' | 'apply',
  ) {
    const sign = direction === 'restore' ? 1 : -1;

    // مسیرِ فاکتور: همان یک فاکتور.
    const invoicePath = ctx.cheque.payment?.invoice;
    if (invoicePath) {
      const room =
        direction === 'restore'
          ? invoicePath.total - invoicePath.dueAmount // بیشتر از کلِ فاکتور نمی‌شود
          : invoicePath.dueAmount; // کمتر از صفر نمی‌شود
      const move = Math.min(ctx.amount, Math.max(0, room));
      if (move > 0) {
        await tx.saleInvoice.update({
          where: { id: invoicePath.id },
          data: {
            dueAmount: { increment: sign * move },
            paidAmount: { decrement: sign * move },
          },
        });
      }
      return;
    }

    // مسیرِ رسید: به همان ترتیبی که پول تخصیص خورده بود، برعکسش می‌کنیم.
    const allocations = ctx.cheque.receiptPayment?.receipt.allocations ?? [];
    if (allocations.length === 0) return;

    const invoices = await tx.saleInvoice.findMany({
      where: { id: { in: allocations.map((a) => a.invoiceId) } },
      select: { id: true, total: true, dueAmount: true },
    });
    const byId = new Map(invoices.map((i) => [i.id, i]));

    let remaining = ctx.amount;
    for (const alloc of allocations) {
      if (remaining <= 0) break;
      const inv = byId.get(alloc.invoiceId);
      if (!inv) continue;

      const room =
        direction === 'restore' ? inv.total - inv.dueAmount : inv.dueAmount;
      const move = Math.min(remaining, alloc.amount, Math.max(0, room));
      if (move <= 0) continue;

      await tx.saleInvoice.update({
        where: { id: inv.id },
        data: {
          dueAmount: { increment: sign * move },
          paidAmount: { decrement: sign * move },
        },
      });
      remaining -= move;
    }
  }

  /** به بانک سپرده شد — فقط وضعیت، بدون اثر مالی. */
  async deposit(id: string) {
    const cheque = await this.prisma.$transaction(async (tx) => {
      const { cheque } = await this.load(tx, id);

      if (cheque.status !== ChequeStatus.IN_HAND) {
        throw new ConflictException({
          error: 'CHEQUE_NOT_IN_HAND',
          message: 'فقط چکی که نزد ماست به بانک سپرده می‌شود',
        });
      }

      return tx.cheque.update({
        where: { id },
        data: { status: ChequeStatus.DEPOSITED },
      });
    });

    this.realtime.broadcast({ type: 'cheque.updated' });
    return cheque;
  }

  /**
   * وصول شد.
   *
   * حالتِ عادی هیچ اثر مالی ندارد — بدهی از روزِ گرفتنِ چک کم شده بود. فقط اگر
   * چک قبلاً برگشت خورده باشد، اثرِ آن برگشت با یک ردیفِ قرینه خنثی می‌شود.
   */
  async cash(id: string, userId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const ctx = await this.load(tx, id);
      const { cheque, amount, customerId } = ctx;

      if (cheque.status === ChequeStatus.CASHED) {
        throw new ConflictException({
          error: 'CHEQUE_ALREADY_CASHED',
          message: 'این چک قبلاً وصول شده است',
        });
      }

      const wasBounced = cheque.status === ChequeStatus.BOUNCED;

      if (wasBounced) {
        await this.ledger.record(tx, {
          customerId,
          type: LedgerEntryType.CHEQUE_CASHED,
          amount: -amount,
          userId: userId ?? null,
          note: `چک ${cheque.number} پس از برگشت وصول شد`,
        });
        await this.shiftInvoiceDue(tx, ctx, 'apply');
      }

      return tx.cheque.update({
        where: { id },
        data: { status: ChequeStatus.CASHED, settledAt: new Date() },
      });
    });

    this.realtime.broadcast({ type: 'cheque.updated' });
    return result;
  }

  /**
   * برگشت خورد — بدهی برمی‌گردد.
   *
   * دلیل اختیاری است: برگشت رویدادِ بانک است، نه تصمیمِ فروشنده. ولی اگر نوشته
   * شود روی خودِ چک می‌ماند تا بعداً معلوم باشد چرا.
   */
  async bounce(id: string, reason: string | undefined, userId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const ctx = await this.load(tx, id);
      const { cheque, amount, customerId } = ctx;

      if (!PENDING.includes(cheque.status)) {
        throw new ConflictException({
          error: 'CHEQUE_NOT_PENDING',
          message:
            cheque.status === ChequeStatus.CASHED
              ? 'چکِ وصول‌شده برگشت نمی‌خورد'
              : 'این چک قبلاً برگشت خورده است',
        });
      }

      await this.ledger.record(tx, {
        customerId,
        type: LedgerEntryType.CHEQUE_BOUNCED,
        amount,
        userId: userId ?? null,
        note: reason?.trim()
          ? `چک ${cheque.number} برگشت خورد — ${reason.trim()}`
          : `چک ${cheque.number} برگشت خورد`,
      });

      await this.shiftInvoiceDue(tx, ctx, 'restore');

      return tx.cheque.update({
        where: { id },
        data: {
          status: ChequeStatus.BOUNCED,
          note: reason?.trim() || cheque.note,
        },
      });
    });

    this.realtime.broadcast({ type: 'cheque.updated' });
    this.realtime.broadcast({ type: 'sale.created' }); // مانده‌ی مشتری عوض شد
    return result;
  }
}
