/**
 * «نمایش در سایت» گروهی.
 *
 * دو ادعا: انتخابِ خالی باید رد شود (وگرنه یک درخواستِ بی‌فیلتر کلِ کاتالوگِ
 * ۳۳ هزارتایی را عمومی می‌کند)، و `dryRun` نباید چیزی بنویسد.
 *
 * اجرا: npx ts-node -r tsconfig-paths/register test/show-online.check.ts
 */
import '../src/load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { ProductsService } from '../src/products/products.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';

let bad = 0;
const ok = (n: string, c: boolean, d = '') => {
  if (c) console.log(`  ✓ ${n}`);
  else {
    bad++;
    console.log(`  ✗ ${n} ${d}`);
  }
};

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();

  const svc = app.get(ProductsService);
  const prisma = app.get(PrismaService);

  console.log('\nانتخابِ خالی کلِ کاتالوگ را عمومی نمی‌کند:');
  for (const sel of [{}, { productIds: [] }]) {
    let threw = false;
    try {
      await svc.bulkSetOnline({ select: sel, showOnline: true });
    } catch {
      threw = true;
    }
    ok(`select=${JSON.stringify(sel)} رد شد`, threw);
  }

  const before = await prisma.product.count({ where: { showOnline: true } });

  console.log('\ndryRun چیزی نمی‌نویسد:');
  const sample = await prisma.product.findFirst({
    where: { showOnline: false, deletedAt: null },
    select: { id: true },
  });
  if (sample) {
    const dry = await svc.bulkSetOnline({
      select: { productIds: [sample.id] },
      showOnline: true,
      dryRun: true,
    });
    const after = await prisma.product.count({ where: { showOnline: true } });
    ok('applied=false برگشت', dry.applied === false, `applied=${dry.applied}`);
    ok('شمارش عوض نشد', after === before, `${before} → ${after}`);
  } else {
    console.log('  — کالای خاموشی برای تست پیدا نشد');
  }

  await app.close();
  console.log(
    bad === 0 ? '\nهمه‌ی ادعاها برقرارند.\n' : `\n${bad} ادعا شکست خورد.\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
