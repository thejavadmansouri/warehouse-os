/**
 * تست دود برای «برگشتِ پرداخت» (PaymentReversal).
 *
 * سناریوی واقعیِ مغازه:
 *   ۱) فاکتورِ کارتی: لنت ۱۰ × ۱۰۰٬۰۰۰ (۱٬۰۰۰٬۰۰۰ — کاملاً پرداخت‌شده با کارتخوان)
 *   ۲) کارتخوان تراکنش را برگشت می‌زند → برگشتِ کامل پرداخت
 *   ۳) فاکتورِ دومِ کارتیِ ۱٬۰۰۰٬۰۰۰ با ۵۰۰٬۰۰۰ پرداخت‌شده → برگشتِ جزئیِ ۲۰۰٬۰۰۰
 *
 * سپس بررسی می‌شود:
 *   • مانده‌ی فاکتور به بدهی برمی‌گردد (paidAmount/dueAmount)
 *   • مانده‌ی دفتر = SUM(amount) — مشتری بدهکار می‌شود
 *   • ردیفِ Payment منفی ثبت شده و جمعِ پرداخت‌های فاکتور درست است
 *   • ردیفِ دفترِ PAYMENT_REVERSED به سندِ برگشت وصل است
 *   • قواعدِ رد: مازاد بر پرداخت‌شده (REVERSAL_EXCEEDS_PAID)، نسیه
 *     (INVALID_METHOD)، فاکتورِ بی‌پرداخت (NOTHING_PAID)
 *   • retry با همان idempotencyKey همان سند را می‌دهد و ردیفِ اضافه نمی‌سازد
 *
 * همه‌چیز از سرِ سرویس‌های واقعی می‌گذرد و در پایان داده‌ی خودش را پاک می‌کند.
 *
 * اجرا:  npx ts-node --transpile-only prisma/smoke-payment-reversal.ts
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { SalesService } from '../src/sales/sales.service';
import { PaymentReversalsService } from '../src/sales/payment-reversals.service';
import { LedgerService } from '../src/sales/ledger.service';
import { CustomersService } from '../src/sales/customers.service';
import { InventoryOperationService } from '../src/inventory-operation/inventory-operation.service';

const TAG = 'SMOKE-PAYREV';
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

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const sales = app.get(SalesService);
  const reversals = app.get(PaymentReversalsService);
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

  const lent = await prisma.product.create({
    data: { name: 'لنت', sku: `${TAG}-lent-${stamp}` },
  });

  try {
    await inventory.execute({
      type: 'IN',
      productId: lent.id,
      locationId: location.id,
      quantity: 40,
      note: `${TAG} اولیه`,
      userId: user.id,
    } as any);

    // ---- ۱) فاکتورِ کارتیِ تسویه‌شده ----
    const invoice = await sales.createInvoice(
      {
        idempotencyKey: `${TAG}-inv1-${stamp}`,
        warehouseId: warehouse.id,
        customerId: customer.id,
        note: 'فاکتور تستِ برگشتِ پرداخت',
        lines: [{ productId: lent.id, quantity: 10, unitPrice: 100_000 }],
        payments: [{ method: 'CARD', amount: 1_000_000 }],
      } as any,
      user.id,
    );
    check('فاکتور ۱ — مبلغ کل', invoice.total, 1_000_000);
    check('فاکتور ۱ — پرداخت‌شده', invoice.paidAmount, 1_000_000);
    check('دفتر — حساب صفر', await ledger.balance(customer.id), 0);

    // ---- ۲) کارتخوان برگشت زد → برگشتِ کامل ----
    const rev1 = await reversals.reverse(
      invoice.id,
      {
        idempotencyKey: `${TAG}-rev1-${stamp}`,
        amount: 1_000_000,
        method: 'CARD',
        reason: 'کارتخوان تراکنش را برگشت زد',
      } as any,
      user.id,
    );
    checkStr('سند برگشت — روش', rev1.method, 'CARD');

    const inv1 = await prisma.saleInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    check('فاکتور ۱ — پرداخت‌شده پس از برگشت', inv1.paidAmount, 0);
    check('فاکتور ۱ — مانده (بدهی) پس از برگشت', inv1.dueAmount, 1_000_000);
    check('دفتر — بدهکاریِ مشتری', await ledger.balance(customer.id), 1_000_000);

    const paySum = await prisma.payment.aggregate({
      where: { invoiceId: invoice.id },
      _sum: { amount: true },
    });
    check('پرداخت‌های فاکتور (جمع با ردیفِ منفی)', paySum._sum.amount ?? 0, 0);

    const led1 = await prisma.customerLedger.findFirst({
      where: { reversalId: rev1.id },
    });
    const okLed =
      !!led1 && led1.type === 'PAYMENT_REVERSED' && led1.amount === 1_000_000;
    if (!okLed) failures++;
    console.log(`${okLed ? '✅' : '❌'}  لجر — ردیفِ PAYMENT_REVERSED وصل به سندِ برگشت`);

    // ---- ۳) retry با همان کلید = همان سند، بدون اثرِ اضافه ----
    const retry1 = await reversals.reverse(
      invoice.id,
      {
        idempotencyKey: `${TAG}-rev1-${stamp}`,
        amount: 1_000_000,
        method: 'CARD',
        reason: 'کارتخوان تراکنش را برگشت زد',
      } as any,
      user.id,
    );
    checkStr('retry — همان سند', retry1.id, rev1.id);    check('retry — لجر دست نخورده', await ledger.balance(customer.id), 1_000_000);
    check(
      'retry — سندهای برگشت همچنان یکی',
      (await prisma.paymentReversal.findMany({ where: { invoiceId: invoice.id } })).length,
      1,
    );

    // ---- ۴) فاکتورِ دوم: برگشتِ جزئی ----
    const invoice2 = await sales.createInvoice(
      {
        idempotencyKey: `${TAG}-inv2-${stamp}`,
        warehouseId: warehouse.id,
        customerId: customer.id,
        note: 'فاکتور دوم — پرداختِ نصفه',
        lines: [{ productId: lent.id, quantity: 10, unitPrice: 100_000 }],
        payments: [{ method: 'CARD', amount: 500_000 }],
      } as any,
      user.id,
    );
    check('فاکتور ۲ — مانده', invoice2.dueAmount, 500_000);
    // ۱٬۰۰۰٬۰۰۰ (برگشتِ کاملِ فاکتور ۱ که در دفتر مانده) + ۵۰۰٬۰۰۰ (بدهیِ ماندهٔ فاکتور ۲)
    check('دفتر — بدهیِ ماندهٔ فاکتور ۲', await ledger.balance(customer.id), 1_500_000);

    const rev2 = await reversals.reverse(
      invoice2.id,
      {
        idempotencyKey: `${TAG}-rev2-${stamp}`,
        amount: 200_000,
        method: 'CASH',
        reason: 'بانک رد کرد — برگشتِ جزئی',
      } as any,
      user.id,
    );
    const inv2 = await prisma.saleInvoice.findUniqueOrThrow({ where: { id: invoice2.id } });
    check('فاکتور ۲ — پرداخت‌شده پس از برگشتِ جزئی', inv2.paidAmount, 300_000);
    check('فاکتور ۲ — مانده پس از برگشتِ جزئی', inv2.dueAmount, 700_000);
    // ۱٬۰۰۰٬۰۰۰ (برگشتِ کاملِ فاکتور ۱) + ۵۰۰٬۰۰۰ (بدهیِ واقعیِ ماندهٔ فاکتور ۲)
    // + ۲۰۰٬۰۰۰ (برگشتِ جزئی) — برگشت، بدهیِ برمی‌گرداند؛ بدهیِ باقی‌مانده هم بدهی است.
    check('دفتر — جمع', await ledger.balance(customer.id), 1_700_000);

    // ---- ۵) قواعدِ رد ----
    await expectReject(
      'برگشتِ بیشتر از پرداخت‌شده',
      'REVERSAL_EXCEEDS_PAID',
      () =>
        reversals.reverse(
          invoice2.id,
          { idempotencyKey: `${TAG}-bad1-${stamp}`, amount: 400_000, method: 'CARD', reason: 'نباید قبول شود' } as any,
          user.id,
        ),
    );
    await expectReject(
      'نسیه روشِ برگشت نیست',
      'INVALID_METHOD',
      () =>
        reversals.reverse(
          invoice2.id,
          { idempotencyKey: `${TAG}-bad2-${stamp}`, amount: 100_000, method: 'CREDIT', reason: 'نباید قبول شود' } as any,
          user.id,
        ),
    );

    const noPayInvoice = await sales.createInvoice(
      {
        idempotencyKey: `${TAG}-inv3-${stamp}`,
        warehouseId: warehouse.id,
        customerId: customer.id,
        note: 'فاکتورِ نسیهِ خالص',
        lines: [{ productId: lent.id, quantity: 1, unitPrice: 100_000 }],
        // payments خالی یعنی فروشِ نقدیِ کامل؛ نسیه باید صراحتاً CREDIT باشد.
        payments: [{ method: 'CREDIT', amount: 100_000 }],
      } as any,
      user.id,
    );
    await expectReject(
      'فاکتورِ بی‌پرداخت',
      'NOTHING_PAID',
      () =>
        reversals.reverse(
          noPayInvoice.id,
          { idempotencyKey: `${TAG}-bad3-${stamp}`, amount: 50_000, method: 'CARD', reason: 'نباید قبول شود' } as any,
          user.id,
        ),
    );
  } finally {
    // پاک‌سازی — این اسکریپت روی دیتابیس واقعی اجرا می‌شود.
    await prisma.customerLedger.deleteMany({ where: { customerId: customer.id } });
    await prisma.paymentReversal.deleteMany({ where: { invoice: { customerId: customer.id } } });
    await prisma.payment.deleteMany({ where: { invoice: { customerId: customer.id } } });
    await prisma.saleInvoice.deleteMany({ where: { customerId: customer.id } });
    await prisma.inventoryLog.deleteMany({ where: { productId: lent.id } });
    await prisma.customerPhone.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.productPrice.deleteMany({ where: { productId: lent.id } });
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

function checkStr(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'}  ${label}: ${actual}` + (ok ? '' : `  (انتظار: ${expected})`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
