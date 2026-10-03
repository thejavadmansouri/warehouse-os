/**
 * پیدا کردن پوشه‌ی واقعی برنامه داخل خروجی standalone.
 *
 * در یک monorepo، Next ساختار مخزن را داخل standalone بازتولید می‌کند؛ یعنی
 * server.js در `.next/standalone/<repo>/apps/web/` می‌نشیند، نه در ریشه‌ی
 * standalone. مسیر ثابت نوشتن اینجا شکننده است — با تغییر نام پوشه‌ی مخزن
 * می‌شکند — پس server.js جست‌وجو می‌شود.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** @returns {string|null} مسیر پوشه‌ای که server.js در آن است */
export function findAppDir(standaloneDir) {
  if (!existsSync(standaloneDir)) return null;

  /** @type {string[]} */
  const queue = [standaloneDir];

  while (queue.length) {
    const dir = queue.shift();
    if (!dir) continue;

    if (existsSync(join(dir, 'server.js'))) return dir;

    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      // node_modules عمیق است و هرگز server.js برنامه را ندارد.
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) queue.push(full);
      } catch {
        /* لینک شکسته — رد شو */
      }
    }
  }

  return null;
}
