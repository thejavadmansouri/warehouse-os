import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

/** مسیر بدون گارد — نباید هرگز throttled شود (مثل بقیه‌ی API غیر از لاگین). */
@Controller('probe')
class ProbeController {
  @Get()
  ping() {
    return { ok: true };
  }
}

/** دقیقاً همان شکلِ لاگین: گارد + @Throttle روی خودِ route. */
@Controller('login-probe')
class LoginProbeController {
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Get()
  login() {
    return { ok: true };
  }
}

describe('Throttler — محدودیت نرخ لاگین (D1)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
      controllers: [ProbeController, LoginProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('مسیر بدون گارد throttled نمی‌شود', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer()).get('/probe');
      expect(res.status).toBe(200);
    }
  });

  it('مسیر محافظت‌شده بعد از سقف، درخواست بعدی را 429 می‌کند', async () => {
    expect((await request(app.getHttpServer()).get('/login-probe')).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/login-probe')).status).toBe(200);
    const blocked = await request(app.getHttpServer()).get('/login-probe');
    expect(blocked.status).toBe(429);
  });
});
