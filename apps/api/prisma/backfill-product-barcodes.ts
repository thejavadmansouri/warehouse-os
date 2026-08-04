/**
 * Backfill: جدول ProductBarcode را برای کالاهای موجود پر می‌کند.
 *
 * مشکل: کالاهای ایمپورت‌شده (۳۳هزار ردیف) بدون رکورد ProductBarcode ساخته شده‌اند،
 * برای همین اسکنر فروشنده بارکدِ چاپی را پیدا نمی‌کرد (resolveForSale از همین جدول
 * می‌خواند). این اسکریپت برای هر کالای بدون رکورد INTERNAL، یکی از
 * Product.internalBarcode می‌سازد.
 *
 * اجرا: npx ts-node prisma/backfill-product-barcodes.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CHUNK = 1000;

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, internalBarcode: true },
  });

  const existing = await prisma.productBarcode.findMany({
    where: { type: 'INTERNAL' },
    select: { productId: true },
  });
  const existingSet = new Set(existing.map((e) => e.productId));

  const missing = products.filter((p) => !existingSet.has(p.id));
  console.log(
    `products: ${products.length} | with INTERNAL row: ${existingSet.size} | missing: ${missing.length}`,
  );

  let created = 0;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing
      .slice(i, i + CHUNK)
      .map((p) => ({ productId: p.id, barcode: p.internalBarcode, type: 'INTERNAL' as const }));
    const res = await prisma.productBarcode.createMany({ data: chunk, skipDuplicates: true });
    created += res.count;
    console.log(`chunk ${Math.floor(i / CHUNK) + 1}: +${res.count}`);
  }

  console.log(`done: created ${created} ProductBarcode rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
