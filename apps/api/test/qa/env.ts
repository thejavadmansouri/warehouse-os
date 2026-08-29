/**
 * تنها جایی که DATABASE_URL برای تست‌ها ست می‌شود.
 * تور ایمنی: اگر به هر دلیلی نامِ دیتابیس به `_qa` ختم نشود، فرایند می‌میرد —
 * هیچ تستی نباید به دیتابیس زنده‌ی انبار بخورد.
 */
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../../.env');
const raw = fs.readFileSync(envPath, 'utf8');
const match = raw.match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m);
if (!match) throw new Error('DATABASE_URL not found in apps/api/.env');

const url = new URL(match[1]);
url.pathname = '/warehouse_os_qa';

if (!url.pathname.endsWith('_qa')) {
  throw new Error('REFUSING TO RUN: test DB must end with _qa');
}

process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = 'test';
