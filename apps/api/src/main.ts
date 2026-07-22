import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // فعال‌سازی CORS برای ارتباط کامل فرانت‌اند و بک‌اند
  app.enableCors({
    origin: true,
    credentials: true,
  });

  await app.listen(3000);
  console.log('🚀 Backend NestJS running on http://127.0.0.1:3000');
}
bootstrap();
