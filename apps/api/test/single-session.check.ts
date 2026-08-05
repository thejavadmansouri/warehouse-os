/** هر حساب فقط روی یک دستگاه: ورود دوم، اولی را بیرون می‌اندازد. */
import '../src/load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import * as argon2 from 'argon2';

const U = 'sesscheck';
const P = 'sesscheck-pass-1234';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const auth = app.get(AuthService);
  const strategy = app.get(JwtStrategy);

  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.user.create({
    data: { username: U, password: await argon2.hash(P), fullName: 'تست نشست', role: 'SALES' },
  });

  const decode = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString());

  const first = await auth.login(U, P);
  const p1 = decode(first.access_token);
  console.log('device 1 logged in, sid =', p1.sid?.slice(0, 8));

  const ok1 = await strategy.validate(p1).then(() => true).catch(() => false);
  console.log('device 1 request before 2nd login ->', ok1 ? 'ACCEPTED ✅' : 'REJECTED ❌');

  const second = await auth.login(U, P);
  const p2 = decode(second.access_token);
  console.log('device 2 logged in, sid =', p2.sid?.slice(0, 8));

  const still1 = await strategy.validate(p1).then(() => 'ACCEPTED ❌').catch((e: any) =>
    (e?.response?.error === 'SESSION_REPLACED' ? 'REJECTED ✅ (SESSION_REPLACED)' : `REJECTED (${e?.message})`));
  console.log('device 1 request AFTER 2nd login ->', still1);

  const ok2 = await strategy.validate(p2).then(() => true).catch(() => false);
  console.log('device 2 request ->', ok2 ? 'ACCEPTED ✅' : 'REJECTED ❌');

  await auth.logout(p2.sub);
  const afterLogout = await strategy.validate(p2).then(() => 'ACCEPTED ❌').catch(() => 'REJECTED ✅');
  console.log('device 2 request after logout ->', afterLogout);

  await prisma.user.deleteMany({ where: { username: U } });
  console.log('\ncleaned up');
  await app.close();
}
main().catch(e => { console.error(e); process.exit(1); });
