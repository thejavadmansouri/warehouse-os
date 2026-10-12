import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';
import { ProductsService } from '../products/products.service';
import { TsplService } from './tspl.service';
import { PrinterTransportService } from './printer-transport.service';
import { ProductImagesModule } from '../product-images/product-images.module';

@Module({
  imports: [PrismaModule, forwardRef(() => ProductImagesModule)],
  controllers: [LabelsController],
  providers: [
    ProductsService,
    LabelsService,
    TsplService,
    PrinterTransportService,
  ],
  exports: [LabelsService, TsplService, PrinterTransportService],
})
export class LabelsModule {}
