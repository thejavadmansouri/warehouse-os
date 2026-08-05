// باید اول همه باشد: ماژول‌های پایین‌تر هنگام import شدن به متغیرهای محیطی
// (مثل JWT_SECRET) نیاز دارند، و در CommonJS ترتیب require همان ترتیب نوشتن است.
import './load-env';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
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

  app.useGlobalFilters(new AppExceptionFilter());

  app.enableCors({
    origin: true,
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
