/**
 * فروشِ کالایی که هنوز در نرم‌افزار ثبت نشده.
 *
 * جنس فیزیکاً در انبار هست ولی موجودی‌اش وارد سیستم نشده. فروش نباید متوقف شود،
 * و باید روی مکان سیستمیِ «موجودی ثبت‌نشده» منفی بنشیند تا بعداً معلوم باشد چه
 * چیزی پیش از ثبت فروخته شده.
 */
import '../src/load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalesService } from '../src/sales/sales.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const sales = app.get(SalesService);

  const warehouse = await prisma.warehouse.create({ data: { code: 'UNR', name: 'تست' } });
  const p = await prisma.product.create({
    data: { name: 'کالای ثبت‌نشده', sku: 'UNREG-1', searchTokens: ['x'], unit: 'عدد' },
  });

  const before = await prisma.inventory.count({ where: { productId: p.id } });
  console.log('inventory rows before sale:', before, '(expected 0)');

  const inv = await sales.createInvoice(
    {
      idempotencyKey: `unreg-${Date.now()}`,
      warehouseId: warehouse.id,
      lines: [{ productId: p.id, quantity: 3, unitPrice: 200_000 }],
    } as never,
    undefined,
  );
  console.log('invoice total:', inv.total, '(expected 600000)');

  const row = await prisma.inventory.findFirst({
    where: { productId: p.id },
    include: { location: { select: { name: true, code: true, path: true } } },
  });
  console.log('stock now:', row?.quantity, '(expected -3)');
  console.log('landed on:', row?.location?.name, '|', row?.location?.code);

  const log = await prisma.inventoryLog.findFirst({
    where: { productId: p.id },
    select: { action: true, quantity: true, unitPrice: true },
  });
  console.log('ledger entry:', log);

  // دومین فروش باید همان مکان را دوباره استفاده کند، نه یکی جدید بسازد
  await sales.createInvoice(
    { idempotencyKey: `unreg2-${Date.now()}`, warehouseId: warehouse.id,
      lines: [{ productId: p.id, quantity: 2, unitPrice: 200_000 }] } as never,
    undefined,
  );
  const sysLocs = await prisma.location.count({ where: { warehouseId: warehouse.id, depth: 99 } });
  const after = await prisma.inventory.findFirst({ where: { productId: p.id } });
  console.log('system locations created:', sysLocs, '(expected 1)');
  console.log('stock after 2nd sale:', after?.quantity, '(expected -5)');

  // پاک‌سازی کامل
  const invoiceIds = (await prisma.inventoryLog.findMany({
    where: { productId: p.id }, select: { invoiceId: true }, distinct: ['invoiceId'],
  })).map(r => r.invoiceId!).filter(Boolean);
  await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.inventoryLog.deleteMany({ where: { productId: p.id } });
  await prisma.saleInvoice.deleteMany({ where: { id: { in: invoiceIds } } });
  await prisma.inventory.deleteMany({ where: { productId: p.id } });
  await prisma.product.delete({ where: { id: p.id } });
  await prisma.location.deleteMany({ where: { warehouseId: warehouse.id } });
  await prisma.locationType.deleteMany({ where: { warehouseId: warehouse.id } });
  await prisma.warehouse.delete({ where: { id: warehouse.id } });
  console.log('\ncleaned up');

  await app.close();
}
main().catch(e => { console.error(e); process.exit(1); });
