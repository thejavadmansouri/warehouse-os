import { Module } from '@nestjs/common';
import { InventoryOperationService } from './inventory-operation.service';
import { PrismaModule } from '../prisma/prisma.module';


@Module({

imports:[
  PrismaModule
],

providers:[
  InventoryOperationService
],

exports:[
  InventoryOperationService
]

})
export class InventoryOperationModule {}
