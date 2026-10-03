import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { InvoiceEffectsService } from './invoice-effects.service';

/**
 * صورت‌حسابِ کاملِ مشتری — «همه‌ی آنچه برده و همه‌ی آنچه داده».
 *
 * چرا جدا از `LedgerService.statement`: آن یکی گردشِ حساب است (بدهکار/بستانکار/
 * مانده) و به زبانِ حسابداری حرف می‌زند. چیزی که مشتری سرِ پیشخوان می‌خواهد این
 * است: «کدام جنس‌ها را بردم، هرکدام چند و چه قیمت، و کِی چقدر دادم». آن سؤال با
 * ردیف‌های دفتر جواب داده نمی‌شود، چون دفتر قلمِ کالا ندارد.
 *
 * پرداخت از **دو** مسیر می‌آید و هر دو باید روی کاغذ بیایند:
 *   - `Payment` روی خودِ فاکتور (پولی که سرِ خرید داده)
 *   - `Receipt` (پولی که بعداً بابت بدهی آورده)
 * نشان‌دادنِ فقط یکی، همان سؤالی است که سرِ آن دعوا می‌شود.
 */
@Injectable()
export class StatementsService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private effects: InvoiceEffectsService,
  ) {}

  async fullStatement(
    customerId: string,
    q: { startDate?: string; endDate?: string } = {},
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { phones: { orderBy: { isPrimary: 'desc' } } },
    });

    if (!customer) {
      throw new NotFoundException({
        error: 'CUSTOMER_NOT_FOUND',
        message: 'مشتری پیدا نشد',
      });
    }

    const start = q.startDate ? new Date(q.startDate) : null;
    const end = q.endDate ? new Date(q.endDate) : null;

    /** بازه‌ی تاریخ، به شکلی که مستقیم در `where` بنشیند. */
    const inRange: Prisma.DateTimeFilter | undefined =
      start || end
        ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) }
        : undefined;

    const [invoices, receipts, opening, closing] = await Promise.all([
      /*
       * فاکتورهای باطل‌نشده — هم نهایی، هم فاکتورِ جاریِ حساب باز. جنس در هر دو
       * حالت از انبار رفته، پس هر دو «خرید»اند.
       */
      this.prisma.saleInvoice.findMany({
        where: {
          customerId,
          status: { not: InvoiceStatus.CANCELLED },
          ...(inRange ? { createdAt: inRange } : {}),
        },
        orderBy: { createdAt: 'asc' },
        include: {
          lines: {
            // فقط حرکت‌های فروش؛ ردیف‌های RETURNِ مرجوعی هم `invoiceId` دارند و
            // بدون این فیلتر به‌عنوان قلمِ خرید ظاهر می‌شوند.
            where: { action: 'SALE' },
            orderBy: { createdAt: 'asc' },
            include: {
              product: {
                select: { id: true, name: true, sku: true, unit: true },
              },
            },
          },
          payments: {
            include: { cheque: true },
            orderBy: { createdAt: 'asc' },
          },
          returns: {
            orderBy: { createdAt: 'asc' },
            include: {
              lines: {
                orderBy: { createdAt: 'asc' },
                include: { product: { select: { name: true, unit: true } } },
              },
            },
          },
          corrections: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              number: true,
              amountAdjust: true,
              reason: true,
              createdAt: true,
            },
          },
        },
      }),

      this.prisma.receipt.findMany({
        where: { customerId, ...(inRange ? { createdAt: inRange } : {}) },
        orderBy: { createdAt: 'asc' },
        include: {
          payments: {
            include: { cheque: true },
            orderBy: { createdAt: 'asc' },
          },
          allocations: { select: { invoiceId: true, amount: true } },
        },
      }),

      // مانده‌ی اول دوره: جمعِ دفتر پیش از شروعِ بازه. بدونِ بازه یعنی صفر.
      start
        ? this.prisma.customerLedger
            .aggregate({
              where: { customerId, createdAt: { lt: start } },
              _sum: { amount: true },
            })
            .then((a) => a._sum.amount ?? 0)
        : Promise.resolve(0),

      this.ledger.balance(customerId),
    ]);

    const delta = await this.effects.deltaByInvoice(invoices.map((i) => i.id));
    const { returnedQty, correctedQty, correctedPrice } =
      await this.effects.lineEffects(
        invoices.flatMap((i) => i.lines.map((l) => l.id)),
      );

    const purchases = invoices.map((inv) => {
      const lines = inv.lines.map((l) => {
        const returned = returnedQty.get(l.id) ?? 0;
        const corrected = correctedQty.get(l.id) ?? 0;
        const effectiveQuantity = l.quantity + corrected - returned;
        const unitPrice = correctedPrice.get(l.id) ?? l.unitPrice ?? 0;
        return {
          id: l.id,
          productName: l.product?.name ?? '—',
          sku: l.product?.sku ?? null,
          unit: l.product?.unit ?? null,
          /** آنچه در آن روز برداشت — دست‌نخورده می‌ماند. */
          quantity: l.quantity,
          returnedQuantity: returned,
          correctedQuantity: corrected,
          effectiveQuantity,
          unitPrice,
          originalUnitPrice: l.unitPrice ?? 0,
          discount: l.lineDiscount ?? 0,
          lineTotal: effectiveQuantity * unitPrice - (l.lineDiscount ?? 0),
        };
      });

      return {
        id: inv.id,
        number: inv.number,
        createdAt: inv.createdAt.toISOString(),
        /** OPEN یعنی روی حساب باز است و هنوز تسویه نشده. */
        status: inv.status,
        dueDate: inv.dueDate?.toISOString() ?? null,
        discount: inv.discount,
        note: inv.note,
        total: inv.total,
        netTotal: inv.total + (delta.get(inv.id) ?? 0),
        dueAmount: inv.dueAmount,
        lines,
        /** پولی که همان لحظه‌ی خرید داده — نقد/کارت/چک. نسیه پول نیست. */
        payments: inv.payments
          .filter((p) => p.method !== PaymentMethod.CREDIT)
          .map((p) => ({
            id: p.id,
            method: p.method,
            amount: p.amount,
            cheque: p.cheque
              ? {
                  number: p.cheque.number,
                  bankName: p.cheque.bankName ?? null,
                  dueDate: p.cheque.dueDate.toISOString(),
                  status: p.cheque.status,
                }
              : null,
          })),
        returns: inv.returns.map((r) => ({
          id: r.id,
          number: r.number,
          createdAt: r.createdAt.toISOString(),
          refundMethod: r.refundMethod,
          refundAmount: r.refundAmount,
          reason: r.reason,
          lines: r.lines.map((l) => ({
            id: l.id,
            productName: l.product?.name ?? '—',
            unit: l.product?.unit ?? null,
            quantity: l.quantity,
            unitRefund: l.unitRefund,
            lineRefund: l.lineRefund,
          })),
        })),
        corrections: inv.corrections.map((c) => ({
          id: c.id,
          number: c.number,
          createdAt: c.createdAt.toISOString(),
          amountAdjust: c.amountAdjust,
          reason: c.reason,
        })),
      };
    });

    const payments = receipts.map((r) => ({
      id: r.id,
      number: r.number,
      createdAt: r.createdAt.toISOString(),
      amount: r.amount,
      note: r.note,
      rows: r.payments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: p.amount,
        cheque: p.cheque
          ? {
              number: p.cheque.number,
              bankName: p.cheque.bankName ?? null,
              dueDate: p.cheque.dueDate.toISOString(),
              status: p.cheque.status,
            }
          : null,
      })),
      /** بابتِ کدام فاکتورها — تا مشتری بداند پولش کجا نشست. */
      appliedTo: r.allocations.map((a) => ({
        invoiceNumber:
          purchases.find((p) => p.id === a.invoiceId)?.number ?? null,
        amount: a.amount,
      })),
    }));

    // ---- جمع‌ها ----
    const purchasedGross = purchases.reduce((s, p) => s + p.total, 0);
    const purchasedNet = purchases.reduce((s, p) => s + p.netTotal, 0);
    const returnedTotal = purchases.reduce(
      (s, p) => s + p.returns.reduce((rs, r) => rs + r.refundAmount, 0),
      0,
    );
    const correctionsTotal = purchases.reduce(
      (s, p) => s + p.corrections.reduce((cs, c) => cs + c.amountAdjust, 0),
      0,
    );
    /** پولِ سرِ خرید + پولِ بعدی. همان «تمام مبالغی که پرداخته». */
    const paidAtSale = purchases.reduce(
      (s, p) => s + p.payments.reduce((ps, x) => ps + x.amount, 0),
      0,
    );
    const paidLater = payments.reduce((s, r) => s + r.amount, 0);

    return {
      customer: {
        id: customer.id,
        fullName: [customer.firstName, customer.lastName]
          .filter(Boolean)
          .join(' '),
        phones: customer.phones.map((p) => p.phone),
        address: customer.address ?? null,
        creditDays: customer.creditDays ?? 0,
        creditLimit: customer.creditLimit ?? 0,
      },
      range: {
        startDate: start?.toISOString() ?? null,
        endDate: end?.toISOString() ?? null,
      },
      purchases,
      payments,
      totals: {
        /** آنچه برداشته، پیش از مرجوعی و اصلاحیه. */
        purchasedGross,
        /** آنچه پس از اسنادِ جبرانی بدهکار شده. */
        purchasedNet,
        returned: returnedTotal,
        corrections: correctionsTotal,
        paidAtSale,
        paidLater,
        paidTotal: paidAtSale + paidLater,
        /** مانده‌ی اول دوره و مانده‌ی امروز — هر دو از دفتر، تنها مرجعِ مانده. */
        openingBalance: opening,
        closingBalance: closing,
      },
    };
  }
}
