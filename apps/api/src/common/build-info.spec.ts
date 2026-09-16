import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { readBuildStamp } from './build-info';

/**
 * تست‌های مهر بیلد.
 *
 * قاعده‌ی موضوعِ تست: مهر یا هست یا نیست — در هر دو حالت خواندنش باید یک شکلِ
 * ثابت بدهد و هرگز خطا ندهد. سلامت‌سنجی که به‌خاطر یک فایلِ متادیتا ۵۰۰ بدهد،
 * بدتر از سلامت‌سنجی است که نسخه را نمی‌داند.
 */
describe('readBuildStamp', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wos-stamp-'));
    file = join(dir, 'build-info.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('مهرِ کامل را می‌خواند (بیلد + کیت)', () => {
    writeFileSync(
      file,
      JSON.stringify({
        version: '0.5.0',
        builtAt: '2026-09-15T20:22:10.000Z',
        node: 'v24.19.0',
        kit: 'kardo-update-2026-09-15',
        packagedAt: '2026-09-15T20:31:02.000Z',
      }),
    );

    expect(readBuildStamp(file)).toEqual({
      version: '0.5.0',
      builtAt: '2026-09-15T20:22:10.000Z',
      kit: 'kardo-update-2026-09-15',
      packagedAt: '2026-09-15T20:31:02.000Z',
    });
  });

  it('مهرِ بیلدِ سادهٔ بدون کیت: kit و packagedAt تهی‌اند', () => {
    writeFileSync(file, JSON.stringify({ version: '0.5.0', builtAt: '2026-09-15T20:22:10.000Z' }));

    const stamp = readBuildStamp(file);

    expect(stamp.version).toBe('0.5.0');
    expect(stamp.builtAt).toBe('2026-09-15T20:22:10.000Z');
    expect(stamp.kit).toBeNull();
    expect(stamp.packagedAt).toBeNull();
  });

  it('فایلِ نبوده: نسخه از package.json، بدون builtAt', () => {
    const stamp = readBuildStamp(join(dir, 'nope.json'));

    expect(stamp.version).not.toBe('');
    expect(stamp.version).not.toBe('unknown');
    expect(stamp.builtAt).toBeNull();
    expect(stamp.kit).toBeNull();
    expect(stamp.packagedAt).toBeNull();
  });

  it('فایلِ خراب: همان پشتیبان، بدون استثنا', () => {
    writeFileSync(file, '{ this is not json');

    const stamp = readBuildStamp(file);

    expect(stamp.version).not.toBe('unknown');
    expect(stamp.builtAt).toBeNull();
  });

  it('رشته‌های خالی به‌جای مقدار، تهی حساب می‌شوند و نسخه به پشتیبان برمی‌گردد', () => {
    writeFileSync(file, JSON.stringify({ version: '   ', builtAt: '', kit: '', packagedAt: '' }));

    const stamp = readBuildStamp(file);

    expect(stamp.version).not.toBe('');
    expect(stamp.version).not.toBe('   ');
    expect(stamp.builtAt).toBeNull();
    expect(stamp.kit).toBeNull();
    expect(stamp.packagedAt).toBeNull();
  });

  it('فایلِ آرایه‌ای (JSONِ معتبر ولی بی‌شکل) مهر نیست', () => {
    writeFileSync(file, '[1,2,3]');

    const stamp = readBuildStamp(file);

    expect(stamp.builtAt).toBeNull();
    expect(stamp.version).not.toBe('unknown');
  });

  it('نسخه با فاصلهٔ اضافه، پاک‌شده برمی‌گردد', () => {
    writeFileSync(file, JSON.stringify({ version: ' 0.5.0\n' }));

    expect(readBuildStamp(file).version).toBe('0.5.0');
  });
});
