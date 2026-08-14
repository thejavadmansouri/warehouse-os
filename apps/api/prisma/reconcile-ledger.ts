/**
 * مغایرت‌گیریِ دفتر حساب مشتری.
 *
 * ادعای کل این معماری یک جمله است: «مانده‌ی مشتری همه‌جا یک عدد است». این
 * اسکریپت همان ادعا را می‌سنجد — برای هر مشتری، مانده‌ی دفتر با آنچه از خودِ
 * فاکتورها و رویدادهای غیرفاکتوری برمی‌آید مقایسه می‌شود.
 *
 * انتظار:  SUM(ledger) === SUM(dueAmount فاکتورهای تأییدشده) + رویدادهای غیرفاکتوری
 * که «رویدادهای غیرفاکتوری» یعنی مانده‌ی اول دوره، اصلاح، برگشتی و چک برگشتی.
 *
 * اجرا:  npx ts-node --transpile-only prisma/reconcile-ledger.ts
 * خروج با کد ۱ یعنی مغایرت پیدا شده.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** انواعی که ریشه‌شان فاکتور نیست، پس در جمعِ dueAmount دیده نمی‌شوند. */
const NON_INVOICE_TYPES = [
  'OPENING',
  'ADJUSTMENT',
  'RETURN',
  'CHEQUE_BOUNCED',
] as const;

async function main() {
  const customers = await prisma.customer.findMany({
    select: { id: true, firstName: true, lastName: true },
  });

  let mismatches = 0;
  let checked = 0;

  for (const c of customers) {
    const [ledgerSum, invoiceSum, nonInvoiceSum] = await Promise.all([
      prisma.customerLedger.aggregate({
        where: { customerId: c.id },
        _sum: { amount: true },
      }),
      prisma.saleInvoice.aggregate({
        where: { customerId: c.id, status: 'CONFIRMED' },
        _sum: { dueAmount: true },
      }),
      prisma.customerLedger.aggregate({
        where: { customerId: c.id, type: { in: [...NON_INVOICE_TYPES] } },
        _sum: { amount: true },
      }),
    ]);

    const fromLedger = ledgerSum._sum.amount ?? 0;
    const expected =
      (invoiceSum._sum.dueAmount ?? 0) + (nonInvoiceSum._sum.amount ?? 0);

    // مشتریِ بدون هیچ حرکتی چیزی برای سنجیدن ندارد.
    if (fromLedger === 0 && expected === 0) continue;
    checked++;

    if (fromLedger !== expected) {
      mismatches++;
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
      console.log(
        `❌ ${name} (${c.id})\n   دفتر: ${fromLedger}   انتظار: ${expected}   اختلاف: ${fromLedger - expected}`,
      );
    }
  }

  console.log(
    `\n${checked} مشتریِ دارای حرکت بررسی شد — ${mismatches} مغایرت.`,
  );

  await prisma.$disconnect();
  process.exit(mismatches === 0 ? 0 : 1);
}

main();
