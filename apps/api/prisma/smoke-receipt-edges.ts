/**
 * تست دود برای دو حالتی که تا امروز شکسته بودند:
 *
 *   ۱) مشتری‌ای که بدهی‌اش فقط مانده‌ی اول دوره است و هیچ فاکتوری ندارد،
 *      باید بتواند پول بدهد. قبلاً «این مشتری بدهی ثبت‌شده‌ای ندارد» می‌گرفت.
 *   ۲) پرداختِ بیشتر از بدهی باید بدون تأیید رد شود و با تأیید به‌عنوان
 *      پیش‌دریافت ثبت شود و مشتری را بستانکار کند.
 *
 * عمداً هیچ انبار و کالایی لازم ندارد — هر دو مسیر کاملاً مالی‌اند.
 *
 * اجرا:  npx ts-node --transpile-only prisma/smoke-receipt-edges.ts
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { ReceiptsService } from '../src/sales/receipts.service';
import { LedgerService } from '../src/sales/ledger.service';
import { CustomersService } from '../src/sales/customers.service';

const TAG = 'SMOKE-RECEIPT';
const prisma = new PrismaClient();

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(
    `${ok ? '✅' : '❌'}  ${label}: ${String(actual)}` +
      (ok ? '' : `  (انتظار: ${String(expected)})`),
  );
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const receipts = app.get(ReceiptsService);
  const ledger = app.get(LedgerService);
  const customers = app.get(CustomersService);
  const user = await prisma.user.findFirst({ select: { id: true } });

  const customer = await customers.create({
    firstName: TAG,
    lastName: 'مشتری آزمایشی',
  });

  try {
    // ---- ۱) بدهیِ فقط اول‌دوره‌ای ----
    await ledger.setOpeningBalance(customer.id, 10_000_000, user?.id);
    check('مانده اول دوره', await ledger.balance(customer.id), 10_000_000);

    // این همان چیزی است که قبلاً می‌ترکید: هیچ فاکتوری وجود ندارد.
    await receipts.create(
      {
        customerId: customer.id,
        amount: 4_000_000,
        method: 'CASH',
        idempotencyKey: `${TAG}-a-${Date.now()}`,
      },
      user?.id,
    );
    check(
      'دریافت بابت مانده اول دوره',
      await ledger.balance(customer.id),
      6_000_000,
    );

    // ---- ۲) پرداخت بیشتر، بدون تأیید ----
    let rejected = '';
    try {
      await receipts.create(
        {
          customerId: customer.id,
          amount: 9_000_000, // بدهی ۶ است
          method: 'CASH',
          idempotencyKey: `${TAG}-b-${Date.now()}`,
        },
        user?.id,
      );
    } catch (e: any) {
      rejected = e?.response?.error ?? e?.getResponse?.()?.error ?? '';
    }
    check('مازاد بدون تأیید رد می‌شود', rejected, 'AMOUNT_EXCEEDS_DEBT');
    check('و چیزی ثبت نشده', await ledger.balance(customer.id), 6_000_000);

    // ---- ۳) پرداخت بیشتر، با تأیید ----
    await receipts.create(
      {
        customerId: customer.id,
        amount: 9_000_000,
        method: 'CASH',
        allowOverpayment: true,
        idempotencyKey: `${TAG}-c-${Date.now()}`,
      },
      user?.id,
    );
    // ۶ بدهی − ۹ پرداخت = ۳ بستانکار
    check('مشتری بستانکار شد', await ledger.balance(customer.id), -3_000_000);

    // ---- ۴) بستانکار دیگر نباید بتواند پول بدهد ----
    let noDebt = '';
    try {
      await receipts.create(
        {
          customerId: customer.id,
          amount: 1_000_000,
          method: 'CASH',
          idempotencyKey: `${TAG}-d-${Date.now()}`,
        },
        user?.id,
      );
    } catch (e: any) {
      noDebt = e?.response?.error ?? e?.getResponse?.()?.error ?? '';
    }
    check('دریافت از بستانکار رد می‌شود', noDebt, 'NO_DEBT');

  } finally {
    await prisma.customerLedger.deleteMany({ where: { customerId: customer.id } });
    await prisma.receiptAllocation.deleteMany({
      where: { receipt: { customerId: customer.id } },
    });
    await prisma.receipt.deleteMany({ where: { customerId: customer.id } });
    await prisma.customerPhone.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });

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
