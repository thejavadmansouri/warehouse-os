/**
 * فروشنده نباید بتواند کاتالوگ یا ساختار انبار را دست بزند.
 * منوی مخفی امنیت نیست — دروازه‌ی واقعی همین گاردهاست.
 */
import '../src/load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import * as argon2 from 'argon2';

const BASE = 'http://127.0.0.1:3000';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const auth = app.get(AuthService);

  const mk = async (username: string, role: any) => {
    await prisma.user.deleteMany({ where: { username } });
    await prisma.user.create({
      data: { username, password: await argon2.hash('guard-pass-1234'), fullName: username, role },
    });
    return (await auth.login(username, 'guard-pass-1234')).access_token;
  };

  const sales = await mk('guard_sales', 'SALES');
  const staff = await mk('guard_staff', 'STAFF');
  const admin = await mk('guard_admin', 'ADMIN');

  const call = async (t: string, method: string, path: string, body?: unknown) => {
    const r = await fetch(BASE + path, {
      method,
      headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.status;
  };

  const cases: [string, string, string, string, unknown?][] = [
    ['SALES', 'POST', '/brands', sales, { name: 'x-guard' }],
    ['SALES', 'POST', '/vehicle-models', sales, { name: 'x', startYear: 1390, endYear: 1400 }],
    ['SALES', 'POST', '/location-types', sales, { warehouseId: 'x', name: 'x', depth: 5 }],
    ['SALES', 'POST', '/location-builder/generate', sales, { warehouseId: 'x', levels: [] }],
    ['SALES', 'POST', '/imports/upload', sales, {}],
    ['STAFF', 'POST', '/brands', staff, { name: 'y-guard' }],
    ['STAFF', 'POST', '/imports/upload', staff, {}],
  ];

  console.log('نوشتن‌هایی که باید ۴۰۳ بگیرند:');
  let ok = true;
  for (const [who, m, p, tok, b] of cases) {
    const st = await call(tok as string, m, p, b);
    const pass = st === 403;
    if (!pass) ok = false;
    console.log(`  ${who.padEnd(6)} ${m} ${p.padEnd(30)} -> ${st} ${pass ? '✅' : '❌ باید ۴۰۳ باشد'}`);
  }

  console.log('\nخواندن‌هایی که باید کار کنند:');
  for (const [who, tok] of [['SALES', sales], ['STAFF', staff]] as const) {
    const st = await call(tok, 'GET', '/brands');
    const pass = st === 200;
    if (!pass) ok = false;
    console.log(`  ${who.padEnd(6)} GET /brands -> ${st} ${pass ? '✅' : '❌'}`);
  }

  console.log('\nمدیر باید همچنان بتواند:');
  const st = await call(admin, 'GET', '/brands');
  console.log(`  ADMIN  GET /brands -> ${st} ${st === 200 ? '✅' : '❌'}`);

  await prisma.brand.deleteMany({ where: { name: { in: ['x-guard', 'y-guard'] } } });
  await prisma.user.deleteMany({ where: { username: { in: ['guard_sales','guard_staff','guard_admin'] } } });
  console.log('\ncleaned up');
  await app.close();
  process.exit(ok && st === 200 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
