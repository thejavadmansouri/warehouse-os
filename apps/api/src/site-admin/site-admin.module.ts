import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SiteAdminController } from './site-admin.controller';
import { SiteAdminService } from './site-admin.service';

/**
 * پنلِ مدیرِ سایت — فقط با `APP_ROLE=site` لود می‌شود.
 *
 * روی سرور انبار عمداً وجود ندارد: آنجا مدیر پنلِ کاملِ خودش را دارد و یک
 * کپیِ ناقص فقط سردرگمی می‌سازد.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SiteAdminController],
  providers: [SiteAdminService],
})
export class SiteAdminModule {}
