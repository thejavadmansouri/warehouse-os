import { Module } from '@nestjs/common';
import { InventoryTransferController } from './inventory-transfer.controller';
import { InventoryTransferService } from './inventory-transfer.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryOperationModule } from '../inventory-operation/inventory-operation.module';

@Module({
  imports: [PrismaModule, InventoryOperationModule],
  controllers: [InventoryTransferController],
  providers: [InventoryTransferService],
  exports: [InventoryTransferService],
})
export class InventoryTransferModule {}
