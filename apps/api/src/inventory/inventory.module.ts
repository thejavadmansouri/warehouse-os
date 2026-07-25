import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { VoiceInventoryService } from './voice-inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from 
'../inventory-operation/inventory-operation.service';
import { ParsingEngineModule } from '../engine/parsing-engine.module';

@Module({
  imports: [
    ParsingEngineModule,
  ],
  controllers: [
    InventoryController
  ],
  providers: [
    PrismaService,
    InventoryService,
    InventoryOperationService,
    VoiceInventoryService,
  ],
  exports: [
    InventoryService,
    VoiceInventoryService,
  ],
})
export class InventoryModule {}
