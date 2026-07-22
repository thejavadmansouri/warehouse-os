import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { VoiceInventoryService } from './voice-inventory.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryEngineModule } from '../inventory-engine/inventory-engine.module';


@Module({

  imports:[
    PrismaModule,
    InventoryEngineModule
  ],

  controllers:[
    InventoryController
  ],

  providers:[
    InventoryService,
    VoiceInventoryService
  ],

  exports:[
    InventoryService,
    VoiceInventoryService
  ]

})
export class InventoryModule {}
