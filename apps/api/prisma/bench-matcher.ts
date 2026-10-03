/**
 * سنجهٔ تطبیق صوتی — مسیر کامل: گفتار → parse → جستجوی سیگنال‌ها → match.
 *
 * هدف: قبل و بعدِ هر تغییر در ProductMatcherService با یک عدد مقایسه شود، نه با حدس.
 * هر مورد یک عبارتِ گفتاریِ واقعی است و انتظار می‌رود کالای هدف در suggestions
 * بیاید (rank) و در حالت ایده‌آل اول باشد.
 *
 *   npx ts-node prisma/bench-matcher.ts
 */
import { PrismaClient } from '@prisma/client';
import { ProductMatcherService } from '../src/inventory/product-matcher.service';
import { ParsingEngineService } from '../src/engine/parsing-engine.service';
import { DictionaryLoaderService } from '../src/engine/services/dictionary-loader.service';

const prisma = new PrismaClient();
const matcher = new ProductMatcherService(prisma as any);
const loader = new DictionaryLoaderService(prisma as any);
const engine = new ParsingEngineService(loader as any);

/**
 * [عبارت گفتاری, SKUهای قابل‌قبول]
 *
 * بعضی عبارت‌ها ذاتاً چند جواب درست دارند: «لنت عقب پراید سایپا» به سه محصول
 * می‌خورد که فقط در کد مارک (P17/PA5/pt9) فرق دارند و گفتار کارگر آنها را از هم
 * جدا نمی‌کند. برای این‌ها همهٔ جواب‌های معتبر پذیرفته می‌شود — وگرنه سنجه
 * چیزی را «خطا» می‌شمارد که خطا نیست.
 */
const CASES: Array<[string, string[]]> = [
  ['دو تا لنت عقب پراید سایپا', ['1234202', '1254917', '1254916', '1374927']],
  ['فیلتر روغن چهارصد و پنج کاسپین', ['1256322']],
  ['سه تا دیسک ترمز جلو تیبا لاهیجان', ['1250406']],
  ['کمک فنر جلو راست دویست و شیش ایندامین', ['1371310']],
  ['واتر پمپ پراید سانکس', ['1251142']],
  ['دیسک ترمز تیبا ام اس ار', ['1231858']],
  ['کمک فنر جلو چپ 206 فراوری عظام', ['1371298']],
  ['تسمه تایم 114 دندانه 405 رایکالتون', ['1080057']],
  ['واتر پمپ پراید الدورا', ['1374138']],
  ['لنت جلو پراید', ['1234712', '1034724', '1360064', '6060135']],
];

async function main() {
  await engine.onModuleInit();

  let top1 = 0;
  let top5 = 0;
  let missed = 0;
  const times: number[] = [];

  console.log('تطبیق صوتی — خط مبنا');
  console.log('─'.repeat(78));

  for (const [phrase, expectedSkus] of CASES) {
    const t0 = performance.now();

    const result = engine.parse(phrase);
    const parsed: any = result.data;
    const unknownTokens = result.explanation.unknownTokens ?? [];

    const [partCatalogId, vehicleModelIds, brandId] = await Promise.all([
      matcher.findPartCatalogIdByName(parsed.productName),
      matcher.findVehicleModelIdsByName(parsed.vehicleModel ?? parsed.vehicleFamily),
      matcher.findBrandIdByName(parsed.brand),
    ]);

    const match: any = await matcher.match({
      partCatalogId,
      partName: parsed.productName,
      vehicleModelIds,
      vehicleName: parsed.vehicleModel ?? parsed.vehicleFamily,
      brandId,
      brandName: parsed.brand,
      keywordTokens: unknownTokens,
      modelIsExplicit: !!parsed.vehicleModel,
    });

    times.push(performance.now() - t0);

    // تشخیص علت شکست: آیا کالای درست اصلاً بازیابی شده و در رتبه‌بندی گم شده،
    // یا از همان ابتدا در مجموعهٔ کاندیدها نبوده؟ درمانِ این دو کاملاً فرق دارد.
    const candidates: any[] = await (matcher as any).fetchCandidates(
      partCatalogId,
      vehicleModelIds,
      brandId,
      [parsed.productName, parsed.vehicleModel ?? parsed.vehicleFamily, parsed.brand, ...unknownTokens]
        .filter(Boolean)
        .join(' '),
    );
    const retrieved = candidates.some((c: any) => expectedSkus.includes(c.sku));

    const sugg = (match.suggestions ?? []).map((s: any) => s.product);
    const rank = sugg.findIndex((p: any) => expectedSkus.includes(p.sku));
    if (rank !== 0) {
      console.log(`     [بازیابی: ${retrieved ? 'بله — مشکل رتبه‌بندی' : 'خیر — مشکل بازیابی'}]`);
    }

    if (rank === 0) top1++;
    else if (rank > 0) top5++;
    else missed++;

    const mark = rank === 0 ? '✓' : rank > 0 ? `~${rank + 1}` : '✗';
    console.log(`${mark.padEnd(3)} «${phrase}»`);
    console.log(
      `     وضعیت=${match.status}  ` +
        `parse: قطعه=${parsed.productName ?? '—'} خودرو=${parsed.vehicleModel ?? parsed.vehicleFamily ?? '—'} برند=${parsed.brand ?? '—'}`,
    );
    if (rank !== 0) {
      console.log(`     انتظار: ${expectedSkus.join(' یا ')}`);
      for (const s of sugg.slice(0, 3)) console.log(`       گرفت: ${s.sku} ${s.name}`);
      if (sugg.length === 0) console.log('       گرفت: (هیچ)');
    }
  }

  times.sort((a, b) => a - b);
  console.log('─'.repeat(78));
  console.log(`رتبه ۱: ${top1}/${CASES.length}   در ۵ تای اول: ${top1 + top5}/${CASES.length}   پیدا نشد: ${missed}`);
  console.log(`زمان: p50=${times[Math.floor(times.length / 2)].toFixed(0)}ms  بدترین=${times[times.length - 1].toFixed(0)}ms`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
