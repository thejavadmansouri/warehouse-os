import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, OpenAccountStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { InvoiceEffectsService } from './invoice-effects.service';


/**
 * حساب بازِ مشتری — «فاکتور کلی»ی که تا تسویه نهایی نمی‌شود.
 *
 * هر نوبت خرید یک فاکتورِ OPEN جداگانه می‌سازد (با شماره و تاریخِ خودش) که به
 * همین حساب وصل است. مجموعِ فاکتورهای باز همان چیزی است که فروشنده به مشتری
 * نشان می‌دهد؛ در تسویه همه‌ی آن‌ها CONFIRMED می‌شوند و خودِ حساب SETTLED.
 */
@Injectable()
export class OpenAccountsService {

  constructor(
    private prisma: PrismaService,
    private realtime: EventsGateway,
    private effects: InvoiceEffectsService,
  ) {}


  /** حسابِ بازِ فعالِ مشتری را برمی‌گرداند؛ اگر نبود می‌سازد (idempotent). */
  async ensureOpen(customerId: string) {
    const existing = await this.prisma.openAccount.findFirst({
      where: { customerId, status: OpenAccountStatus.OPEN },
    });
    if (existing) return this.get(existing.id);

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException({
        error: 'CUSTOMER_NOT_FOUND',
        message: 'مشتری پیدا نشد',
      });
    }

    const created = await this.prisma.openAccount.create({
      data: { customerId, status: OpenAccountStatus.OPEN },
    });

    this.realtime.broadcast({
      type: 'open-account.created',
      customerId,
    });

    return this.get(created.id);
  }


  /** همه‌ی حساب‌های بازِ فعال، با جمع و بازه‌ی خرید — برای فهرستِ صندوق. */
  async list() {
    const accounts = await this.prisma.openAccount.findMany({
      where: { status: OpenAccountStatus.OPEN },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phones: true } },
        invoices: {
          where: { status: InvoiceStatus.OPEN },
          select: { id: true, total: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const delta = await this.effects.deltaByInvoice(
      accounts.flatMap((a) => a.invoices.map((v) => v.id)),
    );

    return accounts.map((a) => {
      const visits = a.invoices;
      // جمعِ خالص: مرجوعی و اصلاحیه‌ی پیش از تسویه همین‌جا کم/زیاد می‌شود،
      // وگرنه فروشنده در فهرست عددی می‌بیند که با تسویه نمی‌خواند.
      const total = visits.reduce(
        (s, v) => s + v.total + (delta.get(v.id) ?? 0),
        0,
      );
      const dates = visits.map((v) => v.createdAt.getTime());
      return {
        id: a.id,
        number: a.number,
        customerId: a.customerId,
        customerName: [a.customer.firstName, a.customer.lastName].filter(Boolean).join(' '),
        phone: a.customer.phones?.[0]?.phone ?? null,
        status: a.status,
        total,
        invoiceCount: visits.length,
        firstVisit: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
        lastVisit: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        createdAt: a.createdAt.toISOString(),
      };
    });
  }


  /**
   * پرونده‌ی حساب — فاکتورهای باز با ردیف‌هایشان.
   * همین‌جا خوراکِ نمای «با یک تیک همه‌ی آنچه برده» می‌شود؛ تاریخِ هر قلم همان
   * createdAtِ ردیف است.
   */
  async get(id: string) {
    const account = await this.prisma.openAccount.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phones: true } },
        invoices: {
          where: { status: InvoiceStatus.OPEN },
          include: {
            // رابطهی lines از قبل به همین فاکتور محدود است — فیلترِ اضافه
            // (invoiceId: <id حساب>) هم زائد بود هم غلط: هیچ ردیفی با invoiceIdِ
            // برابرِ شناسهی حساب وجود ندارد، پس خطها خالی برمیگشتند.
            //
            // اما `lines` همه‌ی لاگ‌های فاکتور است، نه فقط فروش. حالا که مرجوعی
            // پیش از تسویه ممکن شده، بدونِ این فیلتر حرکتِ RETURNِ مرجوعی هم
            // به‌عنوان یک قلمِ خریدِ تازه در پرونده ظاهر می‌شد.
            lines: {
              where: { action: 'SALE' },
              orderBy: { createdAt: 'asc' },
              include: { product: { select: { id: true, name: true, unit: true } } },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!account) {
      throw new NotFoundException({
        error: 'OPEN_ACCOUNT_NOT_FOUND',
        message: 'حساب باز پیدا نشد',
      });
    }

    const invoices = account.invoices;
    const delta = await this.effects.deltaByInvoice(invoices.map((v) => v.id));

    /*
     * اثرِ اسناد روی تک‌تکِ ردیف‌ها — تا فروشنده روی همان قلم ببیند چند تا برگشته
     * و تعدادِ مؤثر چند است، نه اینکه فقط جمعِ ته صفحه فرق کند و معلوم نباشد چرا.
     */
    const { returnedQty, correctedQty, correctedPrice } = await this.effects.lineEffects(
      invoices.flatMap((inv) => inv.lines.map((l) => l.id)),
    );

    const grossTotal = invoices.reduce((s, v) => s + v.total, 0);
    const total = invoices.reduce(
      (s, v) => s + v.total + (delta.get(v.id) ?? 0),
      0,
    );

    return {
      id: account.id,
      number: account.number,
      customerId: account.customerId,
      customerName: [account.customer.firstName, account.customer.lastName]
        .filter(Boolean)
        .join(' '),
      phone: account.customer.phones?.[0]?.phone ?? null,
      status: account.status,
      note: account.note,
      settledAt: account.settledAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
      /** آنچه مشتری باید بدهد — پس از مرجوعی و اصلاحیه. */
      total,
      /** آنچه در این نوبت‌ها برداشته شد، پیش از اسنادِ جبرانی. */
      grossTotal,
      invoiceCount: invoices.length,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        total: inv.total,
        netTotal: inv.total + (delta.get(inv.id) ?? 0),
        discount: inv.discount,
        note: inv.note,
        createdAt: inv.createdAt.toISOString(),
        lines: inv.lines.map((l) => {
          const returned = returnedQty.get(l.id) ?? 0;
          const corrected = correctedQty.get(l.id) ?? 0;
          return {
            id: l.id,
            /** همان شناسه‌ای که مرجوعی و اصلاحیه رویش قفل می‌شوند. */
            saleLogId: l.id,
            invoiceId: inv.id,
            invoiceNumber: inv.number,
            productId: l.productId,
            productName: l.product?.name ?? '—',
            unit: l.product?.unit ?? null,
            quantity: l.quantity,
            returnedQuantity: returned,
            correctedQuantity: corrected,
            /** آنچه واقعاً روی حساب مانده: بردهٔ اولیه + اصلاح − مرجوعی. */
            effectiveQuantity: l.quantity + corrected - returned,
            // لاگِ انبار قیمت را nullable نگه می‌دارد (حرکت‌های غیرفروش قیمت
            // ندارند)؛ اینجا صفر می‌شود تا ضرب سمتِ کلاینت NaN نشود.
            unitPrice: correctedPrice.get(l.id) ?? l.unitPrice ?? 0,
            originalUnitPrice: l.unitPrice ?? 0,
            discount: l.lineDiscount ?? 0,
            createdAt: l.createdAt.toISOString(),
          };
        }),
      })),
    };
  }


  /**
   * برگه‌ی تجمیعیِ کلِ حساب — «فاکتور کلی»ی که مشتری سرِ تسویه با خودش می‌برد.
   *
   * چرا جدا از `get()`: آن یکی فقط فاکتورهای `OPEN` را می‌آورد (خوراکِ صندوق)،
   * پس بلافاصله بعد از تسویه خالی می‌شود — دقیقاً همان لحظه‌ای که برگه لازم است.
   * اینجا همه‌ی نوبت‌های حساب می‌آیند، باطل‌شده‌ها کنار گذاشته می‌شوند، و مرجوعی
   * و دریافت هم روی همان کاغذ می‌نشینند تا مشتری یک برگه ببرد نه پنج تا.
   */
  async sheet(id: string) {
    const account = await this.prisma.openAccount.findUnique({
      where: { id },
      include: {
        customer: {
          select: { id: true, firstName: true, lastName: true, phones: true },
        },
        invoices: {
          where: { status: { not: InvoiceStatus.CANCELLED } },
          include: {
            lines: {
              where: { action: 'SALE' },
              orderBy: { createdAt: 'asc' },
              include: {
                product: {
                  select: { id: true, name: true, sku: true, unit: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!account) {
      throw new NotFoundException({
        error: 'OPEN_ACCOUNT_NOT_FOUND',
        message: 'حساب باز پیدا نشد',
      });
    }

    const invoices = account.invoices;
    const invoiceIds = invoices.map((v) => v.id);

    const [delta, effects, returns, corrections, allocations] = await Promise.all([
      this.effects.deltaByInvoice(invoiceIds),
      this.effects.lineEffects(invoices.flatMap((inv) => inv.lines.map((l) => l.id))),
      this.prisma.saleReturn.findMany({
        where: { invoiceId: { in: invoiceIds } },
        orderBy: { createdAt: 'asc' },
        include: {
          lines: {
            orderBy: { createdAt: 'asc' },
            include: { product: { select: { name: true, unit: true } } },
          },
        },
      }),
      this.prisma.saleCorrection.findMany({
        where: { invoiceId: { in: invoiceIds } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          number: true,
          amountAdjust: true,
          reason: true,
          createdAt: true,
        },
      }),
      /*
       * دریافت‌ها از مسیرِ تخصیص خوانده می‌شوند، نه از کلِ رسیدهای مشتری: مشتری
       * ممکن است بدهیِ قدیمی‌ترِ بی‌ربط هم داشته باشد و پولش نباید روی این برگه
       * بیاید. `ReceiptAllocation.amount` دقیقاً سهمِ همین فاکتورهاست.
       */
      this.prisma.receiptAllocation.findMany({
        where: { invoiceId: { in: invoiceIds } },
        orderBy: { createdAt: 'asc' },
        include: {
          receipt: {
            include: {
              payments: { include: { cheque: true } },
            },
          },
        },
      }),
    ]);

    const { returnedQty, correctedQty, correctedPrice } = effects;

    const gross = invoices.reduce((s, v) => s + v.total, 0);
    const net = invoices.reduce((s, v) => s + v.total + (delta.get(v.id) ?? 0), 0);
    const returnsTotal = returns.reduce((s, r) => s + r.refundAmount, 0);
    const correctionsTotal = corrections.reduce((s, c) => s + c.amountAdjust, 0);
    // مانده از خودِ فاکتورها؛ همان عددی که دفتر و گزارشِ مطالبات می‌بینند.
    const remaining = invoices.reduce((s, v) => s + v.dueAmount, 0);
    const paid = allocations.reduce((s, a) => s + a.amount, 0);

    /*
     * تفکیکِ روشِ پرداخت. یک رسید می‌تواند چند فاکتورِ همین حساب را پوشش دهد،
     * پس رسیدهای تکراری حذف می‌شوند وگرنه چکِ یک‌میلیونی دو بار چاپ می‌شد.
     */
    const seenReceipts = new Set<string>();
    const payments: {
      receiptNumber: number;
      createdAt: string;
      method: string;
      amount: number;
      cheque: {
        number: string;
        bankName: string | null;
        dueDate: string;
      } | null;
    }[] = [];

    for (const a of allocations) {
      if (seenReceipts.has(a.receiptId)) continue;
      seenReceipts.add(a.receiptId);
      for (const p of a.receipt.payments) {
        payments.push({
          receiptNumber: a.receipt.number,
          createdAt: a.receipt.createdAt.toISOString(),
          method: p.method,
          amount: p.amount,
          cheque: p.cheque
            ? {
                number: p.cheque.number,
                bankName: p.cheque.bankName ?? null,
                dueDate: p.cheque.dueDate.toISOString(),
              }
            : null,
        });
      }
    }

    return {
      id: account.id,
      number: account.number,
      status: account.status,
      note: account.note,
      settledAt: account.settledAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
      customerName: [account.customer.firstName, account.customer.lastName]
        .filter(Boolean)
        .join(' '),
      phone: account.customer.phones?.[0]?.phone ?? null,

      visits: invoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        createdAt: inv.createdAt.toISOString(),
        discount: inv.discount,
        note: inv.note,
        gross: inv.total,
        net: inv.total + (delta.get(inv.id) ?? 0),
        lines: inv.lines.map((l) => {
          const returned = returnedQty.get(l.id) ?? 0;
          const corrected = correctedQty.get(l.id) ?? 0;
          const effectiveQuantity = l.quantity + corrected - returned;
          const unitPrice = correctedPrice.get(l.id) ?? l.unitPrice ?? 0;
          return {
            id: l.id,
            productName: l.product?.name ?? '—',
            sku: l.product?.sku ?? null,
            unit: l.product?.unit ?? null,
            quantity: l.quantity,
            returnedQuantity: returned,
            correctedQuantity: corrected,
            effectiveQuantity,
            unitPrice,
            discount: l.lineDiscount ?? 0,
            lineTotal: effectiveQuantity * unitPrice - (l.lineDiscount ?? 0),
          };
        }),
      })),

      returns: returns.map((r) => ({
        id: r.id,
        number: r.number,
        createdAt: r.createdAt.toISOString(),
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

      corrections: corrections.map((c) => ({
        id: c.id,
        number: c.number,
        createdAt: c.createdAt.toISOString(),
        amountAdjust: c.amountAdjust,
        reason: c.reason,
      })),

      payments,

      totals: {
        gross,
        returns: returnsTotal,
        corrections: correctionsTotal,
        net,
        paid,
        remaining,
      },
    };
  }


  /**
   * تسویه — صدورِ فاکتور نهایی.
   *
   * همه‌ی فاکتورهای بازِ حساب CONFIRMED می‌شوند (با سررسیدِ مهلتِ خودِ مشتری از
   * امروز) و خودِ حساب SETTLED. موجودی و دفتر دست نمی‌خورد — بدهی در همان لحظه‌ی
   * هر نوبت وارد دفتر شده بود؛ پول هم از مسیرِ معمولِ «دریافت» گرفته می‌شود.
   */
  async settle(id: string, userId?: string) {
    await this.prisma.$transaction(async (tx) => {
      const account = await tx.openAccount.findUnique({
        where: { id },
        include: { customer: true },
      });

      if (!account) {
        throw new NotFoundException({
          error: 'OPEN_ACCOUNT_NOT_FOUND',
          message: 'حساب باز پیدا نشد',
        });
      }

      if (account.status !== OpenAccountStatus.OPEN) {
        throw new BadRequestException({
          error: 'OPEN_ACCOUNT_NOT_OPEN',
          message: 'این حساب باز قبلاً تسویه شده است',
        });
      }

      const openInvoices = await tx.saleInvoice.findMany({
        where: { accountId: id, status: InvoiceStatus.OPEN },
        select: { id: true },
      });

      if (openInvoices.length === 0) {
        throw new BadRequestException({
          error: 'OPEN_ACCOUNT_EMPTY',
          message: 'هیچ خریدی روی این حساب ثبت نشده',
        });
      }

      /*
       * سررسید دیگر اینجا ساخته نمی‌شود — هر نوبت سررسیدِ خودش را از لحظه‌ی
       * فروش دارد. اگر تسویه سررسیدها را جلو می‌برد، بدهیِ شش‌ماهه با یک بار
       * تسویه‌کردن دوباره «جاری» می‌شد و از گزارشِ معوقات بیرون می‌رفت.
       *
       * این فقط برای فاکتورهای قدیمیِ بی‌سررسید است (پیش از اینکه سررسید در
       * لحظه‌ی فروش تعیین شود) تا بی‌تاریخ نمانند.
       */
      const due = new Date();
      due.setDate(due.getDate() + (account.customer.creditDays ?? 0));
      due.setHours(23, 59, 59, 999);

      await tx.saleInvoice.updateMany({
        where: { accountId: id, status: InvoiceStatus.OPEN, dueDate: null },
        data: { dueDate: due },
      });

      await tx.saleInvoice.updateMany({
        where: { accountId: id, status: InvoiceStatus.OPEN },
        data: { status: InvoiceStatus.CONFIRMED },
      });

      await tx.openAccount.update({
        where: { id },
        data: {
          status: OpenAccountStatus.SETTLED,
          settledAt: new Date(),
        },
      });
    });

    this.realtime.broadcast({
      type: 'open-account.settled',
      customerId: (await this.get(id)).customerId,
    });

    return this.get(id);
  }
}
