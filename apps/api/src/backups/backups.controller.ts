import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  Req,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';

import { BackupsService } from './backups.service';
import { RestoreDto } from './dto/restore.dto';


/** بک‌آپ فقط برای مدیر. */
@Controller('backups')
export class BackupsController {

  constructor(private readonly service: BackupsService) {}


  /**
   * وضعیت بک‌آپ — کلاینت پیش از بستن برنامه این را می‌پرسد.
   * تصمیمِ «آیا یادآوری لازم است» اینجا گرفته می‌شود، نه در کلاینت.
   */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('status')
  status() {
    return this.service.status();
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('config')
  getConfig() {
    return this.service.getConfig();
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Put('config')
  updateConfig(
    @Body() dto: {
      enabled?: boolean;
      destination?: string;
      hour?: number;
      minute?: number;
      keepCount?: number;
      remindAfterHours?: number;
    },
  ){
    return this.service.updateConfig(dto);
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('history')
  history(
    @Query('limit') limit?: string,
  ){
    return this.service.history(limit ? Number(limit) : 30);
  }


  // trigger=ON_CLOSE یعنی مدیر هنگام بستن برنامه تأیید کرده.
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('run')
  runNow(
    @Body() body: { trigger?: 'MANUAL' | 'ON_CLOSE' },
    @Req() req: any,
  ){
    return this.service.createBackup(body?.trigger ?? 'MANUAL', req.user?.userId);
  }


  // ---------- بازیابی ----------

  /** فایل‌های بک‌آپِ روی سرور — خوراکِ جدولِ بازیابی. */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('files')
  files() {
    return this.service.listFiles();
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('restore-history')
  restoreHistory(
    @Query('limit') limit?: string,
  ){
    return this.service.restoreHistory(limit ? Number(limit) : 20);
  }


  /**
   * دانلود یک فایل بک‌آپ — **فقط مدیر کل**.
   *
   * دامپ شاملِ هشِ رمزها و کلِ داده‌ی مالی است؛ این تنها راهِ بیرون‌بردنِ کاملِ
   * دیتابیس از سرور است و از بقیه‌ی روت‌های بک‌آپ سخت‌گیرانه‌تر می‌ماند.
   *
   * ضمناً تنها راهِ پوششِ سناریوی «کل سرور سوخت» همین است: بک‌آپی که فقط روی
   * همان سرور باشد، با خودِ سرور از بین می‌رود.
   */
  @Roles(Role.ADMIN)
  @Get('files/:name/download')
  async download(
    @Param('name') name: string,
    @Res() res: Response,
  ){
    const filePath = await this.service.resolveBackupPath(name);
    // نامِ فایل از سرویس آمده و از الگوی سخت‌گیرانه رد شده، پس امن است.
    res.download(filePath, name);
  }


  /**
   * بازیابیِ کلِ دیتابیس — **فقط مدیر کل**.
   * همه‌ی داده‌ی فعلی با محتوای فایل جایگزین می‌شود.
   */
  @Roles(Role.ADMIN)
  @Post('restore')
  restore(
    @Body() dto: RestoreDto,
    @Req() req: any,
  ){
    return this.service.restore(dto.fileName, req.user?.userId);
  }
}
