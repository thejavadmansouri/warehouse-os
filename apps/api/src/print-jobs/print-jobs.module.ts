import { Module } from '@nestjs/common';
import { PrintJobsController } from './print-jobs.controller';
import { PrintJobsService } from './print-jobs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LabelsModule } from '../labels/labels.module';

@Module({
  imports: [
    PrismaModule,
    LabelsModule,
  ],
  controllers: [
    PrintJobsController,
  ],
  providers: [
    PrintJobsService,
  ],
  exports: [
    PrintJobsService,
  ],
})
export class PrintJobsModule {}
