import { Injectable } from '@nestjs/common';
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


    const where:any = search ? {

      OR:[

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
        }

      ]

    } : {};



    const [data,total]=await Promise.all([

      this.prisma.product.findMany({
        where,
        skip,
        take:limit,
        include:{
          brand:true,
          vehicleModel:true,
          category:true
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





  findOne(id:string){

    return this.prisma.product.findUnique({

      where:{
        id
      },

      include:{
        brand:true,
        vehicleModel:true,
        category:true
      }

    });

  }





  create(dto:any){

    return this.prisma.product.create({

      data:{

        name:dto.name,

        sku:dto.sku,

        internalBarcode:
          dto.internalBarcode || `WOS${Date.now()}`,

        brandId:dto.brandId,

        categoryId:dto.categoryId,

        vehicleModelId:dto.vehicleModelId,

        factoryBarcode:dto.factoryBarcode,

        partNumber:dto.partNumber

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





  remove(id:string){

    return this.prisma.product.delete({

      where:{
        id
      }

    });

  }



  async search(query:string){

    return this.prisma.product.findMany({

      where:{
        OR:[
          {
            name:{
              contains:query,
              mode:'insensitive'
            }
          },
          {
            sku:{
              contains:query,
              mode:'insensitive'
            }
          },
          {
            internalBarcode:{
              contains:query,
              mode:'insensitive'
            }
          },
          {
            factoryBarcode:{
              contains:query,
              mode:'insensitive'
            }
          },
          {
            partNumber:{
              contains:query,
              mode:'insensitive'
            }
          },
          {
            brand:{
              name:{
                contains:query,
                mode:'insensitive'
              }
            }
          },
          {
            vehicleModel:{
              name:{
                contains:query,
                mode:'insensitive'
              }
            }
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
        }
      }

    });

  }

}
