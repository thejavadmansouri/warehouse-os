import { Module } from '@nestjs/common';

import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { CustomersService } from './customers.service';
import { ReceiptsService } from './receipts.service';
import { QuotationsService } from './quotations.service';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';


@Module({

  controllers: [
    SalesController,
  ],

  providers: [
    PrismaService,
    SalesService,
    CustomersService,
    ReceiptsService,
    QuotationsService,
    InventoryOperationService,
  ],

  exports: [
    SalesService,
    CustomersService,
    ReceiptsService,
    QuotationsService,
  ],

})

export class SalesModule {}
