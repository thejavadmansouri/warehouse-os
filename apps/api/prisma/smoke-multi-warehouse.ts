/**
 * تست دود برای **فاکتورِ چند‌انباری**.
 *
 * سناریوی واقعی مغازه: یک خرید، دو قلم — یکی از قفسه‌ی انبار A و یکی از قفسه‌ی
 * انبار B. تا شهریور این فاکتور با `LOCATION_NOT_IN_WAREHOUSE` رد می‌شد و
 * فروشنده فقط پیامِ «مکان انتخاب‌شده در این انبار نیست» را می‌دید، در حالی که
 * صندوق خودش قفسه را از پرموجودی‌ترین مکان انتخاب کرده بود.
 *
 * چرا روی سرویس و دیتابیسِ واقعی و نه با ماک: تصمیم در لایه‌ی `SalesService`
 * گرفته می‌شود و موجودی از موتورِ واقعیِ حرکت موجودی می‌گذرد. تستی که ماک
 * بزند، همان جایی را که باید ثابت شود (کسر شدنِ درستِ موجودیِ دو قفسه‌ی دو
 * انبار) لمس نمی‌کند.
 *
 * داده‌ی خودش را می‌سازد و در پایان پاک می‌کند.
 *
 * اجرا:  npx ts-node --transpile-only prisma/smoke-multi-warehouse.ts
 */
import '../src/load-env';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { SalesService } from '../src/sales/sales.service';

const TAG = 'SMOKE-MW';
const prisma = new PrismaClient();

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? '✅' : '❌'}  ${label}: ${JSON.stringify(actual)}` +
      (ok ? '' : `  (انتظار: ${JSON.stringify(expected)})`),
  );
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const sales = app.get(SalesService);

  const stamp = Date.now();

  const user = await prisma.user.findFirst({ select: { id: true } });
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    take: 2,
    orderBy: { createdAt: 'asc' },
  });
  // انبارِ پیشخوان: اولین انبارِ موجود. این همان انباری است که روی فاکتور
  // می‌نشیند و سربرگِ سند است.
  const warehouseA = await prisma.warehouse.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  const typeA = warehouseA
    ? await prisma.locationType.findFirst({
        where: { warehouseId: warehouseA.id },
        orderBy: { depth: 'asc' },
      })
    : null;

  if (!user || products.length < 2 || !warehouseA || !typeA) {
    throw new Error(
      'برای این تست به یک کاربر، دو کالا و یک انبارِ دارای نوعِ مکان نیاز است',
    );
  }

  // ── انبار دوم و قفسه‌ی آن ──────────────────────────────────────────────
  const warehouseB = await prisma.warehouse.create({
    data: { name: `${TAG} انبار دوم`, code: `${TAG}-${stamp}` },
  });
  const typeB = await prisma.locationType.create({
    data: {
      warehouseId: warehouseB.id,
      name: `${TAG} قفسه`,
      depth: typeA.depth,
    },
  });

  const shelfA = await prisma.location.create({
    data: {
      name: `${TAG} قفسه الف`,
      code: `${TAG}-A-${stamp}`,
      barcode: `LOC-${TAG}-A-${stamp}`,
      path: `${warehouseA.code} > ${TAG} قفسه الف`,
      depth: typeA.depth,
      warehouseId: warehouseA.id,
      typeId: typeA.id,
    },
  });
  const shelfB = await prisma.location.create({
    data: {
      name: `${TAG} قفسه ب`,
      code: `${TAG}-B-${stamp}`,
      barcode: `LOC-${TAG}-B-${stamp}`,
      path: `${warehouseB.code} > ${TAG} قفسه ب`,
      depth: typeB.depth,
      warehouseId: warehouseB.id,
      typeId: typeB.id,
    },
  });

  // کالای اول فقط در انبار A، کالای دوم فقط در انبار B.
  await prisma.inventory.create({
    data: { productId: products[0].id, locationId: shelfA.id, quantity: 5 },
  });
  await prisma.inventory.create({
    data: { productId: products[1].id, locationId: shelfB.id, quantity: 7 },
  });

  let invoiceId: string | null = null;

  try {
    console.log(`\n— فاکتورِ ${warehouseA.code} با یک قلم از ${warehouseB.code} —`);

    const invoice = await sales.createInvoice(
      {
        idempotencyKey: `${TAG}-${stamp}`,
        warehouseId: warehouseA.id,
        lines: [
          {
            productId: products[0].id,
            locationId: shelfA.id,
            quantity: 1,
            unitPrice: 100_000,
          },
          {
            productId: products[1].id,
            locationId: shelfB.id,
            quantity: 1,
            unitPrice: 200_000,
          },
        ],
        payments: [{ method: 'CASH', amount: 300_000 }],
      } as any,
      user.id,
    );
    invoiceId = invoice.id;

    check('فاکتور ثبت شد (سربرگ روی انبار پیشخوان)', invoice.warehouseId, warehouseA.id);

    // ── ردیف‌ها روی دو قفسه‌ی دو انبار ────────────────────────────────────
    const logs = await prisma.inventoryLog.findMany({
      where: { invoiceId: invoice.id, action: 'SALE' },
      select: { productId: true, locationId: true, quantity: true },
    });
    check('تعداد ردیف‌های فروش', logs.length, 2);

    const shelfIds = await prisma.location.findMany({
      where: { id: { in: logs.map((l) => l.locationId) } },
      select: { id: true, path: true, warehouseId: true },
    });
    const warehouses = [...new Set(shelfIds.map((l) => l.warehouseId))];
    check('ردیف‌ها از دو انبار مختلف‌اند', warehouses.length, 2);
    for (const s of shelfIds) console.log(`   • ${s.path}`);

    // ── موجودیِ هر قفسه دقیقاً یک واحد کم شد ─────────────────────────────
    const afterA = await prisma.inventory.findUniqueOrThrow({
      where: {
        productId_locationId: {
          productId: products[0].id,
          locationId: shelfA.id,
        },
      },
      select: { quantity: true },
    });
    const afterB = await prisma.inventory.findUniqueOrThrow({
      where: {
        productId_locationId: {
          productId: products[1].id,
          locationId: shelfB.id,
        },
      },
      select: { quantity: true },
    });
    check(`موجودی قفسه‌ی انبار ${warehouseA.code}`, afterA.quantity, 4);
    check(`موجودی قفسه‌ی انبار ${warehouseB.code}`, afterB.quantity, 6);
  } finally {
    // پاک‌سازی — این اسکریپت روی دیتابیسِ واقعی اجرا می‌شود.
    if (invoiceId) {
      // سندِ دفتر (ووچر) به فاکتور FK ندارد و فقط با sourceId به آن اشاره می‌کند،
      // پس اگر پاک نشود به‌صورت یتیم در دفتر می‌ماند.
      await prisma.voucherLine.deleteMany({
        where: { voucher: { sourceId: invoiceId } },
      });
      await prisma.voucher.deleteMany({ where: { sourceId: invoiceId } });
      await prisma.inventoryLog.deleteMany({ where: { invoiceId } });
      await prisma.payment.deleteMany({ where: { invoiceId } });
      await prisma.saleInvoice.delete({ where: { id: invoiceId } });
    }
    await prisma.inventory.deleteMany({
      where: { locationId: { in: [shelfA.id, shelfB.id] } },
    });
    await prisma.location.deleteMany({
      where: { id: { in: [shelfA.id, shelfB.id] } },
    });
    await prisma.locationType.delete({ where: { id: typeB.id } });
    await prisma.warehouse.delete({ where: { id: warehouseB.id } });

    await app.close();
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? '\nهمه قبول ✅' : `\n${failures} مورد رد شد ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
