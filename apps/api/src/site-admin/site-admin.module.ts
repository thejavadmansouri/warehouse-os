import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { ImagePipeline } from '../common/image-pipeline';
import { SmsSender } from '../sms/sms-sender';
import { SiteAdminController } from './site-admin.controller';
import { SiteAdminService } from './site-admin.service';
import { ReviewModerationController } from '../storefront/review-moderation.controller';
import { ReviewModerationService } from '../storefront/review-moderation.service';
import { CouponsAdminController } from '../storefront/coupons-admin.controller';
import { CouponsAdminService } from '../storefront/coupons-admin.service';
import { BannersAdminController } from '../storefront/banners-admin.controller';
import { BannersAdminService } from '../storefront/banners-admin.service';
import { ShippingZonesAdminController } from '../storefront/shipping-zones-admin.controller';
import { ShippingZonesAdminService } from '../storefront/shipping-zones-admin.service';
import { StockNotifyAdminController } from '../storefront/stock-notify-admin.controller';
import { StockNotifyAdminService } from '../storefront/stock-notify-admin.service';

/**
 * پنلِ مدیرِ سایت — فقط با `APP_ROLE=site` لود می‌شود.
 *
 * روی سرور انبار عمداً وجود ندارد: آنجا مدیر پنلِ کاملِ خودش را دارد و یک
 * کپیِ ناقص فقط سردرگمی می‌سازد.
 *
 * دو دسته چیز اینجاست:
 *   • `SiteAdminController` — گزارشِ **فقط‌خواندنی** از سفارش‌ها و سلامتِ سینک.
 *   • مدیریتِ **محتوای خودِ سایت** — کوپن، بنر، منطقه‌ی ارسال، تأیید نظر و
 *     اعلانِ موجودی. این‌ها می‌نویسند، ولی فقط روی داده‌ای که مالِ سایت است و
 *     جای دیگری برای نوشتنش وجود ندارد؛ هیچ‌کدام به قفسه، قیمت خرید یا موجودیِ
 *     انبار دست نمی‌زنند.
 */
@Module({
  imports: [PrismaModule],
  controllers: [
    SiteAdminController,
    ReviewModerationController,
    CouponsAdminController,
    BannersAdminController,
    ShippingZonesAdminController,
    StockNotifyAdminController,
  ],
  providers: [
    SiteAdminService,
    ReviewModerationService,
    CouponsAdminService,
    BannersAdminService,
    ShippingZonesAdminService,
    StockNotifyAdminService,
    ImagePipeline,
    SmsSender,
  ],
})
export class SiteAdminModule {}
