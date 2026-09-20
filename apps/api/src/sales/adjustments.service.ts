import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, PaymentMethod, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { lineBalances } from './line-balance';
import { lockInvoice } from './line-lock';
import { effectiveTotal, refundFor } from './return-pricing';
import { ReturnsService } from './returns.service';
import { CorrectionsService } from './corrections.service';
import { ReceiptsService } from './receipts.service';
import { LedgerService } from './ledger.service';

import { CreateAdjustDto } from './dto/create-adjust.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateCorrectionDto } from './dto/create-correction.dto';
import { CreateReceiptDto } from './dto/create-receipt.dto';

/**
 * عملیاتِ یکپارچه‌ی «ویرایش فاکتور پس از فروش» (adjust).
 *
 * یک درخواست، یک تراکنش، یک تصمیم: مرجوعی + قلمِ تازه + تصحیح تعداد/قیمت +
 * تسویه‌ی اختلاف، همه با هم ثبت می‌شوند یا هیچ‌کدام. سندهای حاصل همان دو سندِ
 * شناخته‌شده‌ی سیستم‌اند — `SaleReturn` و `SaleCorrection` — با `operationKey`
 * مشترک تا در UI به‌عنوان «یک عملیات» دیده و پیگیری شوند؛ مدل سومی ساخته
 * نمی‌شود که چاپ/لجر/فهرست‌ها را دوباره‌نویسی کند.
 *
 * تراکنشِ واحد (بدون هیچ تراکنشِ تودرتویی — همه‌ی زیرسرویس‌ها با متدهای
 * `*InTx` خودشان صدا زده می‌شوند):
 *
 *   ۱. بررسی idempotencyKey (کلیدهای فرزند روی سندها)
 *   ۲. قفلِ فاکتور (FOR UPDATE) — دو درخواستِ هم‌زمان روی یک فاکتور سریال می‌شوند
 *   ۳. بررسی وضعیت (فقط CONFIRMED / OPEN)
 *   ۴. خواندن ردیف‌های SALE + lineBalances روی همان snapshot
 *   ۵-۸. اعتبارسنجی returns/changes/additions (سقف، تعلق، تکرار، مکان)
 *   ۹-۱۳. محاسبه‌ی مبلغ مؤثر مرجوعی (از snapshotِ فاکتور)، اثر تغییرات و قلم‌های تازه
 *   ۱۴-۱۵. ثبت SaleReturn و SaleCorrection (+ ردیف‌ها)
 *   ۱۶. حرکات انبار فقط از InventoryOperationService (ترتیب ثابت قفل)
 *   ۱۷. تسویه‌ی اختلافِ خالص (CREDIT / رسید / نقدِ همان لحظه)
 *   ۱۸. به‌روزرسانی total/dueAmount طبق قوانینِ فعلیِ هر سند
 *   ۱۹. COMMIT — هر خطا = ROLLBACK کامل؛ partial success ممنوع
 *
 * همه‌ی مبالغ Int و به ریال — هیچ‌جا Float نیست.
 */
@Injectable()
export class AdjustmentsService {
  constructor(
    private prisma: PrismaService,
    private returns: ReturnsService,
    private corrections: CorrectionsService,
    private receipts: ReceiptsService,
    private ledger: LedgerService,
    private realtime: EventsGateway,
  ) {}

  // ---------- خواندن ----------

  /**
   * ردیف‌های قابلِ ویرایشِ یک فاکتور برای حالتِ یکپارچه — تلفیقِ returnable و
   * correctable: برای هر ردیف هم سقفِ برگشت (با قیمت مؤثر) هم «تعداد و قیمتِ
   * فعلی» برای تصحیح. یک خوراک برای کلِ فرمِ adjust، تا UI دو کوئری نزند و دو
   * عددِ متفاوت برای «مانده» نبیند.
   */
  async adjustableLines(invoiceId: string) {
    const invoice = await this.prisma.saleInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        number: true,
        status: true,
        subtotal: true,
        discount: true,
        total: true,
        paidAmount: true,
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

    const balances = await lineBalances(
      this.prisma,
      saleLines.map((l) => l.id),
      new Map(saleLines.map((l) => [l.id, l.quantity])),
    );

    const corrections = await this.prisma.saleCorrectionLine.findMany({
      where: { saleLogId: { in: saleLines.map((l) => l.id) } },
      orderBy: { createdAt: 'asc' },
      select: { saleLogId: true, newUnitPrice: true, isNewLine: true },
    });
    const lastPriceByLog = new Map<string, number>();
    for (const c of corrections) {
      // قلمِ تازه‌ای که با اصلاحیه اضافه شده، قیمتِ خودش را دارد — برای ردیفِ
      // اصلیِ موجود فقط آخرین قیمتِ تصحیح‌شده‌ی همان ردیف می‌خواهیم.
      if (!c.isNewLine) lastPriceByLog.set(c.saleLogId, c.newUnitPrice);
    }

    const lines = saleLines.map((l) => {
      const b = balances.get(l.id)!;
      const sold = b.sold;
      const alreadyReturned = b.returned;
      const returnable = b.outstanding;
      const effTotal = effectiveTotal(
        l.unitPrice ?? 0,
        l.lineDiscount ?? 0,
        sold,
        invoice.subtotal,
        invoice.discount,
      );
      const { unitRefund } = refundFor(effTotal, sold, sold);
      return {
        saleLogId: l.id,
        product: l.product,
        location: l.location,
        lineNote: l.lineNote,
        sold,
        alreadyReturned,
        correctedBy: b.correctionDelta,
        /** همان مانده — هم «قابل‌برگشت» است هم «تعداد فعلی» برای تصحیح. */
        returnable,
        oldQuantity: b.outstanding,
        oldUnitPrice: lastPriceByLog.get(l.id) ?? l.unitPrice ?? 0,
        /** قیمتِ مؤثرِ هر واحد برای برگشت (پس از سهمِ تخفیفِ فاکتور). */
        effectiveUnitPrice: unitRefund,
      };
    });

    const isOpen = invoice.status === InvoiceStatus.OPEN;

    /*
     * مانده‌ی کلِ مشتری — نوارِ پایینِ ویرایش با این عدد خالصِ حساب را نشان
     * می‌دهد، نه مانده‌ی رسمیِ فاکتور که برگشتی‌ها/اصلاحیه‌ها را نمی‌بیند.
     */
    const customerBalance = invoice.customerId
      ? await this.ledger.balance(invoice.customerId)
      : 0;

    /*
     * ماندهٔ دفتریِ همین فاکتور — SUMِ ردیف‌های دفترِ مشتریِ ساخته‌شده با این
     * فاکتور (فاکتور، مرجوعی‌ها، اصلاحیه‌ها). فیلدِ `total` با مرجوعی تازه
     * نمی‌شود و نمایشش فروشنده را گمراه می‌کند؛ این عدد با ماندهٔ کل هم‌خوان است.
     */
    const invoiceDue = await this.ledger.invoiceBalance(invoiceId);

    return {
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        /*
         * مبلغِ فاکتور، خودِ `total` است — مرجوعیِ اعتباری‌اش از قبل کم شده
         * (returns.service)، پس دیگر اینجا جمع‌کردنِ دوبارهٔ دلتا یعنی دو بار
         * کم‌شدنِ همان مرجوعی.
         */
        total: invoice.total,
        paidAmount: invoice.paidAmount,
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
      /** نهایی و حساب باز قابلِ ویرایش‌اند؛ باطل‌شده نه. */
      adjustable:
        invoice.status === InvoiceStatus.CONFIRMED ||
        invoice.status === InvoiceStatus.OPEN,
      isOpenAccount: isOpen,
      /** مانده‌ی واقعیِ کلِ مشتری — پایه‌ی اعدادِ نوارِ پایینِ ویرایش. */
      customerBalance,
      /** ماندهٔ دفتریِ همین فاکتور — حقیقتِ نمایشیِ «همین فاکتور» در نوار پایین. */
      invoiceDue,
    };
  }

  // ---------- ثبت ----------

  async adjust(
    invoiceId: string,
    dto: CreateAdjustDto,
    userId?: string,
    role?: Role,
  ) {
    /* دلیلِ عملیات اختیاری است — ویرایشِ فاکتور نباید به تایپِ دلیل گره بخورد. */
    const reason = dto.reason?.trim() ?? '';

    const returns = dto.returns ?? [];
    const changes = dto.changes ?? [];
    const additions = dto.additions ?? [];

    if (!returns.length && !changes.length && !additions.length) {
      throw new BadRequestException({
        error: 'EMPTY_ADJUST',
        message: 'عملیات باید دست‌کم یک مرجوعی، تغییر یا قلمِ تازه داشته باشد',
      });
    }

    if (returns.length + changes.length + additions.length > 500) {
      throw new BadRequestException({
        error: 'TOO_MANY_LINES',
        message: 'مجموع ردیف‌های عملیات از ۵۰۰ بیشتر است',
      });
    }

    /*
     * تکرارِ یک ردیف داخلِ هر فهرست ممنوع است؛ اما یک ردیف می‌تواند هم‌زمان
     * در returns و changes باشد: بخشی برمی‌گردد و قیمتِ مانده عوض می‌شود —
     * همان کاری که «ویرایشِ عادی» می‌کند (کم‌کردن تعداد و تغییرِ قیمت روی
     * یک قلم). اثرِ مالی دوبار حساب نمی‌شود، چون برگشت با قیمتِ مؤثرِ قبلی
     * و تصحیح فقط روی مانده‌ی پس از برگشت محاسبه می‌شود (پایین، در حلقه‌ی
     * changes). سندِ اصلاحیه هم بعد از ثبتِ برگشت باز می‌شود، پس مانده‌ای
     * که می‌بیند همان مانده‌ی پس از برگشت است و هیچ حرکتِ انباریِ اضافه
     * نمی‌سازد.
     */
    const seenReturns = new Set<string>();
    for (const l of returns) {
      if (seenReturns.has(l.saleLogId)) {
        throw new BadRequestException({
          error: 'DUPLICATE_LINE',
          saleLogId: l.saleLogId,
          message: 'یک ردیفِ فاکتور دو بار در مرجوعی‌ها آمده — ادغامش کنید',
        });
      }
      seenReturns.add(l.saleLogId);
    }
    const seenChanges = new Set<string>();
    for (const c of changes) {
      if (seenChanges.has(c.saleLogId)) {
        throw new BadRequestException({
          error: 'DUPLICATE_LINE',
          saleLogId: c.saleLogId,
          message: 'یک ردیفِ فاکتور دو بار در تصحیح‌ها آمده — ادغامش کنید',
        });
      }
      seenChanges.add(c.saleLogId);
    }

    // کلیدهای فرزند: هر سند کلیدِ خودش را دارد تا یکتاییِ دیتابیس در سطحِ سند
    // هم اجرا شود؛ operationKey (گروه‌بندی) خودِ کلیدِ اصلی است.
    const returnKey = `${dto.idempotencyKey}:return`;
    const correctionKey = `${dto.idempotencyKey}:correction`;
    const receiptKey = `${dto.idempotencyKey}:receipt`;

    // retry شبکه: اگر سندِ فرزندِ همین کلید از قبل هست، همان عملیات را برگردان —
    // دوباره هیچ‌چیز ثبت نمی‌شود.
    const existingReturn = await this.prisma.saleReturn.findUnique({
      where: { idempotencyKey: returnKey },
      select: { id: true, operationKey: true },
    });
    const existingCorrection = await this.prisma.saleCorrection.findUnique({
      where: { idempotencyKey: correctionKey },
      select: { id: true, operationKey: true },
    });
    if (existingReturn || existingCorrection) {
      return this.loadCombined(
        invoiceId,
        existingReturn?.operationKey ?? existingCorrection!.operationKey!,
      );
    }

    try {
      const operationKey = dto.idempotencyKey;

      const result = await this.prisma.$transaction(async (tx) => {
        const invoice = await lockInvoice(tx, invoiceId);
        if (!invoice) {
          throw new NotFoundException({
            error: 'INVOICE_NOT_FOUND',
            message: 'فاکتور پیدا نشد',
          });
        }

        if (
          invoice.status !== InvoiceStatus.CONFIRMED &&
          invoice.status !== InvoiceStatus.OPEN
        ) {
          throw new ConflictException({
            error: 'INVOICE_NOT_ADJUSTABLE',
            message: 'فاکتور باطل‌شده قابل اصلاح یا مرجوعی نیست',
          });
        }

        const hasCustomer = !!invoice.customerId;
        const saleLines = await tx.inventoryLog.findMany({
          where: { invoiceId: invoice.id, action: 'SALE' },
        });
        const saleById = new Map(saleLines.map((l) => [l.id, l]));

        const balances = await lineBalances(
          tx,
          saleLines.map((l) => l.id),
          new Map(saleLines.map((l) => [l.id, l.quantity])),
        );

        const prevCorrections = await tx.saleCorrectionLine.findMany({
          where: { saleLogId: { in: saleLines.map((l) => l.id) } },
          orderBy: { createdAt: 'asc' },
          select: { saleLogId: true, newUnitPrice: true, isNewLine: true },
        });
        const lastPriceByLog = new Map<string, number>();
        for (const c of prevCorrections) {
          if (!c.isNewLine) lastPriceByLog.set(c.saleLogId, c.newUnitPrice);
        }

        // ---- اعتبارسنجی + محاسبه‌ی مرجوعی (قیمت از snapshotِ فاکتور) ----
        let refundAmount = 0;
        for (const line of returns) {
          const sale = saleById.get(line.saleLogId);
          if (!sale) {
            throw new BadRequestException({
              error: 'LINE_NOT_IN_INVOICE',
              saleLogId: line.saleLogId,
              message: 'این ردیف متعلق به فاکتورِ انتخاب‌شده نیست',
            });
          }
          const bal = balances.get(sale.id)!;
          if (line.quantity > bal.outstanding) {
            throw new ConflictException({
              error: 'EXCESS_RETURN',
              saleLogId: sale.id,
              sold: bal.sold,
              alreadyReturned: bal.returned,
              returnable: bal.outstanding,
              requested: line.quantity,
              message: 'تعدادِ مرجوعی از تعدادِ قابل‌برگشت بیشتر است',
            });
          }
          const effTotal = effectiveTotal(
            sale.unitPrice ?? 0,
            sale.lineDiscount ?? 0,
            bal.sold,
            invoice.subtotal,
            invoice.discount,
          );
          const { lineRefund } = refundFor(effTotal, bal.sold, line.quantity);
          refundAmount += lineRefund;
        }

        // ---- محاسبه‌ی اثر تغییرات و قلم‌های تازه ----
        let changesAdjust = 0;
        const returnedNowByLog = new Map(
          returns.map((l) => [l.saleLogId, l.quantity] as const),
        );
        for (const c of changes) {
          const sale = saleById.get(c.saleLogId);
          if (!sale) {
            throw new BadRequestException({
              error: 'LINE_NOT_IN_INVOICE',
              saleLogId: c.saleLogId,
              message: 'این ردیف متعلق به فاکتورِ انتخاب‌شده نیست',
            });
          }
          const oldQty = balances.get(sale.id)!.outstanding;
          const oldPrice = lastPriceByLog.get(sale.id) ?? sale.unitPrice ?? 0;

          /*
           * ردیفی که هم برگشتی است هم قیمتش عوض شده: تصحیح فقط روی مانده‌ی
           * پس از برگشت معنا دارد. تعدادِ اصلاحیه باید دقیقاً همان مانده باشد
           * (وگرنه یعنی سمتِ UI تعداد را هم جابه‌جا کرده که مسیرِ درستش سندِ
           * برگشت است) و قیمتِ تازه هم باید واقعاً عوض شده باشد — وگرنه
           * اصلاحیه‌ی بی‌اثر می‌سازد که سندِ اصلاحیه آن را نمی‌پذیرد.
           */
          const returnedNow = returnedNowByLog.get(sale.id) ?? 0;
          if (returnedNow > 0) {
            const baseQty = oldQty - returnedNow;
            if (c.newQuantity !== baseQty) {
              throw new BadRequestException({
                error: 'COMBINED_LINE_QUANTITY',
                saleLogId: sale.id,
                expected: baseQty,
                message:
                  'تعدادِ این ردیف با برگشتش نمی‌خواند — تعداد را دست نزنید، فقط قیمت',
              });
            }
            if (c.newUnitPrice === oldPrice) {
              throw new BadRequestException({
                error: 'COMBINED_LINE_SAME_PRICE',
                saleLogId: sale.id,
                message: 'قیمتِ این ردیف عوض نشده — فقط برگشتش را ثبت کنید',
              });
            }
            changesAdjust +=
              c.newQuantity * c.newUnitPrice - baseQty * oldPrice;
          } else {
            changesAdjust += c.newQuantity * c.newUnitPrice - oldQty * oldPrice;
          }
        }

        const additionsTotal = additions.reduce(
          (sum, l) => sum + l.quantity * l.unitPrice,
          0,
        );

        // تعدیلِ دستیِ مدیر — چانه‌زنی/گرد‌کردنِ اختلاف سرِ پیشخوان.
        const manual = dto.manualAdjustment ?? 0;

        // اختلافِ نهایی: هرچه بیشتر شد (افزودن/گران‌شدن) منهای هرچه برگشت،
        // به‌علاوه‌ی تعدیلِ دستی.
        const net = changesAdjust + additionsTotal - refundAmount + manual;

        // ---- تصمیمِ تسویه ----
        const requestedMethod =
          dto.settlement?.method ??
          (hasCustomer ? PaymentMethod.CREDIT : PaymentMethod.CASH);

        if (
          dto.settlement?.amount != null &&
          dto.settlement.amount !== Math.abs(net)
        ) {
          throw new BadRequestException({
            error: 'SETTLEMENT_AMOUNT_MISMATCH',
            expected: Math.abs(net),
            message: 'مبلغِ تسویه با اختلافِ محاسبه‌شده نمی‌خواند',
          });
        }

        if (
          !hasCustomer &&
          (requestedMethod === PaymentMethod.CREDIT ||
            requestedMethod === PaymentMethod.CHEQUE)
        ) {
          throw new BadRequestException({
            error: 'CUSTOMER_REQUIRED_FOR_CREDIT',
            message:
              'فاکتورِ بدونِ مشتری فقط نقد/کارت می‌پذیرد — حسابی برای نسیه یا چک نیست',
          });
        }

        if (requestedMethod === PaymentMethod.CHEQUE && net <= 0) {
          throw new BadRequestException({
            error: 'CHEQUE_NOT_A_REFUND',
            message: 'چک فقط برای دریافتِ اختلافِ مثبت است، نه پرداختِ وجه',
          });
        }

        /*
         * روشِ ثبتِ سندِ مرجوعی بر اساسِ جای‌گیریِ اختلاف:
         *   • CREDIT / جمع‌آوری با رسید → مرجوعی «کسر از حساب» (CREDIT) تا اثرش
         *     در دفتر و dueAmount بنشیند.
         *   • پرداختِ نقدیِ همان لحظه (net<0 با CASH/CARD) → مرجوعی نقدی؛ پول از
         *     صندوق بیرون می‌رود و دفتر دست نمی‌خورد؛ طرفِ افزودن/تغییر هم به‌صورت
         *     ردیفِ پرداخت روی فاکتور می‌نشیند تا خالصِ صندوق دقیقاً همان اختلاف باشد.
         */
        let returnMethod: PaymentMethod;
        let settleAsCash = false;
        let receiptInput: CreateReceiptDto | null = null;

        if (!hasCustomer) {
          returnMethod = requestedMethod; // CASH | CARD
          settleAsCash = true;
        } else if (net === 0) {
          returnMethod = PaymentMethod.CREDIT;
        } else if (net > 0) {
          returnMethod = PaymentMethod.CREDIT;
          if (requestedMethod !== PaymentMethod.CREDIT) {
            // جمع‌آوریِ همان لحظه (نقد/کارت/چک) → رسید داخل همین تراکنش؛
            // مثل جریانِ فعلیِ «تسویه‌ی اصلاح»، ولی اتمیک.
            receiptInput = {
              customerId: invoice.customerId!,
              idempotencyKey: receiptKey,
              note:
                dto.note ??
                `تسویه‌ی عملیات فاکتور ${invoice.number}` +
                  (reason ? `: ${reason}` : ''),
              payments: [
                {
                  method: requestedMethod,
                  amount: net,
                  note: `اختلافِ عملیات ${operationKey}`,
                  ...(requestedMethod === PaymentMethod.CHEQUE
                    ? { cheque: dto.settlement!.cheque }
                    : {}),
                },
              ],
            };
          }
        } else {
          // net < 0 — به نفعِ مشتری.
          if (requestedMethod === PaymentMethod.CREDIT) {
            returnMethod = PaymentMethod.CREDIT; // بستانکاری در حساب
          } else {
            // نقدِ همان لحظه: پولِ مرجوعی از صندوق، طرفِ مقابل روی فاکتور.
            returnMethod = requestedMethod;
            settleAsCash = true;
          }
        }

        // ---- ثبتِ سندها و حرکات ----

        let returnId: string | null = null;
        let correctionId: string | null = null;

        if (returns.length) {
          const returnDto: CreateReturnDto = {
            idempotencyKey: returnKey,
            invoiceId: invoice.id,
            refundMethod: returnMethod,
            reason,
            note: dto.note,
            lines: returns,
          };
          const res = await this.returns.createReturnInTx(tx, returnDto, {
            userId,
            role,
            operationKey,
            // در عملیاتِ یکپارچه، فروشنده/مدیر خودش تصمیمِ نقدی‌بودن را گرفته.
            allowCashOnOpen: true,
          });
          returnId = res.returnId;
        }

        if (changes.length || additions.length || manual !== 0) {
          const correctionDto: CreateCorrectionDto = {
            idempotencyKey: correctionKey,
            invoiceId: invoice.id,
            reason,
            note: dto.note,
            lines: changes,
            addedLines: additions,
            manualAdjust: manual !== 0 ? manual : undefined,
            // وقتی تسویه نقدیِ همان لحظه است، ردیفِ پرداختِ اصلاحیه باید همان
            // روشِ انتخابی را داشته باشد (حتی روی فاکتورِ مشتری‌دار).
            settlementMethod: settleAsCash
              ? requestedMethod === PaymentMethod.CARD
                ? 'CARD'
                : 'CASH'
              : undefined,
          };
          const res = await this.corrections.createCorrectionInTx(
            tx,
            correctionDto,
            {
              userId,
              role,
              operationKey,
              settleAsCash,
            },
          );
          correctionId = res.correctionId;
        }

        // ---- تسویه‌ی نهایی (فقط جمع‌آوریِ همان لحظه) ----
        if (receiptInput) {
          await this.receipts.createReceiptInTx(tx, receiptInput, userId);
        }

        return {
          returnId,
          correctionId,
          net,
          refundAmount,
          changesAdjust,
          additionsTotal,
        };
      });

      // تراکنش commit شد → همان لحظه اعلان کن.
      this.realtime.broadcast({ type: 'return.created', invoiceId });
      this.realtime.broadcast({ type: 'correction.created', invoiceId });
      this.realtime.broadcast({ type: 'stock.changed' });
      if (result.net > 0 && dto.settlement?.method !== PaymentMethod.CREDIT) {
        this.realtime.broadcast({ type: 'receipt.created', customerId: null });
      }

      return this.loadCombined(invoiceId, operationKey);
    } catch (err: unknown) {
      // برخوردِ همزمان روی کلیدهای فرزند: عملیاتِ قبلی را برگردان.
      if ((err as { code?: string })?.code === 'P2002') {
        const ret = await this.prisma.saleReturn.findUnique({
          where: { idempotencyKey: returnKey },
          select: { operationKey: true },
        });
        const corr = await this.prisma.saleCorrection.findUnique({
          where: { idempotencyKey: correctionKey },
          select: { operationKey: true },
        });
        const key = ret?.operationKey ?? corr?.operationKey;
        if (key) return this.loadCombined(invoiceId, key);
      }
      throw err;
    }
  }

  // ---------- پاسخِ ترکیبی ----------

  /**
   * پاسخِ کاملِ یک عملیاتِ یکپارچه — هم برای ثبتِ تازه هم برای retry با همان
   * کلید. از سندهای commit‌شده ساخته می‌شود، پس عددِ ثبت‌شده و عددِ نمایشی
   * هیچ‌وقت فرق نمی‌کنند.
   */
  async loadCombined(invoiceId: string, operationKey: string) {
    const [ret, corr, receipt, invoice] = await Promise.all([
      this.prisma.saleReturn.findFirst({
        where: { operationKey },
        include: { lines: true },
      }),
      this.prisma.saleCorrection.findFirst({
        where: { operationKey },
        include: { lines: true },
      }),
      this.prisma.receipt.findUnique({
        where: { idempotencyKey: `${operationKey}:receipt` },
        include: { payments: { take: 1 } },
      }),
      this.prisma.saleInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          customer: true,
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
      }),
    ]);

    if (!invoice) {
      throw new NotFoundException({
        error: 'INVOICE_NOT_FOUND',
        message: 'فاکتور پیدا نشد',
      });
    }

    const refundAmount = ret?.refundAmount ?? 0;
    const amountAdjust = corr?.amountAdjust ?? 0;
    const additionsAmount =
      corr?.lines
        .filter((l) => l.isNewLine)
        .reduce((sum, l) => sum + l.lineAdjust, 0) ?? 0;
    const changesAdjust = amountAdjust - additionsAmount;
    const net = amountAdjust - refundAmount;

    const balances = await lineBalances(
      this.prisma,
      invoice.lines.map((l) => l.id),
      new Map(invoice.lines.map((l) => [l.id, l.quantity])),
    );

    const addedByLog = new Map<string, number>();
    const correctedPriceByLog = new Map<string, number>();
    for (const l of corr?.lines ?? []) {
      if (l.isNewLine) {
        addedByLog.set(
          l.saleLogId,
          (addedByLog.get(l.saleLogId) ?? 0) + l.newQuantity,
        );
      } else {
        correctedPriceByLog.set(l.saleLogId, l.newUnitPrice);
      }
    }

    const lines = invoice.lines.map((l) => {
      const b = balances.get(l.id)!;
      const isAdded = (addedByLog.get(l.id) ?? 0) > 0;
      const returned = b.returned;
      const outstanding = b.outstanding;

      let lineStatus: string;
      if (isAdded) lineStatus = 'ADDED_LATER';
      else if (returned > 0 && outstanding <= 0) lineStatus = 'RETURNED';
      else if (returned > 0) lineStatus = 'PARTIALLY_RETURNED';
      else lineStatus = 'ACTIVE';

      return {
        saleLogId: l.id,
        productId: l.productId,
        productName: l.product?.name ?? '—',
        unit: l.product?.unit ?? 'عدد',
        originalQuantity: isAdded ? 0 : b.sold,
        returnedQuantity: isAdded ? 0 : returned,
        addedQuantity: isAdded ? b.sold : 0,
        currentQuantity: outstanding,
        unitPrice: correctedPriceByLog.get(l.id) ?? l.unitPrice ?? 0,
        lineStatus,
      };
    });

    const direction = net > 0 ? 'COLLECT' : net < 0 ? 'PAY' : 'NONE';

    /*
     * روشِ تسویه از خودِ سندها: رسید (جمع‌آوریِ همان لحظه) روشِ سطرِ پرداختش را
     * می‌گوید؛ وگرنه روشِ مرجوعی — CREDIT یعنی روی حساب، CASH/CARD یعنی نقد.
     */
    let settlementMethod: PaymentMethod | null = null;
    if (net !== 0) {
      settlementMethod =
        receipt?.payments[0]?.method ??
        ret?.refundMethod ??
        (hasCustomerOf(invoice) ? PaymentMethod.CREDIT : PaymentMethod.CASH);
    }

    return {
      operationKey,
      returnId: ret?.id ?? null,
      correctionId: corr?.id ?? null,
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        totalBefore: invoice.total - amountAdjust,
        totalAfter: invoice.total,
        refundAmount,
        additionsAmount,
        changesAdjust,
        difference: net,
        paidAmount: invoice.paidAmount,
        dueAmount: invoice.dueAmount,
        customer: invoice.customer
          ? {
              id: invoice.customer.id,
              fullName: [invoice.customer.firstName, invoice.customer.lastName]
                .filter(Boolean)
                .join(' '),
            }
          : null,
      },
      lines,
      settlement: {
        direction,
        amount: Math.abs(net),
        method: settlementMethod,
      },
    };
  }
}

function hasCustomerOf(invoice: { customerId: string | null }): boolean {
  return !!invoice.customerId;
}
