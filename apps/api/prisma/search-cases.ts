/**
 * سنجه‌ی جستجو — کوئری‌های واقعیِ فروشنده و کالایی که باید بیاورند.
 *
 * چرا این فایل هست: بدون آن، هر تغییر در ranker فقط با حس سنجیده می‌شود
 * («بهتر شد» / «بدتر شد») و هیچ‌کس نمی‌فهمد کدام کوئری خراب شده. اینجا هر تغییر
 * یک عدد می‌دهد.
 *
 * اجرا:  npx ts-node prisma/search-cases.ts
 *
 * هر مورد: کوئریِ تایپ‌شده، و بخشی از نامِ کالایی که باید بالا بیاید. اگر کالای
 * درست در ۵ نتیجه‌ی اول بود قبول است — فروشنده پایین‌تر از آن را نگاه نمی‌کند.
 */
import { PrismaClient } from '@prisma/client';
import { ProductsService } from '../src/products/products.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/** [کوئری، بخشی از نام کالای درست] */
const CASES: [string, string][] = [
  // تکه‌های وسطِ کلمات پشت‌سرهم — دلیل اصلی بازنویسی
  ['نت لو اید', 'لنت جلو پراید'],
  ['فرانسیل', 'دیفرانسیل'],

  // کوئری‌های عادی که نباید با تغییرات خراب شوند
  ['لنت جلو پراید', 'لنت جلو پراید'],
  ['دیفرانسیل', 'دیفرانسیل'],
  ['لنت پراید', 'لنت'],
];

const TOP_N = 5;

async function main() {
  const prisma = new PrismaClient();
  const service = new ProductsService(prisma as unknown as PrismaService);

  let passed = 0;

  for (const [query, expected] of CASES) {
    const started = Date.now();
    const results = (await service.search(query)) as unknown as {
      name: string;
    }[];
    const ms = Date.now() - started;

    const rank = results.findIndex((r) => r?.name?.includes(expected));
    const ok = rank >= 0 && rank < TOP_N;
    if (ok) passed++;

    const where =
      rank < 0 ? 'پیدا نشد' : `رتبه ${rank + 1} از ${results.length}`;
    console.log(
      `${ok ? '✅' : '❌'}  «${query}» → «${expected}»  —  ${where}  (${ms}ms)`,
    );
    if (!ok) {
      for (const r of results.slice(0, TOP_N)) console.log(`      ${r?.name}`);
    }
  }

  console.log(`\n${passed}/${CASES.length} قبول`);
  await prisma.$disconnect();
  process.exit(passed === CASES.length ? 0 : 1);
}

main();
