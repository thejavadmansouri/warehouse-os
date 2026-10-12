import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationModule } from '../inventory-operation/inventory-operation.module';
import { PrintJobsModule } from '../print-jobs/print-jobs.module';
import { ProductRequestsController } from './product-requests.controller';
import { ProductRequestsService } from './product-requests.service';

@Module({
  imports: [InventoryOperationModule, PrintJobsModule],
  controllers: [ProductRequestsController],
  providers: [PrismaService, ProductRequestsService],
})
export class ProductRequestsModule {}
