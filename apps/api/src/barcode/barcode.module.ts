import { Module } from '@nestjs/common';

import { BarcodeService } from './barcode.service';
import { BarcodeController } from './barcode.controller';

import { PrismaModule } from '../prisma/prisma.module';
import { InventoryOperationModule } from '../inventory-operation/inventory-operation.module';


@Module({

  imports:[
    PrismaModule,
    InventoryOperationModule
  ],

  controllers:[
    BarcodeController
  ],

  providers:[
    BarcodeService
  ],

  exports:[
    BarcodeService
  ]

})
export class BarcodeModule {}
