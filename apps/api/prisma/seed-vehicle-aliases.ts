/**
 * پرکردن `VehicleModel.aliases` برای مدل‌های سطح-خانواده.
 *
 * چرا لازم است: پارسر گفتار، خودرو را از روی alias های همین جدول تشخیص می‌دهد.
 * DictionaryLoader فقط «پژو 206» و «پژو» را از روی نام می‌سازد — نه «206» تنها.
 * بنابراین «کمک فنر جلو چپ 206» خودرو را تشخیص نمی‌داد و matcher نمی‌توانست
 * قطعهٔ 206 را از قطعهٔ تیبا تفکیک کند (علتِ اصلی خطاهای رتبه‌بندی در bench-matcher).
 *
 * منبع alias ها همان دیکشنری استخراج ویژگی‌هاست تا دو جا از هم جدا نشوند،
 * به‌علاوهٔ صورت‌های گفتاریِ عدد («چهارصد و پنج») که در گفتار رایج‌اند.
 *
 *   npx ts-node prisma/seed-vehicle-aliases.ts            (پیش‌نمایش)
 *   npx ts-node prisma/seed-vehicle-aliases.ts --commit
 */
import { PrismaClient } from '@prisma/client';
import { VEHICLES } from './extract-attributes';

const prisma = new PrismaClient();

/** صورت‌های گفتاریِ رایجِ شمارهٔ خودرو — گفتار «۴۰۵» را «چهارصد و پنج» می‌گوید. */
const SPOKEN: Record<string, string[]> = {
  'پژو 405': ['چهارصد و پنج', 'چهار صد و پنج', 'چهارصدوپنج'],
  'پژو 206': ['دویست و شش', 'دویست و شیش', 'دویست و شش', 'دویستوشش'],
  'پژو 207': ['دویست و هفت'],
  'تندر 90': ['ال نود', 'تندر نود', 'ای ال نود'],
  'پراید': ['صد و یازده', 'صد و سی و یک', 'صد و سی و دو'],
};

async function main() {
  const commit = process.argv.includes('--commit');

  const rows = await prisma.vehicleModel.findMany({
    where: { startYear: 0, endYear: 0 },
    select: { id: true, name: true, aliases: true },
  });

  let changed = 0;

  for (const row of rows) {
    const fromDict = VEHICLES.find(([canonical]) => canonical === row.name)?.[1] ?? [];
    const merged = [
      ...new Set([...row.aliases, ...fromDict, ...(SPOKEN[row.name] ?? [])]),
    ].filter((a) => a && a !== row.name);

    if (merged.length === row.aliases.length) continue;

    console.log(`${row.name.padEnd(12)} ← ${merged.join('، ')}`);
    changed++;

    if (commit) {
      await prisma.vehicleModel.update({
        where: { id: row.id },
        data: { aliases: merged },
      });
    }
  }

  console.log('─'.repeat(70));
  console.log(
    commit
      ? `✓ ${changed} مدل خودرو به‌روزرسانی شد.`
      : `${changed} مدل تغییر می‌کند. برای نوشتن: --commit`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
