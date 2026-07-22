import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { AddItemDto } from './dto/add-item.dto';


@Injectable()
export class InventoryCountService {

  constructor(
    private prisma: PrismaService
  ) {}


  async create(dto: CreateInventoryCountDto) {

    return this.prisma.inventoryCount.create({

      data:{
        sessionId: dto.sessionId,
        locationId: dto.locationId,
        userId: dto.userId
      }

    });

  }



  async addItem(
    countId:string,
    dto:AddItemDto
  ){

    return this.prisma.inventoryItem.create({

      data:{

        countId,

        productId:dto.productId,

        name:dto.name,

        goodQuantity:dto.goodQuantity ?? 0,

        badQuantity:dto.badQuantity ?? 0,

        voiceText:dto.voiceText,

        note:dto.note

      }

    });

  }




  async findOne(id:string){

    return this.prisma.inventoryCount.findUnique({

      where:{
        id
      },

      include:{
        items:true
      }

    });

  }

async finish(id:string){

  return this.prisma.inventoryCount.update({
    where:{
      id
    },
    data:{
      status:"FINISHED",
      finishedAt:new Date()
    }
  });


}
async apply(id:string){

  const count = await this.prisma.inventoryCount.findUnique({
    where:{
      id
    },
    include:{
      items:true
    }
  });


  if(!count){
    throw new Error('Inventory count not found');
  }


  const results = [];


  for(const item of count.items){


    if(!item.productId){
      results.push({
        item:item.name,
        status:'NO_PRODUCT_LINK'
      });

      continue;
    }



    const current =
      await this.prisma.inventory.findUnique({
        where:{
          productId_locationId:{
            productId:item.productId,
            locationId:count.locationId
          }
        }
      });



    const oldQty = current?.quantity ?? 0;

    const newQty = item.goodQuantity;


    const diff = newQty - oldQty;



    await this.prisma.inventory.upsert({

      where:{
        productId_locationId:{
          productId:item.productId,
          locationId:count.locationId
        }
      },

      update:{
        quantity:newQty
      },

      create:{
        productId:item.productId,
        locationId:count.locationId,
        quantity:newQty
      }

    });



    if(diff !== 0){

      await this.prisma.inventoryLog.create({

        data:{
          productId:item.productId,
          locationId:count.locationId,
          quantity:diff,
          action:'COUNT',
          note:'Inventory count adjustment'
        }

      });

    }


    results.push({
      product:item.name,
      oldQty,
      newQty,
      diff
    });


  }


  await this.prisma.inventoryCount.update({

    where:{
      id
    },

    data:{
      status:'APPLIED'
    }

  });



  return results;

}
}
