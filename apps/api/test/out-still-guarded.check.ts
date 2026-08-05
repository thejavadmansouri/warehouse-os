/** برداشت انباردار باید همچنان جلوی موجودی ناکافی را بگیرد — منفی فقط برای فروش. */
import '../src/load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryOperationService } from '../src/inventory-operation/inventory-operation.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const op = app.get(InventoryOperationService);

  const w = await prisma.warehouse.create({ data: { code: 'GRD', name: 'گارد' } });
  const t = await prisma.locationType.create({ data: { warehouseId: w.id, name: 'قفسه', depth: 0 } });
  const loc = await prisma.location.create({
    data: { name: 'ق۱', code: 'GRD-01', barcode: 'LOC-GRD-01', path: 'GRD > ق۱', depth: 0,
            warehouseId: w.id, typeId: t.id },
  });
  const p = await prisma.product.create({
    data: { name: 'گارد', sku: 'GRD-1', searchTokens: ['g'], unit: 'عدد' },
  });
  await prisma.inventory.create({ data: { productId: p.id, locationId: loc.id, quantity: 2 } });

  let blocked = false;
  try {
    await op.execute({ type: 'OUT', productId: p.id, locationId: loc.id, quantity: 5, source: 'TEST' });
  } catch (e: any) {
    blocked = (e?.response ?? e?.getResponse?.())?.error === 'INSUFFICIENT_STOCK';
  }
  console.log('OUT of 5 when only 2 in stock ->', blocked ? 'BLOCKED ✅' : 'ALLOWED ❌');

  const left = await prisma.inventory.findFirst({ where: { productId: p.id }, select: { quantity: true } });
  console.log('stock untouched:', left?.quantity, '(expected 2)');

  await prisma.inventoryLog.deleteMany({ where: { productId: p.id } });
  await prisma.inventory.deleteMany({ where: { productId: p.id } });
  await prisma.product.delete({ where: { id: p.id } });
  await prisma.location.deleteMany({ where: { warehouseId: w.id } });
  await prisma.locationType.deleteMany({ where: { warehouseId: w.id } });
  await prisma.warehouse.delete({ where: { id: w.id } });
  console.log('cleaned up');
  await app.close();
  process.exit(blocked && left?.quantity === 2 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
