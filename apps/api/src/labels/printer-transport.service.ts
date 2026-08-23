import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'child_process';
import { createConnection } from 'net';
import { randomUUID } from 'crypto';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * فرستادن بایت خام به پرینتر لیبل.
 *
 * «خام» کلیدواژه است: اگر بایت‌ها از مسیر عادیِ درایور بروند، درایور آن‌ها را
 * متن می‌بیند و به‌جای چاپ لیبل، خودِ دستورات TSPL را روی کاغذ می‌نویسد.
 *
 * سه مسیر پشتیبانی می‌شود:
 *  - USB روی ویندوزِ سرور → `print /d:` روی صفِ RAW
 *  - USB روی مک/لینوکس  → `lp -o raw` روی صفِ RAW در CUPS
 *  - پرینتر شبکه‌ای      → سوکت TCP روی پورت ۹۱۰۰ (استاندارد JetDirect)
 *
 * در هر سه حالت صفِ چاپ باید RAW باشد. درایورِ کارخانه‌ی پرینتر دقیقاً همان
 * چیزی است که نباید نصب باشد: کارش رستر‌کردنِ صفحه است و بایت‌های TSPL را
 * خراب می‌کند.
 */

export interface PrinterTarget {
  /** نام پرینتر در ویندوز (برای USB). */
  name?: string | null;
  /** میزبان و پورت (برای پرینتر شبکه‌ای). */
  host?: string | null;
  port?: number | null;
}

@Injectable()
export class PrinterTransportService {
  private readonly logger = new Logger(PrinterTransportService.name);

  async send(payload: Buffer, target: PrinterTarget): Promise<void> {
    if (target.host) {
      return this.sendTcp(payload, target.host, target.port ?? 9100);
    }
    if (target.name) {
      // ویندوز و POSIX هر دو صفِ RAW دارند، فقط دستورش فرق می‌کند.
      return process.platform === 'win32'
        ? this.sendWindowsRaw(payload, target.name)
        : this.sendPosixRaw(payload, target.name);
    }
    throw new ServiceUnavailableException({
      error: 'PRINTER_NOT_CONFIGURED',
      message: 'پرینتر لیبل تنظیم نشده — نام یا آدرس شبکه‌اش را در تنظیمات وارد کنید',
    });
  }

  private sendTcp(payload: Buffer, host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host, port });
      // پرینتری که خاموش است اتصال را باز نگه می‌دارد تا تایم‌اوت شبکه؛
      // فروشنده نباید پشت یک درخواستِ معلق منتظر بماند.
      socket.setTimeout(5000);
      socket.on('connect', () => socket.end(payload));
      socket.on('close', () => resolve());
      socket.on('timeout', () => {
        socket.destroy();
        reject(
          new ServiceUnavailableException({
            error: 'PRINTER_UNREACHABLE',
            message: `پرینتر لیبل در ${host}:${port} جواب نداد`,
          }),
        );
      });
      socket.on('error', (e) =>
        reject(
          new ServiceUnavailableException({
            error: 'PRINTER_UNREACHABLE',
            message: `اتصال به پرینتر لیبل ممکن نشد: ${e.message}`,
          }),
        ),
      );
    });
  }

  /**
   * مک و لینوکس: فایل موقت + `lp -o raw`.
   *
   * `-o raw` همان چیزی است که کل ماجرا به آن بند است: به CUPS می‌گوید فایل را
   * فیلتر نکن و بایت‌به‌بایت به دستگاه بده. بدونِ آن، CUPS سعی می‌کند بایت‌های
   * TSPL را «متن» فرض کند و همان دستورات را روی لیبل چاپ می‌کند.
   *
   * صف هم باید RAW ساخته شده باشد (`lpadmin -m raw`)، وگرنه درایورِ صف حتی
   * قبل از این مرحله محتوا را رستر می‌کند.
   */
  private async sendPosixRaw(payload: Buffer, printerName: string): Promise<void> {
    const file = join(tmpdir(), `label-${randomUUID()}.bin`);
    await writeFile(file, payload);
    try {
      await new Promise<void>((resolve, reject) => {
        const p = spawn('lp', ['-d', printerName, '-o', 'raw', file]);
        let stderr = '';
        p.stderr.on('data', (d) => (stderr += d.toString()));
        p.on('error', (e) =>
          reject(
            new ServiceUnavailableException({
              error: 'PRINTER_FAILED',
              message: `اجرای lp ممکن نشد: ${e.message}`,
            }),
          ),
        );
        p.on('close', (code) =>
          code === 0
            ? resolve()
            : reject(
                new ServiceUnavailableException({
                  error: 'PRINTER_FAILED',
                  // پیامِ خودِ lp معمولاً می‌گوید صف نیست یا متوقف است — همان را
                  // بالا می‌فرستیم، چون تنها سرنخِ کاربر همین است.
                  message: `چاپ ناموفق بود (${code}) ${stderr}`.trim(),
                }),
              ),
        );
      });
    } finally {
      await unlink(file).catch(() => undefined);
    }
  }


  /**
   * ویندوز: فایل موقت + دستور `print /d:`.
   *
   * از نوشتن مستقیم روی `\\.\` استفاده نمی‌شود چون به نام اشتراکِ پرینتر نیاز
   * دارد و همه‌ی نصب‌ها آن را ندارند. صف چاپِ ویندوز با درایور «Generic / Text
   * Only» یا درایور خود TSC در حالت pass-through بایت‌ها را دست‌نخورده می‌فرستد.
   */
  private async sendWindowsRaw(payload: Buffer, printerName: string): Promise<void> {
    const file = join(tmpdir(), `label-${randomUUID()}.bin`);
    await writeFile(file, payload);
    try {
      await new Promise<void>((resolve, reject) => {
        const p = spawn('cmd', ['/c', 'print', `/d:${printerName}`, file], {
          windowsHide: true,
        });
        let stderr = '';
        p.stderr.on('data', (d) => (stderr += d.toString()));
        p.on('error', reject);
        p.on('close', (code) =>
          code === 0
            ? resolve()
            : reject(
                new ServiceUnavailableException({
                  error: 'PRINTER_FAILED',
                  message: `چاپ ناموفق بود (${code}) ${stderr}`.trim(),
                }),
              ),
        );
      });
    } finally {
      // فایل موقت نباید بماند حتی اگر چاپ شکست خورد.
      await unlink(file).catch(() => undefined);
    }
  }
}
