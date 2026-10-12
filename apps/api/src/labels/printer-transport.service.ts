import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { createConnection } from 'net';
import { randomUUID } from 'crypto';
import { appendFile, mkdir, writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * فرستادن بایت خام به پرینتر لیبل.
 *
 * سه مسیر:
 *  - USB روی ویندوز سرور → winspool datatype=RAW (مثل اپ Tauri)
 *  - USB روی مک/لینوکس → `lp -o raw`
 *  - شبکه → TCP:9100
 */

export interface PrinterTarget {
  name?: string | null;
  host?: string | null;
  port?: number | null;
}

export interface SystemPrinter {
  name: string;
  isDefault: boolean;
}

/** همان منطق deploy/windows/updates/raw-label-test.ps1 */
const WINDOWS_RAW_PS1 = `
param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KardoRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFOA { public string pDocName; public string pOutputFile; public string pDatatype; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv")]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA di);
  [DllImport("winspool.drv")]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv")]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv")]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv")]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
}
"@
if (-not (Test-Path -LiteralPath $FilePath)) { Write-Error "missing file"; exit 2 }
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$di = New-Object KardoRawPrinter+DOCINFOA
$di.pDocName = "Kardo Label"
$di.pDatatype = "RAW"
$h = [IntPtr]::Zero
if (-not [KardoRawPrinter]::OpenPrinter($PrinterName, [ref]$h, [IntPtr]::Zero)) {
  Write-Error "OpenPrinter failed"; exit 3
}
try {
  if ([KardoRawPrinter]::StartDocPrinter($h, 1, [ref]$di) -eq 0) { Write-Error "StartDoc failed"; exit 4 }
  [KardoRawPrinter]::StartPagePrinter($h) | Out-Null
  $written = 0
  $ok = [KardoRawPrinter]::WritePrinter($h, $bytes, $bytes.Length, [ref]$written)
  [KardoRawPrinter]::EndPagePrinter($h) | Out-Null
  [KardoRawPrinter]::EndDocPrinter($h) | Out-Null
  if (-not $ok -or $written -ne $bytes.Length) { Write-Error "write fail"; exit 5 }
  Write-Output "OK $written"; exit 0
} finally { [KardoRawPrinter]::ClosePrinter($h) | Out-Null }
`;

@Injectable()
export class PrinterTransportService {
  private readonly logger = new Logger(PrinterTransportService.name);

  async send(payload: Buffer, target: PrinterTarget): Promise<void> {
    await this.archivePayload(payload, target.name ?? `${target.host}:${target.port ?? 9100}`);
    if (target.host) {
      return this.sendTcp(payload, target.host, target.port ?? 9100);
    }
    if (target.name) {
      return process.platform === 'win32'
        ? this.sendWindowsRaw(payload, target.name)
        : this.sendPosixRaw(payload, target.name);
    }
    throw new ServiceUnavailableException({
      error: 'PRINTER_NOT_CONFIGURED',
      message:
        'پرینتر لیبل تنظیم نشده — نام یا آدرس شبکه‌اش را در تنظیمات چاپ وارد کنید',
    });
  }

  /** فهرست پرینترهای نصب‌شده روی ماشینی که API روی آن اجرا می‌شود. */
  async listSystemPrinters(): Promise<SystemPrinter[]> {
    if (process.platform === 'win32') {
      return this.listWindowsPrinters();
    }
    return this.listPosixPrinters();
  }

  private listWindowsPrinters(): Promise<SystemPrinter[]> {
    return new Promise((resolve) => {
      const ps = [
        "Get-CimInstance Win32_Printer | Select-Object Name,Default | ConvertTo-Json -Compress",
      ].join(' ');
      const p = spawn(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', ps],
        { windowsHide: true },
      );
      let out = '';
      p.stdout.on('data', (d) => (out += d.toString()));
      p.on('error', () => resolve([]));
      p.on('close', (code) => {
        if (code !== 0 || !out.trim()) {
          resolve([]);
          return;
        }
        try {
          const parsed = JSON.parse(out) as
            | { Name?: string; Default?: boolean }
            | Array<{ Name?: string; Default?: boolean }>;
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          resolve(
            rows
              .filter((r) => r.Name)
              .map((r) => ({
                name: String(r.Name),
                isDefault: Boolean(r.Default),
              })),
          );
        } catch {
          resolve([]);
        }
      });
    });
  }

  private listPosixPrinters(): Promise<SystemPrinter[]> {
    return new Promise((resolve) => {
      const p = spawn('lpstat', ['-a']);
      let out = '';
      p.stdout.on('data', (d) => (out += d.toString()));
      p.on('error', () => resolve([]));
      p.on('close', () => {
        const names = out
          .split('\n')
          .map((l) => l.split(/\s+/)[0])
          .filter(Boolean);
        resolve(names.map((name) => ({ name, isDefault: false })));
      });
    });
  }

  private sendTcp(payload: Buffer, host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host, port });
      socket.setTimeout(8000);
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

  private async sendPosixRaw(
    payload: Buffer,
    printerName: string,
  ): Promise<void> {
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
                  message: `چاپ ناموفق بود (${code}) ${stderr}`.trim(),
                }),
              ),
        );
      });
    } finally {
      await unlink(file).catch(() => undefined);
    }
  }

  /** ویندوز: winspool RAW — همان مسیر اپ فروشنده / raw-label-test.ps1 */
  private async sendWindowsRaw(
    payload: Buffer,
    printerName: string,
  ): Promise<void> {
    const id = randomUUID();
    const binFile = join(tmpdir(), `kardo-label-${id}.bin`);
    const psFile = join(tmpdir(), `kardo-label-${id}.ps1`);
    await writeFile(binFile, payload);
    await writeFile(psFile, WINDOWS_RAW_PS1, 'utf8');
    try {
      await new Promise<void>((resolve, reject) => {
        const p = spawn(
          'powershell',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            psFile,
            printerName,
            binFile,
          ],
          { windowsHide: true },
        );
        let stderr = '';
        let stdout = '';
        p.stderr.on('data', (d) => (stderr += d.toString()));
        p.stdout.on('data', (d) => (stdout += d.toString()));
        p.on('error', (e) =>
          reject(
            new ServiceUnavailableException({
              error: 'PRINTER_FAILED',
              message: `اجرای چاپ ممکن نشد: ${e.message}`,
            }),
          ),
        );
        p.on('close', (code) => {
          if (code === 0 && /OK\s+\d+/i.test(stdout)) {
            resolve();
            return;
          }
          this.logger.warn(
            `Windows RAW print failed code=${code} stderr=${stderr} stdout=${stdout}`,
          );
          reject(
            new ServiceUnavailableException({
              error: 'PRINTER_FAILED',
              message:
                `چاپ روی «${printerName}» ناموفق بود` +
                (stderr.trim() ? `: ${stderr.trim()}` : ''),
            }),
          );
        });
      });
    } finally {
      await unlink(binFile).catch(() => undefined);
      await unlink(psFile).catch(() => undefined);
    }
  }

  /**
   * بایگانیِ هر چاپ RAW — چون نه کنسولِ API فایل می‌شود نه لاگِ چاپِ ویندوز
   * روشن است. هر job: یک سطر در logs/label-print.log + کپیِ بایت‌های خام
   * در logs/label-payloads/ (بعداً برای تشخیص «چرا بد چاپ شد» لازم می‌شود).
   */
  private async archivePayload(payload: Buffer, printerName: string): Promise<void> {
    try {
      const dir = join(process.cwd(), 'logs');
      const payloadDir = join(dir, 'label-payloads');
      await mkdir(payloadDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const line =
        `${new Date().toISOString()} printer="${printerName}" bytes=${payload.length} ` +
        `PRINT=${(payload.toString('latin1').match(/PRINT \d+,\d+/g) ?? []).join(',')}\n`;
      await appendFile(join(dir, 'label-print.log'), line, 'utf8');
      await writeFile(join(payloadDir, `${stamp}.bin`), payload);
    } catch {
      // بایگانی هرگز نباید جلوی خودِ چاپ را بگیرد.
    }
  }
}
