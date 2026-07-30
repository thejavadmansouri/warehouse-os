import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';
import { PrinterRenderService } from './printer-render.service';

@Module({
  imports: [PrismaModule],
  controllers: [LabelsController],
  providers: [
    LabelsService,
    PrinterRenderService,
  ],
  exports: [
    LabelsService,
    PrinterRenderService,
  ],
})
export class LabelsModule {}
