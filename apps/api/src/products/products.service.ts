import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePersian } from '../engine/utils/persian-normalize';
import { buildSearchTokens, tokenizeQuery } from './search-tokens';
import { nextSku } from './sku.util';


@Injectable()
export class ProductsService {

  constructor(
    private prisma: PrismaService
  ) {}



  async findAll(
    page:number = 1,
    limit:number = 50,
    search?:string
  ){

    const skip=(page-1)*limit;


    const where:any = {
      deletedAt:null
    };


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
      }

    });


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
   * بازیابیِ شناسه‌ها به ترتیب ربط. چهار مرحله، از دقیق به فراگیر؛ هر مرحله فقط
   * وقتی اجرا می‌شود که مرحله‌ی قبل کافی نبوده باشد:
   *   ۱) کدِ دقیق (SKU / شماره فنی / بارکد) — همیشه و بدون قید و شرط اول لیست.
   *   ۲) همه‌ی توکن‌ها (`searchTokens @> ...`) — با ایندکس GIN، مستقل از ترتیب.
   *   ۳) یکی‌کم (n-1 توکن) برای کوئری‌های ۲+ کلمه‌ای — تحملِ کلمه‌ی جاافتاده/اضافه.
   *   ۴) زیررشته‌ی خام — آخرین سنگر برای تایپ ناقص («دیسک ترم»).
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
      // ۲) همه‌ی توکن‌ها
      push(await this.byTokens(tokens, 100 - out.length));

      // ۳) یکی‌کم — فقط اگر هنوز نتیجه‌ی کمی داریم
      if (out.length < 10 && tokens.length >= 2) {
        for (let skip = 0; skip < tokens.length && out.length < 100; skip++) {
          const subset = tokens.filter((_, i) => i !== skip);
          push(await this.byTokens(subset, 100 - out.length));
        }
      }
    }

    // ۴) زیررشته‌ی خام
    if (out.length < 10) {
      push(
        await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id FROM "Product"
          WHERE "deletedAt" IS NULL AND name ILIKE ${'%' + q + '%'}
          ORDER BY length(name) ASC
          LIMIT ${100 - out.length}
        `),
      );
    }

    return out.slice(0, 100);
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
    const products = (await this.search(query)) as Array<{
      id: string;
      name: string;
      sku: string;
      unit: string | null;
      partNumber: string | null;
      brand?: { name: string } | null;
      vehicleModel?: { name: string } | null;
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
        brandName: p.brand?.name ?? null,
        vehicleModelName: p.vehicleModel?.name ?? null,
        totalStock: rows.reduce((s, r) => s + r.quantity, 0),
        locations: rows.map((r) => ({
          locationId: r.locationId,
          name: r.location?.name ?? '',
          code: r.location?.code ?? '',
          path: r.location?.path ?? '',
          quantity: r.quantity,
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

      throw new Error('کالا پیدا نشد');

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
