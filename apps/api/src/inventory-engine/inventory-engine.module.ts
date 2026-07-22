import { Module } from '@nestjs/common';
import { InventoryEngineService } from './inventory-engine.service';
import { PrismaModule } from '../prisma/prisma.module';


@Module({

imports:[
  PrismaModule
],

providers:[
  InventoryEngineService
],

exports:[
  InventoryEngineService
]

})
export class InventoryEngineModule {}