import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesGuard } from './auth/roles.guard';
import { BarcodeModule } from './barcode/barcode.module';
import { ProductsModule } from './products/products.module';
import { LocationBuilderModule } from './location-builder/location-builder.module';
import { LocationsModule } from './locations/locations.module';
import { LocationTypesModule } from './location-types/location-types.module';
import { InventoryModule } from './inventory/inventory.module';
import { VehicleModelsModule } from './vehicle-models/vehicle-models.module';
import { BrandsModule } from './brands/brands.module';
import { InventorySessionModule } from './inventory-session/inventory-session.module';
import { InventoryTransferModule } from './inventory-transfer/inventory-transfer.module';
import { InventoryOperationModule } from './inventory-operation/inventory-operation.module';
import { UploadsModule } from './uploads/uploads.module';
import { InventoryCountModule } from './inventory-count/inventory-count.module';
import { MobileModule } from './mobile/mobile.module';
import { PartCatalogModule } from './part-catalog/part-catalog.module';
import { ImportsModule } from './imports/imports.module';
import { CategoriesModule } from './categories/categories.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { LabelsModule } from './labels/labels.module';
import { PrintJobsModule } from './print-jobs/print-jobs.module';
import { PendingOperationsModule } from './pending-operations/pending-operations.module';

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
LocationBuilderModule,
    InventoryModule,
    VehicleModelsModule,
    BrandsModule,
    InventorySessionModule,
    InventoryTransferModule,
    InventoryOperationModule,
    UploadsModule,
    InventoryCountModule,
    MobileModule,
    PartCatalogModule,
    ImportsModule,
    CategoriesModule,
    SuppliersModule,
    LabelsModule,
    PrintJobsModule,
    PendingOperationsModule,
  ],
  controllers: [
    AppController,
  ],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
