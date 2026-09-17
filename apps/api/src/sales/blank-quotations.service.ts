import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, BlankQuotationStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from './sales.service';
import { ProductsService } from '../products/products.service';
import { normalizePersian } from '../engine/utils/persian-normalize';
import { INT4_MAX } from '../common/money';

import {
  BlankQuotationLineDto,
  ConvertBlankQuotationDto,
  CreateBlankQuotationDto,
  SaveBlankPricesDto,
} from './dto/blank-quotation.dto';

/** یک قلم، آن‌طور که پنل و گوشی می‌بینند. */
export type BlankLineView = {
  id: string;
  text: string;
  quantity: number;
  suggestedPrice: number | null;
  finalPrice: number | null;
  pricedAt: Date | null;
  product: { id: string; name: string; sku: string | null; unit: string | null } | null;
  locationId: string | null;
  locationPath: string | null;
  /** `quantity × (finalPrice ?? 0)` — قیمت پیشنهادی هیچ‌وقت داخلش نیست. */
  lineTotal: number;
};

export type BlankQuotationView = {
  id: string;
  number: number;
  status: BlankQuotationStatus;
  /** «منقضی» وضعیت ذخیره‌شده نیست و از تاریخ حساب می‌شود. */
  displayStatus: BlankQuotationStatus | 'EXPIRED';
  customerName: string | null;
  /** پرونده‌ی مشتری، اگر مدیر نام را به مشتریِ موجود وصل کرده باشد. */
  customer: { id: string; fullName: string } | null;
  note: string | null;
  validUntil: Date | null;
  convertedInvoiceId: string | null;
  createdAt: Date;
  user: { id: string; fullName: string } | null;
  lineCount: number;
  /** ردیف‌های «قیمت نخورده» — قفلِ اولِ تبدیل. */
  unpricedCount: number;
  /** ردیف‌هایی که کالای واقعی ندارند — قفلِ دومِ تبدیل. */
  unlinkedCount: number;
  /** جمعِ قطعی. تا وقتی `unpricedCount > 0` معنا ندارد و پنل «—» نشان می‌دهد. */
  total: number;
  lines: BlankLineView[];
};

export type BlankSuggestionCandidate = {
  productId: string;
  name: string;
  sku: string | null;
  unit: string | null;
  salePrice: number | null;
  totalStock: number;
  /** قفسه‌ی پیشنهادی برای برداشت (پرموجودترین قفسه). */
  locationId: string | null;
  locationPath: string | null;
};

/** پیشنهاد کالا برای یک قلمِ متنی (نیمه‌خودکار: تصمیم با مدیر است). */
export type BlankLineSuggestion = {
  lineId: string;
  lineIndex: number;
  text: string;
  /** `LINKED` یعنی قلم از قبل کالا دارد و پیشنهادی لازم نیست. */
  status: 'LINKED' | 'SUGGEST' | 'NONE';
  best: BlankSuggestionCandidate | null;
  candidates: BlankSuggestionCandidate[];
};

const MAX_SUGGESTIONS = 5;

/**
 * ترتیبِ قلم‌ها: همان چیزی که کارگر گفت یا نوشت.
 *
 * `position` تنها ترتیبِ معنادار است (uuid و `createdAt` هیچ‌کدام ترتیبِ
 * درونِ یک برگه را نمی‌دهند) و `id` فقط داورِ نهایی است تا خروجی همیشه یکسان
 * باشد و تست‌ها به شانس وابسته نباشند.
 */
const LINE_ORDER: Prisma.BlankQuotationLineOrderByWithRelationInput[] = [
  { position: 'asc' },
  { id: 'asc' },
];

type RawLine = {
  id: string;
  text: string;
  quantity: number;
  suggestedPrice: number | null;
  finalPrice: number | null;
  pricedAt: Date | null;
  productId: string | null;
  locationId: string | null;
};

type RawBlank = {
  id: string;
  number: number;
  status: BlankQuotationStatus;
  customerName: string | null;
  customer?: { id: string; firstName: string; lastName: string | null } | null;
  note: string | null;
  validUntil: Date | null;
  convertedInvoiceId: string | null;
  createdAt: Date;
  user?: { id: string; fullName: string } | null;
  lines: RawLine[];
};

/**
 * پیش‌فاکتور سفید (برگه‌ی قیمت).
 *
 * قواعدی که این سرویس عمداً رعایت می‌کند:
 *
 * ۱. **موجودی و لجر دست نمی‌خورد** (Rule 1). تا لحظه‌ی `convert` هیچ ردیفی از
 *    `InventoryLog` نوشته نمی‌شود؛ تنها `SalesService.createInvoice` آن را می‌نویسد.
 * ۲. `suggestedPrice` (پیشنهاد گوشی) **هیچ‌وقت** در جمع، فاکتور یا سند نمی‌آید.
 *    جمع فقط از `finalPrice` ساخته می‌شود.
 * ۳. تبدیل فقط وقتی ممکن است که **همه‌ی** ردیف‌ها کالای واقعی و قیمت نهایی
 *    داشته باشند — برگه‌ی نیمه‌قیمت‌خورده نباید به فاکتوری برود که موجودی را
 *    کم می‌کند.
 */
@Injectable()
export class BlankQuotationsService {
  constructor(
    private prisma: PrismaService,
    private sales: SalesService,
    private products: ProductsService,
  ) {}

  // ---------- ساخت (از گوشی) ----------

  /**
   * ساخت برگه از ورودی گوشی.
   *
   * گوشی آفلاین کار می‌کند، پس همین درخواست ممکن است دوبار برسد: کلید یکتا در
   * سطح دیتابیس تضمین می‌کند دوباره‌فرستادن برگه‌ی دوم نسازد و مدیر دو بار
   * برای یک برگه قیمت نگذارد.
   */
  async create(input: CreateBlankQuotationDto, userId?: string) {
    this.assertLinesValid(input.lines);

    const idempotencyKey = `mobile-${input.clientRequestId}`;

    const existing = await this.prisma.blankQuotation.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existing) return this.findOne(existing.id);

    const warehouseId = await this.resolveDefaultWarehouse();
    const validUntil = input.validForMinutes
      ? new Date(Date.now() + input.validForMinutes * 60_000)
      : null;

    try {
      const created = await this.prisma.blankQuotation.create({
        data: {
          idempotencyKey,
          warehouseId,
          userId: userId ?? null,
          customerName: input.customerName?.trim() || null,
          customerId: input.customerId?.trim() || null,
          note: input.note?.trim() || null,
          validUntil,
          lines: {
            // `position` ترتیبِ گفته‌شده را نگه می‌دارد، وگرنه برگه بی‌ترتیب
            // خوانده می‌شود (uuid ترتیب ندارد).
            create: input.lines.map((l, position) => ({
              position,
              text: l.text.trim(),
              quantity: l.quantity,
              suggestedPrice: l.suggestedPrice ?? null,
              // قیمت نهایی و کالا را مدیر می‌گذارد؛ اینجا خالی می‌ماند.
              finalPrice: null,
              pricedAt: null,
              productId: null,
              locationId: null,
            })),
          },
        },
        select: { id: true },
      });

      return this.findOne(created.id);
    } catch (e) {
      // دو درخواستِ هم‌زمان با یک کلید: دومی باید همان برگه‌ی اول را ببیند.
      if (this.isUniqueViolation(e, 'idempotencyKey')) {
        const found = await this.prisma.blankQuotation.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        if (found) return this.findOne(found.id);
      }
      throw e;
    }
  }

  // ---------- خواندن ----------

  /**
   * فهرست برگه‌ها — بدون ضمیمه‌کردن نام کالا (تا سبک بماند) ولی با شمارشِ
   * ردیف‌های قیمت‌نخورده و وصل‌نشده، چون ستون‌های پنل همین دو را نشان می‌دهند.
   */
  async findAll(query: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 20));

    const where: Prisma.BlankQuotationWhereInput = {};

    // بدون `validUntil` برگه هیچ‌وقت منقضی نمی‌شود: برگه‌ی قیمتِ بی‌تاریخ نباید
    // خودبه‌خود بمیرد. پس شرطِ «معتبر» باید nال را هم بپذیرد.
    const notExpired: Prisma.BlankQuotationWhereInput = {
      OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
    };

    if (query.status === 'EXPIRED') {
      where.status = { in: [BlankQuotationStatus.OPEN, BlankQuotationStatus.PRICED] };
      where.validUntil = { lt: new Date() };
    } else if (query.status === 'OPEN') {
      where.status = BlankQuotationStatus.OPEN;
      Object.assign(where, notExpired);
    } else if (query.status === 'PRICED') {
      where.status = BlankQuotationStatus.PRICED;
      Object.assign(where, notExpired);
    } else if (query.status) {
      where.status = query.status as BlankQuotationStatus;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.blankQuotation.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true } },
          customer: { select: { id: true, firstName: true, lastName: true } },
          lines: {
            select: {
              id: true,
              text: true,
              quantity: true,
              suggestedPrice: true,
              finalPrice: true,
              pricedAt: true,
              productId: true,
              locationId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.blankQuotation.count({ where }),
    ]);

    return {
      data: data.map((q) => this.decorate(q)),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /** جزئیات یک برگه، با نام کالا و مسیر قفسه‌ی هر ردیف. */
  async findOne(id: string): Promise<BlankQuotationView> {
    const q = await this.prisma.blankQuotation.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        lines: { orderBy: LINE_ORDER },
      },
    });

    if (!q) {
      throw new NotFoundException({
        error: 'BLANK_QUOTATION_NOT_FOUND',
        message: 'پیش‌فاکتور سفید پیدا نشد',
      });
    }

    const view = this.decorate(q);
    return this.attachRefs(view, q.lines);
  }

  // ---------- قیمت‌گذاری مدیر (و وصل کردن به کالای واقعی) ----------

  /**
   * ذخیره‌ی قیمت‌های نهایی و/یا وصل‌کردن قلم‌ها.
   *
   * موجودی دست نمی‌خورد (این برگه است)، فقط مبنای تبدیل آماده می‌شود. هر ردیفی
   * که قیمت بگیرد `pricedAt` می‌گیرد و وقتی همه‌ی ردیف‌ها قیمت خوردند وضعیت
   * `PRICED` می‌شود.
   */
  async savePrices(id: string, input: SaveBlankPricesDto) {
    const q = await this.prisma.blankQuotation.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!q) {
      throw new NotFoundException({
        error: 'BLANK_QUOTATION_NOT_FOUND',
        message: 'پیش‌فاکتور سفید پیدا نشد',
      });
    }
    if (q.status === BlankQuotationStatus.CONVERTED) {
      throw new ConflictException({
        error: 'ALREADY_CONVERTED',
        invoiceId: q.convertedInvoiceId,
        message: 'این برگه به فاکتور تبدیل شده و دیگر ویرایش نمی‌شود',
      });
    }
    if (q.status === BlankQuotationStatus.CANCELLED) {
      throw new ConflictException({
        error: 'NOT_OPEN',
        status: q.status,
        message: 'این برگه لغو شده است',
      });
    }

    const byId = new Map(q.lines.map((l) => [l.id, l]));
    input.lines.forEach((row, lineIndex) => {
      if (!byId.has(row.lineId)) {
        throw new BadRequestException({
          error: 'LINE_NOT_FOUND',
          lineIndex,
          message: 'این ردیف روی برگه پیدا نشد',
        });
      }
      if (row.text !== undefined && normalizePersian(row.text).trim().length === 0) {
        throw new BadRequestException({
          error: 'EMPTY_TEXT',
          lineIndex,
          message: 'متن قلم نمی‌تواند خالی باشد',
        });
      }
    });

    // مشتریِ وصل‌شده باید واقعاً وجود داشته باشد — همان قاعده‌ی کالا/قفسه.
    if (input.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true },
      });
      if (!customer) {
        throw new NotFoundException({
          error: 'CUSTOMER_NOT_FOUND',
          message: 'مشتری انتخاب‌شده پیدا نشد',
        });
      }
    }

    // کالا/قفسه پیش از نوشتن بررسی می‌شوند: وصل کردن به شناسه‌ی ناموجود یعنی
    // تبدیل بعداً وسط راه می‌شکند، جایی که مدیر دیگر نمی‌فهمد چرا.
    for (const row of input.lines) {
      if (typeof row.productId === 'string' && row.productId) {
        const product = await this.prisma.product.findUnique({
          where: { id: row.productId },
          select: { id: true },
        });
        if (!product) {
          throw new NotFoundException({
            error: 'PRODUCT_NOT_FOUND',
            message: 'کالای انتخاب‌شده پیدا نشد',
          });
        }
      }
      if (typeof row.locationId === 'string' && row.locationId) {
        const location = await this.prisma.location.findUnique({
          where: { id: row.locationId },
          select: { id: true },
        });
        if (!location) {
          throw new NotFoundException({
            error: 'LOCATION_NOT_FOUND',
            message: 'قفسه‌ی انتخاب‌شده پیدا نشد',
          });
        }
      }
    }

    // جمعِ قطعی فقط از قیمت نهایی؛ سقف مبلغ مثل فاکتور واقعی.
    const total = q.lines.reduce((sum, line) => {
      const row = input.lines.find((r) => r.lineId === line.id);
      const finalPrice = row?.finalPrice !== undefined ? row.finalPrice : line.finalPrice;
      const quantity = row?.quantity !== undefined ? row.quantity : line.quantity;
      return sum + quantity * (finalPrice ?? 0);
    }, 0);

    if (total > INT4_MAX) {
      throw new BadRequestException({
        error: 'AMOUNT_TOO_LARGE',
        message: 'مبلغ برگه از حد مجاز بیشتر است',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const row of input.lines) {
        await tx.blankQuotationLine.update({
          where: { id: row.lineId },
          data: {
            ...(row.text !== undefined ? { text: row.text.trim() } : {}),
            ...(row.finalPrice !== undefined
              ? { finalPrice: row.finalPrice, pricedAt: new Date() }
              : {}),
            ...(row.quantity !== undefined ? { quantity: row.quantity } : {}),
            // `null` یعنی «وصل را بردار»، `undefined` یعنی «دست نزن».
            ...(row.productId !== undefined ? { productId: row.productId } : {}),
            ...(row.locationId !== undefined ? { locationId: row.locationId } : {}),
          },
        });
      }

      const pricedRows = await tx.blankQuotationLine.findMany({
        where: { blankQuotationId: id },
        select: { pricedAt: true },
      });
      const allPriced = pricedRows.every((r) => r.pricedAt !== null);

      await tx.blankQuotation.update({
        where: { id },
        data: {
          ...(allPriced ? { status: BlankQuotationStatus.PRICED } : {}),
          ...(input.customerName !== undefined
            ? { customerName: input.customerName.trim() || null }
            : {}),
          ...(input.customerId !== undefined
            ? { customerId: input.customerId?.trim() || null }
            : {}),
          ...(input.note !== undefined ? { note: input.note.trim() || null } : {}),
        },
      });
    });

    return this.findOne(id);
  }

  // ---------- پیشنهاد کالا (نیمه‌خودکار) ----------

  /**
   * برای هر قلمِ بدون کالا، نزدیک‌ترین کالاهای سیستم را برمی‌گرداند.
   *
   * از همان موتور جست‌وجوی محصول استفاده می‌کند که پنل و صندوق استفاده می‌کنند
   * (`ProductsService.searchWithStock`) — پس پیشنهادی که مدیر می‌بیند همان چیزی
   * است که اگر خودش تایپ می‌کرد پیدا می‌کرد، به‌علاوه‌ی موجودی و آدرس قفسه تا
   * «وصل کن + قفسه» یک کلیک باشد. موتور مشابهت‌یابی جدایی نوشته نشده است.
   */
  async suggestions(id: string): Promise<BlankLineSuggestion[]> {
    const q = await this.prisma.blankQuotation.findUnique({
      where: { id },
      include: { lines: { orderBy: LINE_ORDER } },
    });

    if (!q) {
      throw new NotFoundException({
        error: 'BLANK_QUOTATION_NOT_FOUND',
        message: 'پیش‌فاکتور سفید پیدا نشد',
      });
    }

    const out: BlankLineSuggestion[] = [];

    for (let lineIndex = 0; lineIndex < q.lines.length; lineIndex++) {
      const line = q.lines[lineIndex];

      if (line.productId) {
        out.push({
          lineId: line.id,
          lineIndex,
          text: line.text,
          status: 'LINKED',
          best: null,
          candidates: [],
        });
        continue;
      }

      const candidates = await this.searchCandidates(line.text);
      out.push({
        lineId: line.id,
        lineIndex,
        text: line.text,
        status: candidates.length ? 'SUGGEST' : 'NONE',
        best: candidates[0] ?? null,
        candidates,
      });
    }

    return out;
  }

  private async searchCandidates(text: string): Promise<BlankSuggestionCandidate[]> {
    const clean = normalizePersian(text).trim();
    if (clean.length < 2) return [];

    const rows = (await this.products.searchWithStock(clean, {
      includePurchase: false,
    })) as unknown as Array<{
      id: string;
      name: string;
      sku: string | null;
      unit: string | null;
      salePrice: number | null;
      totalStock: number;
      locations?: Array<{ locationId: string; path: string; quantity: number }>;
    }>;

    return rows.slice(0, MAX_SUGGESTIONS).map((r) => {
      // پرموجودترین قفسه پیشنهاد می‌شود؛ `locations` از قبل نزولی است.
      const top = (r.locations ?? []).find((l) => l.quantity > 0) ?? null;
      return {
        productId: r.id,
        name: r.name,
        sku: r.sku,
        unit: r.unit,
        salePrice: r.salePrice,
        totalStock: r.totalStock,
        locationId: top?.locationId ?? null,
        locationPath: top?.path ?? null,
      };
    });
  }

  // ---------- تبدیل به فاکتور (فقط مدیر) ----------

  /**
   * تبدیل برگه به فاکتور واقعی — **تنها جایی که موجودی کم می‌شود**.
   *
   * گاردها به‌ترتیب: وجود ⇒ تبدیل‌شده ⇒ لغو‌شده ⇒ منقضی ⇒ قلمِ بی‌کالا ⇒
   * قلمِ بی‌قیمت. کمبود موجودی را خودِ `createInvoice` می‌گیرد.
   *
   * کلید یکتای فاکتور **از شناسه‌ی خودِ برگه** ساخته می‌شود و کلاینت نمی‌تواند
   * عوضش کند: دو تبدیلِ هم‌زمان با دو کلیدِ متفاوت، دو فاکتور می‌ساختند و موجودی
   * دو بار کم می‌شد (همان اشتباهی که در `QuotationsService` ثبت شده است).
   */
  async convert(id: string, body: ConvertBlankQuotationDto, userId?: string) {
    const q = await this.prisma.blankQuotation.findUnique({
      where: { id },
      include: { lines: { orderBy: LINE_ORDER } },
    });

    if (!q) {
      throw new NotFoundException({
        error: 'BLANK_QUOTATION_NOT_FOUND',
        message: 'پیش‌فاکتور سفید پیدا نشد',
      });
    }

    if (q.status === BlankQuotationStatus.CONVERTED) {
      throw new ConflictException({
        error: 'ALREADY_CONVERTED',
        invoiceId: q.convertedInvoiceId,
        message: 'این برگه قبلاً به فاکتور تبدیل شده است',
      });
    }

    if (q.status === BlankQuotationStatus.CANCELLED) {
      throw new ConflictException({
        error: 'NOT_OPEN',
        status: q.status,
        message: 'این برگه لغو شده است',
      });
    }

    if (q.validUntil && q.validUntil.getTime() < Date.now()) {
      throw new ConflictException({
        error: 'BLANK_QUOTATION_EXPIRED',
        validUntil: q.validUntil,
        message: 'اعتبار این برگه تمام شده است',
      });
    }

    const unlinked = q.lines.findIndex((l) => !l.productId);
    if (unlinked >= 0) {
      throw new BadRequestException({
        error: 'PRODUCT_REQUIRED',
        lineIndex: unlinked,
        message: 'برای تبدیل، هر قلم باید به یک کالای واقعی وصل شود',
      });
    }

    const unpriced = q.lines.findIndex((l) => l.pricedAt === null);
    if (unpriced >= 0) {
      throw new BadRequestException({
        error: 'UNPRICED_LINE',
        lineIndex: unpriced,
        message: 'برای تبدیل، همه‌ی اقلام باید قیمت نهایی داشته باشند',
      });
    }

    const invoice = await this.sales.createInvoice(
      {
        idempotencyKey: `blank-${q.id}`,
        warehouseId: q.warehouseId,
        // اولویت با مشتریِ انتخابیِ همین درخواست است؛ نبودش، پیوندِ ذخیره‌شده‌ی
        // برگه (اگر مدیر نام را به پرونده وصل کرده باشد) فاکتور را به مشتری
        // می‌بندد. هر دو خالی یعنی فروشِ گذری بدون مشتری.
        customerId: body?.customerId ?? q.customerId ?? undefined,
        note: q.note ?? undefined,
        lines: q.lines.map((l) => ({
          productId: l.productId!,
          // قفسه اختیاری است: نبودنش یعنی «نمی‌دانم کجاست» و فاکتور روی مکان
          // سیستمیِ «موجودی ثبت‌نشده» می‌نشیند — همان قرار `InvoiceLineDto`.
          locationId: l.locationId ?? undefined,
          quantity: l.quantity,
          unitPrice: l.finalPrice ?? 0,
          // متنِ دلخواهِ قلم روی برگه‌ی فاکتور هم می‌ماند (توضیحِ ردیف).
          lineNote: l.text.trim() || undefined,
        })),
        dueDate: body?.dueDate,
        payments: body?.payments,
      },
      userId,
    );

    await this.prisma.blankQuotation.update({
      where: { id },
      data: {
        status: BlankQuotationStatus.CONVERTED,
        convertedInvoiceId: invoice.id,
      },
    });

    return invoice;
  }

  async cancel(id: string) {
    const claimed = await this.prisma.blankQuotation.updateMany({
      where: {
        id,
        status: { in: [BlankQuotationStatus.OPEN, BlankQuotationStatus.PRICED] },
      },
      data: { status: BlankQuotationStatus.CANCELLED },
    });

    if (claimed.count === 0) {
      const current = await this.prisma.blankQuotation.findUnique({ where: { id } });
      if (!current) {
        throw new NotFoundException({
          error: 'BLANK_QUOTATION_NOT_FOUND',
          message: 'پیش‌فاکتور سفید پیدا نشد',
        });
      }
      throw new ConflictException({
        error: 'NOT_OPEN',
        status: current.status,
        message: 'این برگه قابل لغو نیست',
      });
    }

    return this.findOne(id);
  }

  // ---------- کمکی‌ها ----------

  private assertLinesValid(lines: BlankQuotationLineDto[]) {
    if (!lines?.length) {
      throw new BadRequestException({
        error: 'NO_LINES',
        message: 'برگه باید حداقل یک قلم داشته باشد',
      });
    }

    let suggestedTotal = 0;

    lines.forEach((l, lineIndex) => {
      if (normalizePersian(l.text ?? '').trim().length === 0) {
        throw new BadRequestException({
          error: 'EMPTY_TEXT',
          lineIndex,
          message: 'متن قلم نمی‌تواند خالی باشد',
        });
      }
      if (!l.quantity || l.quantity <= 0) {
        throw new BadRequestException({
          error: 'INVALID_QUANTITY',
          lineIndex,
          message: 'تعداد باید بزرگ‌تر از صفر باشد',
        });
      }
      if (l.suggestedPrice !== undefined && l.suggestedPrice < 0) {
        throw new BadRequestException({
          error: 'INVALID_PRICE',
          lineIndex,
          message: 'قیمت نمی‌تواند منفی باشد',
        });
      }
      suggestedTotal += l.quantity * (l.suggestedPrice ?? 0);
    });

    // سقفِ مبلغ حتی روی پیشنهادها اعمال می‌شود: یک درخواست نباید عددهای
    // بی‌معنا وارد کند.
    if (suggestedTotal > INT4_MAX) {
      throw new BadRequestException({
        error: 'AMOUNT_TOO_LARGE',
        message: 'مبلغ برگه از حد مجاز بیشتر است',
      });
    }
  }

  /**
   * انبار پیش‌فرض مغازه — همان روشی که `sync.service` استفاده می‌کند.
   *
   * لازم است چون گوشی هیچ‌وقت `warehouseId` نمی‌فرستد: `LoginResponse` آن را
   * ندارد و فروشنده‌ی پشت پیشخوان نباید انتخابگر انبار ببیند.
   */
  private async resolveDefaultWarehouse(): Promise<string> {
    const warehouse = await this.prisma.warehouse.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!warehouse) {
      throw new BadRequestException({
        error: 'NO_WAREHOUSE',
        message: 'هیچ انباری تعریف نشده است',
      });
    }

    return warehouse.id;
  }

  private isUniqueViolation(e: unknown, field: string): boolean {
    const err = e as { code?: string; meta?: { target?: string[] | string } };
    if (err?.code !== 'P2002') return false;
    const target = err.meta?.target;
    if (!target) return true;
    return Array.isArray(target) ? target.includes(field) : String(target).includes(field);
  }

  /** نقشه‌ی خالصِ رکورد به خروجی — بدون کوئری اضافه. */
  private decorate(q: RawBlank): BlankQuotationView {
    const isExpired =
      (q.status === BlankQuotationStatus.OPEN || q.status === BlankQuotationStatus.PRICED) &&
      !!q.validUntil &&
      q.validUntil.getTime() < Date.now();

    const total = q.lines.reduce((s, l) => s + l.quantity * (l.finalPrice ?? 0), 0);

    return {
      id: q.id,
      number: q.number,
      status: q.status,
      displayStatus: isExpired ? 'EXPIRED' : q.status,
      customerName: q.customerName,
      customer: q.customer
        ? {
            id: q.customer.id,
            fullName: [q.customer.firstName, q.customer.lastName]
              .filter(Boolean)
              .join(' '),
          }
        : null,
      note: q.note,
      validUntil: q.validUntil,
      convertedInvoiceId: q.convertedInvoiceId,
      createdAt: q.createdAt,
      user: q.user ?? null,
      lineCount: q.lines.length,
      unpricedCount: q.lines.filter((l) => l.pricedAt === null).length,
      unlinkedCount: q.lines.filter((l) => !l.productId).length,
      total,
      lines: q.lines.map((l) => ({
        id: l.id,
        text: l.text,
        quantity: l.quantity,
        suggestedPrice: l.suggestedPrice,
        finalPrice: l.finalPrice,
        pricedAt: l.pricedAt,
        product: null,
        locationId: l.locationId,
        locationPath: null,
        lineTotal: l.quantity * (l.finalPrice ?? 0),
      })),
    };
  }

  /**
   * نام کالا و مسیر قفسه را ضمیمه می‌کند.
   *
   * جدا از `decorate` است تا فهرست (۲۰ ردیف در صفحه) دو کوئری اضافه ندهد.
   * کالا و قفسه ممکن است حذف نرم شده باشند؛ در آن صورت `product` نال می‌ماند و
   * متنِ قلم همچنان خوانا است — برگه‌ی ماه پیش نباید با حذف یک کالا بشکند.
   */
  private async attachRefs(
    view: BlankQuotationView,
    rawLines: RawLine[],
  ): Promise<BlankQuotationView> {
    const productIds = [...new Set(rawLines.map((l) => l.productId).filter(Boolean))] as string[];
    const locationIds = [
      ...new Set(rawLines.map((l) => l.locationId).filter((x): x is string => !!x)),
    ];

    const [products, locations] = await Promise.all([
      productIds.length
        ? this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, sku: true, unit: true },
          })
        : Promise.resolve([]),
      locationIds.length
        ? this.prisma.location.findMany({
            where: { id: { in: locationIds } },
            select: { id: true, path: true },
          })
        : Promise.resolve([]),
    ]);

    const productById = new Map(products.map((p) => [p.id, p]));
    const pathById = new Map(locations.map((l) => [l.id, l.path]));

    const productByLineId = new Map(
      rawLines.map((l) => [l.id, l.productId ? productById.get(l.productId) ?? null : null]),
    );
    const pathByLineId = new Map(
      rawLines.map((l) => [l.id, l.locationId ? pathById.get(l.locationId) ?? null : null]),
    );

    return {
      ...view,
      lines: view.lines.map((l) => ({
        ...l,
        product: productByLineId.get(l.id) ?? null,
        locationPath: pathByLineId.get(l.id) ?? null,
      })),
    };
  }
}
