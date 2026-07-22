import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryEngineService {

  constructor(
    private prisma: PrismaService
  ) {}


  async increaseStock(
    productId:string,
    locationId:string,
    quantity:number
  ){

    return this.prisma.inventory.upsert({

      where:{
        productId_locationId:{
          productId,
          locationId
        }
      },

      update:{
        quantity:{
          increment: quantity
        }
      },

      create:{
        productId,
        locationId,
        quantity
      }

    });

  }


  async decreaseStock(
    productId:string,
    locationId:string,
    quantity:number
  ){

    return this.prisma.inventory.update({

      where:{
        productId_locationId:{
          productId,
          locationId
        }
      },

      data:{
        quantity:{
          decrement: quantity
        }
      }

    });

  }

  async transferStock(
    productId:string,
    fromLocationId:string,
    toLocationId:string,
    quantity:number
  ){

    return this.prisma.$transaction(async (tx)=>{

      await tx.inventory.update({

        where:{
          productId_locationId:{
            productId,
            locationId: fromLocationId
          }
        },

        data:{
          quantity:{
            decrement: quantity
          }
        }

      });


      return tx.inventory.upsert({

        where:{
          productId_locationId:{
            productId,
            locationId: toLocationId
          }
        },

        update:{
          quantity:{
            increment: quantity
          }
        },

        create:{
          productId,
          locationId: toLocationId,
          quantity
        }

      });

    });

  }

}
