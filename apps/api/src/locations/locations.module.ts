import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { BarcodeModule } from '../barcode/barcode.module';

@Module({
  imports: [
    BarcodeModule,
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
