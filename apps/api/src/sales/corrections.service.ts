import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, InvoiceStatus, LedgerEntryType, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { SystemLocationsService } from '../inventory/system-locations.service';
import { LedgerService } from './ledger.service';
import { inLockOrder } from '../common/lock-order';
import { EventsGateway } from '../realtime/events.gateway';

import { CreateCorrectionDto } from './dto/create-correction.dto';
import { lineBalances } from './line-balance';


/**
 * اصلاحیه‌ی فاکتور — تصحیحِ قیمت/تعدادِ یک فاکتورِ نهایی با سندِ جدا.
 *
 * سه اصل (همان مرجوعی):
 * ۱. به فاکتور و ردیفِ SALE قفل است؛ «از چه به چه» همیشه از سرور می‌آید، نه از کلاینت.
 * ۲. فاکتور اصلی دست نمی‌خورد؛ اصلاحیه سندِ مستقل است و دفتر/موجودی فقط جبران می‌شود.
 * ۳. دلیل اجباری است — سندِ بدون دلیل، سند نیست.
 */
@Injectable()
export class CorrectionsService {

  constructor(
    private prisma: PrismaService,
    private operation: InventoryOperationService,
    private systemLocations: SystemLocationsService,
    private ledger: LedgerService,
    private realtime: EventsGateway,
  ) {}


  /**
   * ردیف‌های قابلِ اصلاحِ یک فاکتور — خوراکِ فرمِ اصلاحیه.
   *
   * «وضعیتِ فعلی» هر ردیف = فروشِ اصلی + اثرِ اصلاحیه‌های قبلی روی همان ردیف،
   * تا فرم «قبلی → جدید» را نشان دهد نه «نسخه‌ی کهنه».
   */
  async correctableLines(invoiceId: string) {
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
        accountId: true,
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

    // مانده‌ی هر ردیف — چراییِ سه‌جزئی‌بودنش در line-balance.ts نوشته شده.
    const balances = await lineBalances(
      this.prisma,
      saleLines.map((l) => l.id),
      new Map(saleLines.map((l) => [l.id, l.quantity])),
    );

    // آخرین اصلاحیه روی هر ردیف — برای «قیمتِ فعلی» (در صورت گران‌کردن).
    const corrections = await this.prisma.saleCorrectionLine.findMany({
      where: { saleLogId: { in: saleLines.map((l) => l.id) } },
      orderBy: { createdAt: 'asc' },
      select: { saleLogId: true, newUnitPrice: true },
    });
    const lastPriceByLog = new Map<string, number>();
    for (const c of corrections) {
      lastPriceByLog.set(c.saleLogId, c.newUnitPrice);
    }

    const lines = saleLines.map((l) => {
      const b = balances.get(l.id)!;
      const currentPrice = lastPriceByLog.get(l.id) ?? l.unitPrice ?? 0;
      return {
        saleLogId: l.id,
        product: l.product,
        location: l.location,
        lineNote: l.lineNote,
        // آنچه فروشنده می‌بیند و ویرایش می‌کند = آنچه واقعاً دستِ مشتری است.
        oldQuantity: b.outstanding,
        oldUnitPrice: currentPrice,
        sold: b.sold,
        correctedBy: b.correctionDelta,
      };
    });

    // فاکتورِ جاریِ حساب باز (OPEN) هم اصلاحیه می‌خورد — با همین سازوکار، چون
    // بدهیِ حساب از همان لحظه‌ی بردنِ جنس در دفتر نشسته و تغییرِ تعداد/قیمت باید
    // همان‌جا جبران شود، نه اینکه تا تسویه معلق بماند.
    const isOpen = invoice.status === InvoiceStatus.OPEN;

    return {
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        total: invoice.total,
        dueAmount: invoice.dueAmount,
        accountId: invoice.accountId,
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
      /** فاکتورِ نهایی و فاکتورِ جاریِ حساب باز؛ فقط باطل‌شده اصلاحیه نمی‌خورد. */
      correctable: invoice.status === InvoiceStatus.CONFIRMED || isOpen,
      isOpenAccount: isOpen,
    };
  }


  async createCorrection(dto: CreateCorrectionDto, userId?: string, role?: Role) {

    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        error: 'REASON_REQUIRED',
        message: 'برای اصلاحیه، ذکر دلیل الزامی است',
      });
    }

    if (dto.idempotencyKey) {
      const existing = await this.prisma.saleCorrection.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return this.findOne(existing.id);
    }

    if (!dto.lines.length && !dto.addedLines?.length) {
      throw new BadRequestException({
        error: 'EMPTY_CORRECTION',
        message: 'اصلاحیه باید دست‌کم یک ردیف داشته باشد',
      });
    }

    const seen = new Set<string>();
    for (const line of dto.lines) {
      if (seen.has(line.saleLogId)) {
        throw new BadRequestException({
          error: 'DUPLICATE_LINE',
          saleLogId: line.saleLogId,
          message: 'یک ردیفِ فاکتور دو بار در اصلاحیه آمده — ادغامش کنید',
        });
      }
      seen.add(line.saleLogId);
    }

    try {

      const correctionId = await this.prisma.$transaction(async (tx) => {

        const invoice = await tx.saleInvoice.findUnique({
          where: { id: dto.invoiceId },
          select: {
            id: true,
            number: true,
            status: true,
            subtotal: true,
            discount: true,
            total: true,
            paidAmount: true,
            customerId: true,
            warehouseId: true,
            dueAmount: true,
            accountId: true,
          },
        });

        if (!invoice) {
          throw new NotFoundException({
            error: 'INVOICE_NOT_FOUND',
            message: 'فاکتور پیدا نشد',
          });
        }

        /*
         * فاکتورِ نهایی و فاکتورِ جاریِ حساب باز هر دو اصلاحیه می‌خورند؛ فقط
         * باطل‌شده نه — موجودی‌اش قبلاً کامل برگشته و بدهی‌اش صفر شده.
         *
         * قبلاً حساب باز اینجا رد می‌شد با این توضیح که «تا تسویه مستقیم اصلاح
         * می‌شود» — ولی هیچ مسیرِ ویرایشِ مستقیمی وجود نداشت، پس عملاً تنها راهِ
         * کم‌کردنِ یک قلم، تسویه‌ی زودهنگامِ کلِ حساب بود.
         */
        if (
          invoice.status !== InvoiceStatus.CONFIRMED &&
          invoice.status !== InvoiceStatus.OPEN
        ) {
          throw new ConflictException({
            error: 'INVOICE_NOT_CORRECTABLE',
            message: 'فاکتور باطل‌شده قابل اصلاح نیست',
          });
        }

        /*
         * صندوق‌دار (SALES) فقط فاکتورِ جاریِ حساب باز را اصلاح می‌کند — آنجا
         * تغییرِ تعداد/قیمت فقط بدهیِ همان مشتری را جابه‌جا می‌کند و پولی ردوبدل
         * نشده. اصلاحِ فاکتورِ نهایی (که ممکن است پرداخت‌شده باشد) دستِ مدیر است.
         */
        if (role === Role.SALES && invoice.status !== InvoiceStatus.OPEN) {
          throw new ForbiddenException({
            error: 'CORRECTION_REQUIRES_MANAGER',
            message: 'اصلاحیه‌ی فاکتورِ نهایی را فقط مدیر ثبت می‌کند',
          });
        }

        // ردیف‌های SALEِ همین فاکتور — منبعِ کالا، مکان، و قیمتِ اصلی.
        const saleLines = await tx.inventoryLog.findMany({
          where: { invoiceId: invoice.id, action: 'SALE' },
        });
        const saleById = new Map(saleLines.map((l) => [l.id, l]));

        // اثرِ اصلاحیه‌های قبلی روی هر ردیف (تعداد فعلی و آخرین قیمتِ تصحیح‌شده)،
        // تا «از چه» یعنی وضعیتِ واقعیِ الان، نه نسخه‌ی کهنه.
        // همان تعریفِ واحدِ مانده که مسیرِ خواندن هم از آن می‌خواند.
        const balances = await lineBalances(
          tx,
          saleLines.map((l) => l.id),
          new Map(saleLines.map((l) => [l.id, l.quantity])),
        );

        const prevCorrections = await tx.saleCorrectionLine.findMany({
          where: { saleLogId: { in: saleLines.map((l) => l.id) } },
          orderBy: { createdAt: 'asc' },
          select: { saleLogId: true, newUnitPrice: true },
        });
        const lastPriceByLog = new Map<string, number>();
        for (const c of prevCorrections) {
          lastPriceByLog.set(c.saleLogId, c.newUnitPrice);
        }

        let amountAdjust = 0;
        const lineData: {
          saleLogId: string;
          productId: string;
          locationId: string;
          oldQuantity: number;
          newQuantity: number;
          oldUnitPrice: number;
          newUnitPrice: number;
          lineAdjust: number;
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

          /*
           * «از چه» همان مانده است، نه فروشِ اصلی.
           *
           * قبلاً مرجوعی‌های ثبت‌شده کسر نمی‌شدند و یک نگهبانِ جداگانه
           * (`CORRECTION_BELOW_RETURNED`) جلوی بدترین حالت را می‌گرفت. آن
           * نگهبان حالا لازم نیست: وقتی مبنا خودِ مانده باشد، صفر یعنی «همه‌ی
           * باقی‌مانده برگشت» و بیش از این هم ممکن نیست.
           */
          const oldQty = balances.get(sale.id)!.outstanding;

          const oldPrice = lastPriceByLog.get(sale.id) ?? sale.unitPrice ?? 0;
          const lineAdjust = line.newQuantity * line.newUnitPrice - oldQty * oldPrice;

          if (lineAdjust === 0 && line.newQuantity === oldQty && line.newUnitPrice === oldPrice) {
            throw new BadRequestException({
              error: 'NO_CHANGE',
              saleLogId: sale.id,
              message: 'این ردیف تغییری نکرده — چیزی برای اصلاح ندارد',
            });
          }

          amountAdjust += lineAdjust;

          lineData.push({
            saleLogId: sale.id,
            productId: sale.productId,
            locationId: sale.locationId,
            oldQuantity: oldQty,
            newQuantity: line.newQuantity,
            oldUnitPrice: oldPrice,
            newUnitPrice: line.newUnitPrice,
            lineAdjust,
          });
        }

        /*
         * قلم‌های تازه پیش از ساختِ سند حساب می‌شوند چون `amountAdjust` روی
         * خودِ رکوردِ اصلاحیه می‌نشیند و بعداً بازنویسی‌اش یعنی یک لحظه سندِ
         * نادرست در پایگاه داده.
         */
        const added = dto.addedLines ?? [];
        const addedAdjust = added.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
        amountAdjust += addedAdjust;

        // قلمِ تازه حتی با قیمت صفر یک تغییرِ واقعی است (جنس از انبار رفته).
        if (amountAdjust === 0 && !added.length) {
          throw new BadRequestException({
            error: 'NO_AMOUNT_CHANGE',
            message: 'مجموعِ تغییرات صفر است — اصلاحیه‌ای ثبت نمی‌شود',
          });
        }

        const correction = await tx.saleCorrection.create({
          data: {
            idempotencyKey: dto.idempotencyKey ?? null,
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            warehouseId: invoice.warehouseId,
            userId: userId ?? null,
            amountAdjust,
            reason,
            note: dto.note ?? null,
          },
        });

        await tx.saleCorrectionLine.createMany({
          data: lineData.map((l) => ({ ...l, correctionId: correction.id })),
        });

        // ----- جبران موجودی: تعداد زیاد شد → کسر بیشتر؛ کم شد → برگشت. -----
        // به ترتیبِ ثابتِ قفل‌گیری، مثل خودِ فاکتور.
        for (const l of inLockOrder(lineData)) {
          const diff = l.newQuantity - l.oldQuantity;
          if (diff === 0) continue;

          await this.operation.execute(
            {
              // مثل فروشِ اصلی، در دوره‌ی راه‌اندازی جنس ثبت‌نشده اجازه‌ی منفی دارد.
              type: diff > 0 ? 'SALE' : 'RETURN',
              productId: l.productId,
              locationId: l.locationId,
              quantity: Math.abs(diff),
              unitPrice: l.newUnitPrice,
              invoiceId: invoice.id,
              correctionId: correction.id,
              userId: userId ?? null,
              allowNegative: diff > 0,
              source: 'SALE_CORRECTION',
              note: `اصلاحیه ${correction.number} — فاکتور ${invoice.number}`,
            },
            tx,
          );
        }

        /*
         * ----- قلم‌های تازه -----
         *
         * هر قلم دو چیز می‌سازد: یک لاگِ SALE که از این به بعد **جزو خودِ
         * فاکتور** است (چون `invoiceId` می‌خورد، پس دفعه‌ی بعد در فهرستِ
         * قابل‌اصلاح می‌آید)، و یک ردیفِ اصلاحیه‌ی ۰←N که علامتِ isNewLine
         * دارد تا در جمعِ دلتاها دوباره شمرده نشود.
         *
         * موجودیِ منفی مجاز است، دقیقاً مثل خودِ فروش.
         *
         * قبلاً اینجا بسته بود و نتیجه‌اش این شد که یک کالا از صفحه‌ی فروش
         * فروختنی بود ولی همان کالا به فاکتورِ در حالِ ویرایش اضافه نمی‌شد و
         * خطای «موجودی کافی نیست (−۱)» می‌داد. عددِ منفی در این سیستم یعنی
         * «جنس در انبار هست، هنوز ثبت نشده» — نه «نداریم».
         */
        if (added.length) {
          const needsFallback = added.some((l) => !l.locationId);
          const fallbackLocationId = needsFallback
            ? await this.systemLocations.unregisteredStock(tx, invoice.warehouseId)
            : null;

          const orderedAdds = inLockOrder(
            added.map((line) => ({
              line,
              productId: line.productId,
              locationId: line.locationId ?? fallbackLocationId!,
            })),
          );

          for (const { line, productId, locationId } of orderedAdds) {
            const res = await this.operation.execute(
              {
                type: 'SALE',
                productId,
                locationId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                invoiceId: invoice.id,
                correctionId: correction.id,
                userId: userId ?? null,
                allowNegative: true,
                source: 'SALE_CORRECTION',
                note: `اصلاحیه ${correction.number} — قلم تازه در فاکتور ${invoice.number}`,
              },
              tx,
            );

            const saleLogId: string | undefined = res?.inventoryLogId;
            if (!saleLogId) {
              // بدون این شناسه، ردیفِ اصلاحیه به هیچ لاگی قفل نمی‌شود و کلِ
              // حسابِ «تعدادِ فعلی» می‌لنگد. بهتر است تراکنش برگردد.
              throw new BadRequestException({
                error: 'ADD_LINE_FAILED',
                productId,
                message: 'ثبت قلم تازه ناموفق بود',
              });
            }

            await tx.saleCorrectionLine.create({
              data: {
                correctionId: correction.id,
                saleLogId,
                productId,
                locationId,
                oldQuantity: 0,
                newQuantity: line.quantity,
                oldUnitPrice: 0,
                newUnitPrice: line.unitPrice,
                lineAdjust: line.quantity * line.unitPrice,
                isNewLine: true,
              },
            });
          }
        }

        /*
         * ----- اثرِ مالی -----
         *
         * مبلغِ خودِ فاکتور همیشه جابه‌جا می‌شود، چه مشتری داشته باشد چه نه.
         * پیش از این فقط دفترِ مشتری به‌روز می‌شد و `total` فاکتور دست‌نخورده
         * می‌ماند؛ نتیجه‌اش این بود که فاکتورِ نقدیِ گذری بعد از اصلاح هیچ ردِ
         * مالی نداشت — انبار درست کم می‌شد ولی هیچ‌جا ثبت نمی‌شد که پولِ
         * بیشتری گرفته شده، و صندوق با سیستم اختلاف پیدا می‌کرد.
         */
        if (amountAdjust !== 0) {
          const newSubtotal = invoice.subtotal + amountAdjust;
          const newTotal = invoice.total + amountAdjust;

          if (invoice.customerId) {
            // دارای مشتری ⇒ اختلاف در دفترش می‌نشیند و مانده‌ی فاکتور هم همان‌قدر.
            await this.ledger.record(tx, {
              customerId: invoice.customerId,
              type: LedgerEntryType.CORRECTION,
              amount: amountAdjust,
              invoiceId: invoice.id,
              correctionId: correction.id,
              userId: userId ?? null,
              note: `اصلاحیه ${correction.number} — فاکتور ${invoice.number}: ${reason}`,
            });

            await tx.saleInvoice.update({
              where: { id: invoice.id },
              data: {
                subtotal: newSubtotal,
                total: newTotal,
                // منفی نمی‌شود: اضافه‌پرداخت در دفترِ مشتری بستانکار می‌ماند.
                dueAmount: Math.max(0, invoice.dueAmount + amountAdjust),
              },
            });
          } else {
            /*
             * نقدیِ گذری ⇒ دفتری در کار نیست و پول همان لحظه ردوبدل می‌شود.
             * اختلاف به‌عنوان یک پرداختِ روی همین فاکتور ثبت می‌شود؛ منفی
             * یعنی وجه به مشتری برگشته. این‌طور `total − paidAmount` سرِ جای
             * خودش صفر می‌ماند و صندوق با فاکتور می‌خواند.
             */
            const method = dto.settlementMethod ?? 'CASH';
            await tx.payment.create({
              data: {
                invoiceId: invoice.id,
                method,
                amount: amountAdjust,
                note:
                  amountAdjust > 0
                    ? `اصلاحیه ${correction.number} — دریافت اختلاف`
                    : `اصلاحیه ${correction.number} — برگشت اختلاف`,
              },
            });

            await tx.saleInvoice.update({
              where: { id: invoice.id },
              data: {
                subtotal: newSubtotal,
                total: newTotal,
                paidAmount: invoice.paidAmount + amountAdjust,
                dueAmount: Math.max(0, newTotal - (invoice.paidAmount + amountAdjust)),
              },
            });
          }
        }

        return correction.id;
      });

      this.realtime.broadcast({ type: 'correction.created', invoiceId: dto.invoiceId });
      this.realtime.broadcast({ type: 'stock.changed' });

      return this.findOne(correctionId);

    } catch (err: any) {
      if (err?.code === 'P2002') {
        const dup = dto.idempotencyKey
          ? await this.prisma.saleCorrection.findUnique({
              where: { idempotencyKey: dto.idempotencyKey },
            })
          : null;
        if (dup) return this.findOne(dup.id);
      }
      throw err;
    }
  }


  /**
   * عوض‌کردنِ توضیحِ ردیف‌های یک فاکتور.
   *
   * عمداً از اصلاحیه جداست و سندی نمی‌سازد: توضیح یک **متن** است، نه عدد.
   * نه موجودی را تکان می‌دهد نه دفتر را، و ساختنِ سندِ مالی با اثرِ صفر برای
   * تغییرِ «رنگ مشکی» به «رنگ سفید» هم بی‌معناست هم از خودِ اصلاحیه رد
   * می‌شود (اثرِ صفر پذیرفته نمی‌شود).
   *
   * همان قاعده‌ی دسترسیِ اصلاحیه: صندوق‌دار فقط روی فاکتورِ جاریِ حساب باز.
   */
  async updateLineNotes(
    invoiceId: string,
    notes: { saleLogId: string; lineNote: string | null }[],
    role?: Role,
  ) {
    const invoice = await this.prisma.saleInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true },
    });

    if (!invoice) {
      throw new NotFoundException({
        error: 'INVOICE_NOT_FOUND',
        message: 'فاکتور پیدا نشد',
      });
    }

    if (role === Role.SALES && invoice.status !== InvoiceStatus.OPEN) {
      throw new ForbiddenException({
        error: 'CORRECTION_REQUIRES_MANAGER',
        message: 'تغییرِ فاکتورِ نهایی را فقط مدیر ثبت می‌کند',
      });
    }

    /*
     * `invoiceId` در شرط می‌ماند حتی با اینکه شناسه‌ی ردیف یکتاست: بدون آن،
     * یک شناسه‌ی حدس‌زده‌شده می‌توانست ردیفِ فاکتورِ دیگری را عوض کند.
     */
    await this.prisma.$transaction(
      notes.map((n) =>
        this.prisma.inventoryLog.updateMany({
          where: { id: n.saleLogId, invoiceId: invoice.id, action: 'SALE' },
          data: { lineNote: n.lineNote?.trim() || null },
        }),
      ),
    );

    this.realtime.broadcast({ type: 'correction.created', invoiceId: invoice.id });
    return { updated: notes.length };
  }


  async findOne(id: string) {
    const ret = await this.prisma.saleCorrection.findUnique({
      where: { id },
      include: {
        invoice: { select: { id: true, number: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
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
        error: 'CORRECTION_NOT_FOUND',
        message: 'اصلاحیه پیدا نشد',
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

    const where: Prisma.SaleCorrectionWhereInput = {};
    if (q.warehouseId) where.warehouseId = q.warehouseId;
    if (q.customerId) where.customerId = q.customerId;
    if (q.invoiceId) where.invoiceId = q.invoiceId;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.saleCorrection.findMany({
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
      this.prisma.saleCorrection.count({ where }),
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
      meta: { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}