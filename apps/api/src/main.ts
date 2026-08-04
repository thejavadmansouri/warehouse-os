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

  await app.listen(3000);
  console.log('🚀 Backend NestJS running on http://127.0.0.1:3000');
}
bootstrap();
