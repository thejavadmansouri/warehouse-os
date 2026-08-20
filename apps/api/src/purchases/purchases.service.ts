import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, PurchaseStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { SystemLocationsService } from '../inventory/system-locations.service';
import { INT4_MAX } from '../common/money';
import { inLockOrder } from '../common/lock-order';

import {
  CreatePurchaseDto,
  QueryPurchasesDto,
} from './dto/create-purchase.dto';


/**
 * فاکتور خرید — ورودِ کالا از روی برگه‌ای که فروشنده همراه جنس می‌آورد.
 *
 * سه چیز که کل این سرویس رویشان بنا شده:
 *
 * ۱. **ردیف‌ها همان لجرند.** هر قلم یک `InventoryLog` با `action=IN` و
 *    `purchaseId` همین سند است — دقیقاً مثل فاکتور فروش. پس جمعِ سند و حرکتِ
 *    واقعیِ انبار از یک منبع می‌آیند و امکان اختلاف ندارند (قانون ۱ و ۲).
 *
 * ۲. **قیمت خرید ثبت می‌شود.** بدون این، `SaleInvoice.profit` برای کالا null
 *    می‌ماند و گزارش سود خالی است. همان کاری که فروش با قیمتِ فروش می‌کند.
 *
 * ۳. **مکان اختیاری است.** حسابدار جای فیزیکی جنس را نمی‌داند و متوقف‌کردن
 *    ثبت به‌خاطر این ندانستن، بدتر از نشاندنِ موقتِ جنس روی «انبار موقت» است.
 */
@Injectable()
export class PurchasesService {

  constructor(
    private prisma: PrismaService,
    private operation: InventoryOperationService,
    private systemLocations: SystemLocationsService,
  ) {}


  async create(dto: CreatePurchaseDto, userId?: string) {

    // ---- بررسی‌های ارزان، پیش از باز کردن تراکنش ----

    const existing = await this.prisma.purchaseInvoice.findUnique({
      where:{ idempotencyKey: dto.idempotencyKey },
    });
    if (existing) return this.findOne(existing.id);


    const warehouse = await this.prisma.warehouse.findUnique({
      where:{ id: dto.warehouseId },
      select:{ id:true },
    });
    if (!warehouse) {
      throw new NotFoundException({
        error:'WAREHOUSE_NOT_FOUND',
        message:'انبار پیدا نشد',
      });
    }


    // مکانِ هر ردیف باید در همین انبار باشد — همان محافظی که فروش دارد. بدون
    // آن یک locationId از انبار دیگر، موجودیِ آن انبار را زیاد می‌کرد.
    const locationIds = [
      ...new Set(
        dto.lines.map(l => l.locationId).filter((id): id is string => !!id),
      ),
    ];

    if (locationIds.length) {
      const valid = await this.prisma.location.findMany({
        where:{ id:{ in: locationIds }, warehouseId: dto.warehouseId },
        select:{ id:true },
      });

      if (valid.length !== locationIds.length) {
        const ok = new Set(valid.map(l => l.id));
        const lineIndex = dto.lines.findIndex(l => l.locationId && !ok.has(l.locationId));
        throw new BadRequestException({
          error:'LOCATION_NOT_IN_WAREHOUSE',
          lineIndex,
          locationId: dto.lines[lineIndex]?.locationId,
          message:'مکان انتخاب‌شده در این انبار نیست',
        });
      }
    }


    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({
        where:{ id: dto.supplierId },
        select:{ id:true },
      });
      if (!supplier) {
        throw new NotFoundException({
          error:'SUPPLIER_NOT_FOUND',
          message:'تأمین‌کننده پیدا نشد',
        });
      }
    }


    // یک کالا از یک مکان نباید دو ردیف جدا داشته باشد؛ وگرنه سقفِ ابطال و
    // شمارشِ ردیف‌ها گمراه‌کننده می‌شود. کلاینت باید ادغام کند.
    const seen = new Set<string>();
    dto.lines.forEach((line, i) => {
      const key = `${line.productId}::${line.locationId ?? ''}`;
      if (seen.has(key)) {
        throw new BadRequestException({
          error:'DUPLICATE_LINE',
          lineIndex:i,
          message:'یک کالا برای یک مکان نباید دو ردیف جداگانه داشته باشد',
        });
      }
      seen.add(key);
    });


    // ---- مبالغ ----

    const subtotal = dto.lines.reduce(
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

    if (subtotal > INT4_MAX || total > INT4_MAX) {
      throw new BadRequestException({
        error:'AMOUNT_TOO_LARGE',
        max: INT4_MAX,
        message:'مبلغ فاکتور از حد مجاز بیشتر است',
      });
    }


    // ---- تراکنش ----

    try {

      const purchaseId = await this.prisma.$transaction(async (tx) => {

        const purchase = await tx.purchaseInvoice.create({
          data:{
            idempotencyKey: dto.idempotencyKey,
            warehouseId: dto.warehouseId,
            supplierId: dto.supplierId ?? null,
            userId: userId ?? null,
            supplierRef: dto.supplierRef?.trim() || null,
            invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : null,
            subtotal,
            discount,
            total,
            note: dto.note ?? null,
            status: PurchaseStatus.CONFIRMED,
          },
        });

        // ردیفِ بی‌مکان روی «انبار موقت» می‌نشیند. یک بار حساب می‌شود تا برای
        // هر ردیف کوئری تکراری نزنیم.
        const needsStaging = dto.lines.some(l => !l.locationId);
        const stagingId = needsStaging
          ? await this.systemLocations.staging(tx, dto.warehouseId)
          : null;

        // ترتیبِ ثابتِ قفل‌گیری. مکان اینجا resolve می‌شود چون ردیفِ بی‌مکان
        // قفلِ «انبار موقت» را می‌گیرد، نه قفلِ مکانی که نفرستاده.
        const orderedLines = inLockOrder(
          dto.lines.map((line) => ({
            line,
            locationId: line.locationId ?? stagingId!,
          })),
          (l) => ({ productId: l.line.productId, locationId: l.locationId }),
        );

        for (const { line, locationId } of orderedLines) {
          await this.operation.execute(
            {
              type:'IN',
              productId: line.productId,
              locationId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              purchaseId: purchase.id,
              userId: userId ?? null,
              source:'PURCHASE',
            },
            tx,
          );
        }

        await this.learnPurchasePrices(tx, dto);

        return purchase.id;
      });

      return this.findOne(purchaseId);

    } catch (err:any) {
      // برخورد همزمان روی همان کلید: سند موجود برگردانده شود.
      if (err?.code === 'P2002') {
        const dup = await this.prisma.purchaseInvoice.findUnique({
          where:{ idempotencyKey: dto.idempotencyKey },
        });
        if (dup) return this.findOne(dup.id);
      }
      throw err;
    }
  }


  /**
   * ابطال فاکتور خرید.
   *
   * لجر append-only است: ردیف‌های IN حذف نمی‌شوند، برای هر کدام یک حرکتِ OUT
   * جبرانی ثبت می‌شود.
   *
   * ⚠️ **عمداً `allowNegative` ندارد.** اگر جنس بین ورود و ابطال فروخته یا
   * جابه‌جا شده باشد، ابطال باید با خطای روشن رد شود نه اینکه قفسه را منفی کند.
   * «جنسی که رفته را نمی‌شود وارد‌نشده اعلام کرد» — اصلاحش کارِ ADJUST است که
   * رد باقی می‌گذارد.
   */
  async cancel(id: string, reason: string, userId?: string) {

    await this.prisma.$transaction(async (tx) => {

      // ادعای اتمیک: فقط یک درخواست موفق می‌شود، حتی اگر دو نفر همزمان بزنند.
      const claimed = await tx.purchaseInvoice.updateMany({
        where:{ id, status: PurchaseStatus.CONFIRMED },
        data:{
          status: PurchaseStatus.CANCELLED,
          cancelReason: reason,
          cancelledAt: new Date(),
          cancelledById: userId ?? null,
        },
      });

      if (claimed.count === 0) {
        const current = await tx.purchaseInvoice.findUnique({ where:{ id } });
        if (!current) {
          throw new NotFoundException({
            error:'PURCHASE_NOT_FOUND',
            message:'فاکتور خرید پیدا نشد',
          });
        }
        throw new ConflictException({
          error:'ALREADY_CANCELLED',
          message:'این فاکتور قبلاً باطل شده است',
        });
      }

      const lines = await tx.inventoryLog.findMany({
        where:{ purchaseId: id, action:'IN' },
      });

      // ترتیبِ ثابتِ قفل‌گیری؛ `lineIndex` همان اندیسِ ردیف در سندِ خرید
      // می‌ماند تا پیامِ خطا به کالای درست اشاره کند.
      const orderedLines = inLockOrder(
        lines.map((line, index) => ({ line, index })),
        (l) => l.line,
      );

      for (const { line, index: i } of orderedLines) {
        try {
          await this.operation.execute(
            {
              type:'OUT',
              productId: line.productId,
              locationId: line.locationId,
              quantity: line.quantity,
              userId: userId ?? null,
              source:'PURCHASE_CANCEL',
              note:`ابطال فاکتور خرید: ${reason}`,
            },
            tx,
          );
        } catch (err:any) {
          const body = err?.response ?? err?.getResponse?.();
          if (body?.error === 'INSUFFICIENT_STOCK') {
            throw new ConflictException({
              error:'STOCK_ALREADY_MOVED',
              lineIndex:i,
              productId: line.productId,
              locationId: line.locationId,
              received: line.quantity,
              available: body.available ?? 0,
              message:
                'این کالا بعد از ورود فروخته یا جابه‌جا شده و موجودی برای ابطال کافی نیست — با «تعدیل موجودی» اصلاحش کنید',
            });
          }
          throw err;
        }
      }
    });

    return this.findOne(id);
  }


  async findOne(id: string) {

    const purchase = await this.prisma.purchaseInvoice.findUnique({
      where:{ id },
      include:{
        supplier:{ select:{ id:true, name:true, phone:true } },
        warehouse:{ select:{ id:true, name:true, code:true } },
        user:{ select:{ id:true, fullName:true, username:true } },
        // فقط ردیف‌های ورود. حرکت‌های OUTِ ابطال هم purchaseId ندارند ولی
        // فیلتر صریح می‌ماند تا اگر روزی داشتند، جمعِ نمایشی خراب نشود.
        lines:{
          where:{ action:'IN' },
          include:{
            product:{ select:{ id:true, name:true, sku:true, unit:true } },
            location:{ select:{ id:true, name:true, code:true, path:true } },
          },
          orderBy:{ createdAt:'asc' },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundException({
        error:'PURCHASE_NOT_FOUND',
        message:'فاکتور خرید پیدا نشد',
      });
    }

    return purchase;
  }


  async findAll(q: QueryPurchasesDto) {

    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 20));

    const where: Prisma.PurchaseInvoiceWhereInput = {};

    if (q.warehouseId) where.warehouseId = q.warehouseId;
    if (q.supplierId) where.supplierId = q.supplierId;
    if (q.status) where.status = q.status as PurchaseStatus;

    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }

    if (q.q?.trim()) {
      const term = q.q.trim();
      const asNumber = Number(term);
      where.OR = [
        { supplierRef:{ contains: term, mode:'insensitive' } },
        { supplier:{ name:{ contains: term, mode:'insensitive' } } },
        ...(Number.isInteger(asNumber) ? [{ number: asNumber }] : []),
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseInvoice.findMany({
        where,
        include:{
          supplier:{ select:{ id:true, name:true } },
          user:{ select:{ id:true, fullName:true } },
          // فقط ردیف‌های ورود شمرده می‌شوند — همان درسی که شمارشِ اقلامِ
          // فاکتور فروش داد.
          _count:{ select:{ lines:{ where:{ action:'IN' } } } },
        },
        orderBy:{ createdAt:'desc' },
        skip:(page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);

    return {
      data,
      meta:{ total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) },
    };
  }


  // ---------- کمکی‌ها ----------

  /**
   * قیمتی که روی فاکتور خرید آمده را به‌عنوان قیمتِ خریدِ کالا ثبت می‌کند.
   *
   * قرینه‌ی `SalesService.learnPricesFromSale` است و همان قواعد را دارد:
   * `ProductPrice` تاریخچه‌ای است پس ردیف تازه اضافه می‌شود نه بازنویسی، و
   * قیمتِ فروش و عمده دست‌نخورده منتقل می‌شوند چون حسابدار آن‌ها را نزده است.
   *
   * همین تابع است که گزارش سود را از حالت خالی درمی‌آورد.
   */
  private async learnPurchasePrices(
    tx: Prisma.TransactionClient,
    dto: CreatePurchaseDto,
  ) {
    // قیمت صفر یعنی «هدیه/گارانتی»، نه قیمتِ واقعی — یاد گرفته نمی‌شود، وگرنه
    // سودِ آن کالا تا ابد برابر کلِ قیمتِ فروش نشان داده می‌شود.
    const priced = dto.lines.filter(l => l.unitPrice > 0);
    if (!priced.length) return;

    // آخرین قیمتِ هر کالا در همین فاکتور برنده است.
    const wanted = new Map<string, number>();
    for (const l of priced) wanted.set(l.productId, l.unitPrice);

    const current = await tx.productPrice.findMany({
      where:{ productId:{ in: [...wanted.keys()] } },
      orderBy:{ createdAt:'desc' },
    });

    const latest = new Map<
      string,
      { salePrice: number | null; purchasePrice: number | null; wholesalePrice: number | null }
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
      // قیمتی که عوض نشده ردیف تازه نمی‌سازد، وگرنه تاریخچه با هر خرید شلوغ می‌شود.
      .filter(([productId, purchasePrice]) =>
        latest.get(productId)?.purchasePrice !== purchasePrice)
      .map(([productId, purchasePrice]) => ({
        productId,
        purchasePrice,
        salePrice: latest.get(productId)?.salePrice ?? null,
        wholesalePrice: latest.get(productId)?.wholesalePrice ?? null,
      }));

    if (rows.length) await tx.productPrice.createMany({ data: rows });
  }
}
