import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { BarcodeModule } from '../barcode/barcode.module';
import { InventoryOperationModule } from '../inventory-operation/inventory-operation.module';

@Module({
  imports: [
    BarcodeModule,
    // حذفِ قفسه‌ی دارای موجودی باید جنس را واقعی جابه‌جا/تصفیه کند، و هر
    // تغییر موجودی از تک‌نقطه‌ی InventoryOperationService رد می‌شود (قانون ۱).
    InventoryOperationModule,
  ],
  controllers: [
    LocationsController,
  ],
  providers: [
    LocationsService,
  ],
  exports: [
    LocationsService,
  ],
})
export class LocationsModule {}
