/**
 * مرزِ امنیتیِ فروشگاه اینترنتی.
 *
 * تنها ماژولی که روی اینترنت باز است همین است، پس دو ادعا باید ثابت شوند و
 * هر دو در یک جهت اهمیت دارند:
 *
 *   ۱. کاتالوگ عمومی بدون توکن باز است — وگرنه سایت اصلاً محصولی نشان نمی‌دهد.
 *   ۲. توکنِ مشتری **هرگز** به مسیرهای داخلی نمی‌رسد، و مسیرهای مشتری بدون
 *      توکن باز نمی‌شوند.
 *
 * هیچ ردیفی در دیتابیس نوشته نمی‌شود و هیچ پورتی هم باز نمی‌ماند: برنامه
 * درون‌فرایندی بالا می‌آید و supertest خودش سوکت موقت را می‌بندد.
 *
 * اجرا:  npx ts-node -r tsconfig-paths/register test/storefront-guards.check.ts
 */
import '../src/load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { CustomerTokenService } from '../src/storefront/customer-token';

let failures = 0;

function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name} — ${detail}`);
  }
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  // مثل main.ts — بدون این، گیت‌وی realtime دنبال درایور socket.io می‌گردد.
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();

  const http = app.getHttpServer();
  const tokens = app.get(CustomerTokenService);

  // توکنِ معتبرِ مشتری، بدون هیچ نوشتنی در دیتابیس.
  const customerToken = tokens.sign(
    '00000000-0000-4000-8000-000000000000',
    '09120000000',
  );
  const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

  console.log('\nکاتالوگ عمومی بدون توکن:');
  for (const path of ['/shop/settings', '/shop/products', '/shop/facets']) {
    const res = await request(http).get(path);
    // ۴۰۳ یعنی «سایت خاموش است» که خودش پاسخِ درستِ ماژول است؛ ۴۰۱ یعنی گاردِ
    // کارکنان جلویش را گرفته، و آن باگ است.
    check(
      `GET ${path} پشت لاگین نیست`,
      res.status !== 401,
      `status=${res.status}`,
    );
  }

  console.log('\nمسیرهای مشتری بدون توکن بسته‌اند:');
  for (const [method, path] of [
    ['get', '/shop/me'],
    ['get', '/shop/orders'],
    ['post', '/shop/orders'],
  ] as const) {
    const res = await request(http)[method](path);
    check(`${method.toUpperCase()} ${path} → 401`, res.status === 401, `status=${res.status}`);
  }

  console.log('\nصفِ سفارش‌های پنل عمومی نیست:');
  {
    const res = await request(http).get('/online-orders');
    check('GET /online-orders بدون توکن → 401', res.status === 401, `status=${res.status}`);

    const withCustomer = await request(http)
      .get('/online-orders')
      .set(bearer(customerToken));
    check(
      'GET /online-orders با توکنِ مشتری → 401',
      withCustomer.status === 401,
      `status=${withCustomer.status}`,
    );
  }

  console.log('\nتوکنِ مشتری به مسیرهای داخلی نمی‌رسد:');
  for (const path of ['/products', '/locations', '/sales/invoices', '/users']) {
    const res = await request(http).get(path).set(bearer(customerToken));
    check(`GET ${path} با توکنِ مشتری → 401`, res.status === 401, `status=${res.status}`);
  }

  console.log('\nتوکنِ مشتری روی مسیرِ خودش کار می‌کند:');
  {
    const res = await request(http).get('/shop/orders').set(bearer(customerToken));
    // مشتریِ ناموجود یعنی فهرستِ خالی، نه خطا — گارد رد شده و این همان ادعاست.
    check(
      'GET /shop/orders با توکنِ مشتری → 200',
      res.status === 200,
      `status=${res.status} body=${JSON.stringify(res.body).slice(0, 80)}`,
    );
  }

  await app.close();

  console.log(
    failures === 0
      ? '\nهمه‌ی ادعاها برقرارند.\n'
      : `\n${failures} ادعا شکست خورد.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
