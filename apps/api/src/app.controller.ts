import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * سلامت‌سنج — تنها مسیرِ عمومیِ کل API.
   *
   * سرویسِ ویندوز و مانیتورینگ باید بدون توکن بتوانند بپرسند «زنده‌ای؟». فقط
   * وضعیتِ اپ و دیتابیس را می‌گوید (۱۰۰ بایت JSON) و هیچ داده‌ای درز نمی‌کند.
   */
  @Public()
  @Get('health')
  health() {
    return this.appService.health();
  }
}
