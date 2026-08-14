import { Module } from '@nestjs/common';

import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { PrismaService } from '../prisma/prisma.service';


@Module({
  controllers: [ShopController],
  providers: [PrismaService, ShopService],
  exports: [ShopService],
})

export class ShopModule {}
