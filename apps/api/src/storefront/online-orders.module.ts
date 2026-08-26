import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OnlineOrdersController } from './online-orders.controller';
import { OnlineOrdersService } from './online-orders.service';

/**
 * صفِ تحویلِ سفارش‌های سایت — **فقط روی سرور انبار**.
 *
 * عمداً از `StorefrontModule` جدا شد: آن ماژول روی VPS هم لود می‌شود (کاتالوگ
 * عمومی و ورود مشتری)، ولی این یکی کارِ فروشنده است و هیچ‌وقت نباید روی
 * ماشینِ اینترنتی مونت شود.
 *
 * ⚠️ مدیریتِ کوپن، بنر، منطقه‌ی ارسال، تأیید نظر و اعلان موجودی اینجا **نیستند**
 * و نباید بیایند: آن‌ها محتوای سایت‌اند و در دیتابیسِ سایت زندگی می‌کنند، پس در
 * `SiteAdminModule` هستند. ساختنشان روی انبار یعنی نوشتن در دیتابیسی که ایجنتِ
 * سینک هرگز آن را به سایت نمی‌برد.
 */
@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [OnlineOrdersController],
  providers: [OnlineOrdersService],
})
export class OnlineOrdersModule {}
