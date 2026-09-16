import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';

import { SiteAccessGuard } from './site-access.guard';

/**
 * درخواستِ آزمایشیِ محافظت‌نشده از `SiteAccessGuard` — همان شکلی که
 * `OnlineOrdersController` و بقیه‌ی کنترلرهای محتوایِ «فروشگاه اینترنتی»
 * دارند: فقط گارد، دسترسی را از `req.user.canManageSite` می‌خواند و
 * به `role` کاری ندارد.
 */
@UseGuards(SiteAccessGuard)
@Controller('probe')
class ProbeController {
  @Get()
  ping() {
    return { ok: true };
  }
}

/**
 * درست‌کردنِ یک app کامل بامیدل‌ورِ شبیه‌سازِ Auth که `req.user` را با پروفایلِ
 * خواسته‌شده روی درخواست می‌گذارد. `JwtStrategy.validate` واقعی هم دقیقاً
 * همین کار را می‌کند (پرچم را از DB می‌خواند و در `user` می‌گذارد) — اینجا
 * آن‌قدر هست که «ستون‌آخرِ» گارد یعنی `canManageSite` تست شود.
 *
 * هیچ دیتابیسی لازم نیست: گارد فقط به `req.user` نگاه می‌کند، نه به DB.
 */
async function makeApp(user: {
  userId: string;
  role: Role;
  canManageSite: boolean;
}): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use((req: any, _res: any, next: () => void) => {
    req.user = user;
    next();
  });
  await app.init();
  return app;
}

describe('SiteAccessGuard — دسترسی مدیر فروشگاه اینترنتی (D2)', () => {
  it('SALESِ بدونِ پرچم بلاک می‌شود (403)', async () => {
    const app = await makeApp({
      userId: 'u-sales-noplain',
      role: Role.SALES,
      canManageSite: false,
    });
    try {
      const res = await request(app.getHttpServer()).get('/probe');
      expect(res.status).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('SALESِ دارایِ canManageSite پذیرفته می‌شود (200)', async () => {
    const app = await makeApp({
      userId: 'u-sales-site',
      role: Role.SALES,
      canManageSite: true,
    });
    try {
      const res = await request(app.getHttpServer()).get('/probe');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it('MANAGER (پرچم پیش‌فرض روشن) پذیرفته می‌شود', async () => {
    const app = await makeApp({
      userId: 'u-manager',
      role: Role.MANAGER,
      canManageSite: true,
    });
    try {
      const res = await request(app.getHttpServer()).get('/probe');
      expect(res.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('ADMIN (پرچم پیش‌فرض روشن) پذیرفته می‌شود', async () => {
    const app = await makeApp({
      userId: 'u-admin',
      role: Role.ADMIN,
      canManageSite: true,
    });
    try {
      const res = await request(app.getHttpServer()).get('/probe');
      expect(res.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('مدیر بدونِ پرچم نیز بلاک می‌شود — پرچم مستقل از نقش است', async () => {
    const app = await makeApp({
      userId: 'u-manager-noflag',
      role: Role.MANAGER,
      canManageSite: false,
    });
    try {
      const res = await request(app.getHttpServer()).get('/probe');
      expect(res.status).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('بدونِ user (اینباوجشن‌نشده) رد می‌شود (403)', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      const res = await request(app.getHttpServer()).get('/probe');
      expect(res.status).toBe(403);
    } finally {
      await app.close();
    }
  });
});
