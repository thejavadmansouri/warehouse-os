import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { BarcodeModule } from '../barcode/barcode.module';

@Module({
  imports: [
    BarcodeModule,
  ],
  controllers: [
    ProductsController,
  ],
  providers: [
    ProductsService,
  ],
  exports: [
    ProductsService,
  ],
})
export class ProductsModule {}
