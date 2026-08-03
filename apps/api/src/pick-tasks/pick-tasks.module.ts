import { Module } from '@nestjs/common';

import { PickTasksController } from './pick-tasks.controller';
import { PickTasksService } from './pick-tasks.service';
import { PrismaService } from '../prisma/prisma.service';


@Module({
  controllers: [PickTasksController],
  providers: [PrismaService, PickTasksService],
  exports: [PickTasksService],
})

export class PickTasksModule {}
