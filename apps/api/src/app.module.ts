import { Module } from '@nestjs/common';
import { ServeStaticModule } from 
'@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

import { BarcodeModule } from './barcode/barcode.module';
import { ProductsModule } from './products/products.module';
import { LocationsModule } from './locations/locations.module';
import { LocationTypesModule } from './location-types/location-types.module';
import { InventoryModule } from './inventory/inventory.module';
import { VehicleModelsModule } from './vehicle-models/vehicle-models.module';
import { BrandsModule } from './brands/brands.module';
import { InventoryEngineModule } from './inventory-engine/inventory-engine.module';
import { InventorySessionModule } from './inventory-session/inventory-session.module';
import { InventoryTransferModule } from './inventory-transfer/inventory-transfer.module';
import { InventoryOperationModule } from './inventory-operation/inventory-operation.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({

  imports: [
ServeStaticModule.forRoot({
  rootPath: join(__dirname, '..', 'storage'),
  serveRoot: '/storage',
}),

    PrismaModule,

    AuthModule,

    UsersModule,

    BarcodeModule,

    ProductsModule,

    LocationsModule,

    LocationTypesModule,

    InventoryModule,

    VehicleModelsModule,

    BrandsModule,

    InventoryEngineModule,

    InventorySessionModule,

    InventoryTransferModule,

    InventoryOperationModule,
    UploadsModule,
  ],

  controllers: [
    AppController,
  ],

  providers: [
    AppService,
  ],

})

export class AppModule {}
