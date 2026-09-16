/**
 * وارد کردن قیمت‌ها از PRODUCTS-FINAL.xlsx به کالاهای موجود.
 *
 * ستون‌ها (ایندکس‌محور، مثل بقیه‌ی importها):
 *   کد کالا = 1  ·  قیمت1 = 4  ·  آخرین قیمت فروش = 8
 *
 * نگاشت انتخابی مدیر:
 *   قیمت1            → salePrice     (قیمت فروش)
 *   آخرین قیمت فروش  → managerPrice  (قیمت مدیر — عددِ آزادِ مدیر)
 *
 * قواعد:
 *  - فقط کالاهایی که SKUشان در دیتابیس هست به‌روز می‌شوند؛ بقیه رد می‌شوند.
 *  - فیلدِ نبوده یعنی «عوض نکن»، نه «صفر کن»: اگر اکسل قیمت فروش نداشت،
 *    قیمت فروشِ فعلی دست‌نخورده می‌ماند.
 *  - مثل setPrice: اگر هیچ مقداری نسبت به آخرین ردیف عوض نشود، ردیف تکراری
 *    ساخته نمی‌شود (تاریخچه تمیز می‌ماند).
 *
 * اجرا:
 *   dry-run (پیش‌فرض):  npx ts-node prisma/import-product-prices.ts <path>
 *   واقعی:              npx ts-node prisma/import-product-prices.ts <path> --commit
 */
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COL = { sku: 1, sale: 4, lastSale: 8 };
const CHUNK = 500;

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const path = args.find((a) => !a.startsWith('--'));
  if (!path) {
    console.error('مسیر فایل اکسل را بدهید');
    process.exit(1);
  }

  console.log(`فایل: ${path}`);
  console.log(`حالت: ${commit ? '★ COMMIT (نوشتن واقعی)' : 'dry-run (فقط پیش‌نمایش)'}`);
  console.log('─'.repeat(70));

  const wb = XLSX.readFile(path);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sh, {
    header: 1,
    defval: null,
    raw: true,
  });

  // استخراج: sku → { sale, manager } — اولیِ دیده‌شده برای هر sku برنده است.
  const bySku = new Map<string, { sale: number | null; manager: number | null }>();
  let skippedJunk = 0;
  for (const r of rows) {
    const sku = r[COL.sku] != null ? String(r[COL.sku]).trim() : '';
    if (!sku || sku === '0' || sku === 'کد کالا') {
      skippedJunk++;
      continue;
    }
    if (bySku.has(sku)) continue; // اولین ردیف برای هر کد معتبر است
    bySku.set(sku, { sale: toInt(r[COL.sale]), manager: toInt(r[COL.lastSale]) });
  }

  const withSale = [...bySku.values()].filter((v) => v.sale !== null).length;
  const withManager = [...bySku.values()].filter((v) => v.manager !== null).length;
  console.log(`ردیف‌های معتبر (SKU یکتا): ${bySku.size}`);
  console.log(`ردیف آشغال/تکراری:        ${skippedJunk}`);
  console.log(`دارای قیمت1 (فروش):       ${withSale}`);
  console.log(`دارای آخرین فروش (مدیر):  ${withManager}`);
  console.log('─'.repeat(70));

  // تطبیق با دیتابیس — یک پاس همه‌ی SKUها
  const dbProducts = await prisma.product.findMany({
    where: { sku: { in: [...bySku.keys()] } },
    select: { id: true, sku: true },
  });
  const productBySku = new Map(dbProducts.map((p) => [p.sku, p.id]));
  console.log(`تطبیق‌یافته با دیتابیس:     ${dbProducts.length}`);
  console.log('─'.repeat(70));

  const skus = [...bySku.keys()];
  let matched = 0;
  let updated = 0;
  let unchanged = 0;
  let noChangeNeeded = 0;
  const samples: string[] = [];

  for (let i = 0; i < skus.length; i += CHUNK) {
    const chunk = skus.slice(i, i + CHUNK);
    const productIds = chunk.map((s) => productBySku.get(s)).filter((x): x is string => !!x);
    if (productIds.length === 0) continue;

    const latestRows = await prisma.productPrice.findMany({
      where: { productId: { in: productIds } },
      orderBy: { createdAt: 'desc' },
    });
    const latestByProduct = new Map<string, (typeof latestRows)[number]>();
    for (const row of latestRows) {
      if (!latestByProduct.has(row.productId)) latestByProduct.set(row.productId, row);
    }

    const toCreate: { productId: string; salePrice: number | null; managerPrice: number | null }[] = [];

    for (const sku of chunk) {
      const productId = productBySku.get(sku);
      if (!productId) continue;
      matched++;
      const src = bySku.get(sku)!;
      const latest = latestByProduct.get(productId);

      // «نداده‌شده» یعنی عوض نکن — مقادیر قبلی حفظ می‌شوند.
      const next = {
        salePrice: src.sale ?? latest?.salePrice ?? null,
        managerPrice: src.manager ?? latest?.managerPrice ?? null,
      };

      const unchangedRow =
        latest &&
        latest.salePrice === next.salePrice &&
        latest.managerPrice === next.managerPrice;
      const hasAnyPrice = next.salePrice !== null || next.managerPrice !== null;

      if (unchangedRow || !hasAnyPrice) {
        noChangeNeeded++;
        continue;
      }

      updated++;
      if (samples.length < 10) {
        samples.push(
          `${sku} | فروش=${next.salePrice ?? '—'} | مدیر=${next.managerPrice ?? '—'}`,
        );
      }
      toCreate.push({ productId, salePrice: next.salePrice, managerPrice: next.managerPrice });
    }

    if (commit && toCreate.length > 0) {
      await prisma.productPrice.createMany({ data: toCreate });
    }
    unchanged += toCreate.length;
  }

  console.log('نمونه‌ی به‌روزرسانی‌ها:');
  for (const s of samples) console.log(`  ${s}`);
  console.log('─'.repeat(70));
  console.log(`تطبیق‌یافته:        ${matched}`);
  console.log(`ردیف جدید لازم:     ${updated}`);
  console.log(`تکراری/بدون‌تغییر:  ${noChangeNeeded}`);

  if (!commit) {
    console.log('\nاین dry-run بود؛ چیزی نوشته نشد. برای نوشتن: افزودن --commit');
    await prisma.$disconnect();
    return;
  }

  console.log(`✓ ${updated} ردیف قیمت وارد شد.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
