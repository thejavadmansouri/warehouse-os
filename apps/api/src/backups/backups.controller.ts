import { Controller, Get, Post, Put, Body, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';

import { BackupsService } from './backups.service';


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
}
