import { Module } from '@nestjs/common';

import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { PrismaService } from '../prisma/prisma.service';


@Module({
  controllers: [BackupsController],
  providers: [PrismaService, BackupsService],
  exports: [BackupsService],
})

export class BackupsModule {}
