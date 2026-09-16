/**
 * تست دود برای عملیاتِ یکپارچه‌ی «ویرایش فاکتور پس از فروش» (adjust).
 *
 * سناریوی واقعیِ کاربر:
 *   فاکتور اولیه: لنت ۱۰ × ۱۰۰٬۰۰۰، روغن ۱ × ۲۰۰٬۰۰۰، چراغ ۵ × ۵۰٬۰۰۰ (نقد، ۱٬۴۵۰٬۰۰۰)
 *   بعد از ۱۰ روز: ۳ چراغ و ۳ لنت برمی‌گردد، ۲ کاسه‌نمد (۳۰٬۰۰۰) و ۱ سرسیلندر (۲۰۰٬۰۰۰) می‌گیرد
 *
 * سپس بررسی می‌شود:
 *   • مانده‌ها: چراغ ۲، لنت ۷، روغن ۱، کاسه‌نمد ۲، سرسیلندر ۱
 *   • مالی: مرجوعی ۴۵۰٬۰۰۰، افزوده ۲۶۰٬۰۰۰، اختلاف −۱۹۰٬۰۰۰ (به نفع مشتری → بستانکاری)
 *   • موجودیِ واقعیِ انبار دقیقاً همان دلتاها
 *   • دفترِ مشتری دقیقاً −۱۹۰٬۰۰۰
 *   • تکرارِ همان درخواست با همان idempotencyKey هیچ اثرِ اضافه‌ای ندارد
 *
 * همه‌چیز از سرِ سرویس‌های واقعی (SalesService → AdjustmentsService) می‌گذرد و
 * در پایان داده‌ی خودش را پاک می‌کند.
 *
 * اجرا:  npx ts-node --transpile-only prisma/smoke-adjust.ts
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { SalesService } from '../src/sales/sales.service';
import { AdjustmentsService } from '../src/sales/adjustments.service';
import { LedgerService } from '../src/sales/ledger.service';
import { CustomersService } from '../src/sales/customers.service';
import { InventoryOperationService } from '../src/inventory-operation/inventory-operation.service';

const TAG = 'SMOKE-ADJUST';
const prisma = new PrismaClient();

let failures = 0;

function check(label: string, actual: number, expected: number) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(
    `${ok ? '✅' : '❌'}  ${label}: ${actual.toLocaleString('en-US')}` +
      (ok ? '' : `  (انتظار: ${expected.toLocaleString('en-US')})`),
  );
}

function checkStr(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'}  ${label}: ${actual}` + (ok ? '' : `  (انتظار: ${expected})`));
}

async function stockOf(productId: string, warehouseId: string): Promise<number> {
  const agg = await prisma.inventory.aggregate({
    where: { productId, location: { warehouseId } },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const sales = app.get(SalesService);
  const adjustments = app.get(AdjustmentsService);
  const ledger = app.get(LedgerService);
  const customers = app.get(CustomersService);
  const inventory = app.get(InventoryOperationService);

  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error('کاربری برای تست پیدا نشد');

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

  const customer = await customers.create({
    firstName: TAG,
    lastName: 'مشتری آزمایشی',
    creditLimit: 100_000_000,
    creditDays: 30,
  });

  const makeProduct = async (name: string) =>
    prisma.product.create({
      data: { name, sku: `${TAG}-${name}-${stamp}` },
    });

  const lent = await makeProduct('لنت');
  const roghan = await makeProduct('روغن');
  const cheragh = await makeProduct('چراغ');
  const kasehnamad = await makeProduct('کاسه‌نمد');
  const sarsylinder = await makeProduct('سرسیلندر');

  const productIds = [lent.id, roghan.id, cheragh.id, kasehnamad.id, sarsylinder.id];

  try {
    // ---- ۱) موجودیِ اولیه ----
    const seed: [typeof lent, number][] = [
      [lent, 20],
      [roghan, 5],
      [cheragh, 10],
      [kasehnamad, 10],
      [sarsylinder, 5],
    ];
    for (const [p, qty] of seed) {
      await inventory.execute({
        type: 'IN',
        productId: p.id,
        locationId: location.id,
        quantity: qty,
        note: `${TAG} اولیه`,
        userId: user.id,
      } as any);
    }

    // ---- ۲) فاکتور اولیه: لنت ۱۰ + روغن ۱ + چراغ ۵، نقد ----
    const invoice = await sales.createInvoice(
      {
        idempotencyKey: `${TAG}-inv-${stamp}`,
        warehouseId: warehouse.id,
        customerId: customer.id,
        note: 'فاکتور اولیه تست',
        lines: [
          { productId: lent.id, quantity: 10, unitPrice: 100_000 },
          { productId: roghan.id, quantity: 1, unitPrice: 200_000 },
          { productId: cheragh.id, quantity: 5, unitPrice: 50_000 },
        ],
        payments: [{ method: 'CASH', amount: 1_450_000 }],
      } as any,
      user.id,
    );
    check('فاکتور اولیه مبلغ کل', invoice.total, 1_450_000);
    check('فاکتور اولیه تسویه‌شده', invoice.paidAmount, 1_450_000);

    const saleLogs = await prisma.inventoryLog.findMany({
      where: { invoiceId: invoice.id, action: 'SALE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, productId: true },
    });
    const logOf = (productId: string) =>
      saleLogs.find((l) => l.productId === productId)!.id;

    check('موجودی پس از فروش — لنت', await stockOf(lent.id, warehouse.id), 10);
    check('موجودی پس از فروش — چراغ', await stockOf(cheragh.id, warehouse.id), 5);

    // ---- ۳) عملیاتِ یکپارچه: ۳ چراغ و ۳ لنت برمی‌گردد، ۲ کاسه‌نمد و ۱ سرسیلندر اضافه می‌شود ----
    const opKey = `${TAG}-op-${stamp}`;
    const dto = {
      idempotencyKey: opKey,
      reason: 'تست دود — مرجوعی و خریدِ هم‌زمان',
      returns: [
        { saleLogId: logOf(cheragh.id), quantity: 3, restock: true },
        { saleLogId: logOf(lent.id), quantity: 3, restock: true },
      ],
      additions: [
        { productId: kasehnamad.id, quantity: 2, unitPrice: 30_000 },
        { productId: sarsylinder.id, quantity: 1, unitPrice: 200_000 },
      ],
      // اختلاف منفی است → بستانکاری در حسابِ مشتری.
      settlement: { method: 'CREDIT' },
    };

    const res = await adjustments.adjust(invoice.id, dto as any, user.id);

    // مانده‌های ردیف‌ها در پاسخ
    const lineOf = (name: string) =>
      res.lines.find((l) => l.productName === name)!;

    check('چراغ — مرجوعی', lineOf('چراغ').returnedQuantity, 3);
    check('چراغ — باقی‌مانده', lineOf('چراغ').currentQuantity, 2);
    checkStr('چراغ — وضعیت', lineOf('چراغ').lineStatus, 'PARTIALLY_RETURNED');
    check('لنت — مرجوعی', lineOf('لنت').returnedQuantity, 3);
    check('لنت — باقی‌مانده', lineOf('لنت').currentQuantity, 7);
    check('روغن — باقی‌مانده', lineOf('روغن').currentQuantity, 1);
    checkStr('روغن — وضعیت', lineOf('روغن').lineStatus, 'ACTIVE');
    check('کاسه‌نمد — افزوده', lineOf('کاسه‌نمد').addedQuantity, 2);
    checkStr('کاسه‌نمد — وضعیت', lineOf('کاسه‌نمد').lineStatus, 'ADDED_LATER');
    check('سرسیلندر — افزوده', lineOf('سرسیلندر').addedQuantity, 1);

    check('مالی — ارزش مرجوعی', res.invoice.refundAmount, 450_000); // ۳×۵۰ + ۳×۱۰۰
    check('مالی — ارزش افزوده', res.invoice.additionsAmount, 260_000); // ۲×۳۰ + ۱×۲۰۰
    check('مالی — اختلاف', res.invoice.difference, -190_000);
    checkStr('تسویه — جهت', res.settlement.direction, 'PAY');
    check('تسویه — مبلغ', res.settlement.amount, 190_000);
    checkStr('تسویه — روش', res.settlement.method ?? '', 'CREDIT');

    // موجودیِ واقعیِ انبار: برگشتی‌ها برگشتند، افزوده‌ها کم شدند.
    check('موجودی نهایی — لنت (۲۰−۱۰+۳)', await stockOf(lent.id, warehouse.id), 13);
    check('موجودی نهایی — روغن', await stockOf(roghan.id, warehouse.id), 4);
    check('موجودی نهایی — چراغ (۱۰−۵+۳)', await stockOf(cheragh.id, warehouse.id), 8);
    check('موجودی نهایی — کاسه‌نمد (۱۰−۲)', await stockOf(kasehnamad.id, warehouse.id), 8);
    check('موجودی نهایی — سرسیلندر (۵−۱)', await stockOf(sarsylinder.id, warehouse.id), 4);

    // دفترِ مشتری: −۴۵۰ (مرجوعی) + ۲۶۰ (افزوده) = −۱۹۰ (بستانکار).
    check('دفتر مشتری — مانده', await ledger.balance(customer.id), -190_000);

    // ---- ۴) تکرار همان درخواست با همان کلید — هیچ اثر اضافه‌ای ----
    const again = await adjustments.adjust(invoice.id, dto as any, user.id);
    checkStr('retry — همان operationKey', again.operationKey, res.operationKey);
    check('retry — همان اختلاف', again.invoice.difference, -190_000);
    const retCount = await prisma.saleReturn.count({ where: { operationKey: res.operationKey } });
    const corrCount = await prisma.saleCorrection.count({
      where: { operationKey: res.operationKey },
    });
    check('retry — یک سندِ مرجوعی بیشتر نه', retCount, 1);
    check('retry — یک سندِ اصلاحیه بیشتر نه', corrCount, 1);
    check('retry — دفتر دست نخورده', await ledger.balance(customer.id), -190_000);
    check('retry — موجودی دست نخورده', await stockOf(cheragh.id, warehouse.id), 8);

  } finally {
    // پاک‌سازی — این اسکریپت روی دیتابیس واقعی اجرا می‌شود.
    await prisma.saleCorrectionLine.deleteMany({
      where: { correction: { operationKey: { startsWith: `${TAG}-op-` } } },
    });
    await prisma.saleCorrection.deleteMany({
      where: { operationKey: { startsWith: `${TAG}-op-` } },
    });
    await prisma.saleReturnLine.deleteMany({
      where: { saleReturn: { operationKey: { startsWith: `${TAG}-op-` } } },
    });
    await prisma.saleReturn.deleteMany({
      where: { operationKey: { startsWith: `${TAG}-op-` } },
    });
    // همه‌ی ردیف‌های InventoryLogِ این محصولات (فروش، ورودِ اولیه، برگشت،
    // اصلاحیه) — هم آن‌هایی که به فاکتور وصل‌اند هم ورودی‌های مستقل.
    await prisma.inventoryLog.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.payment.deleteMany({
      where: { invoice: { customerId: customer.id } },
    });
    await prisma.saleInvoice.deleteMany({ where: { customerId: customer.id } });
    await prisma.customerLedger.deleteMany({ where: { customerId: customer.id } });
    await prisma.customerPhone.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.productPrice.deleteMany({
      where: { productId: { in: productIds } },
    });
    // موجودیِ باقی‌مانده در هر قفسه‌ای (از جمله مکانِ سیستمیِ «موجودی ثبت‌نشده»)
    // قبل از حذفِ خودِ محصولات.
    await prisma.inventory.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.location.deleteMany({ where: { warehouseId: warehouse.id } });
    await prisma.locationType.deleteMany({ where: { warehouseId: warehouse.id } });
    await prisma.warehouse.delete({ where: { id: warehouse.id } });

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
