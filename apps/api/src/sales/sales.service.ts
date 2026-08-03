import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, PaymentMethod, InvoiceStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { normalizePersian } from '../engine/utils/persian-normalize';
import { normalizePhone } from '../common/phone.util';

import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';


/**
 * بیشترین عددی که در ستون Int (INT4 پستگرس) جا می‌شود.
 * واحد پول تومان است، پس سقف هر فاکتور ≈ ۲.۱ میلیارد تومان.
 */
const INT4_MAX = 2_147_483_647;

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
  ) {}


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

    const total = subtotal - discount;

    // ستون‌های مبلغ از نوع Int هستند (INT4 پستگرس). اگر جلوی سرریز گرفته نشود،
    // Prisma با خطای خام می‌ترکد و مسیر فایل و متن کوئری به کلاینت درز می‌کند.
    // سقف ≈ ۲.۱ میلیارد تومان برای هر فاکتور.
    if (subtotal > INT4_MAX || total > INT4_MAX) {
      throw new BadRequestException({
        error:'AMOUNT_TOO_LARGE',
        max: INT4_MAX,
        message:'مبلغ فاکتور از حد مجاز بیشتر است',
      });
    }


    // پیش‌فرض فروش نقدیِ گذری: اگر کلاینت اصلاً payments نفرستد، یعنی کل مبلغ
    // نقد دریافت شده. این حالت رایج‌ترین فروش سر پیشخوان است و نباید کاربر را
    // مجبور کند برای هر فاکتور ساده یک سطر پرداخت هم بفرستد.
    // برای ثبت نسیه باید صراحتاً payments با method=CREDIT فرستاده شود.
    const payments =
      dto.payments && dto.payments.length > 0
        ? dto.payments
        : [{ method: PaymentMethod.CASH, amount: total, note: null as string | null }];

    const paidAmount =
      payments
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


    // نسیه بدون مشتری قابل پیگیری نیست.
    if (dueAmount > 0 && !dto.customerId && !dto.customer) {
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

        const customerId = await this.resolveCustomer(tx, dto);

        const invoice = await tx.saleInvoice.create({
          data:{
            idempotencyKey: dto.idempotencyKey,
            warehouseId: dto.warehouseId,
            customerId,
            userId: userId ?? null,
            subtotal,
            discount,
            total,
            paidAmount,
            dueAmount,
            profit,
            note: dto.note ?? null,
            status: InvoiceStatus.CONFIRMED,
          },
        });


        // هر ردیف از مسیر تک‌نقطه‌ی تغییر موجودی رد می‌شود (قانون ۱).
        // tx پاس داده می‌شود تا همه‌ی ردیف‌ها در یک تراکنش بمانند.
        for (let i = 0; i < dto.lines.length; i++) {
          const line = dto.lines[i];
          try {
            await this.operation.execute(
              {
                type:'SALE',
                productId: line.productId,
                locationId: line.locationId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
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
                locationId: line.locationId,
                requested: line.quantity,
                available: body.available ?? 0,
                message:'موجودی این کالا در این مکان کافی نیست',
              };
              throw new ConflictException(detail);
            }
            throw err;
          }
        }


        for (const p of payments) {
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
              },
            });
          }
        }

        return invoice.id;
      });

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


      const lines = await tx.inventoryLog.findMany({
        where:{ invoiceId: id, action:'SALE' },
      });

      for (const line of lines) {
        await this.operation.execute(
          {
            type:'RETURN',
            productId: line.productId,
            locationId: line.locationId,
            quantity: line.quantity,
            invoiceId: id,
            userId: userId ?? null,
            source:'SALE_CANCEL',
            note:`ابطال فاکتور: ${reason}`,
          },
          tx,
        );
      }
    });

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
        lines:{
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

    return invoice;
  }


  async findAll(q: QueryInvoicesDto) {

    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;

    const where: Prisma.SaleInvoiceWhereInput = {};

    if (q.warehouseId) where.warehouseId = q.warehouseId;
    if (q.customerId) where.customerId = q.customerId;
    if (q.status) where.status = q.status as InvoiceStatus;

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
          _count:{ select:{ lines:true } },
        },
        orderBy:{ createdAt:'desc' },
        skip:(page - 1) * pageSize,
        take:pageSize,
      }),
      this.prisma.saleInvoice.count({ where }),
    ]);

    return {
      data,
      meta:{ total, page, pageSize, pageCount: Math.ceil(total / pageSize) },
    };
  }


  // ---------- کمکی‌ها ----------

  /**
   * سود = مجموع (قیمت فروش - آخرین قیمت خرید) × تعداد.
   * اگر قیمت خرید حتی یک کالا موجود نباشد null برمی‌گردد.
   */
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
