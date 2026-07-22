import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {

  constructor(
    private prisma: PrismaService
  ) {}



  async findByLocation(locationId: string) {

    return this.prisma.inventoryLog.findMany({

      where:{
        locationId
      },

      include:{
        product:true,
        location:true,
        user:true,
      },

      orderBy:{
        createdAt:'desc'
      }

    });

  }





  async create(dto:any) {

    return this.prisma.inventoryLog.create({

      data:{

        productId: dto.productId,

        locationId: dto.locationId,

        quantity: dto.quantity,


        action:
          dto.action || 'IN',


        note:
          dto.note || null,


        userId:
          dto.userId || null,

      }

    });

  }






async getStock(){

  return this.prisma.inventory.findMany({

    where:{
      quantity:{
        gt:0
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

    },

    orderBy:{
      updatedAt:'desc'
    }

  });

}


async getLogs(){

  return this.prisma.inventoryLog.findMany({

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


  async out(dto:any){

    const inventory =
      await this.prisma.inventory.findUnique({

        where:{
          productId_locationId:{
            productId:dto.productId,
            locationId:dto.locationId
          }
        }

      });


    if(!inventory || inventory.quantity < dto.quantity){
      throw new Error('موجودی کافی نیست');
    }


    await this.prisma.inventory.update({

      where:{
        productId_locationId:{
          productId:dto.productId,
          locationId:dto.locationId
        }
      },

      data:{
        quantity:{
          decrement:dto.quantity
        }
      }

    });


    return this.prisma.inventoryLog.create({

      data:{

        productId:dto.productId,

        locationId:dto.locationId,

        quantity:dto.quantity,

        action:'SALE',

        note:dto.note || 'فروش',

        userId:dto.userId || null

      }

    });

  }




  async scanBarcode(dto:any){

    const product =
      await this.prisma.product.findFirst({

        where:{
          OR:[
            {
              internalBarcode:dto.barcode
            },
            {
              factoryBarcode:dto.barcode
            }
          ]
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



    if(dto.action === 'OUT'){

      return this.out({

        productId: product.id,

        locationId: location.id,

        quantity: dto.quantity,

        note:'Barcode OUT'

      });

    }



    if(dto.action === 'IN'){


      await this.prisma.inventory.upsert({

        where:{
          productId_locationId:{
            productId:product.id,
            locationId:location.id
          }
        },

        update:{
          quantity:{
            increment:dto.quantity
          }
        },

        create:{
          productId:product.id,
          locationId:location.id,
          quantity:dto.quantity
        }

      });



      return this.create({

        productId:product.id,

        locationId:location.id,

        quantity:dto.quantity,

        action:'IN',

        note:'Barcode IN'

      });

    }



    throw new Error('عملیات نامعتبر');

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
        vehicleModel:true
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

    product:{
      id:product.id,
      name:product.name,
      sku:product.sku,
      barcode:barcode,
      brand:product.brand?.name,
      vehicleModel:product.vehicleModel?.name,
      image:product.image
    },


    stocks: stocks.map(item=>({

      locationId:item.locationId,

      location:item.location.name,

      quantity:item.quantity

    }))


  };


}
async scanOut(dto:any){


  const product =
    await this.prisma.product.findFirst({

      where:{
        OR:[
          {
            internalBarcode:dto.barcode
          },
          {
            factoryBarcode:dto.barcode
          }
        ]
      }

    });



  if(!product){

    throw new Error('کالا پیدا نشد');

  }




  const inventory =
    await this.prisma.inventory.findUnique({

      where:{
        productId_locationId:{
          productId:product.id,
          locationId:dto.locationId
        }
      }

    });





  if(!inventory){

    throw new Error('این کالا در این موقعیت موجود نیست');

  }




  if(inventory.quantity < dto.quantity){

    throw new Error(
      `موجودی کافی نیست. موجودی فعلی: ${inventory.quantity}`
    );

  }





  const updated =
    await this.prisma.inventory.update({

      where:{
        productId_locationId:{
          productId:product.id,
          locationId:dto.locationId
        }
      },


      data:{
        quantity:{
          decrement:dto.quantity
        }
      }

    });





  await this.prisma.inventoryLog.create({

    data:{

      productId:product.id,

      locationId:dto.locationId,

      quantity:-dto.quantity,

      action:'SALE',

      note:dto.note || 'Barcode OUT',

      userId:dto.userId || null

    }

  });





  return {

    product:product.name,

    before:
      inventory.quantity,

    out:
      dto.quantity,

    after:
      updated.quantity

  };


}
}
