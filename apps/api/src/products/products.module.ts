import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductPopularityService } from './product-popularity.service';
import { ProductsService } from './products.service';
import { BarcodeModule } from '../barcode/barcode.module';

@Module({
  imports: [BarcodeModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductPopularityService],
  exports: [ProductsService],
})
export class ProductsModule {}
