/**
 * تست دودِ «مسیر کاملِ مرجوعی» — سناریوی واقعیِ پیشخوان، نه یک واحدتستِ جدا:
 *
 *   مشتری از قبل ۲٬۰۰۰٬۰۰۰ بدهکار است → ۱۰۰ قلم می‌خرد (۳۰۰ نقد + ۳۰۰ کارت +
 *   ۴۰۰ نسیه با سررسید ۱۰ روز) → بعداً ۲۰ قلم را «کسر از حساب» برمی‌گرداند →
 *   نسیه‌اش را تسویه می‌کند → ۱۰ قلم دیگر هم روی همان فاکتورِ تسویه‌شده از
 *   حساب کم می‌شود → ۱۰ قلم را نقدی پس می‌دهد → و همهٔ نگهبان‌ها: سقفِ
 *   قابل‌برگشت، برگشتِ نقدیِ بیش از پولِ گرفته‌شده، نقشِ صندوق‌دار، فاکتورِ
 *   حساب‌باز، و سبدِ خالص (تعویض).
 *
 * چرا از سرویس‌ها و نه کلیک مرورگر: همهٔ ارزشِ این زنجیره در این است که دفتر،
 * انبار و صندوق داخلِ همان تراکنش درست شوند — تستِ DOM اصلاً این را لمس نمی‌کند.
 * رابطِ کاربری هم جداگانه در مرورگر پیمایش می‌شود؛ اینجا *درستی* قفل می‌شود.
 *
 * داده‌ی خودش را می‌سازد و در پایان پاک می‌کند.
 *
 * اجرا:  npx ts-node --transpile-only prisma/smoke-return-journey.ts
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient, InvoiceStatus, Role } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { SalesService } from '../src/sales/sales.service';
import { ReturnsService } from '../src/sales/returns.service';
import { ReceiptsService } from '../src/sales/receipts.service';
import { LedgerService } from '../src/sales/ledger.service';
import { CustomersService } from '../src/sales/customers.service';
import { InventoryOperationService } from '../src/inventory-operation/inventory-operation.service';

const TAG = 'SMOKE-RETJ';
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

/** باید با کدِ خاصِ خودش رد شود — نه هر خطای دیگری. */
async function expectRejection(label: string, code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    failures++;
    console.log(`❌  ${label} — رد نشد (انتظار کد: ${code})`);
  } catch (e: any) {
    const resp = typeof e?.getResponse === 'function' ? e.getResponse() : e?.response;
    const got =
      (resp && typeof resp === 'object' ? (resp as any).error : undefined) ??
      e?.code ??
      e?.name;
    if (got === code) {
      console.log(`✅  ${label} — رد شد با کد ${code}`);
    } else {
      failures++;
      console.log(`❌  ${label} — کدِ خطا: ${got} (انتظار: ${code}) — ${e?.message}`);
    }
  }
}

async function stockOf(productId: string, warehouseId: string): Promise<number> {
  const agg = await prisma.inventory.aggregate({
    where: { productId, location: { warehouseId } },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

const daysOut = (d: Date | null) =>
  d
    ? Math.round(
        (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
          new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) /
          86_400_000,
      )
    : -1;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const sales = app.get(SalesService);
  const returns = app.get(ReturnsService);
  const receipts = app.get(ReceiptsService);
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
    creditDays: 10,
  });

  const product = await prisma.product.create({
    data: { name: `${TAG} کالا`, sku: `${TAG}-p-${stamp}` },
  });
  const productIds = [product.id];

  const invoiceIds: string[] = [];
  const returnIds: string[] = [];
  let receiptIds: string[] = [];
  let openAccountId: string | null = null;

  try {
    // ورودِ اولیه به انبار
    await inventory.execute({
      type: 'IN',
      productId: product.id,
      locationId: location.id,
      quantity: 150,
      note: `${TAG} اولیه`,
      userId: user.id,
    } as any);

    // ---- ۱) مشتری از قبل بدهکار است ----
    await ledger.setOpeningBalance(customer.id, 2_000_000, user.id);
    check('ماندهٔ اول دوره', await ledger.balance(customer.id), 2_000_000);

    // ---- ۲) خرید ۱۰۰ عددی با پرداختِ ترکیبی: نقد + کارت + نسیه (۱۰ روزه) ----
    const due = new Date(Date.now() + 10 * 86_400_000);
    const invA = await sales.createInvoice(
      {
        idempotencyKey: `${TAG}-invA-${stamp}`,
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
    invoiceIds.push(invA.id);
    const reloadA = async () =>
      prisma.saleInvoice.findUniqueOrThrow({
        where: { id: invA.id },
        select: { total: true, paidAmount: true, dueAmount: true, status: true, dueDate: true },
      });

    check('فاکتور — مبلغ کل', invA.total, 1_000_000);
    check('فاکتور — پرداخت‌شده (نقد+کارت)', invA.paidAmount, 600_000);
    check('فاکتور — ماندهٔ نسیه', invA.dueAmount, 400_000);
    check('دفتر — بدهیِ تازه فقط بخشِ نسیه', await ledger.balance(customer.id), 2_400_000);
    check('انبار پس از فروش', await stockOf(product.id, warehouse.id), 50);
    check('سررسید (روز)', daysOut((await reloadA()).dueDate), 10);

    const saleLog = await prisma.inventoryLog.findFirstOrThrow({
      where: { invoiceId: invA.id, action: 'SALE' },
      select: { id: true },
    });
    const saleLogId = saleLog.id;

    // ---- ۳) مرجوعیِ ۲۰ عددی «کسر از حساب» (دقیقاً سناریوی کاربر) ----
    const ret1Dto = {
      idempotencyKey: `${TAG}-ret1-${stamp}`,
      invoiceId: invA.id,
      refundMethod: 'CREDIT',
      reason: 'مشتری منصرف شد',
      lines: [{ saleLogId, quantity: 20, restock: true }],
    } as any;
    const ret1 = await returns.createReturn(ret1Dto, user.id);
    returnIds.push(ret1.id);
    check('مرجوعی ۱ — مبلغ برگشتی', ret1.refundAmount, 200_000);
    check('دفتر — پس از کسر از حساب', await ledger.balance(customer.id), 2_200_000);
    let a = await reloadA();
    check('فاکتور — مبلغ پس از مرجوعیِ اعتباری', a.total, 800_000);
    check('فاکتور — مانده پس از کسر', a.dueAmount, 200_000);
    check('انبار — ۲۰ عدد برگشت', await stockOf(product.id, warehouse.id), 70);
    const rl1 = await returns.returnableLines(invA.id);
    check('قابلِ برگشت پس از مرجوعی', rl1.lines[0].returnable, 80);

    // ---- ۳-ب) ارسالِ دوباره با همان کلید — هیچ اثرِ دومی ندارد ----
    const ret1again = await returns.createReturn(ret1Dto, user.id);
    checkStr('retry — همان سند', ret1again.id, ret1.id);
    check('retry — یک سندِ مرجوعی بیشتر نه', await prisma.saleReturn.count({ where: { invoiceId: invA.id } }), 1);
    check('retry — دفتر دست‌نخورده', await ledger.balance(customer.id), 2_200_000);

    // ---- ۴) ده روز بعد: مشتری نسیه‌اش را نقد می‌دهد ----
    const rcpt = await receipts.create(
      {
        customerId: customer.id,
        amount: 200_000,
        method: 'CASH',
        idempotencyKey: `${TAG}-rcpt-${stamp}`,
      },
      user.id,
    );
    if (rcpt?.id) receiptIds.push(rcpt.id);
    check('دفتر پس از تسویهٔ نسیه', await ledger.balance(customer.id), 2_000_000);
    a = await reloadA();
    check('فاکتور — مانده پس از تسویه', a.dueAmount, 0);

    // ---- ۵) ۱۰ قلم دیگر روی همان فاکتورِ تسویه‌شده — باز هم «کسر از حساب» ----
    const ret2 = await returns.createReturn(
      {
        idempotencyKey: `${TAG}-ret2-${stamp}`,
        invoiceId: invA.id,
        refundMethod: 'CREDIT',
        reason: 'کالا معیوب بود',
        lines: [{ saleLogId, quantity: 10, restock: true }],
      } as any,
      user.id,
    );
    returnIds.push(ret2.id);
    check('مرجوعی ۲ — مبلغ برگشتی', ret2.refundAmount, 100_000);
    check('دفتر — کسر از حسابِ فاکتورِ تسویه‌شده', await ledger.balance(customer.id), 1_900_000);
    a = await reloadA();
    check('فاکتور — مبلغ پس از مرجوعیِ دوم', a.total, 700_000);
    check('فاکتور — مانده همچنان صفر', a.dueAmount, 0);

    // ---- ۶) ۱۰ قلم نقدی — پول از صندوق، حساب دست‌نخورده ----
    const ret3 = await returns.createReturn(
      {
        idempotencyKey: `${TAG}-ret3-${stamp}`,
        invoiceId: invA.id,
        refundMethod: 'CASH',
        reason: '',
        lines: [{ saleLogId, quantity: 10, restock: true }],
      } as any,
      user.id,
    );
    returnIds.push(ret3.id);
    check('مرجوعی ۳ — نقدی', ret3.refundAmount, 100_000);
    check('دفتر — نقد دستِ حساب را نمی‌گیرد', await ledger.balance(customer.id), 1_900_000);
    a = await reloadA();
    check('فاکتور — مبلغ با نقد دست‌نخورده', a.total, 700_000);
    check('انبار پس از مرجوعیِ سوم', await stockOf(product.id, warehouse.id), 90);
    check('قابلِ برگشت — ۶۰ باقی‌مانده', (await returns.returnableLines(invA.id)).lines[0].returnable, 60);
    check(
      'سندِ خودکارِ مرجوعیِ نقدی',
      await prisma.voucher.count({ where: { sourceType: 'SALE_RETURN', sourceId: ret3.id } }),
      1,
    );

    // ---- ۷) نگهبانِ مسیرِ مستقل: برگشتِ نقدیِ بیش از پولِ گرفته‌شده ----
    // فاکتوری که فقط نسیه ثبت شده (یک ریال هم نگرفته‌ایم) — نقد دادن بابت آن
    // یعنی پولی که هرگز نیامده از صندوق بیرون برود. سبدِ خالص همین نگهبان را
    // دارد (REFUND_EXCEEDS_PAID)؛ مسیرِ مستقل باید همان را داشته باشد.
    const invB = await sales.createInvoice(
      {
        idempotencyKey: `${TAG}-invB-${stamp}`,
        warehouseId: warehouse.id,
        customerId: customer.id,
        lines: [{ productId: product.id, quantity: 10, unitPrice: 10_000 }],
        payments: [{ method: 'CREDIT', amount: 100_000 }],
      } as any,
      user.id,
    );
    invoiceIds.push(invB.id);
    const saleLogB = await prisma.inventoryLog.findFirstOrThrow({
      where: { invoiceId: invB.id, action: 'SALE' },
      select: { id: true },
    });
    check('فاکتورِ نسیه‌ای — پرداخت‌شده صفر', invB.paidAmount, 0);
    await expectRejection(
      'برگشتِ نقدیِ بیش از پولِ گرفته‌شده رد می‌شود',
      'REFUND_EXCEEDS_PAID',
      () =>
        returns.createReturn(
          {
            idempotencyKey: `${TAG}-ret-cash-over-${stamp}`,
            invoiceId: invB.id,
            refundMethod: 'CASH',
            reason: '',
            lines: [{ saleLogId: saleLogB.id, quantity: 1 }],
          } as any,
          user.id,
        ),
    );

    // ---- ۸) سقفِ قابلِ برگشت ----
    await expectRejection(
      'بیشتر از قابلِ برگشت رد می‌شود (۶۱ از ۶۰)',
      'EXCESS_RETURN',
      () =>
        returns.createReturn(
          {
            invoiceId: invA.id,
            refundMethod: 'CASH',
            reason: '',
            lines: [{ saleLogId, quantity: 61 }],
          } as any,
          user.id,
        ),
    );

    // ---- ۹) صندوق‌دار روی فاکتورِ نهایی ----
    await expectRejection(
      'صندوق‌دار (SALES) روی فاکتورِ نهایی رد می‌شود',
      'RETURN_REQUIRES_MANAGER',
      () =>
        returns.createReturn(
          {
            invoiceId: invA.id,
            refundMethod: 'CREDIT',
            reason: '',
            lines: [{ saleLogId, quantity: 1 }],
          } as any,
          user.id,
          Role.SALES,
        ),
    );

    // ---- ۱۰) فاکتورِ جاریِ حساب باز: فقط «کسر از حساب» ----
    const account = await prisma.openAccount.create({
      data: { customerId: customer.id },
    });
    openAccountId = account.id;
    const invC = await sales.createInvoice(
      {
        idempotencyKey: `${TAG}-invC-${stamp}`,
        warehouseId: warehouse.id,
        customerId: customer.id,
        accountId: account.id,
        lines: [{ productId: product.id, quantity: 5, unitPrice: 10_000 }],
      } as any,
      user.id,
    );
    invoiceIds.push(invC.id);
    const c = await prisma.saleInvoice.findUniqueOrThrow({
      where: { id: invC.id },
      select: { status: true, total: true, dueAmount: true },
    });
    checkStr('حساب باز — وضعیت OPEN', c.status, InvoiceStatus.OPEN);
    const saleLogC = await prisma.inventoryLog.findFirstOrThrow({
      where: { invoiceId: invC.id, action: 'SALE' },
      select: { id: true },
    });
    const beforeC = await ledger.balance(customer.id);

    await expectRejection(
      'حساب باز — برگشتِ نقدی رد می‌شود',
      'OPEN_ACCOUNT_REFUND_MUST_BE_CREDIT',
      () =>
        returns.createReturn(
          {
            invoiceId: invC.id,
            refundMethod: 'CASH',
            reason: '',
            lines: [{ saleLogId: saleLogC.id, quantity: 1 }],
          } as any,
          user.id,
        ),
    );

    const retC = await returns.createReturn(
      {
        idempotencyKey: `${TAG}-retC-${stamp}`,
        invoiceId: invC.id,
        refundMethod: 'CREDIT',
        reason: '',
        lines: [{ saleLogId: saleLogC.id, quantity: 5, restock: true }],
      } as any,
      user.id,
    );
    returnIds.push(retC.id);
    check('حساب باز — کسر از حساب', (await ledger.balance(customer.id)) - beforeC, -50_000);
    check(
      'حساب باز — فاکتور صفر شد',
      (
        await prisma.saleInvoice.findUniqueOrThrow({
          where: { id: invC.id },
          select: { total: true, dueAmount: true },
        })
      ).total,
      0,
    );
    // ۹۰ − ۱۰ (فروشِ فاکتورِ نسیه‌ای B) − ۵ (فروشِ حسابِ باز) + ۵ (برگشتِ همان ۵)
    check('انبار پس از حسابِ باز', await stockOf(product.id, warehouse.id), 80);

    // ---- ۱۱) سبدِ خالص (تعویض): نگهبانِ پولِ گرفته‌شده اینجا هست ----
    await expectRejection(
      'سبدِ خالص — برگشتِ نقدیِ فاکتورِ نسیه‌ای رد می‌شود',
      'REFUND_EXCEEDS_PAID',
      () =>
        sales.createNetSale(
          {
            idempotencyKey: `${TAG}-net-${stamp}`,
            warehouseId: warehouse.id,
            customerId: customer.id,
            refundMethod: 'CASH',
            reason: '',
            returns: [
              {
                invoiceId: invB.id,
                lines: [{ saleLogId: saleLogB.id, quantity: 1 }],
              },
            ],
            lines: [{ productId: product.id, quantity: 1, unitPrice: 10_000 }],
            payments: [{ method: 'CASH', amount: 10_000 }],
          } as any,
          user.id,
        ),
    );

    // ---- ۱۲) سبدِ خالص — «فقط نقد/کارت»، نه کسر از حساب ----
    await expectRejection(
      'سبدِ خالص — برگشتِ به‌حساب رد می‌شود (مسیرِ مستقل دارد)',
      'NET_REFUND_MUST_BE_CASH_OR_CARD',
      () =>
        sales.createNetSale(
          {
            idempotencyKey: `${TAG}-net2-${stamp}`,
            warehouseId: warehouse.id,
            customerId: customer.id,
            refundMethod: 'CREDIT',
            returns: [
              {
                invoiceId: invA.id,
                lines: [{ saleLogId, quantity: 1 }],
              },
            ],
            lines: [{ productId: product.id, quantity: 1, unitPrice: 10_000 }],
            payments: [{ method: 'CASH', amount: 10_000 }],
          } as any,
          user.id,
        ),
    );
  } finally {
    // ---- پاک‌سازی — این اسکریپت روی دیتابیس واقعی اجرا می‌شود ----
    await prisma.saleCorrectionLine.deleteMany({
      where: { correction: { operationKey: { startsWith: `${TAG}-op-` } } },
    });
    await prisma.saleCorrection.deleteMany({
      where: { operationKey: { startsWith: `${TAG}-op-` } },
    });
    await prisma.saleReturnLine.deleteMany({
      where: { saleReturn: { customerId: customer.id } },
    });
    await prisma.saleReturn.deleteMany({ where: { customerId: customer.id } });
    await prisma.receiptAllocation.deleteMany({
      where: { receipt: { customerId: customer.id } },
    });
    await prisma.receipt.deleteMany({ where: { customerId: customer.id } });
    await prisma.payment.deleteMany({
      where: { invoice: { customerId: customer.id } },
    });
    // سندِ حسابداریِ همین عملیات‌ها — نباید برای داده‌ای که پاک می‌شود بماند.
    await prisma.voucher.deleteMany({
      where: {
        OR: [
          { sourceId: { in: [...invoiceIds, ...returnIds, ...receiptIds] } },
          { lines: { some: { customerId: customer.id } } },
        ],
      },
    });
    await prisma.inventoryLog.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.saleInvoice.deleteMany({ where: { customerId: customer.id } });
    if (openAccountId) {
      await prisma.openAccount.deleteMany({ where: { id: openAccountId } });
    }
    await prisma.customerLedger.deleteMany({ where: { customerId: customer.id } });
    await prisma.customerPhone.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.productPrice.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
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