import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryEngineService } from '../inventory-engine/inventory-engine.service';

@Injectable()
export class InventoryTransferService {

  constructor(
    private prisma: PrismaService,
    private inventoryEngine: InventoryEngineService
  ) {}


  async transfer(
    productId:string,
    fromLocationId:string,
    toLocationId:string,
    quantity:number
  ){

    const result =
      await this.inventoryEngine.transferStock(
        productId,
        fromLocationId,
        toLocationId,
        quantity
      );


    await this.prisma.inventoryLog.createMany({

      data:[

        {
          productId,
          locationId:fromLocationId,
          quantity,
          action:'TRANSFER',
          note:`Transfer OUT to ${toLocationId}`
        },

        {
          productId,
          locationId:toLocationId,
          quantity,
          action:'TRANSFER',
          note:`Transfer IN from ${fromLocationId}`
        }

      ]

    });


    return {
      success:true,
      inventory:result
    };

  }

}
