import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './common/filters/app-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
