import { Module } from '@nestjs/common';
import { InventorySessionController } from './inventory-session.controller';
import { InventorySessionService } from './inventory-session.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule
  ],
  controllers: [
    InventorySessionController
  ],
  providers: [
    InventorySessionService
  ],
  exports:[
    InventorySessionService
  ]
})
export class InventorySessionModule {}