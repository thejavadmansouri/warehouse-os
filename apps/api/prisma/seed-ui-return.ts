/**
 * دادهٔ موقت برای پیمایشِ رابطِ مرجوعی در مرورگر — همان سناریوی واقعی:
 * مشتریِ ۲٬۰۰۰٬۰۰۰ بدهکار، فاکتورِ ۱۰۰ عددیِ نقد+کارت+نسیهٔ ۱۰ روزه.
 *
 * اجرای مرورگر روی همین داده انجام می‌شود، نه روی فاکتورهای واقعیِ مغازه.
 * اجرا:   npx ts-node --transpile-only prisma/seed-ui-return.ts
 * پاک‌سازی: npx ts-node --transpile-only prisma/seed-ui-return.ts --clean
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { SalesService } from '../src/sales/sales.service';
import { LedgerService } from '../src/sales/ledger.service';
import { CustomersService } from '../src/sales/customers.service';
import { InventoryOperationService } from '../src/inventory-operation/inventory-operation.service';

const TAG = 'SMOKE-UI';
const prisma = new PrismaClient();

async function clean() {
  const customers = await prisma.customer.findMany({
    where: { firstName: TAG },
    select: { id: true },
  });
  const ids = customers.map((c) => c.id);
  const products = await prisma.product.findMany({
    where: { sku: { startsWith: TAG } },
    select: { id: true },
  });
  const productIds = products.map((p) => p.id);

  await prisma.saleReturnLine.deleteMany({
    where: { saleReturn: { customerId: { in: ids } } },
  });
  const rets = await prisma.saleReturn.findMany({
    where: { customerId: { in: ids } },
    select: { id: true },
  });
  await prisma.receiptAllocation.deleteMany({
    where: { receipt: { customerId: { in: ids } } },
  });
  const receipts = await prisma.receipt.findMany({
    where: { customerId: { in: ids } },
    select: { id: true },
  });
  await prisma.receipt.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.payment.deleteMany({
    where: { invoice: { customerId: { in: ids } } },
  });
  const invoices = await prisma.saleInvoice.findMany({
    where: { customerId: { in: ids } },
    select: { id: true },
  });
  await prisma.voucher.deleteMany({
    where: {
      OR: [
        {
          sourceId: {
            in: [
              ...invoices.map((i) => i.id),
              ...rets.map((r) => r.id),
              ...receipts.map((r) => r.id),
            ],
          },
        },
        { lines: { some: { customerId: { in: ids } } } },
      ],
    },
  });
  await prisma.saleReturn.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.inventoryLog.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.saleInvoice.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customerLedger.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customerPhone.deleteMany({ where: { customerId: { in: ids } } });
  if (ids.length) await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  await prisma.productPrice.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
  if (productIds.length) await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  const whs = await prisma.warehouse.findMany({
    where: { code: { startsWith: TAG } },
    select: { id: true },
  });
  const whIds = whs.map((w) => w.id);
  await prisma.location.deleteMany({ where: { warehouseId: { in: whIds } } });
  await prisma.locationType.deleteMany({ where: { warehouseId: { in: whIds } } });
  if (whIds.length) await prisma.warehouse.deleteMany({ where: { id: { in: whIds } } });

  console.log(
    `پاک شد: ${ids.length} مشتری، ${invoices.length} فاکتور، ${rets.length} مرجوعی، ${productIds.length} کالا، ${whIds.length} انبار`,
  );
}

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const sales = app.get(SalesService);
  const ledger = app.get(LedgerService);
  const customers = app.get(CustomersService);
  const inventory = app.get(InventoryOperationService);

  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error('کاربری پیدا نشد');

  const stamp = Date.now();
  const warehouse = await prisma.warehouse.create({
    data: { name: `${TAG} انبار`, code: `${TAG}-${stamp}` },
  });
  const locType = await prisma.locationType.create({
    data: { warehouseId: warehouse.id, name: `${TAG} نوع`, depth: 1 },
  });
  const location = await prisma.location.create({
    data: {
      warehouseId: warehouse.id,
      name: `${TAG} قفسه`,
      code: `${TAG}-${stamp}`,
      barcode: `${TAG}-loc-${stamp}`,
      path: `${TAG} قفسه`,
      depth: 1,
      typeId: locType.id,
    },
  });
  const product = await prisma.product.create({
    data: { name: `${TAG} کالا`, sku: `${TAG}-p-${stamp}` },
  });
  await inventory.execute({
    type: 'IN',
    productId: product.id,
    locationId: location.id,
    quantity: 150,
    note: `${TAG} اولیه`,
    userId: user.id,
  } as any);

  const customer = await customers.create({
    firstName: TAG,
    lastName: 'مشتری آزمایشی',
    creditLimit: 100_000_000,
    creditDays: 10,
  });
  await ledger.setOpeningBalance(customer.id, 2_000_000, user.id);

  const due = new Date(Date.now() + 10 * 86_400_000);
  const invoice = await sales.createInvoice(
    {
      idempotencyKey: `${TAG}-inv-${stamp}`,
      warehouseId: warehouse.id,
      customerId: customer.id,
      dueDate: due.toISOString(),
      lines: [{ productId: product.id, quantity: 100, unitPrice: 10_000 }],
      payments: [
        { method: 'CASH', amount: 300_000 },
        { method: 'CARD', amount: 300_000 },
        { method: 'CREDIT', amount: 400_000 },
      ],
    } as any,
    user.id,
  );

  console.log(
    JSON.stringify(
      {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        customerId: customer.id,
        customerName: `${TAG} مشتری آزمایشی`,
        warehouseId: warehouse.id,
        productId: product.id,
        total: invoice.total,
        paid: invoice.paidAmount,
        due: invoice.dueAmount,
      },
      null,
      2,
    ),
  );

  await app.close();
  await prisma.$disconnect();
}

const mode = process.argv.includes('--clean') ? clean() : seed();
mode
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });