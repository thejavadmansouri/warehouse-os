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
          internalBarcode:{
            contains:search,
            mode:'insensitive'
          }
        },

        {
          factoryBarcode:{
            contains:search,
            mode:'insensitive'
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


    return this.prisma.product.create({

      data:{


        name:dto.name,


        sku:dto.sku,


        internalBarcode:
          dto.internalBarcode ||
          `WOS${Date.now()}`,



        factoryBarcode:dto.factoryBarcode,


        partNumber:dto.partNumber,



        brandId:dto.brandId,


        categoryId:dto.categoryId,


        vehicleModelId:dto.vehicleModelId,



        purchasePrice:dto.purchasePrice,


        salePrice:dto.salePrice,


        minStock:dto.minStock || 0,


        image:dto.image


      }

    });


  }





  update(id:string,dto:any){


    return this.prisma.product.update({

      where:{
        id
      },


      data:dto

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
        OR:[
          {
            internalBarcode: barcode
          },
          {
            factoryBarcode: barcode
          }
        ]
      },

      include:{

        brand:true,

        vehicleModel:true,

        category:true,


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
            user:true
          }
        }

      }

    });


    if(!product){

      throw new Error('کالا پیدا نشد');

    }


    const totalStock =
      product.inventories.reduce(
        (sum,item)=>sum+item.quantity,
        0
      );


    return {

      product:{

        id:product.id,

        name:product.name,

        sku:product.sku,

        internalBarcode:product.internalBarcode,

        factoryBarcode:product.factoryBarcode,

        partNumber:product.partNumber,

        image:product.image,

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

        image: log.image,

        location:{

          name: log.location.name,

          barcode: log.location.barcode

        },

        user: log.user?.fullName || null,

        createdAt: log.createdAt

      }))

    };


  }


}


