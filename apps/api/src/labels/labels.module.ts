import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';
import { ProductsService } from '../products/products.service';
import { TsplService } from './tspl.service';
import { PrinterTransportService } from './printer-transport.service';

@Module({
  imports: [PrismaModule],
  controllers: [LabelsController],
  providers: [
    ProductsService,
    LabelsService,
    TsplService,
    PrinterTransportService,
  ],
  exports: [
    LabelsService,
    TsplService,
    PrinterTransportService,
  ],
})
export class LabelsModule {}
