import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, InvoiceStatus, PaymentMethod, LedgerEntryType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { LedgerService } from './ledger.service';

import { CreateReturnDto } from './dto/create-return.dto';
import { EventsGateway } from '../realtime/events.gateway';


/**
 * برگشت از فروش (مرجوعی).
 *
 * سه اصل که کل این سرویس رویشان بنا شده:
 *
 * ۱. **همیشه به یک فاکتور قفل است.** هر قلمِ مرجوعی به یک ردیفِ SALEِ همان
 *    فاکتور اشاره می‌کند؛ کالا و قیمت از فاکتور می‌آیند، نه از کلاینت. پس نه
 *    می‌شود کالای دیگری مرجوعی زد، نه بیش از فروخته‌شده، نه با قیمتِ امروز.
 *
 * ۲. **فاکتور اصلی دست‌نخورده می‌ماند.** ردیف‌های SALE هرگز حذف/ویرایش نمی‌شوند؛
 *    مرجوعی یک سندِ مستقل است که حرکت‌های RETURN جبرانی و ردیفِ بستانکاریِ دفتر
 *    را کنارش می‌سازد (لجر و دفتر هر دو append-only).
 *
 * ۳. **قیمتِ برگشت = چیزی که مشتری واقعاً پرداخته.** یعنی قیمتِ فروشِ همان ردیف
 *    منهای سهمِ نسبتیِ تخفیفِ کلِ فاکتور — نه قیمتِ خام.
 */
@Injectable()
export class ReturnsService {

  constructor(
    private prisma: PrismaService,
    private operation: InventoryOperationService,
    private ledger: LedgerService,
    private realtime: EventsGateway,
  ) {}


  /**
   * ردیف مؤثرِ یک لاگِ فروش: قیمت واحد، تخفیف ردیف، و «کلِ مؤثر» که سهمِ تخفیفِ
   * فاکتور از آن کم شده. همین یک تابع هم در پیش‌نمایش (returnable) و هم در ثبت
   * استفاده می‌شود تا عددِ پیش‌نمایش با عددِ نهایی هیچ‌وقت فرق نکند.
   */
  private effectiveTotal(
    unitPrice: number,
    lineDiscount: number,
    sold: number,
    invoiceSubtotal: number,
    invoiceDiscount: number,
  ): number {
    const lineNet = unitPrice * sold - lineDiscount; // همان چیزی که در subtotal جمع شده
    if (invoiceSubtotal <= 0 || invoiceDiscount <= 0) return lineNet;
    // سهمِ تخفیفِ فاکتور، به نسبتِ خالصِ همین ردیف.
    const share = Math.round((invoiceDiscount * lineNet) / invoiceSubtotal);
    return lineNet - share;
  }


  /** مبلغِ برگشتیِ برگرداندنِ q واحد از یک ردیف، با گردکردنِ سازگار. */
  private refundFor(effTotal: number, sold: number, qty: number) {
    const lineRefund = sold > 0 ? Math.round((effTotal * qty) / sold) : 0;
    const unitRefund = qty > 0 ? Math.round(lineRefund / qty) : 0;
    return { lineRefund, unitRefund };
  }


  /**
   * ردیف‌های قابل‌برگشتِ یک فاکتور — خوراکِ صفحه‌ی مرجوعی.
   *
   * برای هر ردیفِ SALE: فروخته، مرجوعیِ قبلی، و «قابل‌برگشت» (= فروخته − قبلی‌ها)
   * را می‌دهد، به‌علاوه‌ی قیمتِ مؤثرِ هر واحد تا کلاینت پیش‌نمایشِ مبلغِ برگشت را
   * نشان دهد.
   */
  async returnableLines(invoiceId: string) {
    const invoice = await this.prisma.saleInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        number: true,
        status: true,
        subtotal: true,
        discount: true,
        total: true,
        dueAmount: true,
        customerId: true,
        customer: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException({
        error: 'INVOICE_NOT_FOUND',
        message: 'فاکتور پیدا نشد',
      });
    }

    const saleLines = await this.prisma.inventoryLog.findMany({
      where: { invoiceId, action: 'SALE' },
      orderBy: { createdAt: 'asc' },
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true } },
        location: { select: { id: true, name: true, code: true, path: true } },
      },
    });

    const prior = await this.prisma.saleReturnLine.groupBy({
      by: ['saleLogId'],
      where: { saleLogId: { in: saleLines.map((l) => l.id) } },
      _sum: { quantity: true },
    });
    const priorQty = new Map(prior.map((p) => [p.saleLogId, p._sum.quantity ?? 0]));

    const lines = saleLines.map((l) => {
      const sold = l.quantity;
      const alreadyReturned = priorQty.get(l.id) ?? 0;
      const returnable = sold - alreadyReturned;
      const effTotal = this.effectiveTotal(
        l.unitPrice ?? 0,
        l.lineDiscount ?? 0,
        sold,
        invoice.subtotal,
        invoice.discount,
      );
      const { unitRefund } = this.refundFor(effTotal, sold, sold);
      return {
        saleLogId: l.id,
        product: l.product,
        location: l.location,
        unitPrice: l.unitPrice ?? 0,
        lineDiscount: l.lineDiscount ?? 0,
        sold,
        alreadyReturned,
        returnable,
        /** قیمتِ مؤثرِ هر واحد پس از سهمِ تخفیفِ فاکتور — پایه‌ی مبلغِ برگشت. */
        effectiveUnitPrice: unitRefund,
      };
    });

    return {
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        total: invoice.total,
        dueAmount: invoice.dueAmount,
        customer: invoice.customer
          ? {
              ...invoice.customer,
              fullName: [invoice.customer.firstName, invoice.customer.lastName]
                .filter(Boolean)
                .join(' '),
            }
          : null,
      },
      lines,
      /** فاکتور باطل‌شده اصلاً قابلِ مرجوعی نیست. */
      returnable: invoice.status === InvoiceStatus.CONFIRMED,
    };
  }


  /**
   * ثبت یک مرجوعی. همه‌چیز در یک تراکنش: یا کلِ سند با حرکت‌های انبار و دفتر
   * ثبت می‌شود، یا هیچ‌کدام.
   */
  async createReturn(dto: CreateReturnDto, userId?: string) {

    // ---- بررسی‌های ارزان، پیش از تراکنش ----

    if (dto.refundMethod === PaymentMethod.CHEQUE) {
      throw new BadRequestException({
        error: 'INVALID_REFUND_METHOD',
        message: 'چک روشِ برگشتِ وجه نیست',
      });
    }

    if (!dto.reason?.trim()) {
      throw new BadRequestException({
        error: 'REASON_REQUIRED',
        message: 'برای مرجوعی، ذکر دلیل الزامی است',
      });
    }

    if (dto.idempotencyKey) {
      const existing = await this.prisma.saleReturn.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return this.findOne(existing.id);
    }

    // یک ردیفِ SALE نباید دو بار در یک سندِ مرجوعی بیاید؛ وگرنه سقفِ قابل‌برگشت
    // ردیف‌به‌ردیف گمراه می‌شود. کلاینت باید ادغام کند.
    const seen = new Set<string>();
    for (const line of dto.lines) {
      if (seen.has(line.saleLogId)) {
        throw new BadRequestException({
          error: 'DUPLICATE_LINE',
          saleLogId: line.saleLogId,
          message: 'یک ردیفِ فاکتور دو بار در مرجوعی آمده — ادغامش کنید',
        });
      }
      seen.add(line.saleLogId);
    }

    try {

      const returnId = await this.prisma.$transaction(async (tx) => {

        const invoice = await tx.saleInvoice.findUnique({
          where: { id: dto.invoiceId },
          select: {
            id: true,
            number: true,
            status: true,
            subtotal: true,
            discount: true,
            customerId: true,
            warehouseId: true,
            dueAmount: true,
          },
        });

        if (!invoice) {
          throw new NotFoundException({
            error: 'INVOICE_NOT_FOUND',
            message: 'فاکتور پیدا نشد',
          });
        }

        // فاکتور باطل‌شده موجودی‌اش قبلاً کامل برگشته و بدهی‌اش صفر شده — مرجوعی
        // رویش یعنی دوباره‌کاری و عددِ غلط.
        if (invoice.status !== InvoiceStatus.CONFIRMED) {
          throw new ConflictException({
            error: 'INVOICE_NOT_RETURNABLE',
            message: 'فاکتور باطل‌شده قابلِ مرجوعی نیست',
          });
        }

        // ردیف‌های SALEِ همین فاکتور — منبعِ کالا و قیمت.
        const saleLines = await tx.inventoryLog.findMany({
          where: { invoiceId: invoice.id, action: 'SALE' },
        });
        const saleById = new Map(saleLines.map((l) => [l.id, l]));

        // مرجوعی‌های قبلیِ هر ردیف — برای سقفِ قابل‌برگشت.
        const prior = await tx.saleReturnLine.groupBy({
          by: ['saleLogId'],
          where: { saleLogId: { in: saleLines.map((l) => l.id) } },
          _sum: { quantity: true },
        });
        const priorQty = new Map(
          prior.map((p) => [p.saleLogId, p._sum.quantity ?? 0]),
        );

        let refundAmount = 0;
        const lineData: {
          saleLogId: string;
          productId: string;
          locationId: string;
          quantity: number;
          unitRefund: number;
          lineRefund: number;
          restock: boolean;
        }[] = [];

        for (const line of dto.lines) {
          const sale = saleById.get(line.saleLogId);
          if (!sale) {
            throw new BadRequestException({
              error: 'LINE_NOT_IN_INVOICE',
              saleLogId: line.saleLogId,
              message: 'این ردیف متعلق به فاکتورِ انتخاب‌شده نیست',
            });
          }

          const sold = sale.quantity;
          const already = priorQty.get(sale.id) ?? 0;
          const returnable = sold - already;

          if (line.quantity > returnable) {
            throw new ConflictException({
              error: 'EXCESS_RETURN',
              saleLogId: sale.id,
              sold,
              alreadyReturned: already,
              returnable,
              requested: line.quantity,
              message: 'تعدادِ مرجوعی از تعدادِ قابل‌برگشت بیشتر است',
            });
          }

          const effTotal = this.effectiveTotal(
            sale.unitPrice ?? 0,
            sale.lineDiscount ?? 0,
            sold,
            invoice.subtotal,
            invoice.discount,
          );
          const { lineRefund, unitRefund } = this.refundFor(
            effTotal,
            sold,
            line.quantity,
          );

          refundAmount += lineRefund;

          lineData.push({
            saleLogId: sale.id,
            productId: sale.productId,
            locationId: sale.locationId,
            quantity: line.quantity,
            unitRefund,
            lineRefund,
            // پیش‌فرض سالم؛ فقط اگر صراحتاً false بیاید معیوب حساب می‌شود.
            restock: line.restock !== false,
          });
        }

        // برگشتِ اعتباری بدونِ مشتری قابل‌ثبت نیست — بستانکاری روی هیچ‌کس نمی‌نشیند.
        if (dto.refundMethod === PaymentMethod.CREDIT && !invoice.customerId) {
          throw new BadRequestException({
            error: 'CUSTOMER_REQUIRED_FOR_CREDIT',
            message: 'برگشت به حساب برای فروش نقدیِ بدون مشتری ممکن نیست',
          });
        }

        const saleReturn = await tx.saleReturn.create({
          data: {
            idempotencyKey: dto.idempotencyKey ?? null,
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            warehouseId: invoice.warehouseId,
            userId: userId ?? null,
            refundMethod: dto.refundMethod,
            refundAmount,
            reason: dto.reason.trim(),
            note: dto.note ?? null,
          },
        });

        await tx.saleReturnLine.createMany({
          data: lineData.map((l) => ({ ...l, returnId: saleReturn.id })),
        });

        // حرکتِ انبار فقط برای اقلامِ سالم — از تک‌نقطه‌ی تغییرِ موجودی (قانون ۱).
        for (const l of lineData) {
          if (!l.restock) continue;
          await this.operation.execute(
            {
              type: 'RETURN',
              productId: l.productId,
              locationId: l.locationId,
              quantity: l.quantity,
              invoiceId: invoice.id,
              saleReturnId: saleReturn.id,
              userId: userId ?? null,
              source: 'SALE_RETURN',
              note: `مرجوعی ${saleReturn.number} — فاکتور ${invoice.number}`,
            },
            tx,
          );
        }

        // ---- سمتِ مالی ----
        if (dto.refundMethod === PaymentMethod.CREDIT && invoice.customerId) {
          /*
           * برگشت به حساب: بدهیِ همین فاکتور تا سقفِ مانده‌اش کم می‌شود تا
           * تفکیکِ سنیِ بدهکاران (که از dueAmount می‌خواند) درست بماند؛ و کلِ
           * مبلغِ برگشت به‌عنوان بستانکاری در دفتر ثبت می‌شود. اگر مبلغِ برگشت
           * از ماندهٔ فاکتور بیشتر باشد (مثلاً فاکتورِ نقداً پرداخت‌شده)، مازاد
           * در دفتر منفی می‌ماند = اعتبارِ مشتری نزدِ ما — قرینه‌ی پیش‌دریافتِ رسید.
           */
          /*
           * کسرِ شرطی و نسبی، نه نوشتنِ مقدار مطلق: اگر رسیدی هم‌زمان همین فاکتور
           * را تسویه کرده باشد، `invoice.dueAmount`ِ خوانده‌شده کهنه است و نوشتنِ
           * مقدار مطلق کاهشِ آن رسید را پاک می‌کرد.
           *
           * اگر شرط نگیرد (فاکتور همین حالا تسویه شده) مانده دست نمی‌خورد ولی
           * ردیفِ بستانکاریِ دفتر همچنان کامل ثبت می‌شود — مشتری پولش را طلبکار
           * است چه این فاکتور باز باشد چه بسته. دفتر مرجع مانده است، نه dueAmount.
           */
          const applied = Math.min(refundAmount, invoice.dueAmount);
          if (applied > 0) {
            await tx.saleInvoice.updateMany({
              where: { id: invoice.id, dueAmount: { gte: applied } },
              data: { dueAmount: { decrement: applied } },
            });
          }

          await this.ledger.record(tx, {
            customerId: invoice.customerId,
            type: LedgerEntryType.RETURN,
            amount: -refundAmount,
            invoiceId: invoice.id,
            returnId: saleReturn.id,
            userId: userId ?? null,
            note: `مرجوعی ${saleReturn.number} — فاکتور ${invoice.number}`,
          });
        }
        // CASH/CARD: وجه از صندوق برگشت داده شده و روی خودِ سندِ مرجوعی ثبت است؛
        // دفتر دست نمی‌خورد چون بدهیِ مشتری تغییری نکرده.

        return saleReturn.id;
      });

      // مرجوعی ثبت شد → فاکتور/لیست‌ها، موجودی (restock)، و احتمالاً مانده‌ی
      // حساب مشتری عوض شد؛ همان لحظه اعلان کن.
      this.realtime.broadcast({ type: 'return.created', invoiceId: dto.invoiceId });
      this.realtime.broadcast({ type: 'stock.changed' });

      return this.findOne(returnId);

    } catch (err: any) {
      // برخوردِ همزمان روی همان idempotencyKey: سندِ موجود برگردانده شود.
      if (err?.code === 'P2002') {
        const dup = dto.idempotencyKey
          ? await this.prisma.saleReturn.findUnique({
              where: { idempotencyKey: dto.idempotencyKey },
            })
          : null;
        if (dup) return this.findOne(dup.id);
      }
      throw err;
    }
  }


  async findOne(id: string) {
    const ret = await this.prisma.saleReturn.findUnique({
      where: { id },
      include: {
        invoice: { select: { id: true, number: true } },
        customer: true,
        warehouse: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, fullName: true, username: true } },
        lines: {
          orderBy: { createdAt: 'asc' },
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true } },
            location: { select: { id: true, name: true, code: true, path: true } },
          },
        },
      },
    });

    if (!ret) {
      throw new NotFoundException({
        error: 'RETURN_NOT_FOUND',
        message: 'سندِ مرجوعی پیدا نشد',
      });
    }

    return {
      ...ret,
      customer: ret.customer
        ? {
            ...ret.customer,
            fullName: [ret.customer.firstName, ret.customer.lastName]
              .filter(Boolean)
              .join(' '),
          }
        : null,
    };
  }


  async findAll(q: {
    warehouseId?: string;
    customerId?: string;
    invoiceId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));

    const where: Prisma.SaleReturnWhereInput = {};
    if (q.warehouseId) where.warehouseId = q.warehouseId;
    if (q.customerId) where.customerId = q.customerId;
    if (q.invoiceId) where.invoiceId = q.invoiceId;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.saleReturn.findMany({
        where,
        include: {
          invoice: { select: { id: true, number: true } },
          customer: { select: { id: true, firstName: true, lastName: true } },
          user: { select: { id: true, fullName: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.saleReturn.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        ...r,
        customer: r.customer
          ? {
              ...r.customer,
              fullName: [r.customer.firstName, r.customer.lastName]
                .filter(Boolean)
                .join(' '),
            }
          : null,
      })),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
