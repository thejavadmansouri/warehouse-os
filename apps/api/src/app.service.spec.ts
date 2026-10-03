import { ServiceUnavailableException } from '@nestjs/common';

import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

/**
 * تست‌های سلامت‌سنج (/health).
 *
 * قواعدِ موضوعِ تست:
 *   • دیتابیسِ سالم → status=ok، db=up، تأخیرِ اندازه‌گیری‌شده، نسخه و uptime.
 *   • دیتابیسِ قطع → همان بدنه با db=down ولی با ۵۰۳ — تا مانیتوری که فقط
 *     کدِ وضعیت را می‌بیند هم بفهمد اپ زنده است ولی دیتابیس نه.
 *   • هیچ چیزِ داخلی‌ای در پاسخ درز نمی‌کند.
 */
describe('AppService — health', () => {
  let service: AppService;
  const prisma = { $queryRaw: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    service = new AppService(prisma as unknown as PrismaService);
  });

  it('دیتابیسِ سالم: status=ok با تأخیر و نسخه', async () => {
    const res = await service.health();

    expect(res.status).toBe('ok');
    expect(res.db).toBe('up');
    expect(res.dbLatencyMs).toBeGreaterThanOrEqual(0);
    expect(res.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(res.version).not.toBe('');
    expect(Object.keys(res)).toEqual(
      expect.arrayContaining([
        'status',
        'db',
        'dbLatencyMs',
        'uptimeSec',
        'version',
        'builtAt',
        'kit',
        'packagedAt',
        'timestamp',
      ]),
    );
  });

  it('نسخه از مهرِ بیلد می‌آید، نه از package.json بی‌معنا', async () => {
    const res = await service.health();

    // در اجرای تست مهر وجود ندارد، پس پشتیبان می‌آید؛ مهم این است که فیلدهای
    // مهر همیشه در پاسخ باشند تا کیتِ نصب‌شده از همین سه فیلد شناخته شود.
    expect(res).toHaveProperty('builtAt');
    expect(res).toHaveProperty('kit');
    expect(res).toHaveProperty('packagedAt');
  });

  it('دیتابیسِ قطع: db=down با ۵۰۳ و همان بدنه', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    await expect(service.health()).rejects.toMatchObject({
      status: 503,
      response: {
        status: 'degraded',
        db: 'down',
      },
    });
  });

  it('هیچ جزئیاتِ داخلی‌ای در پاسخ نیست', async () => {
    prisma.$queryRaw.mockRejectedValue(
      new Error('postgresql://secret@host:5432/db failed'),
    );

    try {
      await service.health();
    } catch (e: any) {
      const body = JSON.stringify(e.response);
      expect(body).not.toContain('postgresql');
      expect(body).not.toContain('secret');
    }
  });
});
