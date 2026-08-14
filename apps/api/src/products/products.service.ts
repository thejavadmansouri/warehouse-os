import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePersian } from '../engine/utils/persian-normalize';
import { buildSearchTokens, tokenizeQuery } from './search-tokens';
import { nextSku } from './sku.util';
import { BulkPriceDto } from './dto/bulk-price.dto';


/** سقف نتایج جستجو — صندوق فروش هیچ‌وقت بیش از این را نشان نمی‌دهد. */
const MAX_SEARCH_RESULTS = 100;

/**
 * تا وقتی نتایجِ مرحله‌ی سریع کمتر از این باشد، مرحله‌ی زیررشته‌ای هم اجرا می‌شود.
 *
 * عمداً بالاست: با آستانه‌ی پایین (۱۰ تای قبلی) یک کوئریِ پرنتیجه‌ی بی‌ربط جلوی
 * اجرای fallback را می‌گرفت و کالای درست هیچ‌وقت پیدا نمی‌شد.
 */
const SUBSTRING_STAGE_THRESHOLD = 20;

/**
 * فرار دادنِ کاراکترهای معنی‌دارِ LIKE در ورودی کاربر.
 *
 * بدون این، یک `%` تایپ‌شده یعنی «هر چیزی» و کل کاتالوگ برمی‌گردد. ترتیب مهم است:
 * بک‌اسلش باید اول فرار داده شود وگرنه فرارهای بعدی را خراب می‌کند.
 */
function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/[%_]/g, (c) => '\\' + c);
}


@Injectable()
export class ProductsService {

  constructor(
    private prisma: PrismaService
  ) {}



  async findAll(
    page:number = 1,
    limit:number = 50,
    search?:string,
    brandId?:string
  ){

    const skip=(page-1)*limit;


    const where:any = {
      deletedAt:null
    };


    // فیلتر برند برای صفحه‌ی قیمت‌گذاری: «همه‌ی کالاهای این برند».
    if(brandId){
      where.brandId = brandId;
    }


    if(search){

      where.OR=[

        {
          name:{
            contains:search,
            mode:'insensitive'
          }
        },

        {
          sku:{
            contains:search,
            mode:'insensitive'
          }
        },

        {
          barcodes:{
            some:{
              barcode:{
                contains:search,
                mode:'insensitive'
              }
            }
          }
        },

        {
          partNumber:{
            contains:search,
            mode:'insensitive'
          }
        },

        {
          brand:{
            name:{
              contains:search,
              mode:'insensitive'
            }
          }
        }

      ];

    }



    const [data,total]=await Promise.all([


      this.prisma.product.findMany({

        where,

        skip,

        take:limit,


        include:{

          brand:true,

          vehicleModel:true,

          category:true,

          barcodes:true,

          assets:true,

          // آخرین قیمت — صفحه‌ی قیمت‌گذاری باید بدون درخواست جداگانه به‌ازای
          // هر ردیف بداند قیمت فعلی چیست.
          prices:{
            orderBy:{
              createdAt:'desc'
            },
            take:1
          },

          inventories:{
            include:{
              location:true
            }
          }

        },


        orderBy:{
          createdAt:'desc'
        }

      }),


      this.prisma.product.count({
        where
      })


    ]);



    return {

      data,

      meta:{
        total,
        page,
        lastPage:Math.ceil(total/limit)
      }

    };

  }





  async findOne(id:string){


    const product =
      await this.prisma.product.findFirst({

        where:{
          id,
          deletedAt:null
        },


        include:{

          brand:true,

          vehicleModel:true,

          category:true,

          barcodes:true,

          assets:true,

          prices:{
            orderBy:{
              createdAt:'desc'
            },
            take:1
          },


          inventories:{
            include:{
              location:true
            }
          }

        }

      });



    if(!product){

      throw new NotFoundException(
        'کالا پیدا نشد'
      );

    }


    return product;

  }





  async create(dto:any){

    // کد کالا = کد حسابداری و همان چیزی که روی لیبل بارکد می‌شود.
    // اگر داده نشده باشد، عدد بعدیِ دنباله تخصیص می‌یابد تا هیچ کالایی
    // بدون کد قابل چاپ نماند.
    const sku: string = dto.sku?.trim()
      ? String(dto.sku).trim()
      : await nextSku(this.prisma);



    const internalBarcode =
      dto.internalBarcode ||
      `WOS${Date.now()}`;


    const barcodesToCreate:{barcode:string; type:'INTERNAL'|'FACTORY'}[] = [
      {
        barcode:internalBarcode,
        type:'INTERNAL'
      }
    ];

    if(dto.factoryBarcode){
      barcodesToCreate.push({
        barcode:dto.factoryBarcode,
        type:'FACTORY'
      });
    }


    return this.prisma.product.create({

      data:{
        internalBarcode: internalBarcode,
        


        name:dto.name,


        sku,


        partNumber:dto.partNumber,


        // بدون این، کالای تازه‌ساخته‌شده در جستجو پیدا نمی‌شود (جستجو روی
        // searchTokens است، نه روی name).
        searchTokens: buildSearchTokens(dto.name, sku, dto.partNumber),


        description:dto.description,


        unit:dto.unit,


        weight:dto.weight,



        brandId:dto.brandId,


        categoryId:dto.categoryId,


        vehicleModelId:dto.vehicleModelId,


        supplierId:dto.supplierId,



        minStock:dto.minStock || 0,



        barcodes:{
          create:barcodesToCreate
        },


        // فقط اگه قیمتی داده شده یه رکورد قیمت هم می‌سازیم
        ...(
          (dto.purchasePrice != null || dto.salePrice != null)
            ? {
                prices:{
                  create:{
                    purchasePrice:dto.purchasePrice ?? null,
                    salePrice:dto.salePrice ?? null,
                    wholesalePrice:dto.wholesalePrice ?? null
                  }
                }
              }
            : {}
        ),


        // فقط اگه مسیر عکسی داده شده یه Asset می‌سازیم
        ...(
          dto.image
            ? {
                assets:{
                  create:{
                    path:dto.image,
                    type:'PRODUCT_IMAGE'
                  }
                }
              }
            : {}
        )


      },

      include:{
        barcodes:true,
        prices:true,
        assets:true,
        brand:true,
        category:true,
        vehicleModel:true
      }

    });


  }





  async update(id:string, dto:any){

    // بارکد و عکس از endpointهای خودشان عوض می‌شوند.
    // قیمت اما همین‌جا پذیرفته می‌شود: فرم محصول فیلد قیمت دارد و آن را
    // می‌فرستد، و اگر اینجا بی‌صدا دور ریخته شود کاربر «ذخیره شد» می‌بیند
    // در حالی که هیچ قیمتی ثبت نشده.
    if (
      dto.purchasePrice != null ||
      dto.salePrice != null ||
      dto.wholesalePrice != null
    ) {
      await this.setPrice(id, dto);
    }

    const {
      name,
      sku,
      partNumber,
      description,
      unit,
      weight,
      minStock,
      categoryId,
      brandId,
      vehicleModelId,
      supplierId,
      isActive,
    } = dto;

    // اگر نام/کد عوض شده، توکن‌های جستجو باید با مقادیرِ نهایی بازساخته شوند،
    // وگرنه کالا با نام جدیدش پیدا نمی‌شود.
    const touchesTokens =
      name !== undefined || sku !== undefined || partNumber !== undefined;

    let searchTokens: string[] | undefined;
    if (touchesTokens) {
      const current = await this.prisma.product.findUnique({
        where: { id },
        select: { name: true, sku: true, partNumber: true },
      });
      if (!current) throw new NotFoundException('کالا پیدا نشد');
      searchTokens = buildSearchTokens(
        name ?? current.name,
        sku ?? current.sku,
        partNumber ?? current.partNumber,
      );
    }

    // روی لیبل فقط نام و کد چاپ می‌شود و کد عوض نمی‌شود؛ پس تنها تغییرِ نام
    // لیبل چاپ‌شده را باطل می‌کند. با پاک کردن این فیلد، کالا خودبه‌خود به
    // صف چاپ برمی‌گردد. تغییر قیمت عمداً بی‌اثر است.
    const nameChanged =
      name !== undefined &&
      name !== (await this.prisma.product.findUnique({
        where: { id },
        select: { name: true },
      }))?.name;

    return this.prisma.product.update({

      where:{
        id
      },


      data:{
        name,
        sku,
        partNumber,
        description,
        unit,
        weight,
        minStock,
        categoryId,
        brandId,
        vehicleModelId,
        supplierId,
        isActive,
        ...(searchTokens ? { searchTokens } : {}),
        ...(nameChanged ? { labelPrintedAt: null } : {}),
      }

    });


  }





  /**
   * کالاهایی که هنوز لیبل نخورده‌اند.
   *
   * این همان سؤالی است که بعد از ورود کالا توسط کارگر پرسیده می‌شود:
   * «چه چیزهایی مانده که لیبل بخورد؟» بدون این، یا دوباره چاپ می‌شود
   * (کاغذ و وقت هدر) یا بعضی کالاها بی‌لیبل می‌مانند و در انبارگردانی گیر
   * می‌کنند.
   */
  async pendingLabels(q: {
    onlyWithStock?: boolean;
    since?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(q.limit) || 50));

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      isActive: true,
      labelPrintedAt: null,
    };

    // معمولاً فقط کالایی که واقعاً وارد انبار شده لیبل لازم دارد.
    if (q.onlyWithStock) {
      where.inventories = { some: { quantity: { gt: 0 } } };
    }

    // بازه روی **ورود کالا به انبار** است، نه تاریخ تعریف کالا.
    // کالاها معمولاً موقع ایمپورت کاتالوگ ساخته شده‌اند؛ چیزی که امروز اتفاق
    // افتاده ثبت موجودی توسط کارگر است. فیلتر روی createdAt کالا باعث می‌شد
    // صفِ «امروز» همیشه خالی باشد.
    if (q.since) {
      const d = new Date(q.since);
      if (!isNaN(d.getTime())) {
        where.inventoryLogs = {
          some: { action: { in: ['IN', 'RETURN'] }, createdAt: { gte: d } },
        };
      }
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          createdAt: true,
          brand: { select: { name: true } },
          inventories: { select: { quantity: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: data.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        brandName: p.brand?.name ?? null,
        createdAt: p.createdAt,
        stock: p.inventories.reduce((s, i) => s + i.quantity, 0),
      })),
      meta: { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) },
    };
  }


  /** ثبت اینکه لیبل این کالاها چاپ شد — از صف خارج می‌شوند. */
  async markLabelsPrinted(productIds: string[]) {
    if (!productIds?.length) return { updated: 0 };

    const res = await this.prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { labelPrintedAt: new Date() },
    });

    return { updated: res.count };
  }


  /**
   * ثبت قیمت جدید برای یک کالا.
   *
   * ProductPrice جدول تاریخچه است: قیمت قبلی به‌روزرسانی نمی‌شود، ردیف تازه
   * اضافه می‌شود. این عمدی است — سود هر فاکتور از قیمت خرید **لحظه‌ی فروش**
   * حساب می‌شود، پس اگر تاریخچه را بازنویسی کنیم سود فاکتورهای قدیمی غلط
   * می‌شود.
   *
   * اگر هیچ مقداری نسبت به آخرین قیمت عوض نشده باشد، ردیف تکراری ساخته
   * نمی‌شود؛ وگرنه هر بار ویرایش کالا تاریخچه را پر از نویز می‌کند.
   */
  async setPrice(
    productId: string,
    dto: { purchasePrice?: number | null; salePrice?: number | null; wholesalePrice?: number | null },
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) throw new NotFoundException('کالا پیدا نشد');

    const latest = await this.prisma.productPrice.findFirst({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });

    // مقدارِ نداده‌شده یعنی «عوض نکن»، نه «صفر کن».
    const next = {
      purchasePrice: dto.purchasePrice ?? latest?.purchasePrice ?? null,
      salePrice: dto.salePrice ?? latest?.salePrice ?? null,
      wholesalePrice: dto.wholesalePrice ?? latest?.wholesalePrice ?? null,
    };

    const unchanged =
      latest &&
      latest.purchasePrice === next.purchasePrice &&
      latest.salePrice === next.salePrice &&
      latest.wholesalePrice === next.wholesalePrice;

    if (unchanged) return latest;

    return this.prisma.productPrice.create({
      data: { productId, ...next },
    });
  }


  /** تاریخچه‌ی قیمت یک کالا، جدیدترین اول. */
  priceHistory(productId: string) {
    return this.prisma.productPrice.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }


  /**
   * قیمت‌گذاری دسته‌ای — انتخاب دستی، یک برند، یا نتیجه‌ی یک جست‌وجو.
   *
   * با ۳۳ هزار کالا، زدن تک‌تک از سمت کلاینت شدنی نیست؛ باید یک درخواست باشد.
   *
   * قواعدی که عمداً رعایت شده‌اند:
   *  - تاریخچه حفظ می‌شود: مثل setPrice، ردیف تازه ساخته می‌شود نه بازنویسی.
   *  - فیلدِ داده‌نشده یعنی «عوض نکن»، نه «صفر کن».
   *  - کالایی که مبنای محاسبه ندارد (مثلاً قیمت خرید برای markup) رد می‌شود،
   *    نه اینکه صفر بگیرد — قیمت صفر روی فاکتور یعنی جنس مجانی.
   *  - dryRun هست چون این عملیات روی هزاران ردیف اثر می‌گذارد و باید بشود
   *    قبلش دید چند تا.
   */
  async bulkSetPrice(dto: BulkPriceDto) {
    const where = this.buildBulkPriceWhere(dto.select);
    if (!where) {
      throw new BadRequestException({
        error: 'NO_SELECTION',
        message: 'هیچ کالایی انتخاب نشده — برند، جست‌وجو یا فهرست کالا لازم است',
      });
    }

    const { kind, percent } = dto.op;
    if ((kind === 'percent' || kind === 'markup') && typeof percent !== 'number') {
      throw new BadRequestException({
        error: 'PERCENT_REQUIRED',
        message: 'برای تغییر درصدی، درصد باید مشخص باشد',
      });
    }
    if (kind === 'percent' && !dto.op.field) {
      throw new BadRequestException({
        error: 'FIELD_REQUIRED',
        message: 'مشخص کنید درصد روی کدام قیمت اعمال شود',
      });
    }
    if (
      kind === 'set' &&
      dto.op.purchasePrice === undefined &&
      dto.op.salePrice === undefined &&
      dto.op.wholesalePrice === undefined
    ) {
      throw new BadRequestException({
        error: 'NO_VALUES',
        message: 'حداقل یکی از قیمت‌ها باید داده شود',
      });
    }

    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        prices: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const matched = products.length;
    if (dto.dryRun) return { matched, updated: 0, skipped: 0, dryRun: true };

    const rows: {
      productId: string;
      purchasePrice: number | null;
      salePrice: number | null;
      wholesalePrice: number | null;
    }[] = [];
    let skipped = 0;

    for (const p of products) {
      const cur = p.prices[0];
      const base = {
        purchasePrice: cur?.purchasePrice ?? null,
        salePrice: cur?.salePrice ?? null,
        wholesalePrice: cur?.wholesalePrice ?? null,
      };

      const next = { ...base };

      if (kind === 'set') {
        if (dto.op.purchasePrice !== undefined) next.purchasePrice = dto.op.purchasePrice;
        if (dto.op.salePrice !== undefined) next.salePrice = dto.op.salePrice;
        if (dto.op.wholesalePrice !== undefined) next.wholesalePrice = dto.op.wholesalePrice;
      } else if (kind === 'percent') {
        const field = dto.op.field!;
        const from = base[field];
        if (from === null) {
          skipped++;
          continue;
        }
        next[field] = Math.max(0, Math.round(from * (1 + percent! / 100)));
      } else {
        // markup: فروش از روی خرید
        if (base.purchasePrice === null) {
          skipped++;
          continue;
        }
        next.salePrice = Math.max(
          0,
          Math.round(base.purchasePrice * (1 + percent! / 100)),
        );
      }

      const unchanged =
        cur &&
        cur.purchasePrice === next.purchasePrice &&
        cur.salePrice === next.salePrice &&
        cur.wholesalePrice === next.wholesalePrice;

      if (unchanged) {
        skipped++;
        continue;
      }

      rows.push({ productId: p.id, ...next });
    }

    // تکه‌تکه، تا نه تراکنش طولانی شود نه حافظه.
    const CHUNK = 2000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await this.prisma.productPrice.createMany({ data: rows.slice(i, i + CHUNK) });
    }

    return { matched, updated: rows.length, skipped, dryRun: false };
  }


  /** فیلترِ انتخاب. برگرداندن null یعنی «هیچ معیاری داده نشده». */
  private buildBulkPriceWhere(sel: BulkPriceDto['select']): Prisma.ProductWhereInput | null {
    const where: Prisma.ProductWhereInput = { deletedAt: null };
    let hasCriteria = false;

    if (sel.productIds?.length) {
      where.id = { in: sel.productIds };
      hasCriteria = true;
    }
    if (sel.brandId) {
      where.brandId = sel.brandId;
      hasCriteria = true;
    }
    if (sel.categoryId) {
      where.categoryId = sel.categoryId;
      hasCriteria = true;
    }
    if (sel.search?.trim()) {
      const q = sel.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { partNumber: { contains: q, mode: 'insensitive' } },
      ];
      hasCriteria = true;
    }
    // این یکی به‌تنهایی معیار نیست: «همه‌ی کالاهای بی‌قیمت» یعنی ۳۳ هزار ردیف،
    // که تقریباً همیشه اشتباهِ کاربر است. فقط محدودکننده‌ی معیارهای دیگر است.
    if (sel.onlyWithoutSalePrice) {
      where.prices = { none: { salePrice: { not: null } } };
    }

    return hasCriteria ? where : null;
  }


  async remove(id:string){


    return this.prisma.product.update({

      where:{
        id
      },


      data:{

        isActive:false,

        deletedAt:new Date()

      }

    });

  }





  // نرمال‌سازی کوئری هم‌راستا با نرمال‌سازی نام‌ها هنگام import:
  // عربی ي/ك → فارسی ی/ک، یکدست‌کردن فاصله‌ها. بدون این، ورودی عربیِ کاربر/STT
  // هیچ‌وقت با نام‌های فارسیِ دیتابیس مطابقت نمی‌کند.
  // همان نرمالایزر canonical که import و matcher صوتی استفاده می‌کنند: رقم فارسی/عربی
  // → انگلیسی، حروف عربی → فارسی، نیم‌فاصله، tashkil و … تا کوئری با نام‌های ذخیره‌شده
  // یکسان شود (بدون این، «۲۰۶» فارسی با «206» انگلیسیِ نام‌ها مطابقت نمی‌کرد).
  private normalizeSearch(q: string): string {
    return normalizePersian(q);
  }

  /**
   * جستجوی قوی محصولات (طبق هدف پروژه: سرچ باید نقطه‌قوت باشد).
   *  - نرمال‌سازی عربی→فارسی روی کوئری
   *  - توکنی و مستقل از ترتیب: همه‌ی کلمات باید در نام باشند (کلمه‌ی وسط مانع نیست)
   *  - رتبه‌بندی با similarity ترای‌گرام (نزدیک‌ترین اول) — از ایندکس GIN استفاده می‌کند
   *  - تحمل غلط املایی: اگر توکن‌ها مطابقت کامل نداشتند، آستانه‌ی similarity کل کوئری
   *  - جستجوی SKU/partNumber برای ورود مستقیم کد
   * رتبه‌بندی در SQL انجام می‌شود (سریع) و سپس محصولات کامل با روابط واکشی می‌شوند.
   */
  // آرایه‌ی خام برمی‌گرداند تا هم اپ اندروید (List<ProductDto>) و هم وب (که هر دو
  // شکل را می‌پذیرد) بتوانند مصرفش کنند.
  async search(query: string) {
    const q = this.normalizeSearch(query || '');
    if (!q) return [];

    const ids = await this.rankIds(q);
    if (ids.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        brand: true,
        vehicleModel: true,
        category: true,
        barcodes: true,
        prices: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const byId = new Map(products.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  /**
   * بازیابیِ شناسه‌ها به ترتیب ربط.
   *
   * مدل تطبیق «کلمه‌به‌کلمه»ی پارسیان است: هر کلمه‌ی کوئری باید **زیررشته**ی یکی از
   * کلمات کالا باشد، مستقل از ترتیب. معیارهای واقعیِ درستی:
   *   «نت لو اید» → لنت جلو پراید   (نت⊂لنت، لو⊂جلو، اید⊂پراید)
   *   «فرانسیل»   → دیفرانسیل
   * مدل قبلی برابریِ کامل توکن می‌خواست، پس این دو کوئری **صفر** نتیجه می‌دادند.
   *
   * چهار مرحله، از دقیق به فراگیر:
   *   ۱) کدِ دقیق (SKU / شماره فنی / بارکد) — همیشه و بدون قید و شرط اول لیست.
   *   ۲) برابریِ کامل توکن‌ها (`searchTokens @> ...`) — با ایندکس GIN و سریع؛
   *      مسیرِ داغِ کوئری‌های عادی. اگر جواب داد، اسکنِ مرحله‌ی ۳ اصلاً اجرا نمی‌شود.
   *   ۳) زیررشته‌ی هر توکن با امتیازدهی — اسکن کامل، ولی روی ۳۳ هزار کالا چند
   *      ده میلی‌ثانیه. اینجاست که «نت لو اید» جواب می‌دهد.
   *   ۴) یکی‌کم (n-1 توکن) روی همان تطبیقِ زیررشته‌ای — تحملِ کلمه‌ی اضافه/غلط.
   */
  private async rankIds(q: string): Promise<string[]> {
    const tokens = tokenizeQuery(q);
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (rows: { id: string }[]) => {
      for (const r of rows) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          out.push(r.id);
        }
      }
    };

    // ۱) کدِ دقیق — قبلاً این مسیر وجود نداشت و اسکنِ یک کد حسابداری
    // نتیجه‌ی درست را برنمی‌گرداند (کد در نامِ کالا نیست، پس امتیاز صفر می‌گرفت).
    push(
      await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p.id FROM "Product" p
        LEFT JOIN "ProductBarcode" b ON b."productId" = p.id
        WHERE p."deletedAt" IS NULL
          AND (p.sku = ${q} OR p."partNumber" = ${q} OR b.barcode = ${q})
        LIMIT 10
      `),
    );

    if (tokens.length > 0) {
      // ۲) برابریِ کامل — مسیر سریع با ایندکس
      push(await this.byTokens(tokens, MAX_SEARCH_RESULTS - out.length));

      /*
       * ۳) زیررشته‌ای.
       *
       * آستانه عمداً سخاوتمندانه است (نه «فقط اگر صفر بود»): وقتی برابریِ کامل
       * چند نتیجه‌ی کم می‌دهد، کالای درست ممکن است اصلاً بینشان نباشد — همان
       * ایرادی که باعث می‌شد fallback هیچ‌وقت اجرا نشود.
       */
      if (out.length < SUBSTRING_STAGE_THRESHOLD) {
        push(await this.bySubstring(tokens, MAX_SEARCH_RESULTS - out.length));

        // ۴) یکی‌کم — کلمه‌ی اضافه یا غلط نباید کل نتیجه را صفر کند.
        if (out.length < SUBSTRING_STAGE_THRESHOLD && tokens.length >= 2) {
          for (
            let skip = 0;
            skip < tokens.length && out.length < MAX_SEARCH_RESULTS;
            skip++
          ) {
            const subset = tokens.filter((_, i) => i !== skip);
            push(
              await this.bySubstring(subset, MAX_SEARCH_RESULTS - out.length),
            );
          }
        }
      }
    }

    return out.slice(0, MAX_SEARCH_RESULTS);
  }

  /**
   * تطبیقِ زیررشته‌ایِ کلمه‌به‌کلمه، با رتبه‌بندی در خودِ SQL.
   *
   * تطبیق روی کلماتِ کالا که با فاصله به‌هم چسبانده شده‌اند (`txt`) انجام می‌شود،
   * نه با unnest و حلقه روی آرایه. چون هیچ توکنی فاصله ندارد، «زیررشته‌ی txt» دقیقاً
   * معادلِ «زیررشته‌ی یکی از کلمات» است — ولی چهار برابر سریع‌تر تمام می‌شود
   * (۴۸۷ms → ۱۳۰ms روی ۳۳٬۵ هزار کالا).
   *
   * امتیاز هر کلمه‌ی کوئری: ابتدای نام ۳ · ابتدای یک کلمه ۲ · وسط کلمه ۱.
   *
   * و مهم‌ترین سیگنال، پاداشِ **ترتیب**: اگر کلمات کوئری به همان ترتیب در نام
   * ظاهر شوند +۵. بدون این، «نت لو اید» اول «لوله خرطومی هواکش پراید هانتر» را
   * می‌آورد (چون «لو» ابتدای «لوله» است) و «لنت جلو پراید» هفتم می‌شود. کاربر
   * تکه‌های کلماتِ پشت‌سرهم را تایپ می‌کند، پس ترتیب واقعاً معنا دارد.
   *
   * به‌علاوه +۲ برای کالای موجود — چیزی که همین حالا قابل فروش است باید بالاتر
   * از چیزی باشد که نیست.
   *
   * تای‌بریکرها: کالای کم‌کلمه‌تر و با نامِ کوتاه‌تر مشخص‌تر است، پس بالاتر.
   */
  private async bySubstring(tokens: string[], limit: number) {
    if (tokens.length === 0 || limit <= 0) return [];

    const conditions = tokens.map(
      (t) => Prisma.sql`s.txt LIKE ${'%' + escapeLike(t) + '%'}`,
    );

    const scores = tokens.map(
      (t) => Prisma.sql`CASE
        WHEN s.txt LIKE ${escapeLike(t) + '%'} THEN 3
        WHEN s.txt LIKE ${'% ' + escapeLike(t) + '%'} THEN 2
        ELSE 1
      END`,
    );

    // کلمه‌ی i باید جلوتر از کلمه‌ی i+1 ظاهر شود. برای کوئری تک‌کلمه‌ای بی‌معناست.
    const ordered =
      tokens.length < 2
        ? Prisma.sql`0`
        : Prisma.sql`CASE WHEN ${Prisma.join(
            tokens.slice(0, -1).map(
              (t, i) =>
                Prisma.sql`strpos(s.txt, ${t}) < strpos(s.txt, ${tokens[i + 1]})`,
            ),
            ' AND ',
          )} THEN 5 ELSE 0 END`;

    return this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p.id
      FROM "Product" p
      CROSS JOIN LATERAL (
        SELECT array_to_string(p."searchTokens", ' ') AS txt
      ) s
      WHERE p."deletedAt" IS NULL
        AND ${Prisma.join(conditions, ' AND ')}
      ORDER BY
        (
          ${ordered}
          + ${Prisma.join(scores, ' + ')}
          + CASE
              WHEN EXISTS (
                SELECT 1 FROM "Inventory" i
                WHERE i."productId" = p.id AND i.quantity > 0
              ) THEN 2 ELSE 0
            END
        ) DESC,
        cardinality(p."searchTokens") ASC,
        char_length(p.name) ASC
      LIMIT ${limit}
    `);
  }

  /** تطبیقِ AND روی آرایه‌ی توکن — کاملاً با ایندکس GIN اجرا می‌شود. */
  private async byTokens(tokens: string[], limit: number) {
    if (tokens.length === 0 || limit <= 0) return [];
    return this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM "Product"
      WHERE "deletedAt" IS NULL
        AND "searchTokens" @> ${tokens}::text[]
      ORDER BY
        (name = ${tokens.join(' ')}) DESC,
        cardinality("searchTokens") ASC,
        length(name) ASC
      LIMIT ${limit}
    `);
  }

  /** نسخه‌ی قدیمیِ مبتنی بر ترای‌گرام — نگه‌داشته شده فقط برای مقایسه‌ی بنچمارک. */
  async searchLegacy(query: string) {
    const q = this.normalizeSearch(query || '');
    if (!q) return [];

    const tokens = q.split(' ').filter((t) => t.length > 0);
    const like = `%${q}%`;

    // پیش‌فیلترِ ایندکس‌دوست: حداقل یک توکن به‌صورت زیررشته (از GIN trgm استفاده می‌کند).
    const anyIlike = Prisma.join(
      tokens.map((t) => Prisma.sql`name ILIKE ${'%' + t + '%'}`),
      ' OR ',
    );
    // امتیاز: هر توکن یا زیررشته است یا از نظر ترای‌گرام به کلمه‌ای در نام نزدیک (تحمل غلط).
    const scoreExpr = Prisma.join(
      tokens.map(
        (t) =>
          Prisma.sql`(CASE WHEN name ILIKE ${'%' + t + '%'} OR word_similarity(${t}, name) > 0.6 THEN 1 ELSE 0 END)`,
      ),
      ' + ',
    );
    // تا ۳ کلمه همه باید بیایند؛ از ۴ کلمه یک کلمه‌ی جاافتاده/اضافه مجاز است.
    const minReq = tokens.length <= 3 ? tokens.length : tokens.length - 1;

    const ranked = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM (
        SELECT id, name, sku,
          (${scoreExpr}) AS score,
          similarity(name, ${q}) AS sim
        FROM "Product"
        WHERE "deletedAt" IS NULL
          AND (
            (${anyIlike})
            OR sku ILIKE ${like}
            OR "partNumber" ILIKE ${like}
            OR word_similarity(${q}, name) > 0.5
          )
      ) t
      WHERE t.score >= ${minReq} OR t.sim > 0.4
      ORDER BY
        (t.sku = ${q}) DESC,
        (t.name ILIKE ${like}) DESC,
        t.score DESC,
        t.sim DESC,
        length(t.name) ASC
      LIMIT 100
    `);

    const ids = ranked.map((r) => r.id);
    if (ids.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        brand: true,
        vehicleModel: true,
        category: true,
        barcodes: true,
        prices: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    // ترتیب رتبه‌بندی SQL را حفظ کن
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  // «یافتن کالا»: سرچ قوی + آدرسِ دقیق. برای هر نتیجه، مکان‌هایی که موجودی دارد
  // (نام/کد/مسیرِ کامل + تعداد) و مجموع کل را ضمیمه می‌کند. برای مدیر/فروشنده/کارگر:
  // اسم را می‌زند → اگر موجود باشد، دقیقاً می‌گوید کجاست.
  async searchWithStock(query: string) {
    const products = (await this.search(query)) as unknown as Array<{
      id: string;
      name: string;
      sku: string;
      unit: string | null;
      partNumber: string | null;
      salePrice: number | null;
      brand?: { name: string } | null;
      vehicleModel?: { name: string } | null;
      prices?: { salePrice: number | null }[];
    }>;
    if (products.length === 0) return [];

    const ids = products.map((p) => p.id);
    const inv = await this.prisma.inventory.findMany({
      where: { productId: { in: ids }, quantity: { gt: 0 } },
      include: { location: true },
      orderBy: { quantity: 'desc' },
    });

    const byProduct = new Map<string, typeof inv>();
    for (const row of inv) {
      const arr = byProduct.get(row.productId) ?? [];
      arr.push(row);
      byProduct.set(row.productId, arr);
    }

    const mapped = products.map((p) => {
      const rows = byProduct.get(p.id) ?? [];
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        partNumber: p.partNumber,
        // قیمت فروش تا صندوق بتواند مستقیم به سبد اضافه کند، بدون رفت‌وبرگشتِ جدا.
        salePrice: p.salePrice ?? p.prices?.[0]?.salePrice ?? null,
        brandName: p.brand?.name ?? null,
        vehicleModelName: p.vehicleModel?.name ?? null,
        totalStock: rows.reduce((s, r) => s + r.quantity, 0),
        locations: rows.map((r) => ({
          locationId: r.locationId,
          name: r.location?.name ?? '',
          code: r.location?.code ?? '',
          path: r.location?.path ?? '',
          quantity: r.quantity,
          // قفسه حذف/غیرفعال شده ولی جنس رویش مانده — «بی‌صاحب» و فروختنی.
          stranded: !r.location || !r.location.isActive,
        })),
      };
    });

    // کالاهایی که موجودی (و آدرس) دارند بالای لیست بیایند؛ ترتیب ربط در هر گروه حفظ می‌شود.
    return mapped
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const aStock = a.r.totalStock > 0 ? 0 : 1;
        const bStock = b.r.totalStock > 0 ? 0 : 1;
        return aStock - bStock || a.i - b.i;
      })
      .map((x) => x.r);
  }



  async detailByBarcode(barcode:string){

    const product = await this.prisma.product.findFirst({

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

        category:true,

        barcodes:true,

        assets:true,


        inventories:{
          include:{
            location:true
          }
        },


        inventoryLogs:{
          orderBy:{
            createdAt:'desc'
          },
          take:20,
          include:{
            location:true,
            user:true,
            assets:true
          }
        }

      }

    });


    if(!product){

      throw new NotFoundException({ error:'PRODUCT_NOT_FOUND', message:'کالا پیدا نشد' });

    }


    const totalStock =
      product.inventories.reduce(
        (sum:number,item)=>sum+item.quantity,
        0
      );


    return {

      product:{

        id:product.id,

        name:product.name,

        sku:product.sku,

        internalBarcode:
          product.barcodes.find(b=>b.type === 'INTERNAL')?.barcode ?? null,

        factoryBarcode:
          product.barcodes.find(b=>b.type === 'FACTORY')?.barcode ?? null,

        partNumber:product.partNumber,

        image:
          product.assets.find(a=>a.type === 'PRODUCT_IMAGE')?.path ?? null,

        brand:product.brand,

        vehicleModel:product.vehicleModel,

        category:product.category

      },


      totalStock,


      locations:product.inventories.map(i=>({

        location:i.location.name,

        barcode:i.location.barcode,

        quantity:i.quantity

      })),


      lastOperations: product.inventoryLogs.map(log => ({

        id: log.id,

        action: log.action,

        quantity: log.quantity,

        note: log.note,

        image:
          log.assets?.find(a=>a.type === 'INVENTORY_IMAGE')?.path ?? null,

        location:{

          name: log.location.name,

          barcode: log.location.barcode

        },

        user: log.user?.fullName || null,

        createdAt: log.createdAt

      }))

    };


  }


  async exportCsv() {

    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      include: {
        brand: true,
        category: true,
        vehicleModel: true,
        barcodes: true,
        inventories: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const header = [
      'نام کالا',
      'SKU',
      'بارکد داخلی',
      'بارکد کارخانه',
      'شماره فنی',
      'برند',
      'دسته‌بندی',
      'خودرو سازگار',
      'واحد',
      'حداقل موجودی',
      'موجودی کل',
    ];

    const escapeCsv = (value: any) => {
      const str = value === null || value === undefined ? '' : String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = products.map((p) => {
      const internalBarcode = p.barcodes.find((b) => b.type === 'INTERNAL')?.barcode ?? '';
      const factoryBarcode = p.barcodes.find((b) => b.type === 'FACTORY')?.barcode ?? '';
      const totalStock = p.inventories.reduce((sum, inv) => sum + inv.quantity, 0);

      return [
        p.name,
        p.sku,
        internalBarcode,
        factoryBarcode,
        p.partNumber ?? '',
        p.brand?.name ?? '',
        p.category?.name ?? '',
        p.vehicleModel?.name ?? '',
        p.unit,
        p.minStock,
        totalStock,
      ].map(escapeCsv).join(',');
    });

    // BOM (\uFEFF) برای اینکه اکسل فارسی رو درست نمایش بده
    return '\uFEFF' + [header.join(','), ...rows].join('\n');
  }
}
