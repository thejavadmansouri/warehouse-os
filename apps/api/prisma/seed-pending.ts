/**
 * Seed a few PENDING operations for the manager review page (/admin/review).
 *
 * Run:  cd apps/api && npx ts-node prisma/seed-pending.ts
 * Clean up only these rows:  they all use clientRequestId prefix "demo-".
 *
 * Ties each pending op to REAL location / product / worker rows so approve/reject
 * commit against valid data. Safe to re-run — it deletes prior "demo-" rows first.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const location = await prisma.location.findFirst({
    where: { warehouseId: { not: null } },
    select: { id: true, warehouseId: true, barcode: true, name: true },
  });
  const products = await prisma.product.findMany({
    take: 3,
    include: { brand: true },
  });
  const worker =
    (await prisma.user.findFirst({ where: { role: 'STAFF' }, select: { id: true, username: true } })) ??
    (await prisma.user.findFirst({ select: { id: true, username: true } }));

  if (!location || products.length < 2 || !worker) {
    console.error('Missing seed refs (need a warehouse location, >=2 products, a user).', {
      location: !!location,
      products: products.length,
      worker: !!worker,
    });
    return;
  }

  // Remove any previous demo rows so this is idempotent.
  const removed = await prisma.pendingOperation.deleteMany({
    where: { clientRequestId: { startsWith: 'demo-' } },
  });

  const rows = products.slice(0, 3).map((p, i) => ({
    clientRequestId: `demo-${randomUUID()}`,
    status: 'PENDING',
    type: 'IN',
    locationBarcode: location.barcode,
    warehouseId: location.warehouseId,
    locationId: location.id,
    productId: p.id,
    workerId: worker.id,
    quantity: (i + 1) * 2, // 2, 4, 6
    unit: 'عدد',
    voiceText: `${(i + 1) * 2} عدد ${p.name}`,
    parsed: {
      parsed: { productName: p.name, quantity: (i + 1) * 2, unit: 'عدد' },
      suggestions: [{ id: p.id, name: p.name, confidence: 90 - i * 12 }],
    },
  }));

  for (const data of rows) {
    await prisma.pendingOperation.create({ data });
  }

  console.log(`Removed ${removed.count} old demo rows; seeded ${rows.length} PENDING ops`);
  console.log(`Location: ${location.name} | warehouse: ${location.warehouseId} | worker: ${worker.username}`);
  console.log('Products:', products.slice(0, 3).map((p) => p.name).join(' | '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
