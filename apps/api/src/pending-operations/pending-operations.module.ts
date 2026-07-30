import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParsingEngineModule } from '../engine/parsing-engine.module';
import { InventoryOperationModule } from '../inventory-operation/inventory-operation.module';
import { ProductMatcherService } from '../inventory/product-matcher.service';
import { PendingOperationsController } from './pending-operations.controller';
import { PendingOperationsService } from './pending-operations.service';

@Module({
  imports: [ParsingEngineModule, InventoryOperationModule],
  controllers: [PendingOperationsController],
  providers: [PrismaService, ProductMatcherService, PendingOperationsService],
})
export class PendingOperationsModule {}
