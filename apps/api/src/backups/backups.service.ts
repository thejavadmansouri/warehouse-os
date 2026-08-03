import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

import { PrismaService } from '../prisma/prisma.service';

const run = promisify(execFile);

const SINGLETON = 'singleton';

/**
 * پارامترهایی که libpq می‌فهمد. بقیه (مثل `schema` که مخصوص Prisma است)
 * باید حذف شوند، وگرنه pg_dump با «invalid URI query parameter» رد می‌کند.
 */
const LIBPQ_PARAMS = new Set([
  'sslmode',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'connect_timeout',
  'application_name',
  'options',
]);

/**
 * Prisma برای ستون BigInt مقدار BigInt جاوااسکریپت می‌دهد و JSON.stringify
 * آن را سریالایز نمی‌کند — پاسخ با «Do not know how to serialize a BigInt»
 * می‌ترکد در حالی که خود بک‌آپ موفق بوده. حجم فایل به number تبدیل می‌شود.
 */
function serializeRun<T extends { sizeBytes?: bigint | null } | null>(row: T) {
  if (!row) return row;
  return { ...row, sizeBytes: row.sizeBytes == null ? null : Number(row.sizeBytes) };
}

/** حذف رمز از هر متنی پیش از رفتن به کلاینت یا لاگ. */
function redactSecrets(text: string): string {
  return text.replace(/(postgres(?:ql)?:\/\/[^:@\s]+:)[^@\s]+@/gi, '$1***@');
}

/** مسیر pg_dump اگر روی PATH نباشد (روی ویندوز معمولاً نیست). */
const PG_DUMP = process.env.PG_DUMP_PATH || 'pg_dump';
const PG_RESTORE = process.env.PG_RESTORE_PATH || 'pg_restore';


@Injectable()
export class BackupsService {

  private readonly logger = new Logger(BackupsService.name);
  /** جلوی اجرای هم‌زمان دو بک‌آپ را می‌گیرد (زمان‌بندی + دستی با هم). */
  private running = false;

  constructor(private prisma: PrismaService) {}


  async getConfig() {
    const existing = await this.prisma.backupConfig.findUnique({
      where: { id: SINGLETON },
    });

    if (existing) return existing;

    return this.prisma.backupConfig.create({ data: { id: SINGLETON } });
  }


  async updateConfig(dto: {
    enabled?: boolean;
    destination?: string;
    hour?: number;
    minute?: number;
    keepCount?: number;
    remindAfterHours?: number;
  }) {
    if (dto.hour !== undefined && (dto.hour < 0 || dto.hour > 23)) {
      throw new BadRequestException({
        error: 'INVALID_HOUR',
        message: 'ساعت باید بین ۰ تا ۲۳ باشد',
      });
    }
    if (dto.minute !== undefined && (dto.minute < 0 || dto.minute > 59)) {
      throw new BadRequestException({
        error: 'INVALID_MINUTE',
        message: 'دقیقه باید بین ۰ تا ۵۹ باشد',
      });
    }
    if (dto.keepCount !== undefined && dto.keepCount < 1) {
      throw new BadRequestException({
        error: 'INVALID_KEEP_COUNT',
        message: 'حداقل یک نسخه باید نگه داشته شود',
      });
    }

    // مقصد باید همین حالا بررسی شود، نه نیمه‌شب وقتی کسی نیست.
    if (dto.destination) {
      await this.assertWritable(dto.destination);
    }

    await this.getConfig();

    return this.prisma.backupConfig.update({
      where: { id: SINGLETON },
      data: dto,
    });
  }


  /**
   * وضعیتی که کلاینت برای «یادآوری پیش از بستن» می‌پرسد.
   *
   * تصمیمِ «آیا باید یادآوری شود» سمت سرور گرفته می‌شود، نه کلاینت — وگرنه
   * هر کلاینت منطق خودش را پیاده می‌کند و با هم فرق می‌کنند.
   */
  async status() {
    const config = await this.getConfig();

    const last = await this.prisma.backupRun.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { startedAt: 'desc' },
    });

    const hoursSince = last
      ? (Date.now() - last.startedAt.getTime()) / 3_600_000
      : Infinity;

    return {
      lastSuccessAt: last?.startedAt ?? null,
      lastFilePath: last?.filePath ?? null,
      lastVerified: last?.verified ?? false,
      hoursSinceLastBackup: last ? Math.round(hoursSince * 10) / 10 : null,
      shouldRemind: config.enabled && hoursSince > config.remindAfterHours,
      isRunning: this.running,
      config,
    };
  }


  /**
   * زمان‌بند: هر دقیقه بیدار می‌شود و فقط اگر ساعت و دقیقه‌ی تنظیم‌شده رسیده
   * باشد اجرا می‌کند.
   *
   * چرا این‌طور و نه یک cron داینامیک: ساعت را مدیر از رابط کاربری عوض می‌کند
   * و ثبت دوباره‌ی cron در زمان اجرا منبع خطاست. یک بررسی سبک در دقیقه هزینه‌ای
   * ندارد و همیشه با تنظیمات فعلی هماهنگ است.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledTick() {
    try {
      const config = await this.getConfig();
      if (!config.enabled || this.running) return;

      const now = new Date();
      if (now.getHours() !== config.hour || now.getMinutes() !== config.minute) return;

      // اگر در همین دقیقه قبلاً اجرا شده، دوباره اجرا نکن.
      const already = await this.prisma.backupRun.findFirst({
        where: { startedAt: { gte: new Date(Date.now() - 90_000) } },
      });
      if (already) return;

      this.logger.log('اجرای بک‌آپ زمان‌بندی‌شده');
      await this.createBackup('SCHEDULED');
    } catch (e) {
      this.logger.error(`بک‌آپ زمان‌بندی‌شده شکست خورد: ${redactSecrets(String(e))}`);
    }
  }


  /**
   * گرفتن بک‌آپ.
   *
   * فرمت custom (-Fc) است نه SQL متنی: فشرده‌تر است و با pg_restore هم
   * قابل بازیابی گزینشی است و هم قابل **بررسی سلامت** بدون بازیابی واقعی.
   */
  async createBackup(trigger: 'MANUAL' | 'SCHEDULED' | 'ON_CLOSE', userId?: string) {

    if (this.running) {
      throw new BadRequestException({
        error: 'BACKUP_IN_PROGRESS',
        message: 'یک بک‌آپ در حال اجراست',
      });
    }

    this.running = true;

    const config = await this.getConfig();
    const dir = await this.resolveDestination(config.destination);

    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filePath = path.join(dir, `warehouse_os_${stamp}.dump`);

    const record = await this.prisma.backupRun.create({
      data: { configId: config.id, trigger, status: 'RUNNING', startedById: userId ?? null },
    });

    try {
      const url = this.connectionString();

      await run(PG_DUMP, ['--format=custom', '--file', filePath, '--dbname', url], {
        maxBuffer: 1024 * 1024 * 64,
      });

      const stat = await fs.stat(filePath);

      if (stat.size === 0) {
        throw new Error('فایل بک‌آپ خالی است');
      }

      // بک‌آپی که خوانده نشود، بک‌آپ نیست.
      const verified = await this.verify(filePath);

      if (!verified) {
        throw new Error('فایل بک‌آپ ساخته شد ولی قابل خواندن نیست');
      }

      await this.prisma.backupRun.update({
        where: { id: record.id },
        data: {
          status: 'SUCCESS',
          filePath,
          sizeBytes: BigInt(stat.size),
          verified: true,
          finishedAt: new Date(),
        },
      });

      await this.prune(dir, config.keepCount);

      this.logger.log(`بک‌آپ موفق: ${filePath} (${stat.size} بایت)`);

      return serializeRun(
        await this.prisma.backupRun.findUnique({ where: { id: record.id } }),
      );

    } catch (e: unknown) {
      // پیام خطای pg_dump رشته‌ی اتصال کامل را تکرار می‌کند — یعنی رمز دیتابیس.
      // بدون پاک‌سازی، رمز مستقیم به مرورگر می‌رفت.
      const message = redactSecrets(e instanceof Error ? e.message : String(e));

      // فایل ناقص نباید بماند و بعداً با بک‌آپ سالم اشتباه گرفته شود.
      await fs.rm(filePath, { force: true }).catch(() => undefined);

      await this.prisma.backupRun.update({
        where: { id: record.id },
        data: { status: 'FAILED', error: message.slice(0, 1000), finishedAt: new Date() },
      });

      this.logger.error(`بک‌آپ شکست خورد: ${message}`);
      throw new BadRequestException({
        error: 'BACKUP_FAILED',
        message: `گرفتن بک‌آپ ناموفق بود: ${message}`,
      });

    } finally {
      this.running = false;
    }
  }


  async history(limit = 30) {
    const rows = await this.prisma.backupRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: Math.min(200, Math.max(1, limit)),
    });
    return rows.map(serializeRun);
  }


  // ---------- کمکی‌ها ----------

  /**
   * رشته‌ی اتصال قابل‌فهم برای pg_dump.
   *
   * DATABASE_URL پروژه `?schema=public` دارد که پارامتر Prisma است نه libpq؛
   * pg_dump با آن اصلاً وصل نمی‌شود.
   */
  private connectionString(): string {
    const raw = process.env.DATABASE_URL;
    if (!raw) throw new Error('DATABASE_URL تنظیم نشده است');

    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (!LIBPQ_PARAMS.has(key)) url.searchParams.delete(key);
    }
    return url.toString();
  }


  /** خواندن فهرست محتویات آرشیو — بدون بازیابی واقعی. */
  private async verify(filePath: string): Promise<boolean> {
    try {
      const { stdout } = await run(PG_RESTORE, ['--list', filePath], {
        maxBuffer: 1024 * 1024 * 32,
      });
      // آرشیو سالم حتماً چند ورودی دارد.
      return stdout.split('\n').filter((l) => l.trim() && !l.startsWith(';')).length > 0;
    } catch {
      return false;
    }
  }


  private async resolveDestination(destination: string): Promise<string> {
    const dir = destination?.trim()
      ? destination.trim()
      : path.resolve(process.cwd(), '..', '..', 'backup');

    await this.assertWritable(dir);
    return dir;
  }


  private async assertWritable(dir: string) {
    try {
      await fs.mkdir(dir, { recursive: true });
      // نوشتن واقعی تست می‌شود؛ وجود پوشه به‌تنهایی یعنی چیزی نیست.
      const probe = path.join(dir, `.write-test-${Date.now()}`);
      await fs.writeFile(probe, 'ok');
      await fs.rm(probe, { force: true });
    } catch (e) {
      throw new BadRequestException({
        error: 'DESTINATION_NOT_WRITABLE',
        destination: dir,
        message:
          'سرور نمی‌تواند در این مسیر بنویسد. توجه: مسیر باید روی همان سیستمی باشد که سرور روی آن اجرا می‌شود.',
      });
    }
  }


  /** نگه داشتن فقط N فایل آخر. */
  private async prune(dir: string, keep: number) {
    try {
      const files = (await fs.readdir(dir))
        .filter((f) => f.startsWith('warehouse_os_') && f.endsWith('.dump'))
        .sort()
        .reverse();

      for (const old of files.slice(keep)) {
        await fs.rm(path.join(dir, old), { force: true });
        this.logger.log(`بک‌آپ قدیمی حذف شد: ${old}`);
      }
    } catch (e) {
      // پاک‌سازی نباید بک‌آپ موفق را خراب کند.
      this.logger.warn(`پاک‌سازی بک‌آپ‌های قدیمی ناموفق: ${e}`);
    }
  }
}
