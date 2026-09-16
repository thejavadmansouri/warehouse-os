/**
 * تست دود برای «پرداخت به مشتری بستانکار» (CustomerPayout).
 *
 * سناریوی واقعی:
 *   ۱) فاکتورِ نقدی: لنت ۱۰ × ۱۰۰٬۰۰۰ (۱٬۰۰۰٬۰۰۰ — کاملاً تسویه‌شده)
 *   ۲) ۱۰ روز بعد، مشتری ۳ لنت پس می‌دهد → اختلاف −۳۰۰٬۰۰۰ به حسابش اعتبار می‌شود
 *   ۳) فروشگاه ۲۰۰٬۰۰۰ نقد به او پرداخت می‌کند → بستانکاری ۱۰۰٬۰۰۰ می‌ماند
 *   ۴) باقی ۱۰۰٬۰۰۰ با چک پرداخت می‌شود → حساب صفر می‌شود
 *
 * سپس بررسی می‌شود:
 *   • مانده‌ی دفتر در هر گام دقیقاً همان عدد است (SUM(amount) تنها منبعِ حقیقت)
 *   • ردیف‌های PAYOUT در دفتر مثبت‌اند و به سندِ پرداخت وصل‌اند
 *   • چکِ پرداختی با شماره/بانک/سررسید روی سند می‌نشیند
 *   • قواعدِ رد: پرداختِ بی‌بستانکاری (NO_CREDIT)، مازاد بر اعتبار
 *     (EXCEEDS_CREDIT)، مبلغِ صفر، نسیه، بی‌دلیل
 *   • retry با همان idempotencyKey همان سند را می‌دهد و هیچ ردیفِ اضافه‌ای
 *     (سند، لجر) نمی‌سازد
 *
 * همه‌چیز از سرِ سرویس‌های واقعی (SalesService → AdjustmentsService →
 * PayoutsService) می‌گذرد و در پایان داده‌ی خودش را پاک می‌کند.
 *
 * اجرا:  npx ts-node --transpile-only prisma/smoke-payout.ts
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { SalesService } from '../src/sales/sales.service';
import { AdjustmentsService } from '../src/sales/adjustments.service';
import { LedgerService } from '../src/sales/ledger.service';
import { PayoutsService } from '../src/sales/payouts.service';
import { CustomersService } from '../src/sales/customers.service';
import { InventoryOperationService } from '../src/inventory-operation/inventory-operation.service';

const TAG = 'SMOKE-PAYOUT';
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

/** خطایِ منتظرشده را می‌گیریم و کدِ خطا را برمی‌گردانیم — هر چیزِ دیگر = رد. */
async function expectReject(
  label: string,
  expectedError: string,
  run: () => Promise<unknown>,
) {
  try {
    await run();
    failures++;
    console.log(`❌  ${label}: رد نشد! (انتظار: ${expectedError})`);
  } catch (e: any) {
    const code = e?.response?.error ?? e?.getError?.() ?? '';
    const ok = code === expectedError;
    if (!ok) failures++;
    console.log(
      `${ok ? '✅' : '❌'}  ${label}: ${code || '(بدون کد)'}` +
        (ok ? '' : `  (انتظار: ${expectedError})`),
    );
  }
}

async function payoutRowsOf(customerId: string) {
  return prisma.customerPayout.findMany({
    where: { customerId },
    orderBy: { number: 'asc' },
  });
}

async function payoutLedgerRowsOf(customerId: string) {
  return prisma.customerLedger.findMany({
    where: { customerId, type: 'PAYOUT' },
    orderBy: { createdAt: 'asc' },
  });
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const sales = app.get(SalesService);
  const adjustments = app.get(AdjustmentsService);
  const ledger = app.get(LedgerService);
  const payouts = app.get(PayoutsService);
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

  const lent = await prisma.product.create({
    data: { name: 'لنت', sku: `${TAG}-lent-${stamp}` },
  });

  try {
    // ---- ۱) موجودیِ اولیه و فاکتورِ نقدیِ تسویه‌شده ----
    await inventory.execute({
      type: 'IN',
      productId: lent.id,
      locationId: location.id,
      quantity: 20,
      note: `${TAG} اولیه`,
      userId: user.id,
    } as any);

    const invoice = await sales.createInvoice(
      {
        idempotencyKey: `${TAG}-inv-${stamp}`,
        warehouseId: warehouse.id,
        customerId: customer.id,
        note: 'فاکتور تستِ پرداخت به مشتری',
        lines: [{ productId: lent.id, quantity: 10, unitPrice: 100_000 }],
        payments: [{ method: 'CASH', amount: 1_000_000 }],
      } as any,
      user.id,
    );
    check('فاکتور — مبلغ کل', invoice.total, 1_000_000);
    check('فاکتور — تسویه‌شده', invoice.paidAmount, 1_000_000);
    check('دفتر — حساب صفر', await ledger.balance(customer.id), 0);

    // ---- ۲) قبل از بستانکاری، هر پرداختی رد است ----
    await expectReject(
      'پرداخت به مشتریِ تسویه‌شده',
      'NO_CREDIT',
      () =>
        payouts.create(
          {
            customerId: customer.id,
            amount: 100_000,
            method: 'CASH',
            reason: 'نباید قبول شود',
          } as any,
          user.id,
        ),
    );

    // ---- ۳) مرجوعی: ۳ لنت پس می‌دهد → ۳۰۰٬۰۰۰ بستانکار می‌شود ----
    const saleLog = await prisma.inventoryLog.findFirst({
      where: { invoiceId: invoice.id, action: 'SALE', productId: lent.id },
      select: { id: true },
    });
    if (!saleLog) throw new Error('ردیفِ فروشِ فاکتور پیدا نشد');

    const adj = await adjustments.adjust(
      invoice.id,
      {
        idempotencyKey: `${TAG}-adj-${stamp}`,
        reason: 'تست دود — برگشت ۳ لنت',
        returns: [{ saleLogId: saleLog.id, quantity: 3, restock: true }],
        settlement: { method: 'CREDIT' },
      } as any,
      user.id,
    );
    check('مرجوعی — اختلاف', adj.invoice.difference, -300_000);
    check('دفتر — بستانکاری', await ledger.balance(customer.id), -300_000);

    // ---- ۴) قواعدِ رد ----
    await expectReject(
      'مبلغِ صفر',
      'INVALID_AMOUNT',
      () =>
        payouts.create(
          { customerId: customer.id, amount: 0, method: 'CASH', reason: 'صفر' } as any,
          user.id,
        ),
    );
    await expectReject(
      'نسیه روشِ پرداخت نیست',
      'INVALID_METHOD',
      () =>
        payouts.create(
          {
            customerId: customer.id,
            amount: 100_000,
            method: 'CREDIT',
            reason: 'نسیه',
          } as any,
          user.id,
        ),
    );
    await expectReject(
      'بی‌دلیل',
      'REASON_REQUIRED',
      () =>
        payouts.create(
          {
            customerId: customer.id,
            amount: 100_000,
            method: 'CASH',
            reason: '   ',
          } as any,
          user.id,
        ),
    );
    await expectReject(
      'چکِ بی‌مشخصات',
      'CHEQUE_DETAILS_REQUIRED',
      () =>
        payouts.create(
          {
            customerId: customer.id,
            amount: 100_000,
            method: 'CHEQUE',
            reason: 'چک بدون مشخصات',
          } as any,
          user.id,
        ),
    );
    await expectReject(
      'مازاد بر بستانکاری',
      'EXCEEDS_CREDIT',
      () =>
        payouts.create(
          {
            customerId: customer.id,
            amount: 500_000,
            method: 'CASH',
            reason: 'بیشتر از اعتبار',
          } as any,
          user.id,
        ),
    );
    check('دفتر — بعد از ردها دست نخورده', await ledger.balance(customer.id), -300_000);
    check('سندِ پرداختِ اضافه‌ای ساخته نشد', (await payoutRowsOf(customer.id)).length, 0);

    // ---- ۵) پرداختِ اول: ۲۰۰٬۰۰۰ نقد ----
    const po1 = await payouts.create(
      {
        idempotencyKey: `${TAG}-po1-${stamp}`,
        customerId: customer.id,
        amount: 200_000,
        method: 'CASH',
        reason: 'تسویه بستانکاری مرجوعی',
      } as any,
      user.id,
    );
    checkStr('پرداخت ۱ — روش', po1.method, 'CASH');
    check('دفتر — پس از پرداخت ۱', await ledger.balance(customer.id), -100_000);

    const ledger1 = await payoutLedgerRowsOf(customer.id);
    check('لجر — یک ردیفِ PAYOUT', ledger1.length, 1);
    check('لجر — مبلغِ مثبتِ PAYOUT', ledger1[0]?.amount ?? 0, 200_000);
    checkStr(
      'لجر — پیوندِ سندِ پرداخت',
      ledger1[0]?.payoutId === po1.id ? 'وصل' : 'قطع',
      'وصل',
    );
    const zeroed = ledger1.filter((r) => r.amount === 0).length;
    check('لجر — ردیفِ صفرِ بی‌اثر وجود ندارد', zeroed, 0);

    // ---- ۶) retry با همان کلید — همان سند، بدون هیچ اثرِ اضافه ----
    const retry1 = await payouts.create(
      {
        idempotencyKey: `${TAG}-po1-${stamp}`,
        customerId: customer.id,
        amount: 200_000,
        method: 'CASH',
        reason: 'تسویه بستانکاری مرجوعی',
      } as any,
      user.id,
    );
    checkStr('retry — همان سند', retry1.id, po1.id);
    check('retry — همان شماره', retry1.number, po1.number);
    check('سند — همچنان یکی', (await payoutRowsOf(customer.id)).length, 1);
    check('لجر — همچنان یک ردیف', (await payoutLedgerRowsOf(customer.id)).length, 1);
    check('retry — دفتر دست نخورده', await ledger.balance(customer.id), -100_000);

    // ---- ۷) پرداختِ دوم: ۱۰۰٬۰۰۰ باقی‌مانده با چک → حساب صفر ----
    const po2 = await payouts.create(
      {
        idempotencyKey: `${TAG}-po2-${stamp}`,
        customerId: customer.id,
        amount: 100_000,
        method: 'CHEQUE',
        reason: 'باقی‌مانده‌ی بستانکاری',
        cheque: {
          number: `CH-${stamp}`,
          bankName: 'بانک آزمایشی',
          dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        },
      } as any,
      user.id,
    );
    checkStr('پرداخت ۲ — روش', po2.method, 'CHEQUE');
    checkStr('پرداخت ۲ — شماره چک', po2.chequeNumber ?? '', `CH-${stamp}`);
    checkStr('پرداخت ۲ — بانک', po2.bankName ?? '', 'بانک آزمایشی');
    check('پرداخت ۲ — شماره‌ی پیوسته', po2.number, po1.number + 1);
    check('دفتر — تسویه کامل', await ledger.balance(customer.id), 0);

    const ledger2 = await payoutLedgerRowsOf(customer.id);
    check('لجر — دو ردیفِ PAYOUT', ledger2.length, 2);
    check('لجر — جمعِ پرداخت‌ها', ledger2.reduce((s, r) => s + r.amount, 0), 300_000);

    // ---- ۸) بعد از تسویه، پرداختِ تازه دوباره رد است ----
    await expectReject(
      'پرداخت بعد از تسویه',
      'NO_CREDIT',
      () =>
        payouts.create(
          {
            customerId: customer.id,
            amount: 50_000,
            method: 'CASH',
            reason: 'حساب صفر شد',
          } as any,
          user.id,
        ),
    );
    check('سند — همان دو سند', (await payoutRowsOf(customer.id)).length, 2);

  } finally {
    // پاک‌سازی — این اسکریپت روی دیتابیس واقعی اجرا می‌شود.
    await prisma.customerLedger.deleteMany({ where: { customerId: customer.id } });
    await prisma.customerPayout.deleteMany({ where: { customerId: customer.id } });
    await prisma.saleCorrectionLine.deleteMany({
      where: { correction: { operationKey: { startsWith: `${TAG}-` } } },
    });
    await prisma.saleCorrection.deleteMany({
      where: { operationKey: { startsWith: `${TAG}-` } },
    });
    await prisma.saleReturnLine.deleteMany({
      where: { saleReturn: { operationKey: { startsWith: `${TAG}-` } } },
    });
    await prisma.saleReturn.deleteMany({
      where: { operationKey: { startsWith: `${TAG}-` } },
    });
    await prisma.inventoryLog.deleteMany({ where: { productId: lent.id } });
    await prisma.payment.deleteMany({ where: { invoice: { customerId: customer.id } } });
    await prisma.saleInvoice.deleteMany({ where: { customerId: customer.id } });
    await prisma.customerPhone.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.productPrice.deleteMany({ where: { productId: lent.id } });
    // موجودیِ باقی‌مانده در هر قفسه‌ای، قبل از حذفِ خودِ محصول.
    await prisma.inventory.deleteMany({ where: { productId: lent.id } });
    await prisma.product.delete({ where: { id: lent.id } });
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
