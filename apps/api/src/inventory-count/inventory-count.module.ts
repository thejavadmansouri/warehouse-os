import { Module } from '@nestjs/common';
import { InventoryCountController } from './inventory-count.controller';
import { InventoryCountService } from './inventory-count.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryOperationModule } from '../inventory-operation/inventory-operation.module';

@Module({
  imports: [PrismaModule, InventoryOperationModule],
  controllers: [InventoryCountController],
  providers: [InventoryCountService],
})
export class InventoryCountModule {}
