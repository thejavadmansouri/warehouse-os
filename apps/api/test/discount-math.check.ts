/**
 * تأیید اینکه ریاضیِ تخفیفِ صندوق فروش با سرور یکی است.
 *
 * رابط کاربری در `apps/web/.../_lib/discount.ts` این ترتیب را پیاده می‌کند:
 *   جمع ردیف = تعداد × قیمت − تخفیف ردیف
 *   جمع اقلام = Σ جمع ردیف‌ها
 *   مبلغ نهایی = جمع اقلام − تخفیف فاکتور
 *
 * اگر سرور جور دیگری حساب کند، فروشنده یک عدد می‌بیند و عددِ دیگری ثبت می‌شود.
 * این تنها چیزی بود که از کار تخفیف تأیید نشده مانده بود.
 *
 * روی یک دیتابیسِ یک‌بارمصرف اجرا می‌شود تا داده‌ی واقعی دست نخورد:
 *   DATABASE_URL=<temp> npx ts-node test/discount-math.check.ts
 */
import '../src/load-env';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalesService } from '../src/sales/sales.service';

const UNIT_A = 100_000;
const UNIT_B = 50_000;
const QTY_A = 1;
const QTY_B = 1;
const LINE_DISCOUNT_A = 10_000; // ۱۰٪ از ۱۰۰٬۰۰۰
const INVOICE_DISCOUNT = 5_000;

function expected() {
  const grossA = QTY_A * UNIT_A;
  const grossB = QTY_B * UNIT_B;
  const subtotal = grossA - LINE_DISCOUNT_A + grossB;
  return { subtotal, total: subtotal - INVOICE_DISCOUNT };
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const sales = app.get(SalesService);

  const warehouse = await prisma.warehouse.create({
    data: { code: 'CHK', name: 'بررسی' },
  });
  const type = await prisma.locationType.create({
    data: { warehouseId: warehouse.id, name: 'قفسه', depth: 0 },
  });
  const location = await prisma.location.create({
    data: {
      name: 'قفسه ۱',
      code: 'CHK-01',
      barcode: 'LOC-CHK-01',
      path: 'CHK > قفسه ۱',
      depth: 0,
      warehouseId: warehouse.id,
      typeId: type.id,
    },
  });

  const mk = async (name: string, sku: string, price: number) => {
    const p = await prisma.product.create({
      data: { name, sku, searchTokens: [name], unit: 'عدد' },
    });
    await prisma.productPrice.create({
      data: { productId: p.id, salePrice: price, purchasePrice: Math.round(price / 2) },
    });
    await prisma.inventory.create({
      data: { productId: p.id, locationId: location.id, quantity: 10 },
    });
    return p;
  };

  const a = await mk('کالای الف', 'CHK-A', UNIT_A);
  const b = await mk('کالای ب', 'CHK-B', UNIT_B);

  const invoice = await sales.createInvoice(
    {
      idempotencyKey: `check-${Date.now()}`,
      warehouseId: warehouse.id,
      discount: INVOICE_DISCOUNT,
      lines: [
        { productId: a.id, locationId: location.id, quantity: QTY_A, unitPrice: UNIT_A, discount: LINE_DISCOUNT_A },
        { productId: b.id, locationId: location.id, quantity: QTY_B, unitPrice: UNIT_B },
      ],
    } as never,
    undefined,
  );

  const want = expected();
  const got = { subtotal: invoice.subtotal, total: invoice.total };

  console.log('UI formula :', want);
  console.log('server     :', got);

  const ok = want.subtotal === got.subtotal && want.total === got.total;
  console.log(ok ? '\nMATCH ✅' : '\nMISMATCH ❌');

  // موجودی هم باید دقیقاً به اندازه‌ی فروش کم شده باشد.
  const left = await prisma.inventory.findFirst({
    where: { productId: a.id, locationId: location.id },
    select: { quantity: true },
  });
  console.log(`stock after selling ${QTY_A}: ${left?.quantity} (expected ${10 - QTY_A})`);

  await app.close();
  process.exit(ok && left?.quantity === 10 - QTY_A ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
