import { Module } from '@nestjs/common';

import { WorkTasksController } from './work-tasks.controller';
import { WorkTasksService } from './work-tasks.service';
import { WorkTasksGateway } from './work-tasks.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [WorkTasksController],
  providers: [PrismaService, WorkTasksService, WorkTasksGateway],
  exports: [WorkTasksService],
})
export class WorkTasksModule {}
