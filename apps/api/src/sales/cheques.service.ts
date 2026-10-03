import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChequeStatus,
  FixedAccount,
  LedgerEntryType,
  Prisma,
  VoucherSourceType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { EventsGateway } from '../realtime/events.gateway';
import { PostingService, VoucherLineInput } from '../vouchers/posting.service';

/** وضعیت‌هایی که هنوز پول نشده‌اند — از این‌ها می‌شود به وصول یا برگشت رفت. */
const PENDING: ChequeStatus[] = [ChequeStatus.IN_HAND, ChequeStatus.DEPOSITED];

/**
 * چرخه‌ی چک — وصول، برگشت، سپردن به بانک.
 *
 * قاعده‌ی مالیِ کل این کلاس یک جمله است: **بدهی در لحظه‌ی گرفتنِ چک کم شده**
 * (تصمیمِ اولِ حساب‌باز). پس:
 *
 *   - سپردن به بانک: چک از حسابِ «چک‌های دریافتی» به «بانک» می‌رود — سندِ
 *     `CHEQUE_DEPOSIT`. بدهیِ مشتری دست نمی‌خورد (از روزِ گرفتنِ چک کم شده).
 *   - وصولِ عادیِ چکِ سپرده‌شده: هیچ اثر مالی ندارد؛ فقط وضعیت عوض می‌شود —
 *     پول از روزِ سپردن در بانک بود. وصولِ مستقیمِ چکِ نزدِ ما (بدون سپردن)
 *     چک را از «چک‌های دریافتی» به «صندوق» می‌برد — سندِ `CHEQUE_CASHED`.
 *   - برگشت اثر مالی دارد: بدهی باید برگردد — سندِ `CHEQUE_BOUNCED`
 *     (بدهکارِ مشتری / بستانکارِ بانک یا چک‌های دریافتی، بسته به جایی که چک بود).
 *   - وصولِ چکی که قبلاً برگشت خورده، اثرِ آن برگشت را خنثی می‌کند — سندِ
 *     قرینه‌ی همان برگشت با لینکِ «معکوسِ» (`reversesVoucherId`).
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
    private posting: PostingService,
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

  /** به بانک سپرده شد — چک از «چک‌های دریافتی» به «بانک» می‌رود. */
  async deposit(id: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const { cheque, amount } = await this.load(tx, id);

      if (cheque.status !== ChequeStatus.IN_HAND) {
        throw new ConflictException({
          error: 'CHEQUE_NOT_IN_HAND',
          message: 'فقط چکی که نزد ماست به بانک سپرده می‌شود',
        });
      }

      // همان حرکتِ فیزیکیِ سپردن: چکِ دریافتی → بانک. بدهیِ مشتری دست نمی‌خورد.
      await this.posting.post(tx, {
        sourceType: VoucherSourceType.CHEQUE_DEPOSIT,
        sourceId: id,
        idempotencyKey: `cheque-deposit:${id}`,
        lines: [
          { account: FixedAccount.BANK, amount, note: 'سپردن چک به بانک' },
          {
            account: FixedAccount.CHEQUES,
            amount: -amount,
            note: 'چک از نزد ما خارج شد',
          },
        ],
        note: `سپردن چک ${cheque.number} به بانک`,
      });

      return tx.cheque.update({
        where: { id },
        data: { status: ChequeStatus.DEPOSITED },
      });
    });

    this.realtime.broadcast({ type: 'cheque.updated' });
    return result;
  }

  /**
   * وصول شد.
   *
   * حالتِ عادی هیچ اثر مالی روی بدهی ندارد — بدهی از روزِ گرفتنِ چک کم شده بود.
   * فقط دو حرکتِ دفتریِ سند ممکن است:
   *   • چکِ نزدِ ما مستقیم نقد شد → از «چک‌های دریافتی» به «صندوق».
   *   • چک قبلاً برگشت خورده بود → اثرِ آن برگشت با سندِ قرینه خنثی می‌شود.
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

      // سندِ وصول — فقط حرکت‌هایی که اثر دارند.
      let lines: VoucherLineInput[] = [];
      let reversesVoucherId: string | null = null;

      if (wasBounced) {
        // قرینه‌ی سندِ برگشت — همان حساب‌ها با علامتِ برعکس، وصل به سندِ برگشت.
        const bouncedVoucher = await tx.voucher.findFirst({
          where: {
            sourceType: VoucherSourceType.CHEQUE_BOUNCED,
            sourceId: id,
          },
          include: {
            lines: {
              select: { account: true, amount: true, customerId: true },
            },
          },
        });
        if (bouncedVoucher) {
          reversesVoucherId = bouncedVoucher.id;
          lines = bouncedVoucher.lines.map((l) => ({
            account: l.account,
            amount: -l.amount,
            customerId: l.customerId,
            note: 'قرینه‌ی برگشت چک',
          }));
        } else {
          // برگشتِ پیش از دورانِ سند — بدهی با قرینه‌ی ساده برمی‌گردد.
          lines = [
            { account: FixedAccount.CASH, amount, note: 'وصول چک برگشتی' },
            {
              account: FixedAccount.CUSTOMERS,
              amount: -amount,
              customerId,
              note: 'وصول چک برگشتی',
            },
          ];
        }
      } else if (cheque.status === ChequeStatus.IN_HAND) {
        // وصولِ مستقیمِ چکِ نزدِ ما: «چک‌های دریافتی» → «صندوق».
        lines = [
          { account: FixedAccount.CASH, amount, note: 'وصول چک' },
          { account: FixedAccount.CHEQUES, amount: -amount, note: 'چک نقد شد' },
        ];
      }
      // DEPOSITED → CASHED: پول از روزِ سپردن در بانک بود؛ فقط وضعیت عوض می‌شود.

      if (lines.length) {
        await this.posting.post(tx, {
          sourceType: VoucherSourceType.CHEQUE_CASHED,
          sourceId: id,
          idempotencyKey: `cheque-cash:${id}`,
          lines,
          note: wasBounced
            ? `وصول چک ${cheque.number} پس از برگشت`
            : `وصول چک ${cheque.number}`,
          userId: userId ?? null,
          reversesVoucherId,
        });
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

      // سندِ برگشت: بدهی برمی‌گردد؛ چک از جایی که بود (بانک یا نزدِ ما) خارج می‌شود.
      const counter =
        cheque.status === ChequeStatus.DEPOSITED
          ? FixedAccount.BANK
          : FixedAccount.CHEQUES;
      await this.posting.post(tx, {
        sourceType: VoucherSourceType.CHEQUE_BOUNCED,
        sourceId: id,
        idempotencyKey: `cheque-bounce:${id}`,
        lines: [
          {
            account: FixedAccount.CUSTOMERS,
            amount,
            customerId,
            note: 'بدهیِ چکِ برگشتی',
          },
          { account: counter, amount: -amount, note: 'چک برگشتی' },
        ],
        note: reason?.trim()
          ? `برگشت چک ${cheque.number} — ${reason.trim()}`
          : `برگشت چک ${cheque.number}`,
        userId: userId ?? null,
      });

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

  /**
   * چک‌های یک مشتری — برای تبِ «چک‌ها» در پرونده‌ی مشتری.
   *
   * چک دو مسیر به مشتری می‌رسد: یا بابتِ فاکتور (`payment`) یا بابتِ رسیدِ
   * تسویه (`receiptPayment`). هر دو را می‌گیریم و مسیر را روی هر ردیف
   * می‌گذاریم تا مدیر بداند چک بابتِ کدام سند بوده — همان «گردش چک» پارسیان.
   */
  async listForCustomer(customerId: string) {
    const rows = await this.prisma.cheque.findMany({
      where: {
        OR: [
          { payment: { invoice: { customerId } } },
          { receiptPayment: { receipt: { customerId } } },
        ],
      },
      include: {
        payment: {
          select: { amount: true, invoice: { select: { number: true } } },
        },
        receiptPayment: {
          select: { amount: true, receipt: { select: { number: true } } },
        },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'desc' }],
      take: 200,
    });

    return rows.map((ch) => {
      // مبلغِ چک از مسیرِ مالیش می‌آید — خودِ Cheque مبلغ ندارد.
      const amount = ch.payment?.amount ?? ch.receiptPayment?.amount ?? 0;
      const viaPayment = ch.payment?.invoice
        ? { docNumber: ch.payment.invoice.number ?? null }
        : null;
      const viaReceipt = ch.receiptPayment?.receipt
        ? { docNumber: ch.receiptPayment.receipt.number ?? null }
        : null;
      return {
        id: ch.id,
        number: ch.number,
        bankName: ch.bankName,
        dueDate: ch.dueDate,
        status: ch.status,
        settledAt: ch.settledAt,
        amount,
        /** SALE = چکی که با فاکتور گرفته شد · RECEIPT = چکی که بابت بدهی آمد. */
        source: ch.paymentId ? ('SALE' as const) : ('RECEIPT' as const),
        docNumber: (viaPayment ?? viaReceipt)?.docNumber ?? null,
      };
    });
  }
}
