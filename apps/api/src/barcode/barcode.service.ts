import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';

@Injectable()
export class BarcodeService {

  constructor(
    private prisma: PrismaService,
    private inventoryOperation: InventoryOperationService
  ) {}



  async generateProductBarcode(): Promise<string> {

    const count = await this.prisma.product.count();

    const number = String(count + 1).padStart(9, '0');

    return `WOS${number}`;
  }



  async generateLocationBarcode(): Promise<string> {

    const count = await this.prisma.location.count();

    const number = String(count + 1).padStart(6, '0');

    return `LOC${number}`;
  }



  /**
   * چسباندنِ بارکدِ خودِ جنس به یک کالای موجود.
   *
   * چرا مهم است: تا امروز تنها راهِ اسکن‌شدنِ یک کالا، چاپ و چسباندنِ برچسبِ
   * خودمان بود. ولی بیشترِ قطعات از کارخانه بارکدِ خوانا دارند. با این مسیر،
   * کارگر یک بار اسکن می‌کند و می‌گوید «این همان لنت جلو پراید است» — و از آن
   * لحظه کار می‌کند، بدون هیچ برچسبی.
   *
   * یعنی یک مرحله‌ی **فیزیکی** حذف می‌شود، نه اینکه سریع‌تر شود. در انباری که
   * چند صد قفسه و ده‌ها هزار قلم دارد، این بزرگ‌ترین صرفه‌جوییِ ساعت-کارگر است.
   *
   * بارکد در کل دیتابیس یکتاست و همین‌جا هم بررسی می‌شود: اگر همان رشته قبلاً
   * به کالای دیگری وصل شده باشد، خطای روشن می‌گیرد. بی‌صدا عوض‌کردنِ مالکِ یک
   * بارکد بدترین کارِ ممکن است — اسکنِ بعدی کالای اشتباه می‌آورد و هیچ‌کس
   * نمی‌فهمد چرا.
   */
  async linkBarcode(
    productId: string,
    rawBarcode: string,
    type: 'FACTORY' | 'QR' | 'OTHER' = 'FACTORY',
  ) {

    const barcode = (rawBarcode || '').trim();

    if (barcode.length < 3) {
      throw new BadRequestException({
        error:'BARCODE_TOO_SHORT',
        message:'بارکد معتبر نیست',
      });
    }

    const product = await this.prisma.product.findFirst({
      where:{ id: productId, deletedAt: null },
      select:{ id:true, name:true },
    });

    if (!product) {
      throw new NotFoundException({
        error:'PRODUCT_NOT_FOUND',
        message:'کالا پیدا نشد',
      });
    }

    const existing = await this.prisma.productBarcode.findUnique({
      where:{ barcode },
      include:{ product:{ select:{ id:true, name:true } } },
    });

    if (existing) {
      // همین کالا: کارِ تمام‌شده است، نه خطا — کارگری که دوبار اسکن کرده نباید
      // پیغام قرمز ببیند.
      if (existing.productId === productId) {
        return { ...existing, alreadyLinked: true };
      }

      throw new BadRequestException({
        error:'BARCODE_TAKEN',
        barcode,
        productId: existing.productId,
        productName: existing.product.name,
        message: `این بارکد قبلاً به «${existing.product.name}» وصل شده`,
      });
    }

    const created = await this.prisma.productBarcode.create({
      data:{ barcode, productId, type: type as any },
    });

    return { ...created, alreadyLinked: false };
  }


  /**
   * برداشتنِ یک بارکد از کالا.
   *
   * بارکدِ **داخلی** برداشته نمی‌شود: روی برچسبِ چاپ‌شده است و بدونش کالا از
   * مسیرِ اسکن گم می‌شود. فقط بارکدهای بیرونی قابلِ جدا شدن‌اند.
   */
  async unlinkBarcode(barcodeId: string) {

    const row = await this.prisma.productBarcode.findUnique({
      where:{ id: barcodeId },
      include:{ product:{ select:{ internalBarcode:true } } },
    });

    if (!row) {
      throw new NotFoundException({
        error:'BARCODE_NOT_FOUND',
        message:'بارکد پیدا نشد',
      });
    }

    if (row.type === 'INTERNAL' || row.barcode === row.product.internalBarcode) {
      throw new BadRequestException({
        error:'CANNOT_UNLINK_INTERNAL',
        message:'بارکد داخلی روی برچسب چاپ شده و برداشته نمی‌شود',
      });
    }

    await this.prisma.productBarcode.delete({ where:{ id: barcodeId } });

    return { success: true };
  }


  async scan(dto:any, userId?:string){

    // بارکد (چه INTERNAL چه FACTORY) خودش توی ProductBarcode یکتاست،
    // پس کافیه دنبال یک رکورد با همین مقدار بگردیم.
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



    let toLocationId = null;



    if(dto.action === 'TRANSFER'){

      if(!dto.toLocationBarcode){

        throw new BadRequestException({ error:'DESTINATION_REQUIRED', message:'مقصد انتقال مشخص نیست' });

      }



      const toLocation =
        await this.prisma.location.findUnique({

          where:{
            barcode:dto.toLocationBarcode
          }

        });



      if(!toLocation){

        throw new NotFoundException({ error:'DESTINATION_NOT_FOUND', message:'موقعیت مقصد پیدا نشد' });

      }



      toLocationId = toLocation.id;

    }



return this.inventoryOperation.execute({

      type:dto.action,

      productId:product.id,

      locationId:location.id,

      toLocationId,

      quantity:dto.quantity,

      note:'Barcode scan',

      source:'BARCODE',

      userId:userId

    });

  }


  async operation(dto:any, userId?:string){

    return this.scan(dto, userId);

  }




  async lookup(barcode:string){

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

          category:true,

          barcodes:true,

          assets:true,

          inventories:{
            where:{
              quantity:{
                gt:0
              }
            },

            include:{
              location:true
            }
          }

        }

      });


    if(!product){

      throw new NotFoundException({ error:'PRODUCT_NOT_FOUND', message:'کالا پیدا نشد' });

    }


    const totalStock =
      product.inventories.reduce(
        (sum:number,item)=>sum + item.quantity,
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

        brand:product.brand?.name || null,

        vehicleModel:product.vehicleModel?.name || null

      },


      totalStock,


      locations:
        product.inventories.map(item=>({

          name:item.location.name,

          barcode:item.location.barcode,

          quantity:item.quantity

        }))


    };


  }


}
