import { Injectable } from '@nestjs/common';
import {
  OnlineOrderStatus,
  QuotationStatus,
  WorkTaskItemStatus,
  WorkTaskKind,
  WorkTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/**
 * رزروِ موجودی — «چند تا از این کالا قول داده شده و هنوز برداشته نشده».
 *
 * چرا لازم است: آخرین سه عدد روی قفسه است. فروشنده‌ی اول برای مشتری‌اش کار
 * برداشت می‌فرستد و کارگر راه می‌افتد. در همان دقیقه فروشنده‌ی دوم همان سه تا
 * را می‌فروشد و فاکتور می‌زند. کارگر برمی‌گردد و چیزی نیست — و سیستم هیچ‌کدام
 * را اشتباه نمی‌داند، چون کار برداشت عمداً به موجودی دست نمی‌زند.
 *
 * **محاسبه‌ای است، نه ستون.** یک عددِ ذخیره‌شده باید در هر مسیرِ ساخت، لغو،
 * انقضا و تبدیل نگه داشته شود؛ اولین مسیری که فراموش شود، عدد برای همیشه
 * منحرف می‌ماند و هیچ‌کس نمی‌فهمد. اینجا حجم کوچک است (ده‌ها سند، نه هزاران)
 * و درستی از سرعت مهم‌تر.
 *
 * **در سطح کالا، نه قفسه.** ردیفِ پیش‌فاکتور و قلمِ کار برداشت هر دو `locationId`
 * اختیاری دارند — هنگام قول‌دادن هنوز معلوم نیست از کدام قفسه برداشته می‌شود.
 * پس رزرو از جمعِ کلِ کالا کم می‌شود، نه از یک قفسه‌ی مشخص.
 */
@Injectable()
export class ReservationService {

  constructor(private prisma: PrismaService) {}

  /** رزروِ یک کالا. */
  async forProduct(productId: string): Promise<number> {
    const map = await this.forProducts([productId]);
    return map.get(productId) ?? 0;
  }

  /**
   * رزروِ چند کالا در یک رفت‌وبرگشت.
   *
   * سه منبع، و ترتیبشان مهم نیست چون هیچ‌کدام دیگری را نمی‌شمارد:
   *
   * ۱. **کار برداشت** — قلم‌هایی که هنوز تیک نخورده‌اند. قلمِ تیک‌خورده یعنی
   *    کارگر برداشته و دیگر روی قفسه نیست.
   * ۲. **پیش‌فاکتور** — فقط آن‌هایی که هنوز معتبرند و کارِ برداشتی برایشان
   *    ساخته نشده. اگر ساخته شده باشد همان جنس در منبع ۱ شمرده می‌شود و
   *    دوباره‌شماری یعنی موجودی الکی صفر نشان داده شود.
   * ۳. **سفارش سایت** — سفارشی که مغازه هنوز فاکتورش را نزده.
   */
  async forProducts(productIds: string[]): Promise<Map<string, number>> {
    const ids = [...new Set(productIds)].filter(Boolean);
    const out = new Map<string, number>();
    if (!ids.length) return out;

    const add = (productId: string, qty: number) => {
      if (qty > 0) out.set(productId, (out.get(productId) ?? 0) + qty);
    };

    const [pickItems, quotationLines, onlineLines] = await Promise.all([
      // ۱ — کارِ برداشتِ باز
      this.prisma.workTaskItem.groupBy({
        by: ['productId'],
        where: {
          productId: { in: ids },
          status: WorkTaskItemStatus.PENDING,
          task: {
            // چیدمان رزرو نیست: جنس دارد وارد می‌شود، نه خارج.
            kind: WorkTaskKind.PICK,
            status: {
              in: [WorkTaskStatus.PENDING, WorkTaskStatus.IN_PROGRESS],
            },
          },
        },
        _sum: { quantity: true },
      }),

      // ۲ — پیش‌فاکتورِ معتبرِ بدونِ کارِ برداشت
      this.prisma.quotationLine.groupBy({
        by: ['productId'],
        where: {
          productId: { in: ids },
          quotation: {
            status: QuotationStatus.ACTIVE,
            // منقضی‌شده جنس را قفل نمی‌کند. بدون این قید، بعد از چند ماه نیمی
            // از انبار روی کاغذ رزرو است و روی قفسه آزاد.
            validUntil: { gt: new Date() },
            convertedInvoiceId: null,
            workTasks: { none: {} },
          },
        },
        _sum: { quantity: true },
      }),

      // ۳ — سفارشِ سایتِ فاکتورنشده
      this.prisma.onlineOrderLine.groupBy({
        by: ['productId'],
        where: {
          productId: { in: ids },
          order: {
            stockAppliedAt: null,
            status: { notIn: [OnlineOrderStatus.CANCELLED] },
          },
        },
        _sum: { quantity: true },
      }),
    ]);

    for (const r of pickItems) add(r.productId, r._sum.quantity ?? 0);
    for (const r of quotationLines) add(r.productId, r._sum.quantity ?? 0);
    for (const r of onlineLines) add(r.productId, r._sum.quantity ?? 0);

    return out;
  }

  /**
   * تفکیکِ رزرو به منبع — برای وقتی فروشنده می‌پرسد «چرا نمی‌توانم بفروشم».
   *
   * بدون این، عددِ رزرو یک دیوارِ بی‌توضیح است و فروشنده یا بی‌خیال می‌شود یا
   * زنگ می‌زند به مدیر.
   */
  async explain(productId: string) {
    const now = new Date();

    const [tasks, quotations, orders] = await Promise.all([
      this.prisma.workTaskItem.findMany({
        where: {
          productId,
          status: WorkTaskItemStatus.PENDING,
          task: {
            kind: WorkTaskKind.PICK,
            status: { in: [WorkTaskStatus.PENDING, WorkTaskStatus.IN_PROGRESS] },
          },
        },
        select: {
          quantity: true,
          task: {
            select: {
              id: true,
              createdAt: true,
              invoice: { select: { number: true } },
              assignedTo: { select: { fullName: true } },
            },
          },
        },
      }),

      this.prisma.quotationLine.findMany({
        where: {
          productId,
          quotation: {
            status: QuotationStatus.ACTIVE,
            validUntil: { gt: now },
            convertedInvoiceId: null,
            workTasks: { none: {} },
          },
        },
        select: {
          quantity: true,
          quotation: {
            select: {
              id: true,
              number: true,
              validUntil: true,
              customer: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),

      this.prisma.onlineOrderLine.findMany({
        where: {
          productId,
          order: {
            stockAppliedAt: null,
            status: { notIn: [OnlineOrderStatus.CANCELLED] },
          },
        },
        select: { quantity: true, order: { select: { id: true, number: true } } },
      }),
    ]);

    return {
      pickTasks: tasks.map(t => ({
        taskId: t.task.id,
        quantity: t.quantity,
        invoiceNumber: t.task.invoice?.number ?? null,
        assignedTo: t.task.assignedTo?.fullName ?? null,
        createdAt: t.task.createdAt,
      })),
      quotations: quotations.map(q => ({
        quotationId: q.quotation.id,
        number: q.quotation.number,
        quantity: q.quantity,
        validUntil: q.quotation.validUntil,
        customer: q.quotation.customer
          ? `${q.quotation.customer.firstName} ${q.quotation.customer.lastName ?? ''}`.trim()
          : null,
      })),
      onlineOrders: orders.map(o => ({
        orderId: o.order.id,
        number: o.order.number,
        quantity: o.quantity,
      })),
    };
  }
}
