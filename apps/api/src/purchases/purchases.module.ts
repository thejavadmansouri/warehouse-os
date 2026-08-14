import { Module } from '@nestjs/common';

import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { SystemLocationsService } from '../inventory/system-locations.service';


@Module({

  controllers: [
    PurchasesController,
  ],

  providers: [
    PrismaService,
    PurchasesService,
    InventoryOperationService,
    SystemLocationsService,
  ],

  exports: [
    PurchasesService,
  ],

})

export class PurchasesModule {}
