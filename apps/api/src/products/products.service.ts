import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';


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





  create(dto:any){






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


        sku:dto.sku,


        partNumber:dto.partNumber,


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





  update(id:string, dto:any){

    // فقط فیلدهای مستقیم روی Product رو آپدیت می‌کنیم.
    // تغییر بارکد/عکس/قیمت باید از endpointهای مخصوص خودشون
    // (barcode / uploads / prices) انجام بشه، چون این‌ها روی
    // جدول‌های جدا (ProductBarcode / Asset / ProductPrice) هستن.
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
      }

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





  async search(query:string){


    return this.findAll(
      1,
      100,
      query
    );

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
