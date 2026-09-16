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
  let file: string;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wos-stamp-'));
    file = join(dir, 'build-info.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (value: unknown) => writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));

  it('مهرِ کاملِ کیت را می‌خواند (نسخه، زمان بیلد، نام بسته)', () => {
    write({
      version: '0.5.0',
      builtAt: '2026-09-15T20:22:10.000Z',
      kit: 'kardo-update-2026-09-15',
      packagedAt: '2026-09-15T20:31:02.000Z',
    });

    expect(readBuildStamp(file)).toEqual({
      version: '0.5.0',
      builtAt: '2026-09-15T20:22:10.000Z',
      kit: 'kardo-update-2026-09-15',
      packagedAt: '2026-09-15T20:31:02.000Z',
    });
  });

  it('بیلدِ سادهٔ بدون کیت: kit و packagedAt تهی‌اند', () => {
    write({ version: '0.5.0', builtAt: '2026-09-15T20:22:10.000Z' });

    expect(readBuildStamp(file)).toEqual({
      version: '0.5.0',
      builtAt: '2026-09-15T20:22:10.000Z',
      kit: null,
      packagedAt: null,
    });
  });

  it('مقدارهای خالی تهی حساب می‌شوند و فاصلهٔ اضافه پاک می‌شود', () => {
    write({ version: '  0.5.0\n', builtAt: '', kit: '  ', packagedAt: '' });

    expect(readBuildStamp(file)).toEqual({
      version: '0.5.0',
      builtAt: null,
      kit: null,
      packagedAt: null,
    });
  });

  it('فایلِ نبوده: نسخه unknown، بدون استثنا', () => {
    expect(readBuildStamp(join(dir, 'nope.json'))).toEqual({
      version: 'unknown',
      builtAt: null,
      kit: null,
      packagedAt: null,
    });
  });

  it('فایلِ خراب یا بی‌شکل: همان unknown، بدون استثنا', () => {
    write('{ this is not json');
    expect(readBuildStamp(file).version).toBe('unknown');

    write('[1,2,3]');
    expect(readBuildStamp(file).version).toBe('unknown');
  });
});
