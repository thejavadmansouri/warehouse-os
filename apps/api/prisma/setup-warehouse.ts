/**
 * ساخت ساختار فیزیکی انبار.
 *
 * از خودِ `LocationBuilderService` استفاده می‌کند، نه insert مستقیم — چون کد و
 * بارکد و مسیر روی لیبل چاپ می‌شوند و باید دقیقاً هم‌فرمتِ چیزی باشند که
 * پنل بعداً می‌سازد:
 *
 *   code    = <کد والد>-<برچسب دو رقمی>
 *   barcode = LOC-<code>
 *   path    = <مسیر والد> > <نام>
 *
 * طبقه‌ی دوم عمداً خالی می‌ماند: ساخته می‌شود ولی ردیف و ستون نمی‌گیرد، چون هنوز
 * استفاده نمی‌شود. هر وقت لازم شد، همین اسکریپت با parentId طبقه‌ی دو اجرا شود.
 *
 * اجرا:  npx ts-node prisma/setup-warehouse.ts
 */
// باید اول باشد: AppModule هنگام import به JWT_SECRET نیاز دارد.
import '../src/load-env';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { LocationBuilderService } from '../src/location-builder/location-builder.service';
import { PrismaService } from '../src/prisma/prisma.service';

const WAREHOUSE = { code: 'W01', name: 'انبار مرکزی' };

/** طبقه‌ها ساخته می‌شوند، ولی فقط طبقه‌ی اول پر می‌شود. */
const FLOORS = 2;
const ROWS_PER_FLOOR = 6;
const COLUMNS_PER_ROW = 20;
const SHELVES_PER_COLUMN = 3;

/** depth از صفر شروع می‌شود و در هر انبار یکتاست. */
const TYPES = [
  { name: 'طبقه', depth: 0 },
  { name: 'ردیف', depth: 1 },
  { name: 'ستون', depth: 2 },
  { name: 'قفسه', depth: 3 },
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const builder = app.get(LocationBuilderService);

  const existing = await prisma.warehouse.findFirst({ where: { code: WAREHOUSE.code } });
  if (existing) {
    console.error(`انبار ${WAREHOUSE.code} از قبل وجود دارد — اسکریپت متوقف شد.`);
    await app.close();
    process.exit(1);
  }

  const warehouse = await prisma.warehouse.create({ data: WAREHOUSE });
  console.log(`انبار ساخته شد: ${warehouse.code} — ${warehouse.name}`);

  const types: Record<string, string> = {};
  for (const t of TYPES) {
    const created = await prisma.locationType.create({
      data: { warehouseId: warehouse.id, name: t.name, depth: t.depth },
    });
    types[t.name] = created.id;
    console.log(`  نوع موقعیت: ${t.name} (depth ${t.depth})`);
  }

  // ۱) طبقه‌ها زیر ریشه‌ی انبار.
  const floors = await builder.generateTree({
    warehouseId: warehouse.id,
    levels: [{ locationTypeId: types['طبقه'], count: FLOORS }],
  });
  console.log(`طبقه‌ها: ${JSON.stringify(floors)}`);

  // ۲) فقط طبقه‌ی اول: ردیف → ستون → قفسه.
  const firstFloor = await prisma.location.findFirst({
    where: { warehouseId: warehouse.id, parentId: null },
    orderBy: { code: 'asc' },
  });
  if (!firstFloor) throw new Error('طبقه‌ی اول ساخته نشد');

  const inner = await builder.generateTree({
    warehouseId: warehouse.id,
    parentId: firstFloor.id,
    levels: [
      { locationTypeId: types['ردیف'], count: ROWS_PER_FLOOR },
      { locationTypeId: types['ستون'], count: COLUMNS_PER_ROW },
      { locationTypeId: types['قفسه'], count: SHELVES_PER_COLUMN },
    ],
  });
  console.log(`داخل ${firstFloor.name}: ${JSON.stringify(inner)}`);

  const total = await prisma.location.count({ where: { warehouseId: warehouse.id } });
  const byDepth = await prisma.location.groupBy({
    by: ['depth'],
    where: { warehouseId: warehouse.id },
    _count: true,
  });
  console.log(`\nمجموع موقعیت‌ها: ${total}`);
  console.table(byDepth.map((d) => ({ depth: d.depth, count: d._count })));

  const sample = await prisma.location.findFirst({
    where: { warehouseId: warehouse.id, depth: 3 },
    orderBy: { code: 'asc' },
    select: { code: true, barcode: true, path: true },
  });
  console.log('نمونه‌ی عمیق‌ترین موقعیت:', sample);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
