import { Module, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';
import { SmsSender } from './sms-sender';
import { SalesModule } from '../sales/sales.module';

@Module({
  // فقط برای `LedgerService` — مانده‌ی مشتری در «یادآوری بدهی» لازم است.
  imports: [SalesModule],

  controllers: [SmsController],
  providers: [PrismaService, SmsService, SmsSender],
  exports: [SmsService, SmsSender],
})
export class SmsModule implements OnModuleInit {
  constructor(private readonly service: SmsService) {}

  /** قالب‌های پیش‌فرض یک بار کاشته می‌شوند؛ متنِ ویرایش‌شده دست‌نخورده می‌ماند. */
  async onModuleInit() {
    await this.service.ensureTemplates().catch(() => {
      // دیتابیس هنوز مهاجرت نشده — بالا آمدن سرور نباید به این بند باشد.
    });
  }
}
