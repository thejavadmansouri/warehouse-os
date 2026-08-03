import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, QuotationStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from './sales.service';
import { normalizePersian } from '../engine/utils/persian-normalize';
import { normalizePhone } from '../common/phone.util';


export interface QuotationLineInput {
  productId: string;
  locationId?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export interface CreateQuotationInput {
  warehouseId: string;
  customerId?: string;
  customer?: { firstName: string; lastName?: string; phone?: string };
  discount?: number;
  note?: string;
  /** مدت اعتبار به دقیقه — ۶۰ یعنی یک ساعت، ۱۴۴۰ یعنی یک شبانه‌روز. */
  validForMinutes?: number;
  /** یا مستقیم تاریخ انقضا (ISO). اگر هر دو داده شود، این اولویت دارد. */
  validUntil?: string;
  lines: QuotationLineInput[];
}

const DEFAULT_VALID_MINUTES = 24 * 60;
const INT4_MAX = 2_147_483_647;


@Injectable()
export class QuotationsService {

  constructor(
    private prisma: PrismaService,
    private sales: SalesService,
  ) {}


  /**
   * ساخت پیش‌فاکتور.
   *
   * **هیچ حرکتی در موجودی ثبت نمی‌کند.** مشتری فقط قیمت می‌گیرد؛ اگر این کار
   * از مسیر فاکتور واقعی می‌رفت، صرفِ قیمت گرفتن انبار را خالی می‌کرد.
   * موجودی فقط در لحظه‌ی تبدیل به فاکتور بررسی و کم می‌شود.
   */
  async create(input: CreateQuotationInput, userId?: string) {

    if (!input.lines?.length) {
      throw new BadRequestException({
        error: 'NO_LINES',
        message: 'پیش‌فاکتور باید حداقل یک ردیف داشته باشد',
      });
    }

    input.lines.forEach((l, i) => {
      if (!l.quantity || l.quantity <= 0) {
        throw new BadRequestException({
          error: 'INVALID_QUANTITY',
          lineIndex: i,
          message: 'تعداد باید بزرگ‌تر از صفر باشد',
        });
      }
      if (l.unitPrice < 0) {
        throw new BadRequestException({
          error: 'INVALID_PRICE',
          lineIndex: i,
          message: 'قیمت نمی‌تواند منفی باشد',
        });
      }
    });

    const subtotal = input.lines.reduce(
      (s, l) => s + l.quantity * l.unitPrice - (l.discount ?? 0),
      0,
    );
    const discount = input.discount ?? 0;

    if (discount > subtotal) {
      throw new BadRequestException({
        error: 'DISCOUNT_EXCEEDS_TOTAL',
        message: 'تخفیف از مبلغ پیش‌فاکتور بیشتر است',
      });
    }

    const total = subtotal - discount;

    if (subtotal > INT4_MAX || total > INT4_MAX) {
      throw new BadRequestException({
        error: 'AMOUNT_TOO_LARGE',
        message: 'مبلغ پیش‌فاکتور از حد مجاز بیشتر است',
      });
    }

    const validUntil = this.resolveValidUntil(input);

    const id = await this.prisma.$transaction(async (tx) => {
      const customerId = await this.resolveCustomer(tx, input);

      const q = await tx.quotation.create({
        data: {
          warehouseId: input.warehouseId,
          customerId,
          userId: userId ?? null,
          subtotal,
          discount,
          total,
          validUntil,
          note: input.note ?? null,
          lines: {
            create: input.lines.map((l) => ({
              productId: l.productId,
              locationId: l.locationId ?? null,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discount: l.discount ?? 0,
            })),
          },
        },
      });

      return q.id;
    });

    return this.findOne(id);
  }


  /**
   * تبدیل پیش‌فاکتور به فاکتور واقعی.
   *
   * اینجاست که موجودی برای اولین بار بررسی و کم می‌شود — از همان مسیر
   * SalesService، پس قانون ۱ و اتمیک بودن ردیف‌ها حفظ می‌شود.
   *
   * پیش‌فاکتور منقضی تبدیل نمی‌شود: کل معنای «اعتبار» همین است که بعد از آن
   * قیمت دیگر تضمین‌شده نیست. مدیر می‌تواند اعتبار را تمدید کند.
   */
  async convert(
    id: string,
    body: { payments?: unknown[]; idempotencyKey?: string },
    userId?: string,
  ) {
    const q = await this.prisma.quotation.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!q) {
      throw new NotFoundException({
        error: 'QUOTATION_NOT_FOUND',
        message: 'پیش‌فاکتور پیدا نشد',
      });
    }

    if (q.status === QuotationStatus.CONVERTED) {
      throw new ConflictException({
        error: 'ALREADY_CONVERTED',
        invoiceId: q.convertedInvoiceId,
        message: 'این پیش‌فاکتور قبلاً به فاکتور تبدیل شده است',
      });
    }

    if (q.status === QuotationStatus.CANCELLED) {
      throw new ConflictException({
        error: 'QUOTATION_CANCELLED',
        message: 'این پیش‌فاکتور لغو شده است',
      });
    }

    if (q.validUntil.getTime() < Date.now()) {
      throw new ConflictException({
        error: 'QUOTATION_EXPIRED',
        validUntil: q.validUntil,
        message: 'اعتبار این پیش‌فاکتور تمام شده؛ برای تبدیل باید تمدید شود',
      });
    }

    // مکان در پیش‌فاکتور اختیاری بوده؛ برای فروش الزامی است.
    const missing = q.lines.findIndex((l) => !l.locationId);
    if (missing >= 0) {
      throw new BadRequestException({
        error: 'LOCATION_REQUIRED',
        lineIndex: missing,
        message: 'برای تبدیل به فاکتور، مکان برداشت هر کالا باید مشخص باشد',
      });
    }

    const invoice = await this.sales.createInvoice(
      {
        idempotencyKey: body.idempotencyKey ?? `quotation-${q.id}`,
        warehouseId: q.warehouseId,
        customerId: q.customerId ?? undefined,
        discount: q.discount || undefined,
        note: q.note ?? undefined,
        lines: q.lines.map((l) => ({
          productId: l.productId,
          locationId: l.locationId!,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount || undefined,
        })),
        payments: body.payments as never,
      } as never,
      userId,
    );

    await this.prisma.quotation.update({
      where: { id },
      data: {
        status: QuotationStatus.CONVERTED,
        convertedInvoiceId: invoice.id,
      },
    });

    return invoice;
  }


  /** تمدید اعتبار — فقط مدیر. */
  async extend(id: string, validForMinutes: number) {
    const q = await this.prisma.quotation.findUnique({ where: { id } });

    if (!q) {
      throw new NotFoundException({
        error: 'QUOTATION_NOT_FOUND',
        message: 'پیش‌فاکتور پیدا نشد',
      });
    }

    if (q.status !== QuotationStatus.ACTIVE) {
      throw new ConflictException({
        error: 'NOT_ACTIVE',
        status: q.status,
        message: 'فقط پیش‌فاکتور فعال قابل تمدید است',
      });
    }

    const minutes = Math.max(1, Number(validForMinutes) || DEFAULT_VALID_MINUTES);

    await this.prisma.quotation.update({
      where: { id },
      data: { validUntil: new Date(Date.now() + minutes * 60_000) },
    });

    return this.findOne(id);
  }


  async cancel(id: string) {
    const claimed = await this.prisma.quotation.updateMany({
      where: { id, status: QuotationStatus.ACTIVE },
      data: { status: QuotationStatus.CANCELLED },
    });

    if (claimed.count === 0) {
      const current = await this.prisma.quotation.findUnique({ where: { id } });
      if (!current) {
        throw new NotFoundException({
          error: 'QUOTATION_NOT_FOUND',
          message: 'پیش‌فاکتور پیدا نشد',
        });
      }
      throw new ConflictException({
        error: 'NOT_ACTIVE',
        status: current.status,
        message: 'فقط پیش‌فاکتور فعال قابل لغو است',
      });
    }

    return this.findOne(id);
  }


  async findOne(id: string) {
    const q = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        warehouse: { select: { id: true, name: true } },
        user: { select: { id: true, fullName: true } },
        lines: {
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true } },
          },
        },
      },
    });

    if (!q) {
      throw new NotFoundException({
        error: 'QUOTATION_NOT_FOUND',
        message: 'پیش‌فاکتور پیدا نشد',
      });
    }

    return this.decorate(q);
  }


  async findAll(query: {
    status?: string;
    customerId?: string;
    warehouseId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 20));

    const where: Prisma.QuotationWhereInput = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;

    // «منقضی» وضعیت ذخیره‌شده نیست، از تاریخ حساب می‌شود — وگرنه به یک
    // کار زمان‌بندی‌شده نیاز داشتیم که هر دقیقه رکوردها را به‌روز کند.
    if (query.status === 'EXPIRED') {
      where.status = QuotationStatus.ACTIVE;
      where.validUntil = { lt: new Date() };
    } else if (query.status === 'ACTIVE') {
      where.status = QuotationStatus.ACTIVE;
      where.validUntil = { gte: new Date() };
    } else if (query.status) {
      where.status = query.status as QuotationStatus;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true } },
          user: { select: { fullName: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return {
      data: data.map((q) => this.decorate(q)),
      meta: { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) },
    };
  }


  // ---------- کمکی‌ها ----------

  private decorate<
    T extends {
      status: QuotationStatus;
      validUntil: Date;
      customer?: { firstName: string; lastName: string | null } | null;
    },
  >(q: T) {
    const isExpired =
      q.status === QuotationStatus.ACTIVE && q.validUntil.getTime() < Date.now();

    return {
      ...q,
      isExpired,
      /** وضعیت قابل نمایش: منقضی، وضعیت ذخیره‌شده نیست و محاسبه می‌شود. */
      displayStatus: isExpired ? 'EXPIRED' : q.status,
      remainingMinutes: isExpired
        ? 0
        : Math.max(0, Math.round((q.validUntil.getTime() - Date.now()) / 60_000)),
      customerName: q.customer
        ? [q.customer.firstName, q.customer.lastName].filter(Boolean).join(' ')
        : null,
    };
  }


  private resolveValidUntil(input: CreateQuotationInput): Date {
    if (input.validUntil) {
      const d = new Date(input.validUntil);
      if (isNaN(d.getTime())) {
        throw new BadRequestException({
          error: 'INVALID_VALID_UNTIL',
          message: 'تاریخ اعتبار معتبر نیست',
        });
      }
      if (d.getTime() <= Date.now()) {
        throw new BadRequestException({
          error: 'VALID_UNTIL_IN_PAST',
          message: 'تاریخ اعتبار باید در آینده باشد',
        });
      }
      return d;
    }

    const minutes = Math.max(
      1,
      Number(input.validForMinutes) || DEFAULT_VALID_MINUTES,
    );
    return new Date(Date.now() + minutes * 60_000);
  }


  private async resolveCustomer(
    tx: Prisma.TransactionClient,
    input: CreateQuotationInput,
  ): Promise<string | null> {
    if (input.customerId) {
      const found = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!found) {
        throw new NotFoundException({
          error: 'CUSTOMER_NOT_FOUND',
          message: 'مشتری پیدا نشد',
        });
      }
      return found.id;
    }

    if (input.customer?.firstName?.trim()) {
      const phone = normalizePhone(input.customer.phone);

      if (phone) {
        const existing = await tx.customerPhone.findUnique({
          where: { phone },
          select: { customerId: true },
        });
        if (existing) return existing.customerId;
      }

      const created = await tx.customer.create({
        data: {
          firstName: input.customer.firstName.trim(),
          lastName: input.customer.lastName?.trim() || null,
          searchName: normalizePersian(
            `${input.customer.firstName} ${input.customer.lastName ?? ''}`,
          ).trim(),
          ...(phone ? { phones: { create: { phone, isPrimary: true } } } : {}),
        },
      });
      return created.id;
    }

    return null;
  }
}