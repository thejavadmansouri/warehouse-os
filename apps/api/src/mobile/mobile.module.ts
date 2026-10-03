import { Module } from '@nestjs/common';

import { MobileController } from './mobile.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MobileCountService } from './mobile-count.service';
import { ParsingEngineModule } from '../engine/parsing-engine.module';
// پیش‌فاکتور سفید از گوشی ساخته می‌شود؛ سرویسش در ماژول فروش است تا مسیر
// قیمت‌گذاری و تبدیل مدیر هم از همان یک منطق استفاده کند.
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [PrismaModule, ParsingEngineModule, SalesModule],

  controllers: [MobileController],

  providers: [MobileCountService],
})
export class MobileModule {}
