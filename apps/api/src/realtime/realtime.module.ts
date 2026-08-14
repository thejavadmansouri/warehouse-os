import { Global, Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

/**
 * سراسری است تا هر سرویسی (فروش، انبار، رسید، مرجوعی و …) بتواند بدون importِ
 * جداگانه، EventsGateway را inject کند و رویداد realtime بفرستد. خودش به هیچ
 * ماژولِ feature وابسته نیست (فقط JwtService که سراسری است) — پس چرخه‌ی وابستگی
 * ایجاد نمی‌شود.
 */
@Global()
@Module({
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class RealtimeModule {}
