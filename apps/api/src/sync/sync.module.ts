import { DynamicModule, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncAgentService } from './sync-agent.service';
import { SyncAuthGuard } from './sync-auth';

/**
 * سینکِ سایت ↔ انبار.
 *
 * یک کدبیس روی دو ماشین اجرا می‌شود و `SYNC_ROLE` تعیین می‌کند کدام نیمه‌اش
 * زنده شود:
 *
 *   • `SYNC_ROLE=site`      → روی سرور اینترنتی. فقط endpointهای دریافت.
 *   • `SYNC_ROLE=warehouse` → روی سرور انبار. فقط ایجنتِ زمان‌بندی‌شده.
 *   • ست‌نشده              → هیچ‌کدام. **پیش‌فرضِ عمدی.**
 *
 * چرا پیش‌فرض «هیچ‌کدام» است: نصبی که هرگز سایت نخواهد داشت نباید با یک
 * به‌روزرسانی ناگهان صاحب مسیرهای `/sync/*` شود. و مهم‌تر، سرور انبار نباید
 * هیچ‌وقت `SyncController` را لود کند — آن کنترلر برای شنیدن است و انبار قرار
 * است فقط حرف بزند.
 */
@Module({})
export class SyncModule {
  static forRole(): DynamicModule {
    const role = (process.env.SYNC_ROLE ?? '').trim().toLowerCase();

    if (role === 'site') {
      return {
        module: SyncModule,
        imports: [PrismaModule],
        controllers: [SyncController],
        providers: [SyncService, SyncAuthGuard],
      };
    }

    if (role === 'warehouse') {
      return {
        module: SyncModule,
        imports: [PrismaModule, RealtimeModule],
        providers: [SyncAgentService],
        exports: [SyncAgentService],
      };
    }

    return { module: SyncModule };
  }
}
