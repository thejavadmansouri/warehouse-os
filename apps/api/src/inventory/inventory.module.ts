import { Module } from '@nestjs/common';

import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { VoiceInventoryService } from './voice-inventory.service';
import { ProductMatcherService } from './product-matcher.service';
import { SystemLocationsService } from './system-locations.service';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';

import { ParsingEngineModule } from '../engine/parsing-engine.module';


@Module({

  imports: [
    ParsingEngineModule,
  ],


  controllers: [
    InventoryController,
  ],


  providers: [

    PrismaService,

    InventoryService,

    InventoryOperationService,

    VoiceInventoryService,

    ProductMatcherService,

    SystemLocationsService,

  ],


  exports: [

    InventoryService,

    VoiceInventoryService,

    ProductMatcherService,

    SystemLocationsService,

  ],

})


export class InventoryModule {}
