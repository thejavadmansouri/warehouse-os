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
      throw new Error('کالا پیدا نشد');
    }


    const location =
      await this.prisma.location.findUnique({

        where:{
          barcode:dto.locationBarcode
        }

      });


    if(!location){
      throw new Error('موقعیت پیدا نشد');
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
      throw new Error('کالا پیدا نشد');
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

      throw new Error('کالا با این بارکد پیدا نشد');

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
