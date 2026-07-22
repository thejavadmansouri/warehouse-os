import { Module } from '@nestjs/common';
import { VehicleModelsController } from './vehicle-models.controller';
import { VehicleModelsService } from './vehicle-models.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports:[
    PrismaModule
  ],
  controllers:[
    VehicleModelsController
  ],
  providers:[
    VehicleModelsService
  ],
  exports:[
    VehicleModelsService
  ]
})
export class VehicleModelsModule {}
