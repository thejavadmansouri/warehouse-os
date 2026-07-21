import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { LocationTypesModule } from './location-types/location-types.module';
import { LocationsModule } from './locations/locations.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [
    PrismaModule,
    ProductsModule,
    LocationTypesModule,
    LocationsModule,
    InventoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
