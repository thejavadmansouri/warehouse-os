import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventorySessionService {

  constructor(
    private prisma: PrismaService
  ) {}


  create(
    warehouseName:string,
    userId?:string
  ){

    return this.prisma.inventorySession.create({

      data:{
        warehouseName,
        userId
      }

    });

  }


  findActive(){

    return this.prisma.inventorySession.findMany({

      where:{
        finishedAt:null
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