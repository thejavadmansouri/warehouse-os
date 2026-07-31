import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationModule } from '../inventory-operation/inventory-operation.module';
import { ProductRequestsController } from './product-requests.controller';
import { ProductRequestsService } from './product-requests.service';

@Module({
  imports: [InventoryOperationModule],
  controllers: [ProductRequestsController],
  providers: [PrismaService, ProductRequestsService],
})
export class ProductRequestsModule {}
