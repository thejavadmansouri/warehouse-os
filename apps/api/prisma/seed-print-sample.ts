/**
 * فاکتور نمونه برای بررسی چاپ.
 *
 * از قفسه‌های واقعیِ انبار W01 استفاده می‌کند و دو کالای موقت می‌سازد تا کاتالوگ
 * واقعی دست نخورد. با `--clean` همه‌چیزِ ساخته‌شده را پس می‌گیرد.
 *
 *   npx ts-node prisma/seed-print-sample.ts
 *   npx ts-node prisma/seed-print-sample.ts --clean
 */
import '../src/load-env';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalesService } from '../src/sales/sales.service';

const TAG = 'PRINTCHK';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const sales = app.get(SalesService);

  if (process.argv.includes('--clean')) {
    const products = await prisma.product.findMany({
      where: { sku: { startsWith: TAG } },
      select: { id: true },
    });
    const ids = products.map((p) => p.id);
    const invoiceIds = (
      await prisma.inventoryLog.findMany({
        where: { productId: { in: ids }, invoiceId: { not: null } },
        select: { invoiceId: true },
        distinct: ['invoiceId'],
      })
    ).map((r) => r.invoiceId!) as string[];

    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.inventoryLog.deleteMany({ where: { productId: { in: ids } } });
    await prisma.saleInvoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productPrice.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productBarcode.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    console.log(`پاک شد: ${invoiceIds.length} فاکتور، ${ids.length} کالای نمونه`);
    await app.close();
    return;
  }

  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { code: 'W01' } });
  const shelves = await prisma.location.findMany({
    where: { warehouseId: warehouse.id, depth: 3 },
    orderBy: { code: 'asc' },
    take: 2,
  });

  const mk = async (name: string, sku: string, price: number, qty: number, locId: string) => {
    const p = await prisma.product.create({
      data: {
        name,
        sku,
        internalBarcode: `${TAG}-${sku}`,
        searchTokens: [name],
        unit: 'عدد',
        barcodes: { create: [{ barcode: `${TAG}-${sku}`, type: 'INTERNAL' }] },
        prices: { create: { salePrice: price, purchasePrice: Math.round(price * 0.7) } },
      },
    });
    await prisma.inventory.create({
      data: { productId: p.id, locationId: locId, quantity: qty },
    });
    return p;
  };

  const a = await mk('لنت ترمز جلو پژو ۴۰۵ عظام', `${TAG}-A`, 1_250_000, 20, shelves[0].id);
  const b = await mk('واشر سرسیلندر پراید', `${TAG}-B`, 480_000, 20, shelves[1].id);

  const customer = await prisma.customer.create({
    data: { firstName: 'رضا', lastName: 'محمدی' },
  });

  const invoice = await sales.createInvoice(
    {
      idempotencyKey: `${TAG}-${Date.now()}`,
      warehouseId: warehouse.id,
      customerId: customer.id,
      discount: 30_000,
      note: 'تحویل درب مغازه',
      lines: [
        { productId: a.id, locationId: shelves[0].id, quantity: 2, unitPrice: 1_250_000, discount: 125_000 },
        { productId: b.id, locationId: shelves[1].id, quantity: 3, unitPrice: 480_000 },
      ],
      payments: [{ method: 'CARD', amount: 1_000_000 }, { method: 'CREDIT', amount: 1_660_000 }],
    } as never,
    undefined,
  );

  console.log('invoice id  :', invoice.id);
  console.log('number      :', invoice.number);
  console.log('subtotal    :', invoice.subtotal);
  console.log('total       :', invoice.total);
  console.log('due         :', invoice.dueAmount);
  console.log(`\nprint at: http://127.0.0.1:3001/admin/print/invoice/${invoice.id}`);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
