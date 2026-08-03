/**
 * وارد کردن کاتالوگ کامل کالا از خروجی حسابداری (PRODUCTS.xlsx).
 *
 * برخلاف GoodsDsg.xlsx این فایل یک جدول تمیز با سرستون در ردیف ۱ است:
 *   نام کالا | کد کالا | واحد اصلي | شماره فني | قيمت1 | انبار مرکزي | بدنه و سپر | انبار منزل و زير زمين
 *
 * قواعد (همان قواعد import-goods.ts):
 *  - SKU = کد کالا (کد حسابداری). یکتا و پایدار.
 *  - نام نرمال‌سازی می‌شود (ي/ك عربی → ی/ک فارسی) چون matching فارسی به آن وابسته است.
 *  - موجودی وارد نمی‌شود: موجودی باید به یک Box وصل باشد و این فایل مکان ندارد.
 *    (ضمناً ستون‌های موجودی این فایل تمیز نیستند — جمعشان منفی است.)
 *  - «واحد اصلي» آلوده است (نام برند، نقطه، عدد و ...) → فقط واحدهای معتبر پذیرفته
 *    می‌شوند، بقیه «عدد» (پیش‌فرض schema).
 *  - «شماره فني» هم آلوده است (گاهی نام برند) → فقط اگر شبیه شماره فنی باشد
 *    استفاده می‌شود، وگرنه partNumber = sku (مثل import قبلی).
 *  - قیمت: فقط ۷۲۲ ردیف قیمت مثبت دارند. برای کالاهایی که از قبل قیمت دارند
 *    چیزی نوشته نمی‌شود تا داده‌ی بهترِ import قبلی خراب نشود.
 *  - idempotent: SKUهای موجود رد می‌شوند، پس اجرای دوباره امن است.
 *
 * اجرا:
 *   dry-run (پیش‌فرض):  npx ts-node prisma/import-products-xlsx.ts [path]
 *   واقعی:              npx ts-node prisma/import-products-xlsx.ts [path] --commit
 */
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { buildSearchTokens } from '../src/products/search-tokens';

const prisma = new PrismaClient();

const COL = {
  name: 'نام کالا',
  code: 'کد کالا',
  unit: 'واحد اصلي',
  partNumber: 'شماره فني',
  price: 'قيمت1',
} as const;

const CHUNK = 1000;

/** واحدهای معتبر انبار — هرچیز دیگری در ستون واحد، آشغال است. */
const VALID_UNITS = new Set([
  'عدد',
  'دست',
  'جفت',
  'بسته',
  'پک',
  'متر',
  'لیتر',
  'سری',
  'کارتن',
  'حلقه',
  'رول',
]);

function normalizeName(raw: string): string {
  return raw
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌+/g, '‌')
    .replace(/\s+/g, ' ')
    .trim();
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanUnit(v: unknown): string {
  const u = normalizeName(v == null ? '' : String(v));
  return VALID_UNITS.has(u) ? u : 'عدد';
}

/** شماره فنی واقعی: لاتین/عددی. نام‌های فارسی داخل این ستون برند هستند نه شماره فنی. */
function cleanPartNumber(v: unknown, sku: string): string {
  if (v == null) return sku;
  const s = String(v).trim();
  return /^[A-Za-z0-9][A-Za-z0-9/. -]{2,}$/.test(s) ? s : sku;
}

type Extracted = {
  sku: string;
  name: string;
  unit: string;
  partNumber: string;
  salePrice: number | null;
};

function extract(path: string): {
  valid: Extracted[];
  skippedJunk: number;
  dupSku: number;
} {
  const wb = XLSX.readFile(path);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets[wb.SheetNames[0]],
    { defval: null, raw: true },
  );

  const valid: Extracted[] = [];
  const seen = new Set<string>();
  let skippedJunk = 0;
  let dupSku = 0;

  for (const r of rows) {
    const code = r[COL.code] != null ? String(r[COL.code]).trim() : '';
    const name = normalizeName(r[COL.name] == null ? '' : String(r[COL.name]));

    if (!code || code === '0') {
      skippedJunk++;
      continue;
    }
    if (name.length < 2 || name === 'نام کالا') {
      skippedJunk++;
      continue;
    }
    if (seen.has(code)) {
      dupSku++;
      continue;
    }
    seen.add(code);

    valid.push({
      sku: code,
      name,
      unit: cleanUnit(r[COL.unit]),
      partNumber: cleanPartNumber(r[COL.partNumber], code),
      salePrice: toInt(r[COL.price]),
    });
  }

  return { valid, skippedJunk, dupSku };
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const path =
    args.find((a) => !a.startsWith('--')) ??
    '/Users/proman/Downloads/PRODUCTS.xlsx';

  console.log(`فایل: ${path}`);
  console.log(
    `حالت: ${commit ? '★ COMMIT (نوشتن واقعی)' : 'dry-run (فقط پیش‌نمایش)'}`,
  );
  console.log('─'.repeat(70));

  const { valid, skippedJunk, dupSku } = extract(path);

  const existing = new Set(
    (await prisma.product.findMany({ select: { sku: true } })).map((p) => p.sku),
  );
  const toCreate = valid.filter((v) => !existing.has(v.sku));
  const withPrice = toCreate.filter((v) => v.salePrice !== null).length;
  const nonDefaultUnit = toCreate.filter((v) => v.unit !== 'عدد').length;
  const realPartNumber = toCreate.filter((v) => v.partNumber !== v.sku).length;

  console.log(`کالاهای معتبر در فایل:   ${valid.length}`);
  console.log(`ردیف آشغال حذف‌شده:      ${skippedJunk}`);
  console.log(`کد تکراری در فایل:       ${dupSku}`);
  console.log(`از قبل در دیتابیس:       ${valid.length - toCreate.length}`);
  console.log(`برای ساخت:               ${toCreate.length}`);
  console.log(`  دارای قیمت فروش:       ${withPrice}`);
  console.log(`  واحد غیر از «عدد»:     ${nonDefaultUnit}`);
  console.log(`  شماره فنی واقعی:       ${realPartNumber}`);
  console.log('موجودی وارد نمی‌شود (بدون مکان).');
  console.log('─'.repeat(70));
  console.log('۱۵ نمونه‌ی نرمال‌شده:');
  for (const v of toCreate.slice(0, 15)) {
    console.log(
      `  ${v.sku} | ${v.name} | واحد=${v.unit} | فني=${v.partNumber} | فروش=${v.salePrice ?? '—'}`,
    );
  }
  console.log('─'.repeat(70));

  if (!commit) {
    console.log('این dry-run بود؛ چیزی نوشته نشد. برای نوشتن: افزودن --commit');
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const slice = toCreate.slice(i, i + CHUNK);
    const productIds = slice.map(() => crypto.randomUUID());

    await prisma.$transaction([
      prisma.product.createMany({
        data: slice.map((v, j) => ({
          id: productIds[j],
          name: v.name,
          sku: v.sku,
          partNumber: v.partNumber,
          unit: v.unit,
          // بدون این، کالای واردشده در جستجو دیده نمی‌شود.
          searchTokens: buildSearchTokens(v.name, v.sku, v.partNumber),
        })),
        skipDuplicates: true,
      }),
      prisma.productPrice.createMany({
        data: slice
          .map((v, j) => ({
            productId: productIds[j],
            purchasePrice: null,
            salePrice: v.salePrice,
            wholesalePrice: null,
          }))
          .filter((p) => p.salePrice !== null),
      }),
    ]);

    created += slice.length;
    console.log(`  ... ${created}/${toCreate.length}`);
  }

  console.log('─'.repeat(70));
  console.log(`✓ ${created} کالا وارد شد.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
