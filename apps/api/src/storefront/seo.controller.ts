import { Controller, Get, Header, Query } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { SeoService } from './seo.service';

/**
 * `sitemap.xml` و `robots.txt`.
 *
 * چرا از API سرو می‌شوند و فایل ثابت نیستند: فهرست کالاهای سایت هر روز عوض
 * می‌شود (مدیر `showOnline` را روشن/خاموش می‌کند). یک فایلِ ثابت از روز دوم
 * دروغ می‌گوید و گوگل را به صفحه‌های ۴۰۴ می‌فرستد.
 *
 * دامنه از هدرِ خودِ درخواست ساخته می‌شود، نه از یک ثابت در کد — همان درسی که
 * در `apiUrl()` پنل گرفتیم: آدرسِ حک‌شده روی نصبِ مشتری کار نمی‌کند.
 */
@Public()
@Controller()
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('sitemap.xml')
  @Header('content-type', 'application/xml; charset=utf-8')
  sitemap(@Query('base') base?: string) {
    return this.seo.sitemap(base);
  }

  @Get('robots.txt')
  @Header('content-type', 'text/plain; charset=utf-8')
  robots(@Query('base') base?: string) {
    return this.seo.robots(base);
  }
}
