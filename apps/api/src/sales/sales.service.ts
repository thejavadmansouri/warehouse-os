import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  Prisma,
  PaymentMethod,
  InvoiceStatus,
  LedgerEntryType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { SystemLocationsService } from '../inventory/system-locations.service';
import { normalizePersian } from '../engine/utils/persian-normalize';
import { normalizePhone } from '../common/phone.util';
import { INT4_MAX } from '../common/money';
import { computeChequeCharge, MAX_CHARGE_RATIO } from '../common/cheque-charge';
import { LedgerService } from './ledger.service';
import { EventsGateway } from '../realtime/events.gateway';

import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';


/** چیزی که در پاسخِ خطای کمبود موجودی برمی‌گردد تا کلاینت همان ردیف را قرمز کند. */
interface InsufficientStock {
  error:'INSUFFICIENT_STOCK';
  lineIndex:number;
  productId:string;
  locationId:string;
  requested:number;
  available:number;
  message:string;
}


@Injectable()
export class SalesService {

  constructor(
    private prisma: PrismaService,
    private operation: InventoryOperationService,
    private ledger: LedgerService,
    private systemLocations: SystemLocationsService,
    private realtime: EventsGateway,
  ) {}


  /**
   * سررسید بخش نسیه‌ی فاکتور.
   *
   * اولویت با چیزی است که فروشنده صراحتاً فرستاده؛ وگرنه از مهلت پیش‌فرضِ خودِ
   * مشتری ساخته می‌شود. این‌طور فروشنده در حالت عادی هیچ فیلدی پر نمی‌کند و
   * فقط وقتی برای این خرید فرق دارد دستش را می‌برد سمت تاریخ.
   */
  private async resolveDueDate(
    tx: Prisma.TransactionClient,
    customerId: string,
    explicit?: string | null,
  ): Promise<Date> {
    if (explicit) return new Date(explicit);

    const customer = await tx.customer.findUnique({
      where:{ id: customerId },
      select:{ creditDays: true },
    });

    const due = new Date();
    due.setDate(due.getDate() + (customer?.creditDays ?? 0));
    // پایان روزِ سررسید — وگرنه فاکتوری که ساعت ۱۰ صبح ثبت شده، ساعت ۹ صبحِ
    // روز سررسید «معوق» حساب می‌شود.
    due.setHours(23, 59, 59, 999);
    return due;
  }


  /**
   * ثبت فاکتور فروش چندردیفی.
   *
   * همه چیز در یک تراکنش انجام می‌شود: یا کل فاکتور ثبت می‌شود یا هیچ‌کدام از
   * ردیف‌ها از انبار کم نمی‌شود. کسر موجودی از طریق InventoryOperationService
   * انجام می‌شود (قانون ۱) و tx به آن پاس داده می‌شود تا ردیف‌ها تراکنش جدا
   * نگیرند.
   */
  async createInvoice(dto: CreateInvoiceDto, userId?: string) {

    // ---- بررسی‌های ارزان، پیش از باز کردن تراکنش ----

    const existing =
      await this.prisma.saleInvoice.findUnique({
        where:{ idempotencyKey: dto.idempotencyKey },
      });

    // ارسال دوباره‌ی همان کلید: فاکتور قبلی برگردانده می‌شود، دوباره ساخته نمی‌شود.
    if (existing) {
      return this.findOne(existing.id);
    }


    const warehouse =
      await this.prisma.warehouse.findUnique({
        where:{ id: dto.warehouseId },
      });

    if (!warehouse) {
      throw new NotFoundException({
        error:'WAREHOUSE_NOT_FOUND',
        message:'انبار پیدا نشد',
      });
    }


    /*
     * مکانِ هر ردیف باید در همین انبار باشد.
     *
     * قبلاً `locationId` مستقیم از کلاینت به تک‌نقطه‌ی تغییر موجودی می‌رفت و
     * آنجا هم بررسی نمی‌شد: فاکتوری برای انبار A می‌توانست موجودیِ قفسه‌ای در
     * انبار B را کم کند، و چون فروش با allowNegative اجرا می‌شود حتی خطا هم
     * نمی‌داد — قفسه‌ی انبارِ دیگر بی‌صدا منفی می‌شد.
     *
     * همین بررسی مکانِ ناموجود را هم می‌گیرد؛ قبلاً به خطای FK پستگرس و ۵۰۰
     * می‌رسید به‌جای یک پیام روشن.
     */
    const linesWithLoc = dto.lines
      .map((l, i) => ({ i, productId: l.productId, locationId: l.locationId }))
      .filter(
        (x): x is { i: number; productId: string; locationId: string } =>
          !!x.locationId,
      );

    if (linesWithLoc.length) {
      const locationIds = [...new Set(linesWithLoc.map(x => x.locationId))];
      const locs = await this.prisma.location.findMany({
        where:{ id:{ in: locationIds } },
        select:{ id:true, warehouseId:true, isActive:true },
      });
      const byId = new Map(locs.map(l => [l.id, l]));

      /*
       * تنها خطرِ واقعی که این بررسی باید بگیرد: قفسه‌ی *زنده‌ای* که به انبارِ
       * دیگری تعلق دارد. فاکتورِ این انبار نباید موجودیِ قفسه‌ی انبارِ دیگر را
       * کم کند — و چون فروش با allowNegative اجرا می‌شود، بی‌این بررسی حتی خطا
       * هم نمی‌داد.
       *
       * اما قفسه‌ی *غیرفعال/حذف‌شده* داستانش فرق دارد: حذفِ قفسه‌ی دارای موجودی
       * فقط غیرفعالش می‌کند (رکورد و warehouseId سرِ جایشان می‌مانند)، و جنس
       * رویش «بی‌صاحب» می‌شود. این جنس فیزیکاً در انبار هست و باید فروختنی
       * بماند؛ قبلاً همین‌جا با LOCATION_NOT_IN_WAREHOUSE رد می‌شد و فاکتور
       * اصلاً ثبت نمی‌شد. پس فقط قفسه‌ی «فعال و متعلق به انبارِ دیگر» را رد کن.
       */
      const foreign = linesWithLoc.find(x => {
        const loc = byId.get(x.locationId);
        return (
          loc &&
          loc.isActive &&
          loc.warehouseId != null &&
          loc.warehouseId !== dto.warehouseId
        );
      });
      if (foreign) {
        throw new BadRequestException({
          error:'LOCATION_NOT_IN_WAREHOUSE',
          lineIndex: foreign.i,
          locationId: foreign.locationId,
          message:'مکان انتخاب‌شده در این انبار نیست',
        });
      }

      /*
       * مکانی که اصلاً رکوردی ندارد فقط وقتی مجاز است که واقعاً موجودیِ همان
       * کالا رویش نشسته باشد — وگرنه upsertِ فروش می‌خواهد ردیفِ موجودی (و لاگ)
       * روی مکانِ ناموجود بسازد و به خطای کلید خارجی می‌خورد. عملاً به‌خاطر
       * قیدهای RESTRICT چنین چیزی نباید پیش بیاید، ولی این تور ایمنی «مکانِ
       * کاملاً ساختگی» را با پیام روشن می‌گیرد نه با ۵۰۰.
       */
      const missing = linesWithLoc.filter(x => !byId.has(x.locationId));
      if (missing.length) {
        const invRows = await this.prisma.inventory.findMany({
          where:{ OR: missing.map(x => ({ productId: x.productId, locationId: x.locationId })) },
          select:{ productId:true, locationId:true },
        });
        const hasInv = new Set(invRows.map(r => `${r.productId}::${r.locationId}`));
        const bogus = missing.find(x => !hasInv.has(`${x.productId}::${x.locationId}`));
        if (bogus) {
          throw new BadRequestException({
            error:'LOCATION_NOT_FOUND',
            lineIndex: bogus.i,
            locationId: bogus.locationId,
            message:'مکان انتخاب‌شده پیدا نشد',
          });
        }
      }
    }


    // یک کالا در یک مکان نباید دو ردیف جدا داشته باشد؛ وگرنه بررسی موجودی
    // ردیف‌به‌ردیف گمراه‌کننده می‌شود. کلاینت باید ادغام کند.
    const seen = new Set<string>();
    dto.lines.forEach((line, i) => {
      const key = `${line.productId}::${line.locationId}`;
      if (seen.has(key)) {
        throw new BadRequestException({
          error:'DUPLICATE_LINE',
          lineIndex:i,
          message:'یک کالا از یک مکان نباید دو ردیف جداگانه داشته باشد',
        });
      }
      seen.add(key);
    });


    // ---- مبالغ ----

    const subtotal =
      dto.lines.reduce(
        (sum, l) => sum + (l.quantity * l.unitPrice) - (l.discount ?? 0),
        0,
      );

    const discount = dto.discount ?? 0;

    if (discount > subtotal) {
      throw new BadRequestException({
        error:'DISCOUNT_EXCEEDS_TOTAL',
        message:'تخفیف از مبلغ فاکتور بیشتر است',
      });
    }

    // با سودِ چک بالاتر می‌رود — پایین‌تر، بعد از حسابِ سطرهای پرداخت.
    let total = subtotal - discount;

    // ستون‌های مبلغ از نوع Int هستند (INT4 پستگرس). اگر جلوی سرریز گرفته نشود،
    // Prisma با خطای خام می‌ترکد و مسیر فایل و متن کوئری به کلاینت درز می‌کند.
    // سقف ≈ ۲.۱ میلیارد ریال برای هر فاکتور.
    if (subtotal > INT4_MAX || total > INT4_MAX) {
      throw new BadRequestException({
        error:'AMOUNT_TOO_LARGE',
        max: INT4_MAX,
        message:'مبلغ فاکتور از حد مجاز بیشتر است',
      });
    }


    // ---- حساب باز (فاکتور جاری) ----
    const account = dto.accountId
      ? await this.prisma.openAccount.findUnique({ where: { id: dto.accountId } })
      : null;

    if (dto.accountId && !account) {
      throw new BadRequestException({
        error: 'OPEN_ACCOUNT_NOT_FOUND',
        message: 'حساب باز پیدا نشد',
      });
    }

    if (account && account.status !== 'OPEN') {
      throw new BadRequestException({
        error: 'OPEN_ACCOUNT_NOT_OPEN',
        message: 'این حساب باز تسویه شده است',
      });
    }

    if (account && dto.customerId && dto.customerId !== account.customerId) {
      throw new BadRequestException({
        error: 'OPEN_ACCOUNT_CUSTOMER_MISMATCH',
        message: 'مشتریِ فاکتور با مشتریِ حساب باز یکی نیست',
      });
    }

    /*
     * پیش‌فرض فروش نقدیِ گذری: اگر کلاینت اصلاً payments نفرستد، یعنی کل مبلغ
     * نقد دریافت شده. این حالت رایج‌ترین فروش سر پیشخوان است و نباید کاربر را
     * مجبور کند برای هر فاکتور ساده یک سطر پرداخت هم بفرستد.
     * برای ثبت نسیه باید صراحتاً payments با method=CREDIT فرستاده شود.
     *
     * روی حساب باز هیچ پرداختی ثبت نمی‌شود — مشتری جنس را می‌برد و پول در
     * تسویه می‌آید؛ پس کلِ مبلغ همان لحظه بدهیِ حساب می‌شود.
     */
    const payments =
      dto.accountId
        ? []
        : dto.payments && dto.payments.length > 0
          ? dto.payments
          : [
              {
                method: PaymentMethod.CASH,
                amount: total,
                note: null as string | null,
                cheque: undefined,
              },
            ];

    /*
     * ---- تفاوتِ فروشِ مدت‌دار (سودِ چک) ----
     *
     * قرارداد با کلاینت: `amount` هر سطر **پایه** است، یعنی چقدر از خودِ صورتحساب
     * را می‌پوشاند. سود جدا حساب می‌شود و مبلغی که روی کاغذِ چک نوشته می‌شود
     * پایه + سود است. پس:
     *
     *     total     = subtotal − discount + Σ سود
     *     مبلغِ چک   = پایه + سودِ همان چک
     *     paidAmount = Σ مبلغِ چک‌ها و نقدها  →  با total می‌خواند
     *
     * سود فقط وقتی حساب می‌شود که فروشنده صریحاً نرخ فرستاده باشد. هیچ پیش‌فرضی
     * از روی مشتری خوانده نمی‌شود — سودی که کسی انتخابش نکرده نباید روی فاکتور
     * بنشیند.
     */
    const priced = payments.map((p) => {
      const c = p.cheque;
      if (p.method !== PaymentMethod.CHEQUE || !c) {
        return { ...p, base: p.amount, charge: 0, rateBp: 0, months: 0 };
      }

      const rateBp = c.rateBp ?? 0;
      const months = c.months ?? 0;
      const computed = computeChequeCharge({
        base: p.amount,
        rateBp,
        months,
        mode: c.rateMode ?? 'MONTHLY',
      });

      // عددِ دستیِ فروشنده می‌چربد، ولی همان سقف رویش هست — نرخِ اشتباه‌تایپ‌شده
      // و عددِ اشتباه‌تایپ‌شده هر دو باید یک‌جا گرفته شوند.
      const charge = Math.min(
        c.charge ?? computed,
        p.amount * MAX_CHARGE_RATIO,
      );

      return { ...p, base: p.amount, charge, rateBp, months, amount: p.amount + charge };
    });

    const financeCharge = priced.reduce((sum, p) => sum + p.charge, 0);
    total += financeCharge;

    if (total > INT4_MAX) {
      throw new BadRequestException({
        error:'AMOUNT_TOO_LARGE',
        max: INT4_MAX,
        message:'مبلغ فاکتور با احتساب سود از حد مجاز بیشتر است',
      });
    }

    const paidAmount =
      priced
        .filter(p => p.method !== PaymentMethod.CREDIT)
        .reduce((sum, p) => sum + p.amount, 0);

    if (paidAmount > total) {
      throw new BadRequestException({
        error:'OVERPAYMENT',
        paidAmount,
        total,
        message:'مجموع پرداخت‌ها از مبلغ فاکتور بیشتر است',
      });
    }

    const dueAmount = total - paidAmount;


    // نسیه بدون مشتری قابل پیگیری نیست. حساب باز از خودِ حساب مشتری دارد.
    if (!dto.accountId && dueAmount > 0 && !dto.customerId && !dto.customer) {
      throw new BadRequestException({
        error:'CUSTOMER_REQUIRED_FOR_CREDIT',
        message:'برای فروش نسیه ثبت مشتری الزامی است',
      });
    }


    // چک باید جزئیات داشته باشد.
    payments.forEach((p, i) => {
      if (p.method === PaymentMethod.CHEQUE && !p.cheque) {
        throw new BadRequestException({
          error:'CHEQUE_DETAILS_REQUIRED',
          paymentIndex:i,
          message:'برای پرداخت چکی، مشخصات چک الزامی است',
        });
      }
    });


    // ---- سود: از قیمت خرید در همین لحظه ----
    // اگر قیمت خرید حتی یک ردیف موجود نباشد، سود کل null می‌ماند؛ عدد نصفه
    // بدتر از نبودِ عدد است.
    const profit = await this.calculateProfit(dto);


    // ---- تراکنش ----

    try {

      const invoiceId = await this.prisma.$transaction(async (tx) => {

        // روی حساب باز مشتری از خودِ حساب می‌آید — ساختِ مشتریِ inline معنا ندارد.
        const customerId = dto.accountId
          ? account!.customerId
          : await this.resolveCustomer(tx, dto);

        /*
         * سررسید فقط برای بخش نسیه معنا دارد. مهلت پیش‌فرض روی خود مشتری نشسته
         * تا فروشنده مجبور نباشد هر بار انتخابش کند؛ اگر صراحتاً چیزی فرستاده
         * شده باشد، همان می‌چربد.
         *
         * روی حساب باز هم سررسید همین‌جا تعیین می‌شود، نه در تسویه.
         *
         * قبلاً null می‌ماند و سررسید در لحظه‌ی تسویه ساخته می‌شد. حالا که هر
         * فروشِ بدونِ پرداخت روی تب می‌نشیند، آن یعنی بدهیِ مشتری تا وقتی
         * حسابش را نبندی هیچ‌وقت «معوق» نمی‌شود — کافی بود کسی تبش را باز نگه
         * دارد تا برای همیشه از گزارشِ معوقات بیرون بماند. ساعت باید از لحظه‌ی
         * بردنِ جنس شروع شود.
         */
        const dueDate =
          dueAmount > 0 && customerId
            ? await this.resolveDueDate(tx, customerId, dto.dueDate)
            : null;

        const invoice = await tx.saleInvoice.create({
          data:{
            idempotencyKey: dto.idempotencyKey,
            warehouseId: dto.warehouseId,
            customerId,
            userId: userId ?? null,
            subtotal,
            discount,
            financeCharge,
            total,
            paidAmount,
            dueAmount,
            dueDate,
            profit,
            note: dto.note ?? null,
            // روی حساب باز فاکتور OPEN (جاری) ثبت می‌شود؛ در تسویه نهایی می‌شود.
            status: dto.accountId ? InvoiceStatus.OPEN : InvoiceStatus.CONFIRMED,
            accountId: dto.accountId ?? null,
          },
        });


        /*
         * بدهی همین‌جا وارد دفتر می‌شود، در همان تراکنشِ فاکتور.
         *
         * اگر بیرون از تراکنش بود، یک خطای وسط راه فاکتوری می‌ساخت که در حساب
         * مشتری اثری ندارد — دقیقاً همان ناهماهنگیِ عددی که دفتر برای جلوگیری
         * از آن ساخته شده.
         */
        if (dueAmount > 0 && customerId) {
          await this.ledger.record(tx, {
            customerId,
            type: LedgerEntryType.INVOICE,
            amount: dueAmount,
            invoiceId: invoice.id,
            userId: userId ?? null,
            note: dto.accountId
              ? `فاکتور ${invoice.number} (حساب باز)`
              : `فاکتور ${invoice.number}`,
          });
        }


        // ردیفی که مکان ندارد یعنی کالای هنوز ثبت‌نشده؛ روی مکان سیستمیِ انبار
        // می‌نشیند. یک بار حساب می‌شود تا برای هر ردیف کوئری تکراری نزنیم.
        const needsFallback = dto.lines.some(l => !l.locationId);
        const fallbackLocationId = needsFallback
          ? await this.systemLocations.unregisteredStock(tx, dto.warehouseId)
          : null;

        // هر ردیف از مسیر تک‌نقطه‌ی تغییر موجودی رد می‌شود (قانون ۱).
        // tx پاس داده می‌شود تا همه‌ی ردیف‌ها در یک تراکنش بمانند.
        for (let i = 0; i < dto.lines.length; i++) {
          const line = dto.lines[i];
          const locationId = line.locationId ?? fallbackLocationId!;
          try {
            await this.operation.execute(
              {
                type:'SALE',
                productId: line.productId,
                locationId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineDiscount: line.discount ?? null,
                // فروش هیچ‌وقت به‌خاطر عددِ سیستم متوقف نمی‌شود — جنس در انبار
                // هست، فقط هنوز ثبت نشده. منفی‌شدن خودش گزارش می‌دهد.
                allowNegative: true,
                invoiceId: invoice.id,
                userId: userId ?? null,
                source:'POS',
              },
              tx,
            );
          } catch (err:any) {
            // خطای موجودی را با شماره‌ی ردیف غنی کن تا کلاینت بداند کجا را
            // قرمز کند. بقیه‌ی خطاها دست‌نخورده بالا می‌روند.
            const body = err?.response ?? err?.getResponse?.();
            if (body?.error === 'INSUFFICIENT_STOCK') {
              const detail: InsufficientStock = {
                error:'INSUFFICIENT_STOCK',
                lineIndex:i,
                productId: line.productId,
                locationId,
                requested: line.quantity,
                available: body.available ?? 0,
                message:'موجودی این کالا در این مکان کافی نیست',
              };
              throw new ConflictException(detail);
            }
            throw err;
          }
        }


        // قیمتی که فروشنده زده، قیمت همان کالا در سیستم می‌شود.
        await this.learnPricesFromSale(tx, dto);


        // `priced` نه `payments`: مبلغِ چک اینجا پایه + سود است، یعنی همان عددی
        // که روی کاغذ نوشته می‌شود و بانک پاس می‌کند.
        for (const p of priced) {
          const payment = await tx.payment.create({
            data:{
              invoiceId: invoice.id,
              method: p.method,
              amount: p.amount,
              note: p.note ?? null,
            },
          });

          if (p.method === PaymentMethod.CHEQUE && p.cheque) {
            await tx.cheque.create({
              data:{
                paymentId: payment.id,
                number: p.cheque.number,
                bankName: p.cheque.bankName ?? null,
                branch: p.cheque.branch ?? null,
                holderName: p.cheque.holderName ?? null,
                dueDate: new Date(p.cheque.dueDate),
                // تفکیکِ سود از پایه — تا گزارشِ سود بتواند جدایشان کند.
                charge: p.charge,
                rateBp: p.rateBp,
                months: p.months,
              },
            });
          }
        }

        return invoice.id;
      });

      // تراکنش commit شد → همان لحظه اعلان کن. فروش هم موجودی را کم کرده، پس
      // stock.changed هم می‌فرستیم تا لیست موجودی/گزارش‌ها هم زنده شوند.
      this.realtime.broadcast({
        type: 'sale.created',
        invoiceId,
        warehouseId: dto.warehouseId,
        customerId: dto.customerId ?? null,
      });
      this.realtime.broadcast({ type: 'stock.changed', warehouseId: dto.warehouseId });

      return this.findOne(invoiceId);

    } catch (err:any) {
      // برخورد همزمان روی همان idempotencyKey: فاکتور موجود برگردانده شود.
      if (err?.code === 'P2002') {
        const dup =
          await this.prisma.saleInvoice.findUnique({
            where:{ idempotencyKey: dto.idempotencyKey },
          });
        if (dup) return this.findOne(dup.id);
      }
      throw err;
    }
  }


  /**
   * ابطال فاکتور.
   *
   * ردیف‌های لجر هرگز حذف نمی‌شوند. برای هر ردیف یک حرکت RETURN جبرانی ثبت
   * می‌شود که موجودی را به همان مکان برمی‌گرداند، و وضعیت فاکتور CANCELLED
   * می‌شود. لجر append-only می‌ماند (قانون ۲).
   */
  async cancelInvoice(id: string, reason: string, userId?: string) {

    await this.prisma.$transaction(async (tx) => {

      // ادعای اتمیک: فقط یک درخواست موفق می‌شود، حتی اگر دو نفر همزمان بزنند.
      const claimed = await tx.saleInvoice.updateMany({
        where:{ id, status: InvoiceStatus.CONFIRMED },
        data:{
          status: InvoiceStatus.CANCELLED,
          cancelReason: reason,
          cancelledAt: new Date(),
          cancelledById: userId ?? null,
        },
      });

      if (claimed.count === 0) {
        const current =
          await tx.saleInvoice.findUnique({ where:{ id } });

        if (!current) {
          throw new NotFoundException({
            error:'INVOICE_NOT_FOUND',
            message:'فاکتور پیدا نشد',
          });
        }

        throw new ConflictException({
          error:'ALREADY_CANCELLED',
          message:'این فاکتور قبلاً باطل شده است',
        });
      }


      /*
       * بدهیِ فاکتورِ باطل‌شده باید برگردد.
       *
       * قبلاً این‌جا فقط موجودی برمی‌گشت و `dueAmount` دست‌نخورده می‌ماند: ابطال
       * یک فاکتور نسیه، بدهی مشتری را سرِ جایش نگه می‌داشت و «بدهکاران» تا ابد
       * عددِ غلط نشان می‌داد.
       */
      const cancelled = await tx.saleInvoice.findUniqueOrThrow({
        where:{ id },
        select:{ number:true, customerId:true, dueAmount:true },
      });

      if (cancelled.customerId && cancelled.dueAmount > 0) {
        await this.ledger.record(tx, {
          customerId: cancelled.customerId,
          type: LedgerEntryType.INVOICE_CANCELLED,
          amount: -cancelled.dueAmount,
          invoiceId: id,
          userId: userId ?? null,
          note:`ابطال فاکتور ${cancelled.number}: ${reason}`,
        });

        await tx.saleInvoice.update({
          where:{ id },
          data:{ dueAmount: 0 },
        });
      }


      const lines = await tx.inventoryLog.findMany({
        where:{ invoiceId: id, action:'SALE' },
      });

      /*
       * اگر بخشی از این فاکتور قبلاً مرجوعیِ سالم خورده، همان مقدار قبلاً به
       * موجودی برگشته است. ابطال باید فقط باقی‌ماندهٔ واقعاً بیرون‌مانده را
       * برگرداند، وگرنه موجودیِ آن کالا دوبار زیاد می‌شود. اقلامِ معیوب
       * (restock=false) اصلاً حرکت انبار نداشته‌اند، پس اینجا هم برنمی‌گردند.
       */
      const restocked = await tx.saleReturnLine.groupBy({
        by:['saleLogId'],
        where:{ saleLogId:{ in: lines.map(l => l.id) }, restock: true },
        _sum:{ quantity: true },
      });
      const restockedQty = new Map(
        restocked.map(r => [r.saleLogId, r._sum.quantity ?? 0]),
      );

      for (const line of lines) {
        const remaining = line.quantity - (restockedQty.get(line.id) ?? 0);
        if (remaining <= 0) continue;

        await this.operation.execute(
          {
            type:'RETURN',
            productId: line.productId,
            locationId: line.locationId,
            quantity: remaining,
            invoiceId: id,
            userId: userId ?? null,
            source:'SALE_CANCEL',
            note:`ابطال فاکتور: ${reason}`,
          },
          tx,
        );
      }
    });

    // تراکنشِ ابطال commit شد → اعلانِ زنده. ابطال موجودی را هم برگردانده.
    this.realtime.broadcast({ type: 'sale.canceled', invoiceId: id });
    this.realtime.broadcast({ type: 'stock.changed' });

    return this.findOne(id);
  }


  async findOne(id: string) {

    const invoice = await this.prisma.saleInvoice.findUnique({
      where:{ id },
      include:{
        customer:true,
        warehouse:{ select:{ id:true, name:true, code:true } },
        user:{ select:{ id:true, fullName:true, username:true } },
        payments:{ include:{ cheque:true } },
        // فقط ردیف‌های فروش. حرکت‌های RETURNِ ابطال/مرجوعی هم invoiceId همین
        // فاکتور را دارند؛ بدون این فیلتر، «ردیف‌های فاکتور» با ردیف‌های برگشتی
        // قاطی می‌شد و جمعِ نمایشی با مبلغِ فاکتور نمی‌خواند.
        lines:{
          where:{ action:'SALE' },
          include:{
            product:{ select:{ id:true, name:true, sku:true, unit:true } },
            location:{ select:{ id:true, name:true, code:true, path:true } },
          },
          orderBy:{ createdAt:'asc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({
        error:'INVOICE_NOT_FOUND',
        message:'فاکتور پیدا نشد',
      });
    }

    return { ...invoice, customer: withFullName(invoice.customer) };
  }


  async findAll(q: QueryInvoicesDto) {

    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;

    const where: Prisma.SaleInvoiceWhereInput = {};

    if (q.warehouseId) where.warehouseId = q.warehouseId;
    if (q.customerId) where.customerId = q.customerId;
    if (q.userId) where.userId = q.userId;
    // «مانده‌دار» یعنی هنوز پولش کامل نیامده — پایه‌ی پیگیریِ وصول.
    if (q.hasDue === 'true') where.dueAmount = { gt: 0 };
    else if (q.hasDue === 'false') where.dueAmount = { lte: 0 };
    // `RETURNED` وضعیتِ واقعیِ مدل نیست؛ یعنی «دستِ‌کم یک مرجوعی خورده». بقیه
    // وضعیت‌ها مستقیم روی status می‌نشینند.
    if (q.status === 'RETURNED') where.returns = { some: {} };
    else if (q.status) where.status = q.status as InvoiceStatus;

    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }

    if (q.q) {
      const asNumber = Number(q.q);
      // اگر ورودی رقمی ندارد، شرطِ شماره حذف شود؛ وگرنه contains:'' همه را
      // برمی‌گرداند و جست‌وجوی اسم بی‌اثر می‌شود.
      const digits = normalizePersian(q.q).replace(/\D/g, '');
      where.OR = [
        { customer:{ searchName:{ contains: normalizePersian(q.q) } } },
        { customer:{ lastName:{ contains:q.q, mode:'insensitive' } } },
        ...(digits
          ? [{ customer:{ phones:{ some:{ phone:{ contains: digits } } } } }]
          : []),
        ...(Number.isInteger(asNumber) ? [{ number: asNumber }] : []),
      ];
    }

    /*
     * ردیف‌های فاکتور فقط وقتی خواسته شود می‌آیند (کاردکس مشتری) — فهرستِ
     * معمولی سبک می‌ماند و همان الگوی findOne است: فقط حرکت‌های SALE، تا
     * ردیف‌های برگشتیِ ابطال/مرجوعی با اقلام واقعی قاطی نشوند.
     */
    const includeLines = q.includeLines === 'true';

    const [data, total] = await this.prisma.$transaction([
      this.prisma.saleInvoice.findMany({
        where,
        include:{
          customer:{
            select:{
              id:true, firstName:true, lastName:true,
              phones:{ where:{ isPrimary:true }, take:1 },
            },
          },
          user:{ select:{ id:true, fullName:true } },
          // فقط ردیف‌های فروش شمرده می‌شوند. رابطه‌ی `lines` همه‌ی لاگ‌های این
          // فاکتور است، پس بدون این فیلتر حرکت‌های RETURNِ ابطال و مرجوعی هم
          // شمرده می‌شدند و ستون «تعداد اقلام» بعد از هر برگشتی متورم می‌شد.
          // `returns` در همین کوئری شمرده می‌شود تا لیست بدون N+1 بداند کدام
          // فاکتور مرجوعی خورده (نشانِ «مرجوعی دارد» + تبِ «مرجوع‌شده»).
          _count:{ select:{ lines:{ where:{ action:'SALE' } }, returns:true } },
          ...(includeLines
            ? {
                lines:{
                  where:{ action:'SALE' },
                  include:{
                    product:{ select:{ id:true, name:true, sku:true, unit:true } },
                    location:{ select:{ id:true, name:true, code:true, path:true } },
                  },
                },
              }
            : {}),
        },
        orderBy:{ createdAt:'desc' },
        skip:(page - 1) * pageSize,
        take:pageSize,
      }),
      this.prisma.saleInvoice.count({ where }),
    ]);

    return {
      data: data.map(inv => ({
        ...inv,
        customer: withFullName(inv.customer),
        hasReturns: inv._count.returns > 0,
      })),
      meta:{ total, page, pageSize, pageCount: Math.ceil(total / pageSize) },
    };
  }


  // ---------- کمکی‌ها ----------



  /**
   * سود = مجموع (قیمت فروش - آخرین قیمت خرید) × تعداد.
   * اگر قیمت خرید حتی یک کالا موجود نباشد null برمی‌گردد.
   */
  /**
   * قیمتی که فروشنده سرِ فروش زده را به‌عنوان قیمت کالا ثبت می‌کند.
   *
   * کاتالوگ ۳۳ هزار کالا دارد و تقریباً هیچ‌کدام قیمت ندارند؛ قیمت‌ها در ذهن
   * فروشنده‌اند و موقع فروش تایپ می‌شوند. بدون این، همان عدد بعد از ثبت فاکتور
   * دود می‌شد و دفعه‌ی بعد خانه دوباره خالی باز می‌شد.
   *
   * قیمت قبلی بازنویسی نمی‌شود: ProductPrice تاریخچه‌ای است و ردیف تازه اضافه
   * می‌شود، پس اگر عددی اشتباه وارد شود سابقه‌اش هست و برگشت‌پذیر است.
   *
   * ⚠️ آخرین قیمتِ فروخته‌شده برنده است. تخفیفِ چانه‌زنی باید در فیلد تخفیف
   * وارد شود، نه با کم‌کردن قیمت واحد — وگرنه آن عدد قیمت رسمی کالا می‌شود.
   */
  private async learnPricesFromSale(
    tx: Prisma.TransactionClient,
    dto: CreateInvoiceDto,
  ) {
    // قیمت صفر یعنی «هنوز وارد نشده»، نه «مجانی» — یاد گرفته نمی‌شود.
    const priced = dto.lines.filter(l => l.unitPrice > 0);
    if (!priced.length) return;

    // آخرین قیمتِ هر کالا در همین فاکتور؛ اگر یک کالا دو ردیف داشت، دومی برنده است.
    const wanted = new Map<string, number>();
    for (const l of priced) wanted.set(l.productId, l.unitPrice);

    const current = await tx.productPrice.findMany({
      where:{ productId:{ in: [...wanted.keys()] } },
      orderBy:{ createdAt:'desc' },
    });

    const latest = new Map<string, { salePrice: number | null; purchasePrice: number | null; wholesalePrice: number | null }>();
    for (const p of current) {
      if (!latest.has(p.productId)) {
        latest.set(p.productId, {
          salePrice: p.salePrice,
          purchasePrice: p.purchasePrice,
          wholesalePrice: p.wholesalePrice,
        });
      }
    }

    const rows = [...wanted.entries()]
      // قیمتی که عوض نشده ردیف تازه نمی‌سازد، وگرنه تاریخچه با هر فروش شلوغ می‌شود.
      .filter(([productId, salePrice]) => latest.get(productId)?.salePrice !== salePrice)
      .map(([productId, salePrice]) => ({
        productId,
        salePrice,
        // قیمت خرید و عمده دست‌نخورده منتقل می‌شوند؛ فروشنده آن‌ها را نزده است.
        purchasePrice: latest.get(productId)?.purchasePrice ?? null,
        wholesalePrice: latest.get(productId)?.wholesalePrice ?? null,
      }));

    if (rows.length) await tx.productPrice.createMany({ data: rows });
  }


  private async calculateProfit(dto: CreateInvoiceDto): Promise<number | null> {

    const productIds = [...new Set(dto.lines.map(l => l.productId))];

    const prices = await this.prisma.productPrice.findMany({
      where:{ productId:{ in: productIds }, purchasePrice:{ not: null } },
      orderBy:{ createdAt:'desc' },
    });

    const latest = new Map<string, number>();
    for (const p of prices) {
      if (!latest.has(p.productId) && p.purchasePrice != null) {
        latest.set(p.productId, p.purchasePrice);
      }
    }

    if (productIds.some(id => !latest.has(id))) return null;

    const lineProfit = dto.lines.reduce((sum, l) => {
      const purchase = latest.get(l.productId)!;
      return sum + ((l.unitPrice - purchase) * l.quantity) - (l.discount ?? 0);
    }, 0);

    const profit = lineProfit - (dto.discount ?? 0);

    // اگر سود در ستون Int جا نشود، null بماند. سود عددی اطلاعاتی است؛
    // نباید کل فروش را زمین بزند. (معمولاً نشانه‌ی قیمت خرید غلط است.)
    if (profit > INT4_MAX || profit < -INT4_MAX) return null;

    return profit;
  }


  private async resolveCustomer(
    tx: Prisma.TransactionClient,
    dto: CreateInvoiceDto,
  ): Promise<string | null> {

    if (dto.customerId) {
      const found = await tx.customer.findUnique({
        where:{ id: dto.customerId },
      });
      if (!found) {
        throw new NotFoundException({
          error:'CUSTOMER_NOT_FOUND',
          message:'مشتری پیدا نشد',
        });
      }
      return found.id;
    }

    if (dto.customer) {

      const firstName = dto.customer.firstName?.trim();

      if (!firstName) {
        throw new BadRequestException({
          error:'NAME_REQUIRED',
          message:'نام مشتری الزامی است',
        });
      }

      // شماره نرمال می‌شود تا «۰۹۱۲…» و «+98912…» و «0912-…» یک مشتری بمانند.
      const phone = normalizePhone(dto.customer.phone);

      // اگر همین شماره از قبل ثبت شده، همان مشتری استفاده شود.
      if (phone) {
        const existing = await tx.customerPhone.findUnique({
          where:{ phone },
          select:{ customerId:true },
        });
        if (existing) return existing.customerId;
      }

      // بدون شماره روی نام ادغام نمی‌کنیم: دو «محمد رضایی» ممکن است دو نفر
      // باشند. تشخیص «همان مشتری» کار فروشنده است، نه حدسِ سرور.
      const created = await tx.customer.create({
        data:{
          firstName,
          lastName: dto.customer.lastName?.trim() || null,
          searchName: normalizePersian(
            `${firstName} ${dto.customer.lastName ?? ''}`,
          ).trim(),
          ...(phone
            ? { phones:{ create:{ phone, isPrimary:true } } }
            : {}),
        },
      });

      return created.id;
    }

    return null;
  }
}

/**
 * `fullName` ستون دیتابیس نیست؛ از firstName/lastName ساخته می‌شود.
 *
 * سرویس مشتری‌ها این کار را می‌کرد ولی سرویس فروش نه، پس هر جایی که فاکتور
 * برمی‌گشت نامِ مشتری undefined بود و کلاینت روی «مشتری نقدی» می‌افتاد — از
 * جمله روی فاکتورِ چاپی که دست مشتری می‌رسد.
 */
function withFullName<T extends { firstName: string; lastName?: string | null } | null>(
  customer: T,
): T extends null ? null : T & { fullName: string } {
  if (!customer) return null as never;
  return {
    ...customer,
    fullName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
  } as never;
}
