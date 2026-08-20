import { Module } from '@nestjs/common';

import { ShortagesController } from './shortages.controller';
import { ShortagesService } from './shortages.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeModule } from '../realtime/realtime.module';


@Module({
  imports: [RealtimeModule],
  controllers: [ShortagesController],
  providers: [PrismaService, ShortagesService],
})
export class ShortagesModule {}
