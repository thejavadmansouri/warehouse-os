import { Module } from '@nestjs/common';

import { WorkTasksController } from './work-tasks.controller';
import { WorkTasksService } from './work-tasks.service';
import { WorkTasksGateway } from './work-tasks.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { SystemLocationsService } from '../inventory/system-locations.service';

@Module({
  controllers: [WorkTasksController],
  // تیکِ کارِ چیدن جنس را از انبار موقت به قفسه منتقل می‌کند.
  providers: [
    PrismaService,
    WorkTasksService,
    WorkTasksGateway,
    InventoryOperationService,
    SystemLocationsService,
  ],
  exports: [WorkTasksService],
})
export class WorkTasksModule {}
