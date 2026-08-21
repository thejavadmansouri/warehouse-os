/**
 * ادعای اصلیِ امنیتیِ سرورِ اینترنتی.
 *
 * پنلِ سایت روی VPS است، یعنی یک لاگینِ مدیر روی اینترنت باز است. تنها چیزی که
 * جلوی فاجعه را می‌گیرد این است که **API انبار روی آن ماشین اصلاً مونت نشود**.
 * نه «محافظت‌شده» — اصلاً وجود نداشته باشد.
 *
 * این فایل همان را اجرایی می‌کند: با `APP_ROLE=site` هر مسیرِ انباری باید ۴۰۴
 * بدهد، حتی با توکنِ درست. اگر روزی کسی ماژولی را از `WAREHOUSE_ONLY` بیرون
 * بیاورد، اینجا قرمز می‌شود.
 *
 * هیچ ردیفی در دیتابیس نوشته نمی‌شود و هیچ پورتی باز نمی‌ماند.
 *
 * اجرا:  npx ts-node -r tsconfig-paths/register test/app-role.check.ts
 */
import '../src/load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';

process.env.SYNC_SECRET = 'k'.repeat(48);

let failures = 0;
const check = (name: string, ok: boolean, detail: string) => {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name} — ${detail}`); }
};

/** مسیرهایی که هرگز نباید روی ماشینِ اینترنتی وجود داشته باشند. */
const WAREHOUSE_ROUTES = [
  '/users',
  '/products',
  '/locations',
  '/inventory',
  '/sales/invoices',
  '/purchases',
  '/reports/summary',
  '/backups/status',
  '/warehouses',
  '/uploads',
  '/labels',
  '/imports',
  '/work-tasks',
  '/shop-settings',
  '/online-orders',
];

/** مسیرهایی که روی سایت باید باشند. */
const SITE_ROUTES = ['/shop/settings', '/shop/products', '/site-admin/overview'];

async function boot() {
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
  // ─────────── APP_ROLE=site ───────────
  process.env.APP_ROLE = 'site';
  process.env.SYNC_ROLE = 'site';
  {
    const app = await boot();
    const http = app.getHttpServer();

    console.log('\nروی VPS، مسیرهای انبار اصلاً وجود ندارند:');
    for (const path of WAREHOUSE_ROUTES) {
      const res = await request(http).get(path);
      /*
       * ۴۰۴ یعنی مسیر مونت نشده. ۴۰۱ یعنی مونت شده و فقط توکن می‌خواهد —
       * و آن دقیقاً همان چیزی است که نمی‌خواهیم: یک در که فقط قفل است.
       */
      check(`GET ${path} → 404`, res.status === 404, `status=${res.status}`);
    }

    console.log('\nولی خودِ سایت کار می‌کند:');
    for (const path of SITE_ROUTES) {
      const res = await request(http).get(path);
      check(`GET ${path} مونت شده`, res.status !== 404, `status=${res.status}`);
    }

    console.log('\nپنلِ سایت پشتِ لاگین است:');
    const admin = await request(http).get('/site-admin/overview');
    check('GET /site-admin/overview بدون توکن → 401', admin.status === 401, `status=${admin.status}`);

    console.log('\nلاگین برای مدیرِ سایت لازم است، پس باید مونت باشد:');
    const login = await request(http).post('/auth/login').send({});
    check('POST /auth/login مونت شده', login.status !== 404, `status=${login.status}`);

    await app.close();
  }

  // ─────────── APP_ROLE=warehouse: هیچ‌چیز از دست نرفته ───────────
  process.env.APP_ROLE = 'warehouse';
  process.env.SYNC_ROLE = 'warehouse';
  {
    const app = await boot();
    const http = app.getHttpServer();

    console.log('\nروی انبار، همه‌چیز سرِ جایش است:');
    for (const path of ['/users', '/products', '/sales/invoices', '/online-orders']) {
      const res = await request(http).get(path);
      check(`GET ${path} مونت شده (۴۰۱ نه ۴۰۴)`, res.status === 401, `status=${res.status}`);
    }

    console.log('\nو پنلِ سایت آنجا وجود ندارد:');
    const admin = await request(http).get('/site-admin/overview');
    check('GET /site-admin/overview → 404', admin.status === 404, `status=${admin.status}`);

    await app.close();
  }

  console.log(
    failures === 0 ? '\nهمه‌ی ادعاها برقرارند.\n' : `\n${failures} ادعا شکست خورد.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
