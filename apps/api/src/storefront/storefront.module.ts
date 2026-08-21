import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StorefrontController } from './storefront.controller';
import { StorefrontCatalogService } from './storefront-catalog.service';
import { StorefrontAuthService } from './storefront-auth.service';
import { StorefrontOrderService } from './storefront-order.service';
import { CustomerTokenService, CustomerAuthGuard } from './customer-token';
import { SmsSender } from '../sms/sms-sender';

/**
 * فروشگاه اینترنتی.
 *
 * `JwtModule` در `AuthModule` سراسری ثبت شده، پس `CustomerTokenService` بدون
 * import اضافه به `JwtService` می‌رسد و کلیدِ امضا همان کلیدِ سرور می‌ماند.
 *
 * `CustomerAuthGuard` اینجا provider است نه guard سراسری: فقط روی مسیرهایی که
 * صریحاً `@UseGuards` خورده‌اند اثر دارد، تا کاتالوگ عمومی باز بماند.
 *
 * ⚠️ صفِ تحویلِ فروشنده اینجا نیست — در `OnlineOrdersModule` است که فقط روی
 * سرور انبار لود می‌شود. این ماژول روی VPS هم بالا می‌آید، پس هرچه داخلش
 * باشد روی اینترنت است.
 */
@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [StorefrontController],
  providers: [
    StorefrontCatalogService,
    StorefrontAuthService,
    StorefrontOrderService,
    CustomerTokenService,
    CustomerAuthGuard,
    SmsSender,
  ],
  exports: [StorefrontCatalogService, StorefrontOrderService],
})
export class StorefrontModule {}
