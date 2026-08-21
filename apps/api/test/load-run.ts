/**
 * تست سرتاسری با حجم واقعی.
 *
 *  ۱) ۵۰۰ کالا از کاتالوگ واقعی، هرکدام با قیمت و موجودی و قفسه‌ی متفاوت
 *  ۲) یک کار برداشت دوقلمی برای کارگر انبار (گوشی باید همان لحظه زنگ بزند)
 *  ۳) ۴۰ فاکتور فروش پشت سر هم، با زمان‌سنجی
 *  ۴) بررسی اینکه دفتر عملیات با موجودی و مبالغ می‌خواند
 *
 * کالای ساختگی ساخته نمی‌شود: کاتالوگ ۳۳ هزارتایی واقعی است و آلوده‌کردنش با
 * ردیف تستی همان چیزی است که بعداً باید پاک شود. به‌جایش ۵۰۰ کالای موجود
 * قیمت و موجودی می‌گیرند — دقیقاً کاری که هنگام راه‌اندازی انجام می‌شود.
 *
 * همه‌ی حرکت‌های موجودی از مسیر تک‌نقطه‌ای رد می‌شوند و فاکتورها از خودِ
 * SalesService، تا این یک تست واقعی باشد نه درج مستقیم در دیتابیس.
 *
 * اجرا:  npx ts-node test/load-run.ts
 */
import '../src/load-env';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalesService } from '../src/sales/sales.service';
import { WorkTasksService } from '../src/work-tasks/work-tasks.service';
import { InventoryOperationService } from '../src/inventory-operation/inventory-operation.service';

const PRODUCT_COUNT = 500;
const INVOICE_COUNT = 40;
/** قلم‌های یک کار برداشت — صف برداشت در WorkTask ادغام شد، پس این تعدادِ قلم است نه تعدادِ کار. */
const PICK_LINE_COUNT = 2;
const WORKER_USERNAME = 'anbar';
const SELLER_USERNAME = 'sales';

const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[rnd(0, arr.length - 1)];
/** قیمت‌ها به تومان و رند شده به هزار — مثل قیمت‌گذاری واقعی. */
const price = () => rnd(20, 5_000) * 1_000;

async function main() {
  const t0 = Date.now();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const sales = app.get(SalesService);
  const workTasks = app.get(WorkTasksService);
  const ops = app.get(InventoryOperationService);

  const warehouse = await prisma.warehouse.findFirstOrThrow();
  const seller = await prisma.user.findUnique({ where: { username: SELLER_USERNAME } });
  const worker = await prisma.user.findUnique({ where: { username: WORKER_USERNAME } });
  if (!seller) throw new Error(`کاربر فروشنده «${SELLER_USERNAME}» پیدا نشد`);
  if (!worker) throw new Error(`کاربر کارگر «${WORKER_USERNAME}» پیدا نشد`);

  const shelves = await prisma.location.findMany({
    where: { warehouseId: warehouse.id, depth: 3, isActive: true },
    select: { id: true, path: true },
  });
  console.log(`انبار: ${warehouse.code} · ${shelves.length} قفسه · فروشنده: ${seller.username} · کارگر: ${worker.username}\n`);

  // ---------- ۱) قیمت و موجودی و موقعیت ----------
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, unit: true },
    take: PRODUCT_COUNT,
    orderBy: { createdAt: 'asc' },
  });

  const stocked: { id: string; locationId: string; qty: number; price: number }[] = [];
  const tStock = Date.now();

  for (const p of products) {
    const salePrice = price();
    const purchase = Math.round(salePrice * 0.7);
    const qty = rnd(3, 60);
    const shelf = pick(shelves);

    await prisma.productPrice.create({
      data: { productId: p.id, salePrice, purchasePrice: purchase },
    });
    await ops.execute({
      type: 'IN',
      productId: p.id,
      locationId: shelf.id,
      quantity: qty,
      source: 'LOAD_TEST',
      note: 'ورود اولیه‌ی تست',
    });

    stocked.push({ id: p.id, locationId: shelf.id, qty, price: salePrice });
  }
  console.log(`۱) ${stocked.length} کالا قیمت و موجودی و قفسه گرفتند — ${((Date.now() - tStock) / 1000).toFixed(1)} ثانیه`);

  // ---------- ۲) کار برداشت برای کارگر ----------
  const forWorker = stocked.slice(0, PICK_LINE_COUNT);
  const created = await workTasks.create(
    {
      warehouseId: warehouse.id,
      assignedToId: worker.id,
      // یادداشت در WorkTask روی خودِ کار است، نه روی تک‌تک قلم‌ها.
      note: 'تست بار — لطفاً بیاورید',
      lines: forWorker.map((s) => ({
        productId: s.id,
        locationId: s.locationId,
        quantity: 1,
      })),
    },
    seller.id,
  );
  console.log(`۲) یک کار برداشت با ${created.totalItems} قلم برای «${worker.username}» فرستاده شد (گوشی باید زنگ بزند)`);

  // ---------- ۳) ۴۰ فاکتور ----------
  // اقلامی که به کارگر رفته‌اند فروخته نمی‌شوند تا صف کارگر دست‌نخورده بماند.
  const sellable = stocked.slice(PICK_LINE_COUNT);
  const remaining = new Map(sellable.map((s) => [s.id, s.qty]));
  const durations: number[] = [];
  let soldValue = 0;
  const soldPerProduct = new Map<string, number>();
  let failures = 0;

  const tSales = Date.now();
  for (let i = 0; i < INVOICE_COUNT; i++) {
    const lineCount = rnd(2, 6);
    const chosen: typeof sellable = [];
    for (let j = 0; j < lineCount; j++) {
      const cand = pick(sellable);
      if (chosen.some((c) => c.id === cand.id)) continue;
      if ((remaining.get(cand.id) ?? 0) < 1) continue;
      chosen.push(cand);
    }
    if (!chosen.length) continue;

    const lines = chosen.map((c) => {
      const q = Math.min(rnd(1, 3), remaining.get(c.id)!);
      return { productId: c.id, locationId: c.locationId, quantity: q, unitPrice: c.price };
    });

    const t = Date.now();
    try {
      const inv = await sales.createInvoice(
        {
          idempotencyKey: `load-${Date.now()}-${i}`,
          warehouseId: warehouse.id,
          lines,
          // یک فاکتور از هر پنج تا، تخفیف فاکتوری می‌گیرد.
          discount: i % 5 === 0 ? 50_000 : undefined,
        } as never,
        seller.id,
      );
      durations.push(Date.now() - t);
      soldValue += inv.total;
      for (const l of lines) {
        remaining.set(l.productId, (remaining.get(l.productId) ?? 0) - l.quantity);
        soldPerProduct.set(l.productId, (soldPerProduct.get(l.productId) ?? 0) + l.quantity);
      }
    } catch (e: any) {
      failures++;
      console.log(`   فاکتور ${i + 1} خطا: ${e?.response?.error ?? e?.message}`);
    }
  }

  const totalSalesMs = Date.now() - tSales;
  const sorted = [...durations].sort((a, b) => a - b);
  console.log(
    `۳) ${durations.length} فاکتور در ${(totalSalesMs / 1000).toFixed(1)} ثانیه` +
      ` — میانه ${sorted[Math.floor(sorted.length / 2)]}ms، بدترین ${sorted[sorted.length - 1]}ms` +
      (failures ? ` — ${failures} ناموفق` : ''),
  );
  console.log(`   ارزش فروش: ${soldValue.toLocaleString('en-US')} تومان`);

  // ---------- ۴) بررسی درستی ----------
  console.log('\n۴) بررسی درستی:');

  let mismatched = 0;
  for (const [productId, sold] of soldPerProduct) {
    const s = stocked.find((x) => x.id === productId)!;
    const row = await prisma.inventory.findUnique({
      where: { productId_locationId: { productId, locationId: s.locationId } },
      select: { quantity: true },
    });
    if ((row?.quantity ?? 0) !== s.qty - sold) mismatched++;
  }
  console.log(`   موجودی هر کالا با فروشش می‌خواند: ${mismatched === 0 ? 'بله ✅' : `نه ❌ (${mismatched} مورد)`}`);

  const invoices = await prisma.saleInvoice.findMany({
    where: { status: 'CONFIRMED' },
    include: { lines: { where: { action: 'SALE' } } },
  });
  let badTotals = 0;
  for (const inv of invoices) {
    const sub = inv.lines.reduce(
      (s, l) => s + l.quantity * (l.unitPrice ?? 0) - (l.lineDiscount ?? 0),
      0,
    );
    if (sub !== inv.subtotal || inv.total !== inv.subtotal - inv.discount) badTotals++;
  }
  console.log(`   مبلغ فاکتورها با ردیف‌هایشان می‌خواند: ${badTotals === 0 ? 'بله ✅' : `نه ❌ (${badTotals} فاکتور)`}`);

  // مکان سیستمیِ «موجودی ثبت‌نشده» (عمق ۹۹) عمداً منفی می‌شود و ایراد نیست —
  // یعنی جنسی پیش از ثبت شدن فروخته شده. فقط قفسه‌های واقعی باید سالم بمانند.
  const negatives = await prisma.inventory.count({
    where: { quantity: { lt: 0 }, location: { depth: { lt: 99 } } },
  });
  const unregistered = await prisma.inventory.count({
    where: { quantity: { lt: 0 }, location: { depth: 99 } },
  });
  console.log(`   موجودی منفی روی قفسه‌های واقعی: ${negatives === 0 ? 'ندارد ✅' : `${negatives} مورد ❌`}`);
  if (unregistered) {
    console.log(`   (${unregistered} قلم روی «موجودی ثبت‌نشده» منفی است — صف ثبتِ عقب‌افتاده، نه خطا)`);
  }

  const pending = await prisma.workTask.count({ where: { status: 'PENDING' } });
  console.log(`   کارهای در انتظار: ${pending}`);

  console.log(`\nکل اجرا: ${((Date.now() - t0) / 1000).toFixed(1)} ثانیه`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
