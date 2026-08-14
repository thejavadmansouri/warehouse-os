import { Module } from '@nestjs/common';

import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { CustomersService } from './customers.service';
import { CustomerCategoriesService } from './customer-categories.service';
import { ReceiptsService } from './receipts.service';
import { QuotationsService } from './quotations.service';
import { ReturnsService } from './returns.service';
import { LedgerService } from './ledger.service';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { SystemLocationsService } from '../inventory/system-locations.service';


@Module({

  controllers: [
    SalesController,
  ],

  providers: [
    PrismaService,
    SalesService,
    CustomersService,
    CustomerCategoriesService,
    ReceiptsService,
    QuotationsService,
    ReturnsService,
    LedgerService,
    InventoryOperationService,
    SystemLocationsService,
  ],

  exports: [
    SalesService,
    CustomersService,
    CustomerCategoriesService,
    ReceiptsService,
    QuotationsService,
    ReturnsService,
    LedgerService,
  ],

})

export class SalesModule {}
