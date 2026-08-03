/**
 * بنچمارک جستجوی محصولات روی کاتالوگ واقعی.
 *
 * سرویسِ واقعی را صدا می‌زند (نه یک کپیِ SQL) تا عدد‌ها همان چیزی باشند که
 * اپ اندروید و وب تجربه می‌کنند. برای هر کوئری: تعداد نتیجه، p50/p95 و ۳ نتیجه‌ی اول
 * چاپ می‌شود تا هم سرعت و هم کیفیتِ رتبه‌بندی قابل قضاوت باشد.
 *
 *   npx ts-node prisma/bench-search.ts
 */
import { PrismaClient } from '@prisma/client';
import { ProductsService } from '../src/products/products.service';

const prisma = new PrismaClient();
const service = new ProductsService(prisma as any);

/** کوئری‌های واقعیِ کف انبار — هر کدام یک قابلیت را می‌سنجد. */
const QUERIES: Array<[string, string]> = [
  ['کد حسابداری دقیق', '1010040'],
  ['نام کامل', 'دیسک ترمز تیبا لاهیجان'],
  ['ترتیب جابه‌جا', 'لاهیجان تیبا ترمز دیسک'],
  ['غلط املایی', 'دیسک ترمز تیبا لاهیجن'],
  ['ورودی عربی', 'ديسك ترمز تيبا'],
  ['ارقام فارسی', 'لنت ترمز ۴۰۵'],
  ['فقط برند', 'عظام'],
  ['فقط خودرو', 'پراید'],
  ['برند + خودرو', 'دسته موتور 405 عظام'],
  ['قطعه + خودرو', 'کمک فنر جلو 206'],
  ['عمومی پرتکرار', 'بوش'],
  ['دو خودرو', 'دسته موتور 206 و سمند'],
];

const RUNS = 7;

function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

async function main() {
  console.log(`کاتالوگ: ${await prisma.product.count()} کالا`);
  console.log('─'.repeat(78));

  const all: number[] = [];

  for (const [label, q] of QUERIES) {
    const times: number[] = [];
    let results: any[] = [];

    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      results = (await service.search(q)) as any[];
      times.push(performance.now() - t0);
    }

    times.sort((a, b) => a - b);
    all.push(...times);

    console.log(
      `${label.padEnd(18)} «${q}»\n` +
        `   نتایج=${String(results.length).padStart(3)}  ` +
        `p50=${pct(times, 0.5).toFixed(0).padStart(5)}ms  ` +
        `p95=${pct(times, 0.95).toFixed(0).padStart(5)}ms`,
    );
    for (const r of results.slice(0, 3)) {
      console.log(`      → ${r.name}`);
    }
    if (results.length === 0) console.log('      → (هیچ نتیجه‌ای نیست)');
  }

  all.sort((a, b) => a - b);
  console.log('─'.repeat(78));
  console.log(
    `کل: p50=${pct(all, 0.5).toFixed(0)}ms  p95=${pct(all, 0.95).toFixed(0)}ms  ` +
      `بدترین=${all[all.length - 1].toFixed(0)}ms`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
