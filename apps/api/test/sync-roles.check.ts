/**
 * ادعای مرکزیِ معماریِ سینک، به‌صورت اجرایی.
 *
 * کلِ امنیتِ این طرح روی یک جمله سوار است: **سرور انبار هیچ‌وقت گوش نمی‌دهد.**
 * اگر روزی کسی `SyncController` را بی‌قید لود کند، آن جمله بی‌سروصدا دروغ
 * می‌شود و هیچ تستِ دیگری متوجهش نمی‌شود. این فایل همان را قفل می‌کند.
 *
 * سه حالت بررسی می‌شود:
 *   • SYNC_ROLE=site      → مسیرها هستند، ولی بدون کلید ۴۰۱
 *   • SYNC_ROLE=warehouse → مسیرها **اصلاً وجود ندارند** (۴۰۴)
 *   • ست‌نشده             → هیچ مسیری نیست (پیش‌فرضِ امن)
 *
 * هیچ ردیفی در دیتابیس نوشته نمی‌شود و هیچ پورتی باز نمی‌ماند.
 *
 * اجرا:  npx ts-node -r tsconfig-paths/register test/sync-roles.check.ts
 */
import '../src/load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';

const KEY = 'k'.repeat(48);
process.env.SYNC_SECRET = KEY;

let failures = 0;

function check(name: string, ok: boolean, detail: string) {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name} — ${detail}`); }
}

async function boot() {
  // AppModule هر بار دوباره خوانده می‌شود تا SyncModule.forRole() نقشِ تازه را ببیند.
  for (const k of Object.keys(require.cache)) {
    if (k.includes('/src/')) delete require.cache[k];
  }
  const { AppModule } = require('../src/app.module');
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return app;
}

async function main() {
  // ─────────── نقشِ سایت ───────────
  process.env.SYNC_ROLE = 'site';
  {
    const app = await boot();
    const http = app.getHttpServer();

    const noKey = await request(http).get('/sync/ping');
    check('site: /sync/ping بدون کلید → 401', noKey.status === 401, `status=${noKey.status}`);

    const wrong = await request(http).get('/sync/ping').set('x-sync-key', 'x'.repeat(48));
    check('site: کلید غلط → 401', wrong.status === 401, `status=${wrong.status}`);

    // کلیدِ هم‌طول ولی متفاوت — مسیرِ timingSafeEqual
    const right = await request(http).get('/sync/ping').set('x-sync-key', KEY);
    check('site: کلید درست → 200', right.status === 200, `status=${right.status}`);

    // بدنه‌ی نامعتبر باید ۴۰۰ بگیرد نه ۵۰۰ — یعنی DTO واقعاً اعتبارسنجی می‌کند.
    const bad = await request(http)
      .post('/sync/catalog')
      .set('x-sync-key', KEY)
      .send({ products: [{ id: 'not-a-uuid' }], storedUnit: 'DOLLAR' });
    check('site: بدنه‌ی نامعتبر → 400', bad.status === 400, `status=${bad.status}`);

    const orders = await request(http).get('/sync/orders').set('x-sync-key', KEY);
    check('site: /sync/orders با کلید → 200', orders.status === 200, `status=${orders.status}`);

    await app.close();
  }

  // ─────────── نقشِ انبار: هیچ دری نباید باشد ───────────
  process.env.SYNC_ROLE = 'warehouse';
  {
    const app = await boot();
    const http = app.getHttpServer();

    for (const [method, path] of [
      ['get', '/sync/ping'],
      ['get', '/sync/orders'],
      ['post', '/sync/catalog'],
      ['post', '/sync/orders/ack'],
    ] as const) {
      const res = await request(http)[method](path).set('x-sync-key', KEY);
      check(
        `warehouse: ${method.toUpperCase()} ${path} → 404 (وجود ندارد)`,
        res.status === 404,
        `status=${res.status}`,
      );
    }
    await app.close();
  }

  // ─────────── بدون نقش: پیش‌فرضِ امن ───────────
  delete process.env.SYNC_ROLE;
  {
    const app = await boot();
    const res = await request(app.getHttpServer()).get('/sync/ping').set('x-sync-key', KEY);
    check('بدون SYNC_ROLE: /sync/ping → 404', res.status === 404, `status=${res.status}`);
    await app.close();
  }

  console.log(
    failures === 0 ? '\nهمه‌ی ادعاها برقرارند.\n' : `\n${failures} ادعا شکست خورد.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
