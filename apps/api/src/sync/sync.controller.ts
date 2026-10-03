import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { SyncAuthGuard } from './sync-auth';
import { SyncService } from './sync.service';
import {
  AckOrdersDto,
  PushStatusDto,
  SyncCatalogDto,
  SyncSettingsDto,
} from './dto/sync.dto';

/**
 * درگاهِ ایجنتِ انبار — فقط روی **سایت** فعال است.
 *
 * `@Public()` گاردِ کارکنان را کنار می‌زند، ولی جایش `SyncAuthGuard` می‌نشیند:
 * بدون هدرِ `x-sync-key` هیچ‌کدام از این‌ها جواب نمی‌دهند.
 *
 * ⚠️ این ماژول نباید روی سرور انبار لود شود. `SYNC_ROLE=site` تنها چیزی است
 * که تصمیم می‌گیرد، و پیش‌فرضش «لود نکن» است.
 */
@Public()
@UseGuards(SyncAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** زنده‌ای؟ — ایجنت پیش از فرستادنِ کاتالوگ این را می‌زند. */
  @Get('ping')
  ping() {
    return { ok: true, at: new Date().toISOString() };
  }

  @Post('catalog')
  catalog(@Body() dto: SyncCatalogDto) {
    return this.sync.applyCatalog(dto);
  }

  @Post('settings')
  settings(@Body() dto: SyncSettingsDto) {
    return this.sync.applySettings(dto);
  }

  @Get('orders')
  orders() {
    return this.sync.pendingOrders();
  }

  @Post('orders/ack')
  ack(@Body() dto: AckOrdersDto) {
    return this.sync.ackOrders(dto);
  }

  @Post('orders/status')
  status(@Body() dto: PushStatusDto) {
    return this.sync.applyStatuses(dto);
  }
}
