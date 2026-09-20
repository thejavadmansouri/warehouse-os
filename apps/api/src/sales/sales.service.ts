import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  Prisma,
  Role,
  PaymentMethod,
  InvoiceStatus,
  LedgerEntryType,
  FixedAccount,
  VoucherSourceType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { SystemLocationsService } from '../inventory/system-locations.service';
import { PostingService, VoucherLineInput } from '../vouchers/posting.service';
import { normalizePersian } from '../engine/utils/persian-normalize';
import { normalizePhone } from '../common/phone.util';
import { INT4_MAX } from '../common/money';
import { computeChequeCharge, MAX_CHARGE_RATIO } from '../common/cheque-charge';
import { inLockOrder } from '../common/lock-order';
import { LedgerService } from './ledger.service';
import { lineBalances } from './line-balance';
import { effectiveTotal, refundFor } from './return-pricing';
import {
  firstWithoutInventory,
  inventoryKey,
  locationsWithoutRecord,
  saleLineRefs,
} from './sale-locations';
import { EventsGateway } from '../realtime/events.gateway';
import { ReturnsService } from './returns.service';

import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { CreateNetSaleDto } from './dto/create-net-sale.dto';

/** چیزی که در پاسخِ خطای کمبود موجودی برمی‌گردد تا کلاینت همان ردیف را قرمز کند. */
interface InsufficientStock {
  error: 'INSUFFICIENT_STOCK';
  lineIndex: number;
  productId: string;
  locationId: string;
  requested: number;
  available: number;
  message: string;
}

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private operation: InventoryOperationService,
    private ledger: LedgerService,
    private systemLocations: SystemLocationsService,
    private realtime: EventsGateway,
    private posting: PostingService,
    private returns: ReturnsService,
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
      where: { id: customerId },
      select: { creditDays: true },
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
  /**
   * ثبت فاکتور فروش چندردیفی.
   *
   * @param txClient وقتی داده شود، کلِ فاکتور داخل همان تراکنشِ بیرونی ساخته
   *   می‌شود (سبدِ خالص = فروش + مرجوعی در یک تراکنش). در این حالت این متد
   *   اعلانِ realtime نمی‌فرستد، `findOne` نمی‌کند و فقط `invoice.id` برمی‌گرداند؛
   *   تکراریِ کلید هم بی‌صدا بلعیده نمی‌شود بلکه بالا می‌آید تا مالکِ تراکنش
   *   کل را برگرداند.
   */
  /** بدونِ tx (مسیرهایِ عادی): فاکتورِ کامل برمی‌گردد — همان شکلِ findOne. */
  async createInvoice(
    dto: CreateInvoiceDto,
    userId?: string,
  ): Promise<Awaited<ReturnType<SalesService['findOne']>>>;

  /** داخلِ تراکنشِ بیرونی (سبدِ خالص): فقط `invoice.id` برمی‌گردد. */
  async createInvoice(
    dto: CreateInvoiceDto,
    userId: string | undefined,
    txClient: Prisma.TransactionClient,
  ): Promise<string>;

  async createInvoice(
    dto: CreateInvoiceDto,
    userId?: string,
    txClient?: Prisma.TransactionClient,
  ): Promise<any> {
    // ---- بررسی‌های ارزان، پیش از باز کردن تراکنش ----

    /*
     * کلیدِ یکتا اجباری است.
     *
     * بدون آن `findUnique` زیر با `undefined` صدا زده می‌شود و Prisma یک خطای
     * خامِ Validation می‌اندازد — یعنی کاربر ۵۰۰ می‌گیرد به‌جای پیامِ روشن. مهم‌تر
     * از زشتیِ خطا: فاکتوری که کلید ندارد هیچ محافظی در برابرِ ارسالِ دوباره
     * ندارد، و همان بازه‌ی Double Sale است که این کلید برای بستنش ساخته شده.
     */
    if (typeof dto.idempotencyKey !== 'string' || !dto.idempotencyKey.trim()) {
      throw new BadRequestException({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'کلید یکتای فاکتور الزامی است',
      });
    }

    /*
     * تعدادِ اعشاری همین‌جا رد می‌شود تا خطا `lineIndex` داشته باشد و صندوق
     * بداند کدام سطر را قرمز کند. گاردِ اصلی در تک‌نقطه‌ی تغییر موجودی است؛
     * این یکی فقط پیام را دقیق‌تر می‌کند.
     */
    dto.lines.forEach((line, i) => {
      if (!Number.isInteger(line.quantity)) {
        throw new BadRequestException({
          error: 'INVALID_QUANTITY',
          lineIndex: i,
          quantity: line.quantity,
          message: 'تعداد باید عدد صحیح باشد',
        });
      }

      const lineGross = line.quantity * line.unitPrice;
      if ((line.discount ?? 0) > lineGross) {
        throw new BadRequestException({
          error: 'LINE_DISCOUNT_EXCEEDS_TOTAL',
          lineIndex: i,
          discount: line.discount ?? 0,
          lineTotal: lineGross,
          message: 'تخفیفِ ردیف از مبلغِ همان ردیف بیشتر است',
        });
      }
    });

    const existing = await this.prisma.saleInvoice.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });

    if (txClient && existing) {
      // در تراکنشِ سبدِ خالص، تکراریِ کلید نباید به شکلِ Invoice کامل
      // برگردد؛ مالکِ تراکنش باید خطا را ببیند تا کلِ مرجوعی‌ها rollback شوند.
      throw new Error('NET_SALE_DUPLICATE');
    }

    // ارسال دوباره‌ی همان کلید در مسیرهای عادی: فاکتور قبلی برگردانده می‌شود.
    if (existing) {
      return this.findOne(existing.id);
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });

    if (!warehouse) {
      throw new NotFoundException({
        error: 'WAREHOUSE_NOT_FOUND',
        message: 'انبار پیدا نشد',
      });
    }

    /*
     * مکانِ هر ردیف بررسی می‌شود — ولی **انبارِ فاکتور قیدِ مکان نیست**.
     *
     * قلمِ فاکتور می‌تواند از قفسه‌ی انبارِ دیگر بیاید: انبارها پشتِ یک پیشخوان‌اند
     * و یک خرید = یک فاکتور، حتی اگر اقلامش از دو قفسه‌ی دو انبار بیایند. صندوق
     * هم قفسه را خودکار از پرموجودی‌ترین مکان برمی‌دارد، پس قاعده‌ی قبلی بیشتر
     * وقت‌ها بی‌آنکه فروشنده کاری کند فاکتور را رد می‌کرد.
     *
     * تا شهریور همین‌جا یک بررسیِ «قفسه‌ی فعالِ انبارِ دیگر ممنوع» با خطای
     * LOCATION_NOT_IN_WAREHOUSE بود. دلیلش این بود که `locationId` مستقیم از
     * کلاینت می‌رفت و چون فروش با allowNegative اجرا می‌شود، فاکتورِ انبار A
     * می‌توانست موجودیِ قفسه‌ای در انبار B را بی‌صدا منفی کند.
     *
     * امروز منبعِ حقیقت، قفسه‌ی همان ردیف است: هر ردیف یک InventoryLog با
     * locationId خودش است، پس موجودیِ درست کم می‌شود و مرجوعی هم به همان قفسه
     * برمی‌گردد (returns.service.ts). سیاست و دلیلش در `sale-locations.ts` باز
     * شده است.
     */
    const refs = saleLineRefs(dto.lines);

    if (refs.length) {
      const locs = await this.prisma.location.findMany({
        where: { id: { in: [...new Set(refs.map((x) => x.locationId))] } },
        select: { id: true },
      });
      const known = new Set(locs.map((l) => l.id));

      /*
       * مکانی که اصلاً رکوردی ندارد فقط وقتی مجاز است که واقعاً موجودیِ همان
       * کالا رویش نشسته باشد — وگرنه upsertِ فروش می‌خواهد ردیفِ موجودی (و لاگ)
       * روی مکانِ ناموجود بسازد و به خطای کلید خارجی می‌خورد. عملاً به‌خاطر
       * قیدهای RESTRICT چنین چیزی نباید پیش بیاید، ولی این تور ایمنی «مکانِ
       * کاملاً ساختگی» را با پیام روشن می‌گیرد نه با ۵۰۰.
       */
      const missing = locationsWithoutRecord(refs, known);
      if (missing.length) {
        const invRows = await this.prisma.inventory.findMany({
          where: {
            OR: missing.map((x) => ({
              productId: x.productId,
              locationId: x.locationId,
            })),
          },
          select: { productId: true, locationId: true },
        });
        const hasInv = new Set(
          invRows.map((r) => inventoryKey(r.productId, r.locationId)),
        );
        const bogus = firstWithoutInventory(missing, hasInv);
        if (bogus) {
          throw new BadRequestException({
            error: 'LOCATION_NOT_FOUND',
            lineIndex: bogus.index,
            locationId: bogus.locationId,
            message: 'مکان انتخاب‌شده پیدا نشد',
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
          error: 'DUPLICATE_LINE',
          lineIndex: i,
          message: 'یک کالا از یک مکان نباید دو ردیف جداگانه داشته باشد',
        });
      }
      seen.add(key);
    });

    // ---- مبالغ ----

    const subtotal = dto.lines.reduce(
      (sum, l) => sum + l.quantity * l.unitPrice - (l.discount ?? 0),
      0,
    );

    const discount = dto.discount ?? 0;

    if (discount > subtotal) {
      throw new BadRequestException({
        error: 'DISCOUNT_EXCEEDS_TOTAL',
        message: 'تخفیف از مبلغ فاکتور بیشتر است',
      });
    }

    // با سودِ چک بالاتر می‌رود — پایین‌تر، بعد از حسابِ سطرهای پرداخت.
    let total = subtotal - discount;

    // ستون‌های مبلغ از نوع Int هستند (INT4 پستگرس). اگر جلوی سرریز گرفته نشود،
    // Prisma با خطای خام می‌ترکد و مسیر فایل و متن کوئری به کلاینت درز می‌کند.
    // سقف ≈ ۲.۱ میلیارد ریال برای هر فاکتور.
    if (subtotal > INT4_MAX || total > INT4_MAX) {
      throw new BadRequestException({
        error: 'AMOUNT_TOO_LARGE',
        max: INT4_MAX,
        message: 'مبلغ فاکتور از حد مجاز بیشتر است',
      });
    }

    // ---- حساب باز (فاکتور جاری) ----
    const account = dto.accountId
      ? await this.prisma.openAccount.findUnique({
          where: { id: dto.accountId },
        })
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
    const payments = dto.accountId
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

      return {
        ...p,
        base: p.amount,
        charge,
        rateBp,
        months,
        amount: p.amount + charge,
      };
    });

    const financeCharge = priced.reduce((sum, p) => sum + p.charge, 0);
    total += financeCharge;

    if (total > INT4_MAX) {
      throw new BadRequestException({
        error: 'AMOUNT_TOO_LARGE',
        max: INT4_MAX,
        message: 'مبلغ فاکتور با احتساب سود از حد مجاز بیشتر است',
      });
    }

    const paidAmount = priced
      .filter((p) => p.method !== PaymentMethod.CREDIT)
      .reduce((sum, p) => sum + p.amount, 0);

    if (paidAmount > total) {
      throw new BadRequestException({
        error: 'OVERPAYMENT',
        paidAmount,
        total,
        message: 'مجموع پرداخت‌ها از مبلغ فاکتور بیشتر است',
      });
    }

    const dueAmount = total - paidAmount;

    // نسیه بدون مشتری قابل پیگیری نیست. حساب باز از خودِ حساب مشتری دارد.
    if (!dto.accountId && dueAmount > 0 && !dto.customerId && !dto.customer) {
      throw new BadRequestException({
        error: 'CUSTOMER_REQUIRED_FOR_CREDIT',
        message: 'برای فروش نسیه ثبت مشتری الزامی است',
      });
    }

    // چک باید جزئیات داشته باشد.
    payments.forEach((p, i) => {
      if (p.method === PaymentMethod.CHEQUE && !p.cheque) {
        throw new BadRequestException({
          error: 'CHEQUE_DETAILS_REQUIRED',
          paymentIndex: i,
          message: 'برای پرداخت چکی، مشخصات چک الزامی است',
        });
      }
    });

    // ---- سود: از قیمت خرید در همین لحظه ----
    // اگر قیمت خرید حتی یک ردیف موجود نباشد، سود کل null می‌ماند؛ عدد نصفه
    // بدتر از نبودِ عدد است.
    const profit = await this.calculateProfit(dto);

    // ---- تراکنش ----

    try {
      const runSaleTx = async (tx: Prisma.TransactionClient) => {
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
          data: {
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
            status: dto.accountId
              ? InvoiceStatus.OPEN
              : InvoiceStatus.CONFIRMED,
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
        const needsFallback = dto.lines.some((l) => !l.locationId);
        const fallbackLocationId = needsFallback
          ? await this.systemLocations.unregisteredStock(tx, dto.warehouseId)
          : null;

        /*
         * هر ردیف از مسیر تک‌نقطه‌ی تغییر موجودی رد می‌شود (قانون ۱).
         * tx پاس داده می‌شود تا همه‌ی ردیف‌ها در یک تراکنش بمانند.
         *
         * پیمایش به **ترتیبِ قفل‌گیری** است نه ترتیبی که صندوق فرستاده: دو
         * صندوقِ هم‌زمان با اقلامِ مشترکِ معکوس، وگرنه روی سطرهای `Inventory`
         * قفلِ متقابل می‌گیرند و یکی با deadlock کشته می‌شود.
         *
         * `index` همان اندیسِ اصلیِ کلاینت می‌ماند — خطای کمبودِ موجودی با آن
         * سطر را قرمز می‌کند، و آن سطر جای خودش در سبد است نه در این ترتیب.
         */
        const orderedLines = inLockOrder(
          dto.lines.map((line, index) => ({
            line,
            index,
            locationId: line.locationId ?? fallbackLocationId!,
          })),
          (l) => ({ productId: l.line.productId, locationId: l.locationId }),
        );

        for (const { line, index: i, locationId } of orderedLines) {
          try {
            await this.operation.execute(
              {
                type: 'SALE',
                productId: line.productId,
                locationId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineDiscount: line.discount ?? null,
                lineNote: line.lineNote?.trim() || null,
                // فروش هیچ‌وقت به‌خاطر عددِ سیستم متوقف نمی‌شود — جنس در انبار
                // هست، فقط هنوز ثبت نشده. منفی‌شدن خودش گزارش می‌دهد.
                allowNegative: true,
                invoiceId: invoice.id,
                userId: userId ?? null,
                source: 'POS',
              },
              tx,
            );
          } catch (err: any) {
            // خطای موجودی را با شماره‌ی ردیف غنی کن تا کلاینت بداند کجا را
            // قرمز کند. بقیه‌ی خطاها دست‌نخورده بالا می‌روند.
            const body = err?.response ?? err?.getResponse?.();
            if (body?.error === 'INSUFFICIENT_STOCK') {
              const detail: InsufficientStock = {
                error: 'INSUFFICIENT_STOCK',
                lineIndex: i,
                productId: line.productId,
                locationId,
                requested: line.quantity,
                available: body.available ?? 0,
                message: 'موجودی این کالا در این مکان کافی نیست',
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
            data: {
              invoiceId: invoice.id,
              method: p.method,
              amount: p.amount,
              note: p.note ?? null,
            },
          });

          if (p.method === PaymentMethod.CHEQUE && p.cheque) {
            await tx.cheque.create({
              data: {
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

        /*
         * ---- سند خودکارِ این فاکتور (پشت صحنه) ----
         *
         * همان تراکنشِ فاکتور؛ اگر این سند موازنه نشود، کلِ فاکتور برمی‌گردد.
         *
         * شکل‌دهی (همه‌چیز به ریال، مثبت = بدهکار):
         *   بدهکار: صندوق (نقد/کارت‌خوان) + چک + نسیه‌ی مشتری + تخفیف + بهای تمام‌شده
         *   بستانکار: فروشِ ناخالص + درآمدِ تفاوتِ مدت‌دار + موجودی انبار
         *
         * فروشِ ناخالص = subtotal + جمعِ تخفیفِ ردیف‌ها (subtotal از قبل تخفیفِ
         * ردیف‌ها را کم کرده). تخفیفِ کلِ فاکتور و تخفیفِ ردیف‌ها هر دو در حسابِ
         * DISCOUNT می‌نشینند تا «فروش خالص» از خودِ سند خوانده شود.
         */
        const lineDiscounts = dto.lines.reduce(
          (sum, l) => sum + (l.discount ?? 0),
          0,
        );
        const gross = subtotal + lineDiscounts;

        let paidCash = 0;
        let paidCheque = 0;
        for (const p of priced) {
          if (p.method === PaymentMethod.CREDIT) continue;
          if (p.method === PaymentMethod.CHEQUE) paidCheque += p.amount;
          else paidCash += p.amount;
        }

        /*
         * بهای تمام‌شده از آخرین قیمتِ خرید — همان مبنایِ `calculateProfit`.
         * کالایی که قیمتِ خرید ندارد در این سند COGS نمی‌آید (فاز ۰ این حالت
         * را به صفر می‌رساند)؛ سندِ بدونِ آن قلم همچنان موازنه است.
         */
        const prices = await this.posting.latestPurchasePrices(
          tx,
          dto.lines.map((l) => l.productId),
        );
        const cogs = dto.lines.reduce(
          (sum, l) => sum + (prices.get(l.productId) ?? 0) * l.quantity,
          0,
        );

        const voucherLines: VoucherLineInput[] = [];
        if (paidCash > 0) {
          voucherLines.push({
            account: FixedAccount.CASH,
            amount: paidCash,
            note: 'نقد/کارت‌خوان',
          });
        }
        if (paidCheque > 0) {
          voucherLines.push({
            account: FixedAccount.CHEQUES,
            amount: paidCheque,
            note: 'چک دریافتی',
          });
        }
        if (dueAmount > 0 && customerId) {
          voucherLines.push({
            account: FixedAccount.CUSTOMERS,
            amount: dueAmount,
            customerId,
            note: dto.accountId ? 'حساب باز' : 'نسیه',
          });
        }
        voucherLines.push({ account: FixedAccount.SALES, amount: -gross });
        const discounts = lineDiscounts + discount;
        if (discounts > 0) {
          voucherLines.push({
            account: FixedAccount.DISCOUNT,
            amount: discounts,
          });
        }
        if (financeCharge > 0) {
          voucherLines.push({
            account: FixedAccount.FINANCE_CHARGE,
            amount: -financeCharge,
          });
        }
        if (cogs > 0) {
          voucherLines.push({ account: FixedAccount.COGS, amount: cogs });
          voucherLines.push({ account: FixedAccount.INVENTORY, amount: -cogs });
        }

        await this.posting.post(tx, {
          sourceType: VoucherSourceType.SALE_INVOICE,
          sourceId: invoice.id,
          idempotencyKey: `sale:${invoice.id}`,
          lines: voucherLines,
          note: `فاکتور ${invoice.number}`,
          userId: userId ?? null,
        });

        return invoice.id;
      };

      const invoiceId = txClient
        ? await runSaleTx(txClient)
        : await this.prisma.$transaction(runSaleTx);

      if (txClient) return invoiceId;

      // تراکنش commit شد → همان لحظه اعلان کن. فروش هم موجودی را کم کرده، پس
      // stock.changed هم می‌فرستیم تا لیست موجودی/گزارش‌ها هم زنده شوند.
      this.realtime.broadcast({
        type: 'sale.created',
        invoiceId,
        warehouseId: dto.warehouseId,
        customerId: dto.customerId ?? null,
      });
      this.realtime.broadcast({
        type: 'stock.changed',
        warehouseId: dto.warehouseId,
      });

      return this.findOne(invoiceId);
    } catch (err: any) {
      // در مسیرِ تراکنشِ بیرونی، هر خطا (ازجمله تکراری) باید به مالکِ تراکنش
      // برسد تا کلِ سبدِ خالص برگردد؛ بلعیدنش یعنی مرجوعی‌هایِ ثبت‌شده بی‌سند
      // می‌مانند.
      if (txClient) throw err;
      // برخورد همزمان روی همان idempotencyKey: فاکتور موجود برگردانده شود.
      if (err?.code === 'P2002') {
        const dup = await this.prisma.saleInvoice.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (dup) return this.findOne(dup.id);
      }
      throw err;
    }
  }

  /**
   * سبدِ خالص — «جنسِ قبلی پس داده می‌شود + جنسِ نو برده می‌شود» در یک تراکنش.
   *
   * برگشت از **چند** فاکتورِ قبلیِ همین مشتری (ردیف‌هایِ قرمزِ سبدِ فروش) همراه با
   * فاکتورِ فروشِ ردیف‌هایِ نو — همه در یک درخواستِ اتمیک: یا همه‌ی سندها ثبت
   * می‌شوند یا هیچ‌کدام. هر قلمِ مرجوعی به همان ردیفِ SALE فاکتورِ مبدأ قفل
   * می‌شود و قیمتِ برگشتش را ReturnsService از خودِ فاکتور می‌خواند (سمتِ
   * سرور، نه کلاینت)؛ سندِ خودکارِ هر مرجوعی هم همان‌جا ساخته می‌شود.
   *
   * سیاستِ این فاز:
   *   - `refundMethod` فقط نقد/کارت است — پولِ واقعی از صندوق برمی‌گردد؛
   *     برگشتِ به‌حساب (CREDIT) و چک مسیرِ مستقلِ خودشان را دارند.
   *   - مبدأ فقط فاکتورهایِ نهایی (CONFIRMED) است؛ فاکتورِ جاریِ حساب باز مسیرِ
   *     «عملیاتِ یکپارچه» (adjust) را دارد.
   *   - بازپرداختِ نقدی از پولِ پرداخت‌شده‌یِ همان فاکتورِ مبدأ بیشتر نمی‌شود.
   *   - جمعِ مرجوعی‌ها از مبلغِ خریدِ نو بیشتر نمی‌شود (خالص ≥ ۰).
   *
   * کلِ عملیات با یک operationKey روی مرجوعی‌ها ردیابی می‌شود تا پاسخ،
   * «فاکتورِ نو + مرجوعی‌هایِ همراه‌اش» را با هم برگرداند.
   */
  async createNetSale(dto: CreateNetSaleDto, userId?: string, role?: Role) {
    // ---- بررسی‌هایِ ارزان، پیش از تراکنش ----

    if (typeof dto.idempotencyKey !== 'string' || !dto.idempotencyKey.trim()) {
      throw new BadRequestException({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'کلید یکتای عملیات الزامی است',
      });
    }

    if (
      dto.refundMethod === PaymentMethod.CREDIT ||
      dto.refundMethod === PaymentMethod.CHEQUE
    ) {
      throw new BadRequestException({
        error: 'NET_REFUND_MUST_BE_CASH_OR_CARD',
        message:
          'در سبدِ خالص وجه فقط نقد/کارت برمی‌گردد — برگشتِ به‌حساب مسیرِ مستقلِ مرجوعی دارد',
      });
    }

    /* دلیلِ مرجوعیِ همراهِ سبدِ خالص اختیاری است. */

    if (!dto.customerId) {
      throw new BadRequestException({
        error: 'CUSTOMER_REQUIRED',
        message:
          'سبدِ خالص مشتری دارد — برگشت برای فاکتورهایِ قبلیِ همین مشتری است',
      });
    }

    // کلیدِ یکتایِ کلِ عملیات روی خودِ فاکتورِ نو می‌نشیند (همان الگویِ فروشِ
    // عادی) و operationKey مرجوعی‌ها را به هم و به همین عملیات گره می‌زند.
    const opKey = `net:${dto.idempotencyKey}`;

    const existing = await this.prisma.saleInvoice.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      select: { id: true },
    });
    if (existing) return this.netResultFor(existing.id, opKey);

    try {
      const { invoiceId } = await this.prisma.$transaction(async (tx) => {
        // ۰) فاکتورهایِ مبدأ — همه باید فاکتورهایِ نهاییِ همین مشتری باشند.
        const sources = await tx.saleInvoice.findMany({
          where: {
            id: { in: dto.returns.map((g) => g.invoiceId) },
            customerId: dto.customerId,
          },
          select: { id: true, status: true, paidAmount: true },
        });
        const byId = new Map(sources.map((s) => [s.id, s]));
        for (const g of dto.returns) {
          const inv = byId.get(g.invoiceId);
          if (!inv) {
            throw new NotFoundException({
              error: 'SOURCE_INVOICE_NOT_FOUND',
              invoiceId: g.invoiceId,
              message:
                'فاکتورِ مبدأِ مرجوعی پیدا نشد یا متعلق به این مشتری نیست',
            });
          }
          if (inv.status !== InvoiceStatus.CONFIRMED) {
            throw new ConflictException({
              error: 'SOURCE_INVOICE_NOT_FINAL',
              invoiceId: g.invoiceId,
              message:
                'فاکتورِ جاریِ حساب باز مسیرِ خودش را دارد (عملیاتِ یکپارچه روی همان فاکتور) — سبدِ خالص فقط از فاکتورِ نهایی می‌پذیرد',
            });
          }
        }

        // ۱) مرجوعی‌ها اول — قیمتِ برگشت را ReturnsService از خودِ فاکتور می‌خواند.
        // ترتیبِ ثابتِ invoiceId: دو سبدِ هم‌زمان با فاکتورهایِ مشترک deadlock نکنند.
        const sorted = [...dto.returns].sort((a, b) =>
          a.invoiceId.localeCompare(b.invoiceId),
        );
        let refundTotal = 0;
        for (const g of sorted) {
          const inv = byId.get(g.invoiceId)!;
          const made = await this.returns.createReturnInTx(
            tx,
            {
              idempotencyKey: `${dto.idempotencyKey}:return:${g.invoiceId}`,
              invoiceId: g.invoiceId,
              refundMethod: dto.refundMethod,
              reason: dto.reason?.trim() ?? '',
              note: dto.note?.trim() || undefined,
              lines: g.lines,
            },
            { userId, role, operationKey: opKey },
          );

          // بازپرداختِ نقدی از پولی که مشتری بابتِ همین فاکتور پرداخته بیشتر
          // نمی‌شود؛ بدهیِ پرداخت‌نشده مسیرِ مرجوعیِ اعتباری دارد.
          if (made.refundAmount > inv.paidAmount) {
            throw new ConflictException({
              error: 'REFUND_EXCEEDS_PAID',
              invoiceId: g.invoiceId,
              refund: made.refundAmount,
              paid: inv.paidAmount,
              message:
                'برگشتِ نقدی از پولِ پرداخت‌شده‌یِ این فاکتور بیشتر است — اگر کالا نسیه بوده، از مسیرِ مرجوعیِ اعتباری برگردانید',
            });
          }
          refundTotal += made.refundAmount;
        }

        // ۲) فروشِ نو روی همان تراکنش — بدنه‌یِ فاکتورِ عادی، ولی با txِ همین‌جا.
        const invoiceId = await this.createInvoice(
          {
            idempotencyKey: dto.idempotencyKey,
            warehouseId: dto.warehouseId,
            customerId: dto.customerId,
            discount: dto.discount,
            note: dto.note,
            dueDate: dto.dueDate,
            lines: dto.lines,
            payments: dto.payments,
          },
          userId,
          tx,
        );

        // ۳) خالص ≥ ۰: برگشتِ بیشتر از خریدِ نو یعنی باید به مشتری پول پس
        // بدهیم؛ در این فاز مجاز نیست (مسیرِ payout). هر خطا کلِ تراکنش را
        // برمی‌گرداند و مرجوعی‌هایِ همین‌حالا ثبت‌شده هم با آن undo می‌شوند.
        const sale = await tx.saleInvoice.findUniqueOrThrow({
          where: { id: invoiceId },
          select: { total: true },
        });
        if (refundTotal > sale.total) {
          throw new ConflictException({
            error: 'NEGATIVE_NET',
            refundTotal,
            saleTotal: sale.total,
            message:
              'مبلغِ برگشتی‌ها از خریدِ نو بیشتر است — در این نسخه خالصِ منفی مجاز نیست',
          });
        }

        return { invoiceId };
      });

      // تراکنش commit شد → همان لحظه اعلان کن (الگویِ بقیه‌یِ مسیرها).
      this.realtime.broadcast({
        type: 'sale.created',
        invoiceId,
        warehouseId: dto.warehouseId,
        customerId: dto.customerId,
      });
      this.realtime.broadcast({ type: 'return.created' });
      this.realtime.broadcast({
        type: 'stock.changed',
        warehouseId: dto.warehouseId,
      });

      return this.netResultFor(invoiceId, opKey);
    } catch (err: any) {
      // برخوردِ همزمان: نفرِ دیگر همین کلید را ساخته — سبدِ او کامل ثبت شده،
      // همان را برگردان. (در مسیرِ tx، createInvoice تکراری را بی‌صدا بلعیده
      // نمی‌کند؛ NET_SALE_DUPLICATE هم از همان مسیر می‌آید تا کل برگردد.)
      if (err?.code === 'P2002' || err?.message === 'NET_SALE_DUPLICATE') {
        const dup = await this.prisma.saleInvoice.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          select: { id: true },
        });
        if (dup) return this.netResultFor(dup.id, opKey);
      }
      throw err;
    }
  }

  /** پاسخِ یک سبدِ خالصِ ثبت‌شده — فاکتورِ نو + مرجوعی‌هایِ همراهش. */
  private async netResultFor(invoiceId: string, opKey: string) {
    const [invoice, returns] = await Promise.all([
      this.findOne(invoiceId),
      this.prisma.saleReturn.findMany({
        where: { operationKey: opKey },
        orderBy: { createdAt: 'asc' },
        include: { invoice: { select: { id: true, number: true } } },
      }),
    ]);
    return { invoice, returns };
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
        where: { id, status: InvoiceStatus.CONFIRMED },
        data: {
          status: InvoiceStatus.CANCELLED,
          cancelReason: reason,
          cancelledAt: new Date(),
          cancelledById: userId ?? null,
        },
      });

      if (claimed.count === 0) {
        const current = await tx.saleInvoice.findUnique({ where: { id } });

        if (!current) {
          throw new NotFoundException({
            error: 'INVOICE_NOT_FOUND',
            message: 'فاکتور پیدا نشد',
          });
        }

        throw new ConflictException({
          error: 'ALREADY_CANCELLED',
          message: 'این فاکتور قبلاً باطل شده است',
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
        where: { id },
        select: {
          number: true,
          customerId: true,
          dueAmount: true,
          subtotal: true,
          discount: true,
          financeCharge: true,
          // جمعِ وجهِ گرفته‌شده — رسیدها و اصلاحیه‌ها همیشه آن را با dueAmount
          // هماهنگ نگه می‌دارند، پس «وجهِ گرفته‌شده = total − due» همیشه درست است.
          paidAmount: true,
        },
      });

      if (cancelled.customerId && cancelled.dueAmount > 0) {
        await this.ledger.record(tx, {
          customerId: cancelled.customerId,
          type: LedgerEntryType.INVOICE_CANCELLED,
          amount: -cancelled.dueAmount,
          invoiceId: id,
          userId: userId ?? null,
          note: `ابطال فاکتور ${cancelled.number}: ${reason}`,
        });

        await tx.saleInvoice.update({
          where: { id },
          data: { dueAmount: 0 },
        });
      }

      const lines = await tx.inventoryLog.findMany({
        where: { invoiceId: id, action: 'SALE' },
      });

      /*
       * اگر بخشی از این فاکتور قبلاً مرجوعیِ سالم خورده، همان مقدار قبلاً به
       * موجودی برگشته است. ابطال باید فقط باقی‌ماندهٔ واقعاً بیرون‌مانده را
       * برگرداند، وگرنه موجودیِ آن کالا دوبار زیاد می‌شود. اقلامِ معیوب
       * (restock=false) اصلاً حرکت انبار نداشته‌اند، پس اینجا هم برنمی‌گردند.
       */
      const restocked = await tx.saleReturnLine.groupBy({
        by: ['saleLogId'],
        where: { saleLogId: { in: lines.map((l) => l.id) }, restock: true },
        _sum: { quantity: true },
      });
      const restockedQty = new Map(
        restocked.map((r) => [r.saleLogId, r._sum.quantity ?? 0]),
      );

      // ترتیبِ ثابتِ قفل‌گیری — ابطالِ هم‌زمانِ دو فاکتور با اقلامِ مشترک
      // نباید به deadlock برسد. `findMany` بدون `orderBy` ترتیبِ تضمین‌شده‌ای
      // هم ندارد، پس اینجا حتی ترتیبِ پایداری وجود نداشت که رویش حساب کنیم.
      for (const line of inLockOrder(lines)) {
        const remaining = line.quantity - (restockedQty.get(line.id) ?? 0);
        if (remaining <= 0) continue;

        await this.operation.execute(
          {
            type: 'RETURN',
            productId: line.productId,
            locationId: line.locationId,
            quantity: remaining,
            invoiceId: id,
            userId: userId ?? null,
            source: 'SALE_CANCEL',
            note: `ابطال فاکتور: ${reason}`,
          },
          tx,
        );
      }

      /*
       * ---- سندِ معکوسِ ابطال (پشت صحنه) ----
       *
       * «فروش اتفاق نیفتاده» خوانده می‌شود:
       *   بدهکار: فروشِ ناخالص + درآمدِ تفاوتِ مدت‌دار + موجودی انبار (اقلامِ برگشتی)
       *   بستانکار: تخفیف + مشتری (بدهیِ پاک‌شده) + بازپرداختِ مشتری + بهای تمام‌شده
       *
       * ترازِ ریاضی: total = gross − تخفیف + سود؛ due + paidAmount = total —
       * چون رسیدها/اصلاحیه‌ها/برگشتِ پرداخت همیشه paidAmount و dueAmount را با هم
       * جابه‌جا می‌کنند، این فرمول برای هر ترکیبی (فروشِ نقدی، نسیه، رسیدِ بعدی،
       * اصلاحیه، برگشتِ پرداخت) صفر می‌ماند.
       *
       * حسابِ REFUND_PAYABLE: نرم‌افزار موقعِ ابطال پولِ گرفته‌شده را به مشتری
       * برنمی‌گرداند (بازپرداختِ واقعی مسیرِ مجزای فاز ۲ دارد). سندِ ابطال آن
       * وجه را بستانکارِ این حساب می‌کند تا سند موازنه بماند و حسابِ صندوق با
       * واقعیتِ فیزیکی بخواند؛ فاز ۲ از همین حساب صافش می‌کند.
       *
       * بهای تمام‌شده فقط برای اقلامِ باقی‌مانده‌ای که همین‌جا برمی‌گردند
       * حساب می‌شود — اقلامِ مرجوعیِ قبلی اثرشان را در سندِ مرجوعیِ خودشان
       * دارند.
       */
      const lineDiscounts = lines.reduce(
        (sum, l) => sum + (l.lineDiscount ?? 0),
        0,
      );
      const gross = cancelled.subtotal + lineDiscounts;
      const discounts = lineDiscounts + cancelled.discount;

      const prices = await this.posting.latestPurchasePrices(
        tx,
        lines.map((l) => l.productId),
      );
      let cogsRemaining = 0;
      for (const line of lines) {
        const remaining = line.quantity - (restockedQty.get(line.id) ?? 0);
        if (remaining > 0) {
          cogsRemaining += (prices.get(line.productId) ?? 0) * remaining;
        }
      }

      const original = await tx.voucher.findFirst({
        where: { sourceType: VoucherSourceType.SALE_INVOICE, sourceId: id },
        select: { id: true },
      });

      const voucherLines: VoucherLineInput[] = [];
      voucherLines.push({ account: FixedAccount.SALES, amount: gross });
      if (cancelled.financeCharge > 0) {
        voucherLines.push({
          account: FixedAccount.FINANCE_CHARGE,
          amount: cancelled.financeCharge,
        });
      }
      if (discounts > 0) {
        voucherLines.push({
          account: FixedAccount.DISCOUNT,
          amount: -discounts,
        });
      }
      if (cancelled.customerId && cancelled.dueAmount > 0) {
        voucherLines.push({
          account: FixedAccount.CUSTOMERS,
          amount: -cancelled.dueAmount,
          customerId: cancelled.customerId,
          note: 'بازگشتِ بدهیِ فاکتور',
        });
      }
      if (cancelled.paidAmount > 0) {
        voucherLines.push({
          account: FixedAccount.REFUND_PAYABLE,
          amount: -cancelled.paidAmount,
          customerId: cancelled.customerId ?? null,
          note: 'وجهِ گرفته‌شده — بازپرداخت در فاز ۲',
        });
      }
      if (cogsRemaining > 0) {
        voucherLines.push({
          account: FixedAccount.INVENTORY,
          amount: cogsRemaining,
        });
        voucherLines.push({
          account: FixedAccount.COGS,
          amount: -cogsRemaining,
        });
      }

      await this.posting.post(tx, {
        sourceType: VoucherSourceType.SALE_CANCEL,
        sourceId: id,
        idempotencyKey: `sale-cancel:${id}`,
        lines: voucherLines,
        note: `ابطال فاکتور ${cancelled.number}: ${reason}`,
        userId: userId ?? null,
        reversesVoucherId: original?.id ?? null,
      });
    });

    // تراکنشِ ابطال commit شد → اعلانِ زنده. ابطال موجودی را هم برگردانده.
    this.realtime.broadcast({ type: 'sale.canceled', invoiceId: id });
    this.realtime.broadcast({ type: 'stock.changed' });

    return this.findOne(id);
  }

  async findOne(id: string) {
    const invoice = await this.prisma.saleInvoice.findUnique({
      where: { id },
      include: {
        customer: true,
        warehouse: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, fullName: true, username: true } },
        payments: { include: { cheque: true } },
        // فقط ردیف‌های فروش. حرکت‌های RETURNِ ابطال/مرجوعی هم invoiceId همین
        // فاکتور را دارند؛ بدون این فیلتر، «ردیف‌های فاکتور» با ردیف‌های برگشتی
        // قاطی می‌شد و جمعِ نمایشی با مبلغِ فاکتور نمی‌خواند.
        lines: {
          where: { action: 'SALE' },
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true },
            },
            location: {
              select: { id: true, name: true, code: true, path: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({
        error: 'INVOICE_NOT_FOUND',
        message: 'فاکتور پیدا نشد',
      });
    }

    /*
     * وضعیتِ «الان» هر قلم — خوراکِ برگه‌ی چاپ.
     *
     * برگه باید وضعیتِ نهاییِ خالص را نشان بدهد: تعدادِ مانده، آخرین قیمتِ
     * تصحیح‌شده، و سهمِ تخفیفِ اقلامِ باقی‌مانده. ردیفی که کاملاً برگشته روی
     * کاغذ نمی‌آید (برگه صفرها را حذف می‌کند)؛ سابقه در سیستم کامل می‌ماند
     * ولی هیچ‌کدام از آن روی برگه‌ی مشتری چاپ نمی‌شود.
     */
    const saleLogIds = invoice.lines.map((l) => l.id);
    const balances = await lineBalances(
      this.prisma,
      saleLogIds,
      new Map(invoice.lines.map((l) => [l.id, l.quantity])),
    );

    // آخرین قیمتِ تصحیح‌شده‌ی هر ردیف — قلمِ تازه قیمتِ خودش را دارد.
    const corrLines = await this.prisma.saleCorrectionLine.findMany({
      where: { saleLogId: { in: saleLogIds } },
      orderBy: { createdAt: 'asc' },
      select: { saleLogId: true, newUnitPrice: true, isNewLine: true },
    });
    const lastPriceByLog = new Map<string, number>();
    for (const c of corrLines) {
      if (!c.isNewLine) lastPriceByLog.set(c.saleLogId, c.newUnitPrice);
    }

    const refundAgg = await this.prisma.saleReturn.aggregate({
      where: { invoiceId: id },
      _sum: { refundAmount: true },
    });

    const lines = invoice.lines.map((l) => {
      const bal = balances.get(l.id)!;
      const sold = bal.sold;
      const outstanding = bal.outstanding;
      const currentUnitPrice = lastPriceByLog.get(l.id) ?? l.unitPrice ?? 0;

      /*
       * سهمِ تناسبیِ تخفیفِ ردیف از اقلامِ باقی‌مانده — همان تقسیمی که برگشتِ
       * وجه با آن حساب می‌شود، تا جمعِ برگه با ماندهِ فاکتور بخواند.
       */
      const netLineDiscount =
        sold > 0 ? Math.round((l.lineDiscount ?? 0) * (outstanding / sold)) : 0;

      // قیمتِ مؤثرِ هر واحد (پس از سهمِ تخفیفِ ردیفی و فاکتوری) — وقتی فاکتور
      // مرجوعی دارد، برگه با همین قیمتِ واقعیِ هر عدد چاپ می‌شود تا جمعش با
      // مبلغِ نهایی بخواند.
      const effTotal = effectiveTotal(
        l.unitPrice ?? 0,
        l.lineDiscount ?? 0,
        sold,
        invoice.subtotal,
        invoice.discount,
      );
      const { unitRefund } = refundFor(effTotal, sold, sold);

      return {
        ...l,
        netQuantity: outstanding,
        currentUnitPrice,
        netLineDiscount,
        effectiveUnitPrice: unitRefund,
      };
    });

    return {
      ...invoice,
      lines,
      /** جمعِ وجهِ برگشتیِ همه‌ی مرجوعی‌های این فاکتور — پایه‌ی «مبلغِ قابلِ پرداختِ» برگه. */
      refundTotal: refundAgg._sum.refundAmount ?? 0,
      customer: withFullName(invoice.customer),
    };
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
        { customer: { searchName: { contains: normalizePersian(q.q) } } },
        { customer: { lastName: { contains: q.q, mode: 'insensitive' } } },
        ...(digits
          ? [
              {
                customer: { phones: { some: { phone: { contains: digits } } } },
              },
            ]
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
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phones: { where: { isPrimary: true }, take: 1 },
            },
          },
          user: { select: { id: true, fullName: true } },
          // فقط ردیف‌های فروش شمرده می‌شوند. رابطه‌ی `lines` همه‌ی لاگ‌های این
          // فاکتور است، پس بدون این فیلتر حرکت‌های RETURNِ ابطال و مرجوعی هم
          // شمرده می‌شدند و ستون «تعداد اقلام» بعد از هر برگشتی متورم می‌شد.
          // `returns` در همین کوئری شمرده می‌شود تا لیست بدون N+1 بداند کدام
          // فاکتور مرجوعی خورده (نشانِ «مرجوعی دارد» + تبِ «مرجوع‌شده»).
          _count: {
            select: { lines: { where: { action: 'SALE' } }, returns: true },
          },
          ...(includeLines
            ? {
                lines: {
                  where: { action: 'SALE' },
                  include: {
                    product: {
                      select: { id: true, name: true, sku: true, unit: true },
                    },
                    location: {
                      select: { id: true, name: true, code: true, path: true },
                    },
                  },
                },
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.saleInvoice.count({ where }),
    ]);

    /*
     * مبلغِ نمایشیِ فهرست، خودِ `total` است.
     *
     * مرجوعیِ اعتباری و اصلاحیه از قبل داخل `total` نشسته‌اند (returns.service
     * و corrections.service) — همان مقدارِ کهنه‌ای که فاکتورِ ۳۰ میلیونیِ
     * مرجوعی‌خورده را «۴۰» نشان می‌داد، دیگر وجود ندارد. پس هیچ جبرانی اینجا
     * لازم نیست؛ اگر اضافه شود، مرجوعی دو بار کم می‌شود.
     */
    return {
      data: data.map((inv) => ({
        ...inv,
        customer: withFullName(inv.customer),
        hasReturns: inv._count.returns > 0,
      })),
      meta: { total, page, pageSize, pageCount: Math.ceil(total / pageSize) },
    };
  }

  /**
   * سرگذشتِ یک فاکتور — «این فاکتور چه شد و چرا مانده‌اش این عدد است؟».
   *
   * همه‌چیز از دفتر می‌آید، نه از `paidAmount`/`dueAmount`/`total` خودِ فاکتور:
   * آن فیلدها با ویرایش‌های بعدی (مرجوعی، اصلاحیه، برگشتِ پرداخت، اصلاحِ نحوهٔ
   * پرداخت) همیشه هم‌گام نمی‌مانند. دفتر هر رویداد را با تاریخ و سندش ثبت
   * کرده؛ همین است که جمعش دقیقاً به ماندهٔ نمایش‌داده‌شده می‌رسد و فروشنده
   * می‌تواند خط‌به‌خط دنبالش کند.
   *
   * مرجوعیِ نقد/کارت عمداً وارد دفتر نمی‌شود (پول از صندوق برگشت، بدهی عوض
   * نمی‌شود)؛ ولی در «سرگذشت» می‌آید تا معلوم باشد کالا برگشته، فقط اثرش
   * روی حساب نبوده.
   */
  async invoiceStory(id: string) {
    const invoice = await this.prisma.saleInvoice.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        customerId: true,
        dueAmount: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException({
        error: 'INVOICE_NOT_FOUND',
        message: 'فاکتور پیدا نشد',
      });
    }

    const [rows, cashRefunds, allocations, salePayments] = await Promise.all([
      this.prisma.customerLedger.findMany({
        where: { invoiceId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          amount: true,
          note: true,
          createdAt: true,
          receipt: { select: { number: true } },
          saleReturn: { select: { number: true } },
          correction: { select: { number: true } },
          payout: { select: { number: true } },
          reversal: { select: { method: true, reason: true } },
        },
      }),
      /*
       * مرجوعی‌هایی که دفتر ندیده‌اند (برگشتِ نقدی/کارتخوان) — بدون این‌ها
       * سرگذشت ناقص می‌شود و کسی که کالا را پس داده می‌پرسد «پس چرا اینجا
       * نیست؟». مبلغشان از مانده کم نمی‌شود، فقط نشان داده می‌شود.
       */
      this.prisma.saleReturn.findMany({
        where: {
          invoiceId: id,
          refundMethod: { in: [PaymentMethod.CASH, PaymentMethod.CARD] },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          number: true,
          refundAmount: true,
          refundMethod: true,
          createdAt: true,
        },
      }),
      /*
       * پرداخت‌های روی همین فاکتور.
       *
       * رسید در دفتر فقط به مشتری می‌چسبد (invoiceId ندارد)، پس تنها جایی که
       * معلوم می‌کند «کدام پرداخت بابت کدام فاکتور بود» همین تخصیص‌هاست — بدون
       * آن، فروشنده نمی‌فهمد چرا این فاکتور کمتر از مبلغش مانده دارد.
       */
      this.prisma.receiptAllocation.findMany({
        where: { invoiceId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          amount: true,
          createdAt: true,
          receipt: {
            select: {
              number: true,
              createdAt: true,
              payments: { select: { method: true } },
            },
          },
        },
      }),
      /*
       * پولِ نقد/کارتی که سرِ فروش گرفته شده (ردیف‌های مثبت و دست‌نخوردهٔ
       * پرداخت). ردیف‌های منفی/operationKey‌دار را نمی‌آوریم: اثرشان همان ردیفِ
       * «اصلاح نحوهٔ پرداخت» یا «برگشت پرداخت»ِ دفتر است و دو بار شمرده می‌شد.
       */
      this.prisma.payment.findMany({
        where: { invoiceId: id, amount: { gt: 0 }, operationKey: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, amount: true, method: true, createdAt: true },
      }),
    ]);

    const events = rows.map((row) => ({
      id: row.id,
      kind: row.type,
      amount: row.amount,
      at: row.createdAt,
      docNumber:
        row.receipt?.number ??
        row.saleReturn?.number ??
        row.correction?.number ??
        row.payout?.number ??
        null,
      method: row.reversal?.method ?? null,
      note: row.note ?? null,
    }));

    return {
      invoice,
      events,
      /** پرداخت‌هایی که بابتِ همین فاکتور گرفته شده — با شمارهٔ رسید و تاریخ. */
      payments: allocations.map((a) => ({
        id: a.id,
        amount: a.amount,
        at: a.receipt.createdAt,
        receiptNumber: a.receipt.number,
        methods: a.receipt.payments.map((p) => p.method),
      })),
      /** پولِ نقد/کارتیِ سرِ فروش — توضیحِ مبلغِ کمترِ فاکتور از لحظهٔ صدور. */
      salePayments: salePayments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        at: p.createdAt,
      })),
      /** مرجوعی‌های بیرونِ حساب (نقد/کارت) — اثرشان روی مانده صفر است. */
      offAccountRefunds: cashRefunds.map((r) => ({
        id: r.id,
        number: r.number,
        amount: r.refundAmount,
        method: r.refundMethod,
        at: r.createdAt,
      })),
      /**
       * ماندهٔ این فاکتور = همان `dueAmount` که ستون «مانده» و صندوق نشان
       * می‌دهند — نه جمعِ ردیف‌های دفتر: پرداخت‌های تخصیص‌یافته دفتر را به
       * مشتری می‌چسبانند نه به فاکتور، پس جمعِ ردیف‌های فاکتور از مانده بیشتر
       * در می‌آید. مانده در هر مسیر (فروش، رسید، مرجوعی، اصلاحیه، برگشتِ
       * پرداخت) به‌روز می‌شود و همین عددی است که فروشنده در دو جای دیگر می‌بیند.
       */
      due: invoice.dueAmount,
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
    const priced = dto.lines.filter((l) => l.unitPrice > 0);
    if (!priced.length) return;

    // آخرین قیمتِ هر کالا در همین فاکتور؛ اگر یک کالا دو ردیف داشت، دومی برنده است.
    const wanted = new Map<string, number>();
    for (const l of priced) wanted.set(l.productId, l.unitPrice);

    const current = await tx.productPrice.findMany({
      where: { productId: { in: [...wanted.keys()] } },
      orderBy: { createdAt: 'desc' },
    });

    const latest = new Map<
      string,
      {
        salePrice: number | null;
        purchasePrice: number | null;
        wholesalePrice: number | null;
      }
    >();
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
      .filter(
        ([productId, salePrice]) =>
          latest.get(productId)?.salePrice !== salePrice,
      )
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
    const productIds = [...new Set(dto.lines.map((l) => l.productId))];

    const prices = await this.prisma.productPrice.findMany({
      where: { productId: { in: productIds }, purchasePrice: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    const latest = new Map<string, number>();
    for (const p of prices) {
      if (!latest.has(p.productId) && p.purchasePrice != null) {
        latest.set(p.productId, p.purchasePrice);
      }
    }

    if (productIds.some((id) => !latest.has(id))) return null;

    const lineProfit = dto.lines.reduce((sum, l) => {
      const purchase = latest.get(l.productId)!;
      return sum + (l.unitPrice - purchase) * l.quantity - (l.discount ?? 0);
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
        where: { id: dto.customerId },
      });
      if (!found) {
        throw new NotFoundException({
          error: 'CUSTOMER_NOT_FOUND',
          message: 'مشتری پیدا نشد',
        });
      }
      return found.id;
    }

    if (dto.customer) {
      const firstName = dto.customer.firstName?.trim();

      if (!firstName) {
        throw new BadRequestException({
          error: 'NAME_REQUIRED',
          message: 'نام مشتری الزامی است',
        });
      }

      // شماره نرمال می‌شود تا «۰۹۱۲…» و «+98912…» و «0912-…» یک مشتری بمانند.
      const phone = normalizePhone(dto.customer.phone);

      // اگر همین شماره از قبل ثبت شده، همان مشتری استفاده شود.
      if (phone) {
        const existing = await tx.customerPhone.findUnique({
          where: { phone },
          select: { customerId: true },
        });
        if (existing) return existing.customerId;
      }

      // بدون شماره روی نام ادغام نمی‌کنیم: دو «محمد رضایی» ممکن است دو نفر
      // باشند. تشخیص «همان مشتری» کار فروشنده است، نه حدسِ سرور.
      const created = await tx.customer.create({
        data: {
          firstName,
          lastName: dto.customer.lastName?.trim() || null,
          searchName: normalizePersian(
            `${firstName} ${dto.customer.lastName ?? ''}`,
          ).trim(),
          ...(phone ? { phones: { create: { phone, isPrimary: true } } } : {}),
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
function withFullName<
  T extends { firstName: string; lastName?: string | null } | null,
>(customer: T): T extends null ? null : T & { fullName: string } {
  if (!customer) return null as never;
  return {
    ...customer,
    fullName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
  } as never;
}
