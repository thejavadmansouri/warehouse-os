import { Module } from '@nestjs/common';

import { PickTasksController } from './pick-tasks.controller';
import { PickTasksService } from './pick-tasks.service';
import { PickTasksGateway } from './pick-tasks.gateway';
import { PrismaService } from '../prisma/prisma.service';


@Module({
  controllers: [PickTasksController],
  providers: [PrismaService, PickTasksService, PickTasksGateway],
  exports: [PickTasksService],
})

export class PickTasksModule {}
