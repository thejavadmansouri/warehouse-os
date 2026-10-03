/**
 * اجرای سرور production.
 *
 * `NODE_ENV=production node ...` نحو یونیکس است و در cmd ویندوز کار نمی‌کند،
 * و `| tee` هم روی ویندوز وجود ندارد. مسیر server.js هم ثابت نیست (در
 * monorepo زیر پوشه‌ی مخزن می‌نشیند)، پس پیدا می‌شود.
 */
import { spawn } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAppDir } from './standalone-path.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = findAppDir(join(root, '.next', 'standalone'));

if (!appDir) {
  console.error('server.js پیدا نشد. اول `npm run build` را اجرا کنید.');
  process.exit(1);
}

const child = spawn(process.execPath, ['server.js'], {
  cwd: appDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: process.env.PORT ?? '3001',
    // بدون این، سرور فقط روی localhost گوش می‌دهد و از شبکه‌ی داخلی در
    // دسترس نیست — یعنی گوشی کارگر و سیستم فروشنده وصل نمی‌شوند.
    HOSTNAME: process.env.HOSTNAME ?? '0.0.0.0',
  },
});

child.on('exit', (code) => process.exit(code ?? 0));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}
