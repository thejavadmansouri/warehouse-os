import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventorySessionService {

  constructor(
    private prisma: PrismaService
  ) {}






  async addLocation(
    sessionId:string,
    locationBarcode:string
  ){

    const location =
      await this.prisma.location.findUnique({

        where:{
          barcode:locationBarcode
        }

      });


    if(!location){
      throw new Error('قفسه پیدا نشد');
    }


    return this.prisma.inventorySessionLocation.create({

      data:{
        sessionId,
        locationId:location.id
      },

      include:{
        location:true
      }

    });

  }


  async start(
    warehouseId?: string,
    userId?: string
  ){

    return this.prisma.inventorySession.create({

      data:{
        warehouseId,
        userId
      },

      include:{
        warehouse:true,
        user:true
      }

    });

  }


  create(
    warehouseId: string,
    userId?: string
  ){

    return this.prisma.inventorySession.create({

      data:{
        warehouseId,
        userId
      }

    });

  }


  findActive(){

    return this.prisma.inventorySession.findMany({

      where:{
        finishedAt:null
      },

      include:{
        warehouse:true,
        user:true
      },

      orderBy:{
        startedAt:'desc'
      }

    });

  }


  finish(id:string){

    return this.prisma.inventorySession.update({

      where:{
        id
      },

      data:{
        finishedAt:new Date()
      }

    });

  }

}