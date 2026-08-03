/**
 * وارد کردن کاتالوگ کالا از خروجی حسابداری (GoodsDsg.xlsx).
 *
 * این فایل یک گزارش چندلایه است (نه جدول تمیز): داده از ردیف ۸ و یکی‌درمیان،
 * سرستون‌ها merge‌شده. ستون‌های داده با ایندکس ثابت خوانده می‌شوند:
 *   name=17, code=22, sale=[0,4,5], purchaseLast=8, purchaseAvg=10, stock=11
 *
 * قواعد (طبق معماری پروژه):
 *  - SKU = کد حسابداری (یکتا، پایدار، قابل‌تطبیق با سیستم فعلی مشتری). partNumber هم همان.
 *  - نام نرمال‌سازی می‌شود (عربی ي/ك → فارسی ی/ک، فاصله‌ها) چون matching فارسی به آن وابسته است.
 *  - موجودی وارد نمی‌شود: موجودی باید به یک مکان (Box) وصل باشد و این فایل مکان ندارد؛
 *    کشف «چه چیزی کجاست» کارِ خود اپ است.
 *  - برند/خودرو ستون جدا ندارند (داخل نام‌اند)؛ فعلاً null — رفاین matching بعد از import.
 *  - idempotent: SKUهای موجود رد می‌شوند، پس اجرای دوباره امن است.
 *
 * اجرا:
 *   dry-run (پیش‌فرض، چیزی نمی‌نویسد):  npx ts-node prisma/import-goods.ts [path]
 *   واقعی:                              npx ts-node prisma/import-goods.ts [path] --commit
 */
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COL = { name: 17, code: 22, sale: [0, 4, 5], purchaseLast: 8, stock: 11 };
const CHUNK = 1000;

function normalizeName(raw: string): string {
  return raw
    .replace(/ي/g, 'ی') // ي → ی
    .replace(/ك/g, 'ک') // ك → ک
    .replace(/‌+/g, '‌') // نیم‌فاصله‌های پشت‌سرهم
    .replace(/\s+/g, ' ')
    .trim();
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

type Extracted = {
  sku: string;
  name: string;
  purchasePrice: number | null;
  salePrice: number | null;
  stock: number | null;
};

function extract(path: string): {
  valid: Extracted[];
  skippedJunk: number;
  dupSku: number;
} {
  const wb = XLSX.readFile(path);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sh, {
    header: 1,
    defval: null,
    raw: true,
  });

  const valid: Extracted[] = [];
  const seen = new Set<string>();
  let skippedJunk = 0;
  let dupSku = 0;

  for (const r of rows) {
    const rawName = r[COL.name] != null ? String(r[COL.name]) : '';
    const code = r[COL.code] != null ? String(r[COL.code]).trim() : '';
    const name = normalizeName(rawName);

    // ردیف‌های سرستون/جداکننده/آشغال
    if (!code || code === '0') { skippedJunk++; continue; }
    if (name.length < 2) { skippedJunk++; continue; }
    if (name === 'نام کالا' || code === 'کد کالا') { skippedJunk++; continue; }

    if (seen.has(code)) { dupSku++; continue; }
    seen.add(code);

    const salePrice =
      COL.sale.map((c) => toInt(r[c])).find((x) => x !== null) ?? null;

    valid.push({
      sku: code,
      name,
      purchasePrice: toInt(r[COL.purchaseLast]),
      salePrice,
      stock: toInt(r[COL.stock]),
    });
  }

  return { valid, skippedJunk, dupSku };
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const path =
    args.find((a) => !a.startsWith('--')) ?? '/Users/proman/Downloads/GoodsDsg.xlsx';

  console.log(`فایل: ${path}`);
  console.log(`حالت: ${commit ? '★ COMMIT (نوشتن واقعی)' : 'dry-run (فقط پیش‌نمایش)'}`);
  console.log('─'.repeat(70));

  const { valid, skippedJunk, dupSku } = extract(path);

  const withPurchase = valid.filter((v) => v.purchasePrice !== null).length;
  const withSale = valid.filter((v) => v.salePrice !== null).length;
  const withStock = valid.filter((v) => v.stock !== null).length;

  console.log(`کالاهای معتبر:            ${valid.length}`);
  console.log(`ردیف آشغال حذف‌شده:        ${skippedJunk}`);
  console.log(`کد تکراری در فایل:         ${dupSku}`);
  console.log(`دارای قیمت خرید:          ${withPurchase}`);
  console.log(`دارای قیمت فروش:          ${withSale}`);
  console.log(`دارای موجودی (وارد نمی‌شود): ${withStock}`);
  console.log('─'.repeat(70));
  console.log('۱۵ نمونه‌ی نرمال‌شده:');
  for (const v of valid.slice(0, 15)) {
    console.log(
      `  ${v.sku}  |  ${v.name}  |  خرید=${v.purchasePrice ?? '—'}  فروش=${v.salePrice ?? '—'}`,
    );
  }
  console.log('─'.repeat(70));

  if (!commit) {
    console.log('این dry-run بود؛ چیزی نوشته نشد. برای نوشتن: افزودن --commit');
    await prisma.$disconnect();
    return;
  }

  // idempotent: SKUهای موجود را کنار بگذار
  const existing = new Set(
    (await prisma.product.findMany({ select: { sku: true } })).map((p) => p.sku),
  );
  const toCreate = valid.filter((v) => !existing.has(v.sku));
  console.log(`از قبل موجود (رد شد): ${valid.length - toCreate.length}`);
  console.log(`برای ساخت:            ${toCreate.length}`);

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
          partNumber: v.sku,
          unit: 'عدد',
        })),
        skipDuplicates: true,
      }),
      prisma.productPrice.createMany({
        data: slice
          .map((v, j) => ({
            productId: productIds[j],
            purchasePrice: v.purchasePrice,
            salePrice: v.salePrice,
            wholesalePrice: null,
          }))
          .filter((p) => p.purchasePrice !== null || p.salePrice !== null),
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
