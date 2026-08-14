import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';

@Injectable()
export class InventoryService {

  constructor(
    private prisma: PrismaService,
    private operation: InventoryOperationService
  ) {}


  async create(dto:any){

    return this.operation.execute({

      type:'IN',

      productId:dto.productId,

      locationId:dto.locationId,

      quantity:dto.quantity,

      note:dto.note,

      userId:dto.userId,

      source:'MANUAL'

    });

  }



  async adjust(dto:any){
    return this.operation.execute({
      type:'ADJUST',
      productId:dto.productId,
      locationId:dto.locationId,
      targetQuantity:dto.targetQuantity,
      note:dto.note,
      source:'MANUAL',
      userId:dto.userId,
    });
  }



  async out(dto:any){
    // موجودی داخل InventoryOperationService.execute به‌صورت اتمیک (داخل تراکنش) چک می‌شه؛
    // چک جداگانه‌ی اینجا حذف شد چون race condition ایجاد می‌کرد (بین این چک و اجرای عملیات).
    return this.operation.execute({

      type:'SALE',

      productId:dto.productId,

      locationId:dto.locationId,

      quantity:dto.quantity,

      unitPrice:dto.unitPrice,

      note:dto.note,

      userId:dto.userId,

      source:'SALE'

    });

  }



  // اسکن بارکد برای فروش: کالا را از بارکد/SKU/شماره‌فنی/بارکد داخلی پیدا کن و
  // موجودی‌اش را در یک درخواست برگردان (یک round-trip → فروش سریع پشت پیشخوان).
  async resolveForSale(rawBarcode: string) {
    const code = (rawBarcode || '').trim();
    if (!code) {
      throw new NotFoundException({ error: 'NOT_FOUND', message: 'بارکد خالی است' });
    }

    const product = await this.prisma.product.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [
          { barcodes: { some: { barcode: code } } },
          { internalBarcode: code },
          { sku: code },
          { partNumber: code },
        ],
      },
      include: { prices: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!product) {
      throw new NotFoundException({
        error: 'PRODUCT_NOT_FOUND',
        message: 'کالایی با این بارکد پیدا نشد',
      });
    }

    const stock = await this.stockByProduct(product.id);

    return {
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        salePrice: product.prices?.[0]?.salePrice ?? null,
      },
      stock,
    };
  }

  // موجودیِ یک کالا به تفکیک مکان — برای صفحه‌ی فروش اپ: «این کالا کجا و چند تا موجوده».
  // فقط مکان‌هایی که موجودیِ مثبت دارند (یعنی ثبت و لیبل خورده‌اند) قابل فروش‌اند.
  async stockByProduct(productId:string){
    const rows = await this.prisma.inventory.findMany({
      where:{ productId, quantity:{ gt:0 } },
      include:{ location:true },
      orderBy:{ quantity:'desc' },
    });
    return rows.map((r)=>({
      locationId: r.locationId,
      locationName: r.location?.name ?? '',
      locationCode: r.location?.code ?? '',
      locationBarcode: r.location?.barcode ?? '',
      locationPath: r.location?.path ?? '',
      quantity: r.quantity,
      // قفسه‌اش حذف/غیرفعال شده ولی جنس رویش مانده — «بی‌صاحب». فروختنی هست،
      // ولی UI باید نشان دهد و در صورت خواست، جابه‌جایش کند.
      stranded: !r.location || !r.location.isActive,
    }));
  }



  async scanBarcode(dto:any){

    const product =
      await this.prisma.product.findFirst({

        where:{
          barcodes:{
            some:{
              barcode:dto.barcode
            }
          }
        }

      });


    if(!product){
      throw new NotFoundException({ error:'PRODUCT_NOT_FOUND', message:'کالا پیدا نشد' });
    }


    const location =
      await this.prisma.location.findUnique({

        where:{
          barcode:dto.locationBarcode
        }

      });


    if(!location){
      throw new NotFoundException({ error:'LOCATION_NOT_FOUND', message:'موقعیت پیدا نشد' });
    }



    return this.operation.execute({

      type:dto.action || 'IN',

      productId:product.id,

      locationId:location.id,

      quantity:dto.quantity,

      note:'BARCODE',

      userId:dto.userId,

      source:'BARCODE'

    });

  }




  async scanOut(dto:any){

    const product =
      await this.prisma.product.findFirst({

        where:{
          barcodes:{
            some:{
              barcode:dto.barcode
            }
          }
        }

      });


    if(!product){
      throw new NotFoundException({ error:'PRODUCT_NOT_FOUND', message:'کالا پیدا نشد' });
    }



    return this.operation.execute({

      type:'SALE',

      productId:product.id,

      locationId:dto.locationId,

      quantity:dto.quantity,

      note:dto.note || 'Barcode OUT',

      userId:dto.userId,

      source:'BARCODE'

    });

  }




      async getStock(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.inventory.findMany({
        skip,
        take: limit,
        where: {
          quantity: {
            gt: 0
          }
        },
        include: {
          product: {
            include: {
              brand: true,
              vehicleModel: true
            }
          },
          location: true
        },
        orderBy: {
          updatedAt: 'desc'
        }
      }),
      this.prisma.inventory.count({
        where: {
          quantity: {
            gt: 0
          }
        }
      })
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findByLocation(locationId:string){

    return this.prisma.inventoryLog.findMany({

      where:{
        locationId
      },

      include:{
        product:true,
        location:true,
        user:true
      },

      orderBy:{
        createdAt:'desc'
      }

    });

  }



  async getLogs(query:any){

    const { productId, locationId, action, from, to, page = 1, limit = 20 } = query;

    const where:any = {};
    if (productId) where.productId = productId;
    if (locationId) where.locationId = locationId;
    if (action) where.action = action;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [items, total] = await Promise.all([
      this.prisma.inventoryLog.findMany({
        where,
        include:{ product:true, location:true, user:true },
        orderBy:{ createdAt:'desc' },
        skip:(Number(page)-1)*Number(limit),
        take:Number(limit),
      }),
      this.prisma.inventoryLog.count({ where }),
    ]);

    return { items, total, page:Number(page), limit:Number(limit) };

  }



  async getLog(id:string){

    return this.prisma.inventoryLog.findUnique({

      where:{
        id
      },

      include:{
        product:true,
        location:true,
        user:true
      }

    });

  }



  /**
   * کاردکس کالا — گردشِ ورود/خروج یک کالا با مانده‌ی متحرک.
   *
   * دو نکته‌ی صحت که این متد رویشان بنا شده:
   *
   * ۱) علامتِ حرکت. `InventoryLog.quantity` همیشه مثبت است و جهت از `action`
   *    می‌آید — جز ADJUST که خودش diffِ علامت‌دار را نگه می‌دارد، و TRANSFER که
   *    دو ردیف با همان actionِ 'TRANSFER' می‌سازد و تنها تفکیکش متنِ note است
   *    (`TRANSFER IN…` ورود، `TRANSFER OUT…` خروج). COUNT هیچ‌وقت لاگ نمی‌شود.
   *
   * ۲) مانده باید از کلِ تاریخچه‌ی کالا تجمیع شود، بعد به بازه فیلتر شود؛ اگر
   *    window را روی خودِ بازه ببندیم، مانده‌ی اول دوره صفر می‌افتد و «مانده‌ی
   *    آخر = موجودی فعلی» دیگر برقرار نیست. پس WITH روی همه‌ی رکوردها بسته
   *    می‌شود و فیلترِ تاریخ بیرونِ window اعمال می‌شود.
   */
  async kardex(
    productId: string,
    q: {
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
      /** فیلتر نوع حرکت — فقط روی نمایش اعمال می‌شود؛ مانده و خلاصه از کل تاریخچه. */
      action?: string;
    },
  ){

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, name: true, sku: true },
    });
    if (!product) throw new NotFoundException('کالا یافت نشد');

    const start = q.startDate ? new Date(q.startDate) : null;
    const end   = q.endDate   ? new Date(q.endDate)   : null;
    const page  = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(10_000, Math.max(1, Number(q.limit) || 50));
    const skip  = (page - 1) * limit;

    // فیلتر نوع حرکت — فقط مقادیر مجاز. COUNT هرگز لاگ نمی‌شود و در فیلتر نمی‌آید.
    const KARDEX_ACTIONS = new Set(['IN', 'OUT', 'SALE', 'RETURN', 'TRANSFER', 'ADJUST']);
    const action = q.action && KARDEX_ACTIONS.has(q.action) ? q.action : null;

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        createdAt: Date;
        action: string;
        note: string | null;
        unitPrice: number | null;
        locationName: string | null;
        saleNumber: number | null;
        purchaseNumber: number | null;
        returnNumber: number | null;
        docId: string | null;
        signed: number;
        balance: bigint;
      }[]
    >`
      WITH moves AS (
        SELECT l."id", l."createdAt", l."action", l."note", l."unitPrice",
               loc."name"   AS "locationName",
               si."number"  AS "saleNumber",
               pi."number"  AS "purchaseNumber",
               sr."number"  AS "returnNumber",
               -- شناسه‌ی سندِ منبع — اولویت همان اولویتِ docType (برگشتی، خرید، فروش)
               COALESCE(sr."id", pi."id", si."id") AS "docId",
               CASE
                 WHEN l."action" IN ('IN','RETURN')                          THEN l."quantity"
                 WHEN l."action" IN ('OUT','SALE')                           THEN -l."quantity"
                 WHEN l."action" = 'ADJUST'                                  THEN l."quantity"
                 WHEN l."action" = 'TRANSFER' AND l."note" LIKE 'TRANSFER IN%'  THEN l."quantity"
                 WHEN l."action" = 'TRANSFER' AND l."note" LIKE 'TRANSFER OUT%' THEN -l."quantity"
                 ELSE l."quantity"
               END AS "signed"
        FROM "InventoryLog" l
        LEFT JOIN "Location"        loc ON loc."id" = l."locationId"
        LEFT JOIN "SaleInvoice"     si  ON si."id"  = l."invoiceId"
        LEFT JOIN "PurchaseInvoice" pi  ON pi."id"  = l."purchaseId"
        LEFT JOIN "SaleReturn"      sr  ON sr."id"  = l."saleReturnId"
        WHERE l."productId" = ${productId}
      ),
      balanced AS (
        SELECT *, SUM("signed") OVER (ORDER BY "createdAt", "id") AS "balance"
        FROM moves
      )
      SELECT * FROM balanced
      WHERE (${start}::timestamptz IS NULL OR "createdAt" >= ${start})
        AND (${end}::timestamptz   IS NULL OR "createdAt" <= ${end})
        AND (${action}::text IS NULL OR "action"::text = ${action}::text)
      ORDER BY "createdAt" DESC, "id" DESC
      OFFSET ${skip} LIMIT ${limit}
    `;

    const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "InventoryLog"
      WHERE "productId" = ${productId}
        AND (${start}::timestamptz IS NULL OR "createdAt" >= ${start})
        AND (${end}::timestamptz   IS NULL OR "createdAt" <= ${end})
        AND (${action}::text IS NULL OR "action"::text = ${action}::text)
    `;

    // موجودی فعلی = جمع همه‌ی مکان‌ها؛ برای هدرِ صفحه و راستی‌آزماییِ مانده.
    const stockAgg = await this.prisma.inventory.aggregate({
      where: { productId },
      _sum: { quantity: true },
    });

    /*
     * خلاصه‌ی بازه — چهار عددی که بالای جدول می‌آید. عمداً روی «بازه‌ی تاریخ»
     * حساب می‌شود نه روی فیلترِ action: نوار خلاصه باید جوابِ دوره باشد، مستقل
     * از اینکه کاربر چه حرکتی را فیلتر کرده.
     */
    const [summaryRow] = await this.prisma.$queryRaw<
      { totalIn: bigint; totalOut: bigint; saleCount: bigint; saleValue: bigint }[]
    >`
      WITH moves AS (
        SELECT l."createdAt", l."quantity", l."unitPrice", l."action",
               CASE
                 WHEN l."action" IN ('IN','RETURN')                          THEN l."quantity"
                 WHEN l."action" IN ('OUT','SALE')                           THEN -l."quantity"
                 WHEN l."action" = 'ADJUST'                                  THEN l."quantity"
                 WHEN l."action" = 'TRANSFER' AND l."note" LIKE 'TRANSFER IN%'  THEN l."quantity"
                 WHEN l."action" = 'TRANSFER' AND l."note" LIKE 'TRANSFER OUT%' THEN -l."quantity"
                 ELSE l."quantity"
               END AS "signed"
        FROM "InventoryLog" l
        WHERE l."productId" = ${productId}
      )
      SELECT
        COALESCE(SUM(CASE WHEN "signed" > 0 THEN "signed" ELSE 0 END), 0)::bigint AS "totalIn",
        COALESCE(SUM(CASE WHEN "signed" < 0 THEN -"signed" ELSE 0 END), 0)::bigint AS "totalOut",
        COALESCE(SUM(CASE WHEN "action"::text = 'SALE' THEN 1 ELSE 0 END), 0)::bigint AS "saleCount",
        COALESCE(SUM(CASE WHEN "action"::text = 'SALE' THEN "quantity" * COALESCE("unitPrice", 0) ELSE 0 END), 0)::bigint AS "saleValue"
      FROM moves
      WHERE (${start}::timestamptz IS NULL OR "createdAt" >= ${start})
        AND (${end}::timestamptz   IS NULL OR "createdAt" <= ${end})
    `;

    const data = rows.map((r) => {
      const signed = Number(r.signed);
      const docType =
        r.returnNumber   != null ? 'RETURN'
        : r.purchaseNumber != null ? 'PURCHASE'
        : r.saleNumber   != null ? 'SALE'
        : 'MANUAL';
      const docNumber =
        r.returnNumber ?? r.purchaseNumber ?? r.saleNumber ?? null;

      return {
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        docType,
        docId: r.docId ?? null,
        docNumber,
        locationName: r.locationName,
        inQty: signed > 0 ? signed : 0,
        outQty: signed < 0 ? -signed : 0,
        balance: Number(r.balance),
        unitPrice: r.unitPrice,
      };
    });

    const total = Number(count);
    return {
      product,
      currentStock: stockAgg._sum.quantity ?? 0,
      summary: {
        totalIn: Number(summaryRow.totalIn),
        totalOut: Number(summaryRow.totalOut),
        saleCount: Number(summaryRow.saleCount),
        saleValue: Number(summaryRow.saleValue),
      },
      rows: {
        data,
        meta: {
          total,
          page,
          limit,
          lastPage: Math.max(1, Math.ceil(total / limit)),
        },
      },
    };

  }




  async findOne(
    productId:string,
    locationId:string
  ){

    return this.prisma.inventory.findUnique({

      where:{
        productId_locationId:{
          productId,
          locationId
        }
      },

      include:{
        product:{
          include:{
            brand:true,
            vehicleModel:true
          }
        },
        location:true
      }

    });

  }



  async scan(barcode:string){

    const product =
      await this.prisma.product.findFirst({

        where:{
          barcodes:{
            some:{
              barcode
            }
          }
        },

        include:{
          brand:true,
          vehicleModel:true,
          assets:true
        }

      });



    if(!product){

      throw new NotFoundException({ error:'PRODUCT_NOT_FOUND', message:'کالا با این بارکد پیدا نشد' });

    }



    const stocks =
      await this.prisma.inventory.findMany({

        where:{
          productId:product.id
        },

        include:{
          location:true
        }

      });



    return {

      product,

      stocks

    };

  }

}
