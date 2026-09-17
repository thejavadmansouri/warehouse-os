import { Controller, Get, Query, Res } from '@nestjs/common';
import * as os from 'os';
import * as QRCode from 'qrcode';
import type { Response } from 'express';

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

  /**
   * آدرس‌های شبکه‌ی همین سرور — برای صفحه‌ی «اتصال گوشی».
   *
   * عمومی است چون همان اطلاعاتی است که هر دستگاهِ داخلِ شبکه به‌هرحال دارد
   * (خودِ آدرسِ سرور) و هیچ داده‌ای درز نمی‌کند؛ فقط فهرستِ آی‌پی‌های IPv4
   * داخلی + نامِ ماشین برمی‌گردد تا مدیر بتواند QR بگیرد و گوشی را وصل کند.
   */
  @Public()
  @Get('network')
  network() {
    const nets = os.networkInterfaces();
    const addresses: string[] = [];
    for (const list of Object.values(nets)) {
      for (const net of list ?? []) {
        if (net.family === 'IPv4' && !net.internal) addresses.push(net.address);
      }
    }
    return { hostname: os.hostname(), addresses };
  }

  /**
   * تصویرِ QR — برای صفحه‌ی «اتصال گوشی».
   *
   * عمومی است چون فقط متنِ داده‌شده را کد می‌کند و هیچ داده‌ای نمی‌خواند؛
   * QR روی آدرسِ وبِ داخلِ شبکه می‌نشیند که هر دستگاهِ شبکه به‌هرحال می‌داند.
   */
  @Public()
  @Get('qr')
  async qr(@Query('data') data: string, @Res() res: Response) {
    const png = await QRCode.toBuffer(data || '', {
      margin: 1,
      width: 240,
      errorCorrectionLevel: 'M',
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(png);
  }
}
