/**
 * تست دود برای فروش حساب‌باز.
 *
 * چرخه‌ی کاملِ یک بدهی را از سرِ سرویس‌های واقعی می‌گذراند و بعد از هر گام
 * مانده را می‌سنجد:
 *   مانده‌ی اول دوره → فروش نسیه → دریافت وجه → ابطال فاکتور
 *
 * چرا از سرویس‌ها و نه SQL: تمام ارزشِ دفتر در این است که *داخل همان تراکنشِ*
 * فاکتور و رسید نوشته شود. تست SQL این را اصلاً لمس نمی‌کند.
 *
 * داده‌ی خودش را می‌سازد و در پایان پاک می‌کند.
 *
 * اجرا:  npx ts-node --transpile-only prisma/smoke-credit-sale.ts
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { SalesService } from '../src/sales/sales.service';
import { ReceiptsService } from '../src/sales/receipts.service';
import { LedgerService } from '../src/sales/ledger.service';
import { CustomersService } from '../src/sales/customers.service';

const TAG = 'SMOKE-CREDIT';
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

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const sales = app.get(SalesService);
  const receipts = app.get(ReceiptsService);
  const ledger = app.get(LedgerService);
  const customers = app.get(CustomersService);

  const user = await prisma.user.findFirst({ select: { id: true } });
  const product = await prisma.product.findFirst({
    where: { deletedAt: null },
    select: { id: true },
  });
  if (!user || !product) throw new Error('کاربر یا کالایی برای تست پیدا نشد');

  const warehouse = await prisma.warehouse.create({
    data: { name: `${TAG} انبار`, code: `${TAG}-${Date.now()}` },
  });

  const customer = await customers.create({
    firstName: TAG,
    lastName: 'مشتری آزمایشی',
    creditLimit: 10_000_000,
    creditDays: 30,
  });

  try {
    // ---- ۱) مانده‌ی اول دوره ----
    await ledger.setOpeningBalance(customer.id, 2_000_000, user.id);
    check('مانده پس از اول دوره', await ledger.balance(customer.id), 2_000_000);

    // ---- ۲) فروش نسیه‌ی ۵٬۰۰۰٬۰۰۰ ----
    const invoice = await sales.createInvoice(
      {
        idempotencyKey: `${TAG}-inv-${Date.now()}`,
        warehouseId: warehouse.id,
        customerId: customer.id,
        lines: [{ productId: product.id, quantity: 1, unitPrice: 5_000_000 }],
        payments: [{ method: 'CREDIT', amount: 5_000_000 }],
      } as any,
      user.id,
    );
    check('مانده پس از فروش نسیه', await ledger.balance(customer.id), 7_000_000);

    // سررسید باید خودکار از مهلت ۳۰ روزه‌ی مشتری ساخته شده باشد.
    const stored = await prisma.saleInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { dueDate: true },
    });
    // مقایسه روی روزِ تقویمی، نه اختلاف ساعت: سررسید عمداً روی *پایان* روز
    // سی‌ام می‌نشیند، پس اختلاف ساعتی ۳۰.x روز است و گرد کردنش ۳۱ می‌دهد.
    const midnight = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const daysOut = stored.dueDate
      ? Math.round(
          (midnight(stored.dueDate) - midnight(new Date())) /
            (1000 * 60 * 60 * 24),
        )
      : -1;
    check('سررسید خودکار (روز)', daysOut, 30);

    // ---- ۳) هشدار سقف اعتبار ----
    const credit = await ledger.creditCheck(customer.id, 5_000_000);
    check('عبور از سقف اعتبار', credit.exceededBy, 2_000_000);

    // ---- ۴) دریافت ۳٬۰۰۰٬۰۰۰ ----
    await receipts.create(
      {
        customerId: customer.id,
        amount: 3_000_000,
        method: 'CASH',
        idempotencyKey: `${TAG}-rcpt-${Date.now()}`,
      },
      user.id,
    );
    check('مانده پس از دریافت', await ledger.balance(customer.id), 4_000_000);

    // ---- ۵) ابطال فاکتور ----
    // فاکتور ۵ میلیونی بود که ۳ میلیونش دریافت شده، پس ۲ میلیون بدهیِ باز دارد.
    // ابطال باید همان ۲ میلیون را برگرداند و مانده به اول دوره برسد.
    await sales.cancelInvoice(invoice.id, `${TAG} — تست`, user.id);
    check('مانده پس از ابطال', await ledger.balance(customer.id), 2_000_000);

    // ---- ۶) خلاصه‌ی حساب ----
    const summary = await ledger.summary(customer.id);
    check('خلاصه: مانده کل', summary.totalDue, 2_000_000);

  } finally {
    // پاک‌سازی — این اسکریپت روی دیتابیس واقعی اجرا می‌شود.
    await prisma.customerLedger.deleteMany({ where: { customerId: customer.id } });
    await prisma.receiptAllocation.deleteMany({
      where: { receipt: { customerId: customer.id } },
    });
    await prisma.receipt.deleteMany({ where: { customerId: customer.id } });
    await prisma.payment.deleteMany({
      where: { invoice: { customerId: customer.id } },
    });
    await prisma.inventoryLog.deleteMany({
      where: { invoice: { customerId: customer.id } },
    });
    await prisma.saleInvoice.deleteMany({ where: { customerId: customer.id } });
    await prisma.customerPhone.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.inventory.deleteMany({
      where: { location: { warehouseId: warehouse.id } },
    });
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
