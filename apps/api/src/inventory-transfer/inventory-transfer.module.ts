import { Module } from '@nestjs/common';
import { InventoryTransferController } from './inventory-transfer.controller';
import { InventoryTransferService } from './inventory-transfer.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryEngineModule } from '../inventory-engine/inventory-engine.module';


@Module({

  imports:[
    PrismaModule,
    InventoryEngineModule
  ],

  controllers:[
    InventoryTransferController
  ],

  providers:[
    InventoryTransferService
  ],

  exports:[
    InventoryTransferService
  ]

})
export class InventoryTransferModule {}
