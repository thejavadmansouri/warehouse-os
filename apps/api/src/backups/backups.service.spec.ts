import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { BackupsService } from './backups.service';
import { PrismaService } from '../prisma/prisma.service';


/**
 * `resolveBackupPath` مرزِ امنیتیِ دو اندپوینت است: دانلود و بازیابی.
 *
 * دامپ شاملِ هشِ رمزهای همه‌ی کاربران و کلِ داده‌ی مالی است. اگر نامِ فایل
 * کنترل نشود، `GET /backups/files/<name>/download` تبدیل می‌شود به «هر فایلی
 * از این سرور را برایم بفرست». این تست‌ها همان مرز را نگه می‌دارند.
 */
describe('BackupsService — نگهبانِ نامِ فایل', () => {
  let service: BackupsService;
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wos-backup-test-'));
    await fs.writeFile(path.join(dir, 'warehouse_os_2026-01-01T00-00-00.dump'), 'x');
    // فایلی بیرون از پوشه‌ی مقصد، برای آزمونِ فرار از مسیر.
    await fs.writeFile(path.join(path.dirname(dir), 'secret.dump'), 'x');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupsService,
        {
          provide: PrismaService,
          useValue: {
            backupConfig: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'singleton',
                destination: dir,
                enabled: true,
                hour: 23,
                minute: 0,
                keepCount: 14,
                remindAfterHours: 12,
              }),
            },
          },
        },
      ],
    }).compile();

    service = module.get(BackupsService);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(path.join(path.dirname(dir), 'secret.dump'), { force: true });
  });


  it('نامِ درست پذیرفته می‌شود', async () => {
    const p = await service.resolveBackupPath('warehouse_os_2026-01-01T00-00-00.dump');
    expect(p).toBe(path.join(dir, 'warehouse_os_2026-01-01T00-00-00.dump'));
  });

  /*
   * هر کدام از این‌ها اگر رد نشود، یعنی خواندنِ فایلِ دلخواه از سرور.
   */
  it.each([
    ['فرار با ../', '../secret.dump'],
    ['فرار چندمرحله‌ای', '../../etc/passwd'],
    ['مسیر مطلق', '/etc/passwd'],
    ['جداکننده‌ی ویندوزی', '..\\secret.dump'],
    ['بدون پسوند dump', 'warehouse_os_x'],
    ['پسوند دیگر', 'anything.env'],
    ['نامِ خالی', ''],
    ['نقطه‌ی متوالی داخل نام', 'warehouse..dump'],
  ])('%s رد می‌شود', async (_label, name) => {
    await expect(service.resolveBackupPath(name)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('نامِ معتبرِ ناموجود ۴۰۴ می‌دهد، نه ۴۰۰', async () => {
    await expect(
      service.resolveBackupPath('warehouse_os_1999-01-01T00-00-00.dump'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });


  describe('listFiles', () => {
    it('فقط فایل‌های dump را برمی‌گرداند', async () => {
      await fs.writeFile(path.join(dir, 'notes.txt'), 'x');
      const { files } = await service.listFiles();
      expect(files.map((f) => f.name)).toEqual([
        'warehouse_os_2026-01-01T00-00-00.dump',
      ]);
    });

    it('آرشیوِ خراب با verified=false علامت می‌خورد', async () => {
      const { files } = await service.listFiles();
      // محتوای فایل «x» است، نه آرشیوِ واقعی pg_dump.
      expect(files[0].verified).toBe(false);
    });
  });
});
