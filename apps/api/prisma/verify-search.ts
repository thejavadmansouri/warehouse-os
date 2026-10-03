/**
 * تست‌های صحتِ جستجو — چیزهایی که بنچمارک نمی‌سنجد.
 * روی دیتابیس واقعی اجرا می‌شود و یک کالای موقت می‌سازد و پاک می‌کند.
 *
 *   npx ts-node prisma/verify-search.ts
 */
import { PrismaClient } from '@prisma/client';
import { ProductsService } from '../src/products/products.service';
import { buildSearchTokens } from '../src/products/search-tokens';

const prisma = new PrismaClient();
const service = new ProductsService(prisma as any);

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label} ${detail}`);
  }
}

async function names(q: string): Promise<string[]> {
  return ((await service.search(q)) as any[]).map((p) => p.name);
}

async function main() {
  console.log('صحت جستجو:');

  // ۱) کد حسابداری دقیق باید همان کالا را اول برگرداند (باگِ قبلی)
  const bySku = (await service.search('1010040')) as any[];
  check(
    'SKU دقیق → همان کالا در جایگاه اول',
    bySku[0]?.sku === '1010040',
    `(گرفت: ${bySku[0]?.sku ?? 'هیچ'})`,
  );

  // ۲) نام کامل → تطبیق دقیق اول
  check(
    'نام کامل → تطبیق دقیق اول',
    (await names('دیسک ترمز تیبا لاهیجان'))[0] === 'دیسک ترمز تیبا لاهیجان',
  );

  // ۳) استقلال از ترتیب
  const a = await names('دیسک ترمز تیبا لاهیجان');
  const b = await names('لاهیجان تیبا ترمز دیسک');
  check('استقلال از ترتیب کلمات', a[0] === b[0], `(${a[0]} ≠ ${b[0]})`);

  // ۴) ورودی عربی (ي/ك) باید با نام فارسی مطابقت کند
  check('ورودی عربی ي/ك', (await names('ديسك ترمز تيبا')).length > 0);

  // ۵) ارقام فارسی
  check('ارقام فارسی ۴۰۵', (await names('لنت ترمز ۴۰۵')).length > 0);

  // ۶) کلمه‌ی جاافتاده (n-1)
  check('تحمل کلمه‌ی اضافه/جاافتاده', (await names('دیسک ترمز تیبا لاهیجن')).length > 0);

  // ۷) کوئری بی‌معنی نباید نتیجه بدهد
  check('کوئری بی‌ربط → خالی', (await names('قهوه اسپرسو ایتالیایی')).length === 0);

  // ۸) کالای تازه‌ساخته‌شده باید بلافاصله پیدا شود (رگرسیونِ نگه‌داری توکن‌ها)
  const sku = `TEST-${Date.now()}`;
  const created = await prisma.product.create({
    data: {
      name: 'قطعه آزمایشی زیبیزوب پراید',
      sku,
      searchTokens: buildSearchTokens('قطعه آزمایشی زیبیزوب پراید', sku, null),
    },
  });
  check('کالای جدید بلافاصله قابل جستجو', (await names('زیبیزوب')).length > 0);

  // ۹) بعد از تغییر نام، با نام جدید پیدا شود
  await service.update(created.id, { name: 'قطعه آزمایشی ووووشکا پراید' });
  const afterRename = await names('ووووشکا');
  const oldGone = (await names('زیبیزوب')).length === 0;
  check('بعد از تغییر نام، نام جدید پیدا می‌شود', afterRename.length > 0);
  check('بعد از تغییر نام، نام قدیم دیگر پیدا نمی‌شود', oldGone);

  await prisma.product.delete({ where: { id: created.id } });

  console.log('─'.repeat(50));
  console.log(`${pass} قبول، ${fail} رد`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
