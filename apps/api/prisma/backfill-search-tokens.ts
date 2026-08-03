/**
 * پرکردن `Product.searchTokens` برای کل کاتالوگ.
 *
 * بعد از هر import کالا باید اجرا شود (import-products-xlsx.ts خودش این کار را
 * برای سطرهای جدید انجام می‌دهد؛ این اسکریپت برای backfill و بازسازی است).
 *
 *   npx ts-node prisma/backfill-search-tokens.ts
 */
import { PrismaClient } from '@prisma/client';
import { buildSearchTokens } from '../src/products/search-tokens';

const prisma = new PrismaClient();
const CHUNK = 1000;

async function main() {
  const total = await prisma.product.count();
  console.log(`بازسازی توکن‌های جستجو برای ${total} کالا ...`);

  let done = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.product.findMany({
      take: CHUNK,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, name: true, sku: true, partNumber: true },
    });
    if (batch.length === 0) break;

    await prisma.$transaction(
      batch.map((p) =>
        prisma.product.update({
          where: { id: p.id },
          data: { searchTokens: buildSearchTokens(p.name, p.sku, p.partNumber) },
        }),
      ),
    );

    done += batch.length;
    cursor = batch[batch.length - 1].id;
    console.log(`  ... ${done}/${total}`);
  }

  console.log(`✓ ${done} کالا توکن‌گذاری شد.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
