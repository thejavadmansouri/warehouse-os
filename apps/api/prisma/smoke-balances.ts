/**
 * تست دود برای «حساب‌بازها» — فهرستِ بدهکار/طلبکار از خودِ دفتر
 * (GET /sales/customer-balances ← LedgerService.accountBalances).
 *
 * سناریوی واقعیِ مغازه:
 *   ۱) مشتریِ «جاری» نسیه ۱٬۰۰۰٬۰۰۰ می‌برد (سررسید ۳۰ روز → سطلِ جاری)
 *   ۲) مشتریِ «معوق» نسیه ۵۰۰٬۰۰۰ می‌برد و سررسیدش را دیروز می‌کنیم
 *   ۳) فهرست: معوق اول (به بدیِ وضعیت)، جاری بعدش — فیلدِ balance علامت‌دار
 *   ۴) ۴۰۰٬۰۰۰ نقد از جاری می‌گیریم → مانده ۶۰۰٬۰۰۰؛ فهرست همان لحظه درست
 *   ۵) retry با همان idempotencyKey → همان رسید، بدون هیچ اثرِ اضافه
 *   ۶) ۶۰۰٬۰۰۰ باقی را می‌گیریم → حسابش صفر → از فهرست می‌رود
 *   ۷) سه لنت پس می‌دهد (اعتبار) → ۳۰۰٬۰۰۰ طلبکار → در فهرست، آخرِ صف
 *   ۸) ۳۰۰٬۰۰۰ به او پرداخت می‌کنیم → صفر → باز از فهرست می‌رود
 *   ۹) جست‌وجو با q فقط همان را می‌آورد
 *
 * در هر گام، مانده‌ی دفتر و عددِ فهرست باید یکی باشند — «یک فرمول» بودنِ
 * accountBalances با گزارش مطالبات هم بررسی می‌شود.
 *
 * همه‌چیز از سرِ سرویس‌های واقعی می‌گذرد و در پایان داده‌ی خودش پاک می‌شود.
 *
 * اجرا:  npx ts-node --transpile-only prisma/smoke-balances.ts
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { SalesService } from '../src/sales/sales.service';
import { AdjustmentsService } from '../src/sales/adjustments.service';
import { LedgerService } from '../src/sales/ledger.service';
import { ReceiptsService } from '../src/sales/receipts.service';
import { PayoutsService } from '../src/sales/payouts.service';
import { CustomersService } from '../src/sales/customers.service';
import { InventoryOperationService } from '../src/inventory-operation/inventory-operation.service';

const TAG = 'SMOKE-BALANCES';
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

/** مانده‌ی مشتری در فهرست — غایب بودن هم «۰» حساب می‌شود تا با دفتر مقایسه شود. */
async function listBalanceOf(customerId: string): Promise<number> {
  const rows = await ledgerOfApp.accountBalances();
  const row = rows.find((r) => r.id === customerId);
  return row ? (row as { balance: number }).balance : 0;
}

/** نمونه‌ی سرویس‌ها — در main پر می‌شود. */
let ledgerOfApp: LedgerService;
let receiptsOfApp: ReceiptsService;
let payoutsOfApp: PayoutsService;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const sales = app.get(SalesService);
  const adjustments = app.get(AdjustmentsService);
  const ledger = app.get(LedgerService);
  const receipts = app.get(ReceiptsService);
  const payouts = app.get(PayoutsService);
  const customers = app.get(CustomersService);
  const inventory = app.get(InventoryOperationService);
  ledgerOfApp = ledger;
  receiptsOfApp = receipts;
  payoutsOfApp = payouts;

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

  // دو مشتری با نام‌های جدا — جست‌وجوی q باید فقط همان را بیاورد.
  const a = await customers.create({
    firstName: TAG,
    lastName: 'جاریِ آزمایشی',
    creditLimit: 100_000_000,
    creditDays: 30,
  });
  const b = await customers.create({
    firstName: TAG,
    lastName: 'معوقِ آزمایشی',
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

    // ---- ۱) مشتریِ جاری: نسیه ۱٬۰۰۰٬۰۰۰ ----
    const invA = await sales.createInvoice(
      {
        idempotencyKey: `${TAG}-invA-${stamp}`,
        warehouseId: warehouse.id,
        customerId: a.id,
        note: 'تست دود — نسیه‌ی جاری',
        lines: [{ productId: lent.id, quantity: 10, unitPrice: 100_000 }],
        payments: [{ method: 'CREDIT', amount: 1_000_000 }],
      } as any,
      user.id,
    );
    check('فاکتور جاری — مانده', invA.dueAmount, 1_000_000);
    check('فاکتور جاری — وضعیت CONFIRMED', invA.status === 'CONFIRMED' ? 1 : 0, 1);
    check('دفتر جاری — بدهی', await ledger.balance(a.id), 1_000_000);

    // ---- ۲) مشتریِ معوق: نسیه ۵۰۰٬۰۰۰ و سررسیدِ دیروز ----
    const invB = await sales.createInvoice(
      {
        idempotencyKey: `${TAG}-invB-${stamp}`,
        warehouseId: warehouse.id,
        customerId: b.id,
        note: 'تست دود — نسیه‌ی معوق',
        lines: [{ productId: lent.id, quantity: 5, unitPrice: 100_000 }],
        payments: [{ method: 'CREDIT', amount: 500_000 }],
      } as any,
      user.id,
    );
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);
    await prisma.saleInvoice.update({
      where: { id: invB.id },
      data: { dueDate: yesterday },
    });
    check('دفتر معوق — بدهی', await ledger.balance(b.id), 500_000);

    /*
     * ---- ۳) فهرست: ترتیب + شکلِ قرارداد ----
     *
     * دیتابیس مشتری‌های مانده‌دارِ دیگر هم دارد — پس هیچ بررسی‌ای سرِ جایگاه
     * (rows[0], rows[1]) نیست؛ همه بر اساس شناسه‌ی مشتری‌های خودِ این تست.
     */
    let rows = await ledger.accountBalances();
    const rowA = rows.find((r) => r.id === a.id) as any | undefined;
    const rowB = rows.find((r) => r.id === b.id) as any | undefined;
    checkStr('فهرست — معوق در فهرست است', rowB ? 'هست' : 'نیست', 'هست');
    checkStr('فهرست — جاری در فهرست است', rowA ? 'هست' : 'نیست', 'هست');
    checkStr('فهرست — هر دو بدهکار', `${rowA?.kind}/${rowB?.kind}`, 'debtor/debtor');
    // معوق باید قبل از جاری بیاید — به بدیِ وضعیت.
    check(
      'فهرست — معوق قبل از جاری',
      rows.findIndex((r) => r.id === b.id) < rows.findIndex((r) => r.id === a.id) ? 1 : 0,
      1,
    );
    check('فهرست — معوقِ سطل', rowB?.overdue ?? -1, 500_000);
    check('فهرست — جاریِ سطل', rowA?.current ?? -1, 1_000_000);
    check('فهرست — جاری: شمارش فاکتور', rowA?.invoiceCount ?? -1, 1);
    checkStr(
      'فهرست — سررسیدِ جاری ثبت است',
      rowA?.nextDueDate ? 'هست' : 'نیست',
      'هست',
    );
    checkStr(
      'قرارداد فهرست — فیلدِ balance علامت‌دار',
      rows.length > 0 && 'balance' in rows[0] && !('totalDue' in rows[0]) ? 'درست' : 'خراب',
      'درست',
    );

    // «یک فرمول»: گزارش مطالبات هم همین دو را با همین مانده می‌بیند.
    const debtors = await ledger.debtors();
    const dA = debtors.data.find((r) => r.id === a.id);
    const dB = debtors.data.find((r) => r.id === b.id);
    checkStr('گزارش مطالبات — جاری حاضر', dA ? 'هست' : 'نیست', 'هست');
    checkStr('گزارش مطالبات — معوق حاضر', dB ? 'هست' : 'نیست', 'هست');
    check('گزارش مطالبات — مانده‌ی جاری', dA?.totalDue ?? -1, 1_000_000);
    check('گزارش مطالبات — مانده‌ی معوق', dB?.totalDue ?? -1, 500_000);

    // ---- ۴) رسید ۱: ۴۰۰٬۰۰۰ نقد از جاری ----
    const rc1 = await receipts.create(
      {
        idempotencyKey: `${TAG}-rc1-${stamp}`,
        customerId: a.id,
        amount: 400_000,
        method: 'CASH',
        note: 'تست دود — بخش اول',
      } as any,
      user.id,
    );
    check('دفتر جاری — پس از رسید ۱', await ledger.balance(a.id), 600_000);
    check('فاکتور جاری — مانده پس از رسید', invA.dueAmount, 1_000_000); // رکوردِ قبل از رسید — تازه می‌گیریم:
    const invAAfter = await prisma.saleInvoice.findUnique({
      where: { id: invA.id },
      select: { dueAmount: true },
    });
    check('فاکتور جاری — مانده واقعی', invAAfter?.dueAmount ?? -1, 600_000);

    rows = await ledger.accountBalances();
    check('فهرست — همان لحظه پس از رسید', await listBalanceOf(a.id), 600_000);
    check('فهرست — جاریِ سطل تازه', (rows.find((r) => r.id === a.id) as any)?.current ?? -1, 600_000);
    check(
      'فهرست — هر دو مشتری هنوز حاضرند',
      rows.some((r) => r.id === a.id) && rows.some((r) => r.id === b.id) ? 1 : 0,
      1,
    );

    const rcLedger = await prisma.customerLedger.findMany({
      where: { customerId: a.id, type: 'RECEIPT' },
    });
    check('لجر — یک ردیفِ RECEIPT', rcLedger.length, 1);
    check('لجر — RECEIPT منفی', rcLedger[0]?.amount ?? 0, -400_000);
    checkStr(
      'لجر — پیوندِ رسید',
      rcLedger[0]?.receiptId === rc1.id ? 'وصل' : 'قطع',
      'وصل',
    );
    check('لجر — ردیفِ صفرِ بی‌اثر', rcLedger.filter((r) => r.amount === 0).length, 0);

    // ---- ۵) retry با همان کلید — همان رسید، بدون اثرِ اضافه ----
    const retry = await receipts.create(
      {
        idempotencyKey: `${TAG}-rc1-${stamp}`,
        customerId: a.id,
        amount: 400_000,
        method: 'CASH',
        note: 'تست دود — بخش اول',
      } as any,
      user.id,
    );
    checkStr('retry — همان رسید', retry.id, rc1.id);
    check('retry — همان شماره', retry.number, rc1.number);
    check('رسید — همچنان یکی', await prisma.receipt.count({ where: { customerId: a.id } }), 1);
    check('لجر — همچنان یک ردیف', rcLedger.length, 1);
    check('retry — دفتر دست نخورده', await ledger.balance(a.id), 600_000);

    // ---- ۶) رسید ۲: ۶۰۰٬۰۰۰ باقی → حساب صفر → از فهرست می‌رود ----
    await receipts.create(
      {
        idempotencyKey: `${TAG}-rc2-${stamp}`,
        customerId: a.id,
        amount: 600_000,
        method: 'CARD',
        note: 'تست دود — تسویه کامل',
      } as any,
      user.id,
    );
    check('دفتر جاری — تسویه کامل', await ledger.balance(a.id), 0);
    check('فهرست — جاری غایب', await listBalanceOf(a.id), 0);
    rows = await ledger.accountBalances();
    checkStr('فهرست — جاری از فهرست رفت', rows.some((r) => r.id === a.id) ? 'مانده' : 'رفت', 'رفت');
    checkStr('فهرست — معوق سر جایش', rows.some((r) => r.id === b.id) ? 'هست' : 'نیست', 'هست');

    // ---- ۷) مرجوعی: سه لنت پس می‌دهد → ۳۰۰٬۰۰۰ طلبکار ----
    const saleLog = await prisma.inventoryLog.findFirst({
      where: { invoiceId: invA.id, action: 'SALE', productId: lent.id },
      select: { id: true },
    });
    if (!saleLog) throw new Error('ردیفِ فروشِ فاکتور جاری پیدا نشد');
    await adjustments.adjust(
      invA.id,
      {
        idempotencyKey: `${TAG}-ret-${stamp}`,
        reason: 'تست دود — برگشت ۳ لنت',
        returns: [{ saleLogId: saleLog.id, quantity: 3, restock: true }],
        settlement: { method: 'CREDIT' },
      } as any,
      user.id,
    );
    check('دفتر جاری — طلبکار', await ledger.balance(a.id), -300_000);

    rows = await ledger.accountBalances();
    const credA = rows.find((r) => r.id === a.id) as any | undefined;
    checkStr('فهرست — طلبکارِ تازه حاضر', credA ? 'هست' : 'نیست', 'هست');
    checkStr('فهرست — نقشِ طلبکار', credA?.kind ?? '-', 'creditor');
    check('فهرست — مانده‌ی منفیِ طلبکار', credA?.balance ?? 0, -300_000);
    // قراردادِ ترتیب: هیچ طلبکاری نباید قبل از بدهکارها بیاید.
    const firstCreditor = rows.findIndex((r) => (r as any).kind === 'creditor');
    const lastDebtor = rows.reduce(
      (last, r, i) => ((r as any).kind === 'debtor' ? i : last),
      -1,
    );
    check(
      'فهرست — بدهکارها قبل از طلبکارها',
      firstCreditor === -1 || lastDebtor < firstCreditor ? 1 : 0,
      1,
    );

    const retLedger = await prisma.customerLedger.findFirst({
      where: { customerId: a.id, type: 'RETURN' },
    });
    check('لجر — RETURN منفی', retLedger?.amount ?? 0, -300_000);

    // ---- ۸) پرداخت به طلبکار: ۳۰۰٬۰۰۰ → صفر → باز از فهرست می‌رود ----
    await payouts.create(
      {
        idempotencyKey: `${TAG}-po-${stamp}`,
        customerId: a.id,
        amount: 300_000,
        method: 'CASH',
        reason: 'تست دود — تسویه بستانکاری',
      } as any,
      user.id,
    );
    check('دفتر جاری — پس از پرداخت، صفر', await ledger.balance(a.id), 0);
    check('فهرست — طلبکار غایب', await listBalanceOf(a.id), 0);
    rows = await ledger.accountBalances();
    checkStr('فهرست — معوق سر جایش', rows.some((r) => r.id === b.id) ? 'هست' : 'نیست', 'هست');
    checkStr('فهرست — جاری باز غایب', rows.some((r) => r.id === a.id) ? 'حاضر' : 'غایب', 'غایب');

    const poLedger = await prisma.customerLedger.findFirst({
      where: { customerId: a.id, type: 'PAYOUT' },
    });
    check('لجر — PAYOUT مثبت', poLedger?.amount ?? 0, 300_000);

    // ---- ۹) جست‌وجو: q فقط همان را می‌آورد ----
    const qB = await ledger.accountBalances({ q: 'معوق' });
    check('جست‌وجو — معوق پیدا شد', qB.length, 1);
    checkStr('جست‌وجو — همان B', qB[0]?.id === b.id ? 'معوق' : 'دیگری', 'معوق');
    const qA = await ledger.accountBalances({ q: 'جاری' });
    check('جست‌وجو — جاری دیگر مانده ندارد', qA.length, 0);

    // جمعِ نهایی: دفتر و فهرست همیشه هم‌خوان — معوق ۵۰۰٬۰۰۰.
    check('پایان — دفتر معوق', await ledger.balance(b.id), 500_000);
    check('پایان — فهرست معوق', await listBalanceOf(b.id), 500_000);

  } finally {
    // پاک‌سازی — این اسکریپت روی دیتابیس واقعی اجرا می‌شود.
    for (const customerId of [a.id, b.id]) {
      await prisma.customerLedger.deleteMany({ where: { customerId } });
      await prisma.customerPayout.deleteMany({ where: { customerId } });
    }
    await prisma.receiptAllocation.deleteMany({
      where: { receipt: { customerId: { in: [a.id, b.id] } } },
    });
    await prisma.receiptPayment.deleteMany({
      where: { receipt: { customerId: { in: [a.id, b.id] } } },
    });
    await prisma.receipt.deleteMany({ where: { customerId: { in: [a.id, b.id] } } });
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
    await prisma.payment.deleteMany({
      where: { invoice: { customerId: { in: [a.id, b.id] } } },
    });
    await prisma.saleInvoice.deleteMany({ where: { customerId: { in: [a.id, b.id] } } });
    for (const customerId of [a.id, b.id]) {
      await prisma.customerPhone.deleteMany({ where: { customerId } });
      await prisma.customer.delete({ where: { id: customerId } });
    }
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
