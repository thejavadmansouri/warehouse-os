import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SalesModule } from '../sales/sales.module';
import { StorefrontController } from './storefront.controller';
import { OnlineOrdersController } from './online-orders.controller';
import { StorefrontCatalogService } from './storefront-catalog.service';
import { StorefrontAuthService } from './storefront-auth.service';
import { StorefrontOrderService } from './storefront-order.service';
import { OnlineOrdersService } from './online-orders.service';
import { CustomerTokenService, CustomerAuthGuard } from './customer-token';
import { SmsSender } from './sms-sender';

/**
 * فروشگاه اینترنتی.
 *
 * `JwtModule` در `AuthModule` سراسری ثبت شده، پس `CustomerTokenService` بدون
 * import اضافه به `JwtService` می‌رسد و کلیدِ امضا همان کلیدِ سرور می‌ماند.
 *
 * `CustomerAuthGuard` اینجا provider است نه guard سراسری: فقط روی مسیرهایی که
 * صریحاً `@UseGuards` خورده‌اند اثر دارد، تا کاتالوگ عمومی باز بماند.
 */
@Module({
  imports: [PrismaModule, RealtimeModule, SalesModule],
  controllers: [StorefrontController, OnlineOrdersController],
  providers: [
    StorefrontCatalogService,
    StorefrontAuthService,
    StorefrontOrderService,
    OnlineOrdersService,
    CustomerTokenService,
    CustomerAuthGuard,
    SmsSender,
  ],
  exports: [StorefrontCatalogService, StorefrontOrderService],
})
export class StorefrontModule {}
