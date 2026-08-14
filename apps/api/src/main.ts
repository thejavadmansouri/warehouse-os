// باید اول همه باشد: ماژول‌های پایین‌تر هنگام import شدن به متغیرهای محیطی
// (مثل JWT_SECRET) نیاز دارند، و در CommonJS ترتیب require همان ترتیب نوشتن است.
import './load-env';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './common/filters/app-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Pick-task push channel: raw `ws` sockets (lightweight, no socket.io client
  // needed on the operator phone — OkHttp speaks plain WebSocket natively).
  app.useWebSocketAdapter(new WsAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // هدرهای امنیتی: CSP، X-Frame-Options، nosniff، HSTS، حذف X-Powered-By و…
  // (پیش‌فرض helmet برای API کافی است — این سرور HTML به مرورگر نمی‌دهد.)
  app.use(helmet());

  app.useGlobalFilters(new AppExceptionFilter());

  /*
   * CORS — به‌جای `origin: true` (هر اوریجینی).
   *
   * - درخواست بدون Origin (برنامه‌ی اندروید، curl، same-origin) مجاز است —
   *   CORS اصلاً درباره‌ی این‌ها نیست.
   * - اگر `CORS_ORIGINS` ست شده باشد فقط همان اوریجین‌ها (با کاما جدا) مجازند.
   * - اگر ست نشده باشد، پیش‌فرض امنِ نصب‌های LAN: لوپ‌بک، شبکه‌ی خصوصی
   *   (RFC1918) و وب‌ویوی Tauri. صفحه‌ی یک سایت عمومی هرگز نمی‌تواند اوریجینِ
   *   خصوصی ادعا کند، پس این پیش‌فرض به‌جای «همه‌چیز» فقط هم‌شبکه‌ای‌ها را
   *   راه می‌دهد.
   */
  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const loopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  const privateLan =
    /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
  const tauri = /^(tauri:\/\/localhost|http:\/\/tauri\.localhost)$/;

  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (
        err: Error | null,
        origin?: boolean | string | RegExp | (string | RegExp)[],
      ) => void,
    ) => {
      if (!origin) return cb(null, true);
      const strict = allowedOrigins.length > 0;
      const ok = strict
        ? allowedOrigins.includes(origin)
        : loopback.test(origin) || privateLan.test(origin) || tauri.test(origin);
      return cb(null, ok);
    },
    credentials: true,
  });

  // The Windows service passes PORT, and the installer opens the firewall for
  // that same port. Hardcoding 3000 here meant a chosen port was silently
  // ignored and the open firewall port led nowhere.
  const port = Number(process.env.PORT) || 3000;

  // Bound on every interface, not just loopback: the worker phones and the
  // seller PC reach this over the warehouse LAN.
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Backend NestJS listening on 0.0.0.0:${port}`);
}
bootstrap();
