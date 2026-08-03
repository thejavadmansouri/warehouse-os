import { Module } from '@nestjs/common';

import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { CustomersService } from './customers.service';

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
    InventoryOperationService,
  ],

  exports: [
    SalesService,
    CustomersService,
  ],

})

export class SalesModule {}
