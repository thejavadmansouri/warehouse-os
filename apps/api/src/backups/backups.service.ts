import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
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

/**
 * الگوی نامِ فایل بک‌آپ — همان چیزی که `createBackup` می‌سازد.
 *
 * عمداً سخت‌گیرانه: این تنها چیزی است که میان اندپوینتِ دانلود/بازیابی و
 * خواندنِ فایلِ دلخواه از سرور ایستاده. جداکننده‌ی مسیر و نقطه‌ی متوالی اصلاً
 * در این الگو جا نمی‌شوند.
 */
const BACKUP_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*\.dump$/;


@Injectable()
export class BackupsService {

  private readonly logger = new Logger(BackupsService.name);
  /** جلوی اجرای هم‌زمان دو بک‌آپ را می‌گیرد (زمان‌بندی + دستی با هم). */
  private running = false;
  /**
   * بازیابی در جریان است. بک‌آپِ زمان‌بندی‌شده نباید وسطِ جایگزینیِ جدول‌ها
   * دامپ بگیرد — فایلی که از یک دیتابیسِ نیمه‌بازیابی‌شده گرفته شود، بک‌آپ نیست.
   */
  private restoring = false;

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
  async createBackup(
    trigger: 'MANUAL' | 'SCHEDULED' | 'ON_CLOSE' | 'PRE_RESTORE',
    userId?: string,
  ) {

    if (this.running) {
      throw new BadRequestException({
        error: 'BACKUP_IN_PROGRESS',
        message: 'یک بک‌آپ در حال اجراست',
      });
    }

    // بک‌آپِ خودکارِ پیش از بازیابی خودش از داخل restore صدا زده می‌شود و باید
    // رد شود؛ بقیه‌ی بک‌آپ‌ها وسطِ بازیابی بی‌معنا هستند.
    if (this.restoring && trigger !== 'PRE_RESTORE') {
      throw new BadRequestException({
        error: 'RESTORE_IN_PROGRESS',
        message: 'بازیابی در جریان است — تا پایانش بک‌آپ گرفته نمی‌شود',
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


  // ---------- بازیابی ----------

  /**
   * فایل‌های بک‌آپِ موجود روی سرور.
   *
   * از خودِ پوشه خوانده می‌شود نه از جدول `BackupRun`: فایلی که دستی کپی شده یا
   * از نصبِ قبلی مانده هم باید دیده و بازیابی شود. جدول تاریخچه است، نه فهرستِ
   * واقعیتِ روی دیسک.
   */
  async listFiles() {
    const config = await this.getConfig();
    const dir = await this.resolveDestination(config.destination);

    const names = (await fs.readdir(dir)).filter((f) => BACKUP_FILE_RE.test(f));

    const files = await Promise.all(
      names.map(async (name) => {
        const full = path.join(dir, name);
        const stat = await fs.stat(full);
        return {
          name,
          sizeBytes: Number(stat.size),
          modifiedAt: stat.mtime,
          /** آرشیوی که خوانده نشود بازیابی هم نمی‌شود — همان‌جا علامت می‌خورد. */
          verified: await this.verify(full),
        };
      }),
    );

    // جدیدترین اول — همان چیزی که مدیر معمولاً می‌خواهد.
    files.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

    return { directory: dir, files };
  }


  /**
   * مسیر کاملِ یک فایل بک‌آپ، با دو نگهبان.
   *
   * ⚠️ این تابع مرزِ امنیتیِ دو اندپوینت است (دانلود و بازیابی). دامپ شاملِ هشِ
   * رمزها و کلِ داده‌ی مالی است؛ بدون این بررسی‌ها، `..%2F..%2Fetc%2Fpasswd`
   * آن اندپوینت‌ها را به ابزارِ خواندنِ فایلِ دلخواه تبدیل می‌کرد.
   *
   * ۱. نام باید دقیقاً الگوی فایل بک‌آپ را داشته باشد.
   * ۲. مسیرِ resolve‌شده باید **داخل** پوشه‌ی مقصد بماند.
   */
  async resolveBackupPath(name: string): Promise<string> {
    const config = await this.getConfig();
    const dir = await this.resolveDestination(config.destination);

    if (!name || !BACKUP_FILE_RE.test(name)) {
      throw new BadRequestException({
        error: 'INVALID_BACKUP_NAME',
        message: 'نام فایل بک‌آپ معتبر نیست',
      });
    }

    const full = path.resolve(dir, name);

    if (!full.startsWith(path.resolve(dir) + path.sep)) {
      throw new BadRequestException({
        error: 'INVALID_BACKUP_NAME',
        message: 'نام فایل بک‌آپ معتبر نیست',
      });
    }

    try {
      await fs.access(full);
    } catch {
      throw new NotFoundException({
        error: 'BACKUP_NOT_FOUND',
        message: 'فایل بک‌آپ پیدا نشد',
      });
    }

    return full;
  }


  /**
   * بازیابیِ کلِ دیتابیس از یک فایل بک‌آپ.
   *
   * ⚠️ مخرب‌ترین کاری که از پنل ممکن است: همه‌ی داده‌ی فعلی با محتوای فایل
   * جایگزین می‌شود.
   *
   * دو محافظ که بدون آن‌ها این قابلیت نباید وجود داشته باشد:
   *
   * ۱. **بک‌آپِ خودکارِ پیش از بازیابی.** اگر مدیر فایل اشتباهی را انتخاب کند،
   *    راهِ برگشت باید همان لحظه ساخته شده باشد نه اینکه به آخرین بک‌آپِ شبانه
   *    تکیه کنیم.
   * ۲. **تأییدِ سلامتِ آرشیو پیش از شروع.** نصفه‌بازیابی از یک فایلِ خراب،
   *    بدترین حالتِ ممکن است: نه داده‌ی قبلی می‌ماند نه داده‌ی جدید کامل است.
   *
   * **چرا `--clean` استفاده نمی‌شود:** آن گزینه فقط آبجکت‌هایی را drop می‌کند که
   * داخل خودِ آرشیو هستند. اگر دیتابیسِ فعلی جدولی داشته باشد که بک‌آپ نمی‌شناسد
   * (یعنی هر بک‌آپی که پیش از آخرین مایگریشن گرفته شده)، FKهای آن جدولِ تازه روی
   * کلیدهای جدول‌های قدیمی نشسته‌اند و drop با
   * «cannot drop constraint … because other objects depend on it» شکست می‌خورد.
   * این حالتِ عادی است نه استثنا: بعد از هر به‌روزرسانی، همه‌ی بک‌آپ‌های قبلی
   * همین وضع را دارند.
   *
   * پس کلِ schema پاک و از نو ساخته می‌شود و آرشیو روی دیتابیسِ خالی می‌نشیند —
   * یعنی «بازیابی» دقیقاً همان معنایی را می‌دهد که کاربر انتظار دارد: دیتابیس
   * عیناً همان چیزی می‌شود که در فایل است.
   *
   * ⚠️ نتیجه‌اش این است که schema به نسخه‌ی همان بک‌آپ برمی‌گردد. اگر کدِ فعلی
   * جلوتر باشد، مایگریشن‌های معلق در پاسخ گزارش می‌شوند تا مدیر بداند باید
   * به‌روزرسانی را اجرا کند — بی‌صدا رهایش نمی‌کنیم.
   */
  async restore(fileName: string, userId?: string) {

    if (this.restoring) {
      throw new BadRequestException({
        error: 'RESTORE_IN_PROGRESS',
        message: 'یک بازیابی در حال اجراست',
      });
    }
    if (this.running) {
      throw new BadRequestException({
        error: 'BACKUP_IN_PROGRESS',
        message: 'یک بک‌آپ در حال اجراست — تا پایانش بازیابی ممکن نیست',
      });
    }

    const filePath = await this.resolveBackupPath(fileName);

    if (!(await this.verify(filePath))) {
      throw new BadRequestException({
        error: 'BACKUP_UNREADABLE',
        message: 'این فایل بک‌آپ خوانده نمی‌شود و برای بازیابی امن نیست',
      });
    }

    // بک‌آپِ ایمنی *پیش از* گرفتنِ فلگ، چون createBackup خودش فلگ running را می‌گیرد.
    let preRestoreFile: string | null = null;
    try {
      const pre = await this.createBackup('PRE_RESTORE', userId);
      preRestoreFile = pre?.filePath ?? null;
    } catch (e: unknown) {
      throw new BadRequestException({
        error: 'PRE_RESTORE_BACKUP_FAILED',
        message:
          'بک‌آپِ ایمنیِ پیش از بازیابی گرفته نشد، پس بازیابی شروع نمی‌شود: ' +
          redactSecrets(e instanceof Error ? e.message : String(e)),
      });
    }

    const source = path.basename(filePath);
    const pre = preRestoreFile ? path.basename(preRestoreFile) : null;
    const startedAt = new Date();

    /*
     * ردِ ممیزی **بیرون از دیتابیس** نوشته می‌شود.
     *
     * جدول `RestoreRun` داخل همان دیتابیسی است که جایگزین می‌شود — یعنی هر
     * ردیفی که پیش از بازیابی بنویسیم، خودِ بازیابی پاکش می‌کند، و اگر بک‌آپ
     * قدیمی‌تر از آخرین مایگریشن باشد جدول اصلاً وجود نخواهد داشت. یک فایلِ
     * append-only کنار بک‌آپ‌ها تنها جایی است که از این عملیات جان سالم می‌برد.
     */
    await this.appendRestoreLog({
      at: startedAt.toISOString(),
      event: 'started',
      sourceFile: source,
      preRestoreFile: pre,
      userId: userId ?? null,
    });

    this.restoring = true;

    try {
      const url = this.connectionString();

      /*
       * اتصال‌های دیگر بسته می‌شوند وگرنه DROP SCHEMA پشت قفل می‌ماند. فقط
       * خودِ API به این دیتابیس وصل می‌شود (پنل وب از API می‌خواند، نه از
       * دیتابیس)، پس این معمولاً چیزی برای بستن ندارد — ولی یک Prisma Studio
       * یا psqlِ باز کافی است که بازیابی تا ابد معطل بماند.
       */
      await this.prisma.$executeRawUnsafe(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
      `);

      /*
       * **همه‌ی** schemaهای غیرسیستمی پاک می‌شوند، نه فقط `public`.
       *
       * ابزارهای Prisma هنگام کار schemaهای موقت مثل `public_shadow` جا
       * می‌گذارند. آرشیو هم آن‌ها را دارد، پس اگر باقی بمانند pg_restore روی
       * `CREATE SCHEMA public_shadow` خطا می‌دهد و بازیابی نیمه‌کاره اعلام
       * می‌شود — در حالی که داده درست برگشته. بازیابی یعنی «دیتابیس عیناً همان
       * چیزی شود که در فایل است»، پس هرچه در فایل نیست باید برود.
       */
      const schemas = await this.prisma.$queryRawUnsafe<{ nspname: string }[]>(`
        SELECT nspname FROM pg_namespace
        WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
      `);

      for (const { nspname } of schemas) {
        // نام از خودِ کاتالوگ پستگرس آمده، ولی باز هم نقل‌قول می‌شود.
        await this.prisma.$executeRawUnsafe(
          `DROP SCHEMA "${nspname.replace(/"/g, '""')}" CASCADE`,
        );
      }

      await this.prisma.$executeRawUnsafe('CREATE SCHEMA public');

      // Prisma پیش از پرشدنِ دوباره‌ی schema کنار می‌رود؛ statementهای
      // آماده‌شده‌اش به جدول‌هایی اشاره دارند که دیگر وجود ندارند.
      await this.prisma.$disconnect();

      await run(
        PG_RESTORE,
        [
          // بدون این، pg_restore خطاها را «نادیده» می‌گیرد و با کد غیرصفر تمام
          // می‌شود — یعنی نمی‌شود فهمید بازیابی کامل بوده یا نصفه. برای کاری که
          // کل داده را جایگزین می‌کند، ابهام بدترین حالت است.
          '--exit-on-error',
          '--no-owner',
          '--no-privileges',
          '--dbname', url,
          filePath,
        ],
        { maxBuffer: 1024 * 1024 * 64 },
      );

      await this.prisma.$connect();

      // بازیابی‌ای که تأیید نشود، بازیابی نیست.
      const [products, users] = await Promise.all([
        this.prisma.product.count(),
        this.prisma.user.count(),
      ]);

      const pendingMigrations = await this.pendingMigrations();

      await this.appendRestoreLog({
        at: new Date().toISOString(),
        event: 'success',
        sourceFile: source,
        preRestoreFile: pre,
        userId: userId ?? null,
        counts: { products, users },
        pendingMigrations,
      });

      /*
       * ردیفِ تاریخچه برای پنل — **best-effort**.
       *
       * اگر بک‌آپ قدیمی‌تر از مایگریشنی باشد که این جدول را ساخته، جدول اصلاً
       * وجود ندارد. نبودنش نباید بازیابیِ موفق را به شکست تبدیل کند؛ ردِ
       * ممیزیِ واقعی همان فایلِ لاگ است.
       */
      await this.prisma.restoreRun
        .create({
          data: {
            sourceFile: source,
            preRestoreFile: pre,
            status: 'SUCCESS',
            startedAt,
            finishedAt: new Date(),
            startedById: userId ?? null,
          },
        })
        .catch(() => undefined);

      this.logger.log(`بازیابی موفق از ${source}`);
      if (pendingMigrations.length) {
        this.logger.warn(
          `بک‌آپ از نسخه‌ی قدیمی‌تری است؛ ${pendingMigrations.length} مایگریشن معلق`,
        );
      }

      return {
        success: true,
        sourceFile: source,
        preRestoreFile: pre,
        counts: { products, users },
        pendingMigrations,
        message: pendingMigrations.length
          ? 'بازیابی انجام شد، ولی این بک‌آپ از نسخه‌ی قدیمی‌تری از برنامه است. تا زمانی که به‌روزرسانیِ دیتابیس اجرا نشود، بخش‌هایی از برنامه کار نمی‌کنند.'
          : 'بازیابی کامل انجام شد.',
      };

    } catch (e: unknown) {
      const message = redactSecrets(e instanceof Error ? e.message : String(e));

      // اتصال باید هر طور شده برگردد، وگرنه کلِ برنامه از کار می‌افتد.
      await this.prisma.$connect().catch(() => undefined);

      await this.appendRestoreLog({
        at: new Date().toISOString(),
        event: 'failed',
        sourceFile: source,
        preRestoreFile: pre,
        userId: userId ?? null,
        error: message.slice(0, 1000),
      });

      await this.prisma.restoreRun
        .create({
          data: {
            sourceFile: source,
            preRestoreFile: pre,
            status: 'FAILED',
            error: message.slice(0, 1000),
            startedAt,
            finishedAt: new Date(),
            startedById: userId ?? null,
          },
        })
        .catch(() => undefined);

      this.logger.error(`بازیابی شکست خورد: ${message}`);

      throw new BadRequestException({
        error: 'RESTORE_FAILED',
        preRestoreFile: pre,
        message:
          `بازیابی ناموفق بود: ${message}` +
          (pre ? ` — بک‌آپِ پیش از بازیابی «${pre}» سالم است.` : ''),
      });

    } finally {
      this.restoring = false;
    }
  }


  /**
   * ردِ ممیزیِ بازیابی، در فایلی کنارِ خودِ بک‌آپ‌ها.
   *
   * تنها جایی که یک بازیابی می‌تواند رد بگذارد و آن رد باقی بماند: دیتابیس
   * جایگزین می‌شود، این فایل نه. append-only و یک JSON در هر خط، تا اگر روزی
   * وسطِ نوشتن برق رفت، خطوطِ قبلی همچنان خوانا بمانند.
   */
  private async appendRestoreLog(entry: Record<string, unknown>) {
    try {
      const config = await this.getConfig();
      const dir = await this.resolveDestination(config.destination);
      await fs.appendFile(
        path.join(dir, 'restore-log.jsonl'),
        JSON.stringify(entry) + '\n',
        'utf-8',
      );
    } catch (e) {
      // لاگ نباید علتِ شکستِ بازیابی شود.
      this.logger.warn(`نوشتن لاگ بازیابی ناموفق: ${e}`);
    }
  }


  /**
   * مایگریشن‌هایی که روی دیتابیس نیستند ولی در کد هستند.
   *
   * بعد از بازیابیِ یک بک‌آپِ قدیمی، schema به نسخه‌ی همان بک‌آپ برمی‌گردد. اگر
   * این را گزارش نکنیم، مدیر یک دیتابیسِ ظاهراً سالم دارد که نیمی از صفحه‌های
   * برنامه رویش خطا می‌دهند و هیچ سرنخی هم ندارد چرا.
   *
   * عمداً **خودکار اجرا نمی‌شوند**: اجرای بی‌صدای DDL بلافاصله بعد از یک عملیات
   * مخرب، همان جایی است که وضعیتِ قابل‌برگشت به غیرقابل‌برگشت تبدیل می‌شود.
   */
  private async pendingMigrations(): Promise<string[]> {
    const dir = process.env.PRISMA_MIGRATIONS_PATH
      || path.resolve(process.cwd(), 'prisma', 'migrations');

    let onDisk: string[];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      onDisk = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    } catch {
      // پوشه‌ی مایگریشن‌ها همراه نصب نیامده — چیزی برای مقایسه نیست.
      return [];
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<{ migration_name: string }[]>(
        `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
      );
      const applied = new Set(rows.map((r) => r.migration_name));
      return onDisk.filter((name) => !applied.has(name));
    } catch {
      // جدول تاریخچه نیست ⇒ هیچ مایگریشنی اعمال نشده.
      return onDisk;
    }
  }


  /** سابقه‌ی بازیابی‌ها — ردِ ممیزیِ یک عملیات مخرب. */
  async restoreHistory(limit = 20) {
    return this.prisma.restoreRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
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
