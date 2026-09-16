/**
 * زیرساختِ تست‌های QA — سرویس‌های واقعی روی دیتابیسِ واقعیِ جدا (warehouse_os_qa).
 * هیچ چیز mock نمی‌شود جز EventsGateway (سوکت) که اثرِ داده‌ای ندارد.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { InventoryOperationService } from '../../src/inventory-operation/inventory-operation.service';
import { SystemLocationsService } from '../../src/inventory/system-locations.service';
import { LedgerService } from '../../src/sales/ledger.service';
import { SalesService } from '../../src/sales/sales.service';
import { ReturnsService } from '../../src/sales/returns.service';
import { CorrectionsService } from '../../src/sales/corrections.service';
import { CustomersService } from '../../src/sales/customers.service';
import { CustomerCategoriesService } from '../../src/sales/customer-categories.service';
import { InvoiceEffectsService } from '../../src/sales/invoice-effects.service';
import { buildSearchTokens } from '../../src/products/search-tokens';

if (
  !process.env.DATABASE_URL?.endsWith('_qa?schema=public') &&
  !process.env.DATABASE_URL?.includes('warehouse_os_qa')
) {
  throw new Error('REFUSING: not the QA database');
}

export const broadcasts: any[] = [];
export const fakeGateway: any = {
  broadcast: (e: any) => {
    broadcasts.push(e);
  },
};

/*
 * عمداً `PrismaService` و نه `new PrismaClient()` خام: تنظیماتِ تراکنش
 * (`maxWait`/`timeout`) روی همان کلاس نشسته. با کلاینتِ خام، تست‌ها روی
 * پیکربندی‌ای اجرا می‌شدند که در تولید وجود ندارد — و همان چیزی بود که
 * باعث شد رفعِ H‑۴ در تست دیده نشود.
 */
export const prisma = new PrismaService();

export const operation = new InventoryOperationService(prisma, fakeGateway);
export const systemLocations = new SystemLocationsService();
export const ledger = new LedgerService(prisma);
export const sales = new SalesService(
  prisma,
  operation,
  ledger,
  systemLocations,
  fakeGateway,
);
export const returns = new ReturnsService(
  prisma,
  operation,
  ledger,
  fakeGateway,
);
export const corrections = new CorrectionsService(
  prisma,
  operation,
  systemLocations,
  ledger,
  fakeGateway,
);
export const categories = new CustomerCategoriesService(prisma);
export const customers = new CustomersService(prisma, ledger, categories);
export const effects = new InvoiceEffectsService(prisma);

let counter = 0;
export const uniq = (p = 'x') =>
  `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface Fixture {
  warehouseId: string;
  warehouse2Id: string;
  locationId: string;
  location2Id: string;
  foreignLocationId: string;
  userId: string;
}

let fixture: Fixture | null = null;

/** انبار/قفسه/کاربرِ پایه. یک بار برای کل اجرا ساخته می‌شود. */
export async function baseFixture(): Promise<Fixture> {
  if (fixture) return fixture;

  const user = await prisma.user.create({
    data: {
      username: uniq('qa-user'),
      password: 'x',
      fullName: 'QA',
      role: 'ADMIN',
    },
  });

  const wh = await prisma.warehouse.create({
    data: { name: 'QA انبار', code: uniq('QAW').toUpperCase() },
  });
  const wh2 = await prisma.warehouse.create({
    data: { name: 'QA انبار ۲', code: uniq('QAW2').toUpperCase() },
  });

  const mkType = async (warehouseId: string, depth: number) =>
    prisma.locationType.create({
      data: { name: `نوع${depth}`, depth, warehouseId },
    });

  const t1 = await mkType(wh.id, 1);
  const t2 = await mkType(wh2.id, 1);

  const mkLoc = async (warehouseId: string, typeId: string, name: string) =>
    prisma.location.create({
      data: {
        name,
        code: uniq('L').toUpperCase(),
        barcode: uniq('B').toUpperCase(),
        warehouseId,
        typeId,
        depth: 1,
        path: name,
      },
    });

  const l1 = await mkLoc(wh.id, t1.id, 'قفسه ۱');
  const l2 = await mkLoc(wh.id, t1.id, 'قفسه ۲');
  const lf = await mkLoc(wh2.id, t2.id, 'قفسه بیگانه');

  fixture = {
    warehouseId: wh.id,
    warehouse2Id: wh2.id,
    locationId: l1.id,
    location2Id: l2.id,
    foreignLocationId: lf.id,
    userId: user.id,
  };
  return fixture;
}

/** کالای تازه با موجودیِ اولیه روی قفسه‌ی داده‌شده. */
export async function makeProduct(
  opts: {
    stock?: number;
    locationId?: string;
    salePrice?: number;
    purchasePrice?: number;
    isActive?: boolean;
    deleted?: boolean;
    name?: string;
  } = {},
) {
  const f = await baseFixture();
  const name = opts.name ?? `کالای ${uniq('p')}`;
  const sku = uniq('SKU').toUpperCase();
  const p = await prisma.product.create({
    data: {
      name,
      sku,
      isActive: opts.isActive ?? true,
      deletedAt: opts.deleted ? new Date() : null,
      // مثل مسیر واقعی: کالا هیچ‌وقت بدون توکنِ جستجو ساخته نمی‌شود. بدون این،
      // هر تستِ جستجو روی کالای نامرئی اجرا می‌شد و بی‌معنا سبز/قرمز می‌شد.
      searchTokens: buildSearchTokens(name, sku, null),
    },
  });
  if (opts.salePrice != null || opts.purchasePrice != null) {
    await prisma.productPrice.create({
      data: {
        productId: p.id,
        salePrice: opts.salePrice ?? null,
        purchasePrice: opts.purchasePrice ?? null,
      },
    });
  }
  if (opts.stock != null) {
    await prisma.inventory.create({
      data: {
        productId: p.id,
        locationId: opts.locationId ?? f.locationId,
        quantity: opts.stock,
      },
    });
  }
  return p;
}

export async function makeCustomer(over: any = {}) {
  const { phone, ...rest } = over;
  return await prisma.customer.create({
    data: {
      firstName: rest.firstName ?? 'مشتری',
      lastName: rest.lastName ?? uniq('ln'),
      searchName: rest.searchName ?? `مشتری ${uniq('ln')}`,
      creditDays: rest.creditDays ?? 0,
      ...rest,
      // `phone` می‌تواند string (ساده) یا objectِ create-رابطه باشد. اینجا فرضِ
      // متداولِ تست: شِمایِ فعلی `Customer.phone` را ندارد؛ شماره در رابطه‌ی
      // `phones` است. پس phone تکی → createِ CustomerPhone با isPrimary.
      ...(phone
        ? { phones: { create: { phone: phone, isPrimary: true } } }
        : {}),
    },
  });
}

export async function stockAt(
  productId: string,
  locationId: string,
): Promise<number> {
  const row = await prisma.inventory.findUnique({
    where: { productId_locationId: { productId, locationId } },
  });
  return row?.quantity ?? 0;
}

/** جمعِ موجودیِ کالا در همه‌ی قفسه‌ها. */
export async function totalStock(productId: string): Promise<number> {
  const agg = await prisma.inventory.aggregate({
    where: { productId },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

/** عکسِ فوریِ همه‌ی جدول‌هایی که یک فروش لمس می‌کند. */
export async function snapshot(productId?: string, customerId?: string) {
  const [inv, logs, invoices, payments, ledgerRows, rets, corrs] =
    await Promise.all([
      productId
        ? prisma.inventory.findMany({
            where: { productId },
            orderBy: { locationId: 'asc' },
          })
        : ([] as any[]),
      productId ? prisma.inventoryLog.count({ where: { productId } }) : 0,
      prisma.saleInvoice.count(),
      prisma.payment.count(),
      customerId
        ? prisma.customerLedger.findMany({ where: { customerId } })
        : ([] as any[]),
      prisma.saleReturn.count(),
      prisma.saleCorrection.count(),
    ]);
  return {
    stock: (inv as any[]).reduce((s: number, r: any) => s + r.quantity, 0),
    invRows: (inv as any[]).length,
    logs,
    invoices,
    payments,
    ledgerSum: (ledgerRows as any[]).reduce(
      (s: number, r: any) => s + r.amount,
      0,
    ),
    ledgerRows: (ledgerRows as any[]).length,
    returns: rets,
    corrections: corrs,
  };
}

export const invoiceDto = (over: any = {}) => ({
  idempotencyKey: uniq('idem'),
  ...over,
});

export async function close() {
  await (prisma as unknown as PrismaClient).$disconnect();
}
