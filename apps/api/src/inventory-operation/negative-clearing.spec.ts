import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { InventoryOperationService } from './inventory-operation.service';

/**
 * صفرکردنِ کسریِ پیش از ثبت، هنگام ورودِ کالا.
 *
 * سناریوی واقعی: انبار پیش از دیجیتالی‌شدن می‌فروخت. کالایی ۳۳ بار فروخته شده
 * وقتی هنوز در سیستم نبود، پس روی «موجودی ثبت‌نشده» منفی ۳۳ نشسته. حالا کارگر
 * همان کالا را می‌شمارد: **۲۰ عدد روی قفسه است**.
 *
 * عددِ درست ۲۰ است، نه ۲۰−۳۳. آن منفی بدهی نیست؛ ردِّ فروشی است که سندش از قبل
 * در لجر هست. اگر کم می‌شد، کارگر ۲۰ عدد می‌دید و سیستم منفی ۱۳ نشان می‌داد و
 * او دوباره می‌شمرد — و باز همان.
 */

interface Row {
  productId: string;
  locationId: string;
  quantity: number;
}

describe('صفرکردن موجودی منفی هنگام ورود', () => {
  let service: InventoryOperationService;
  let rows: Row[];
  let logs: any[];

  const WAREHOUSE = 'w1';
  const SHELF = 'shelf-1';
  const UNREG = 'sys-unreg';

  const tx = {
    location: {
      findUnique: ({ where }: any) =>
        Promise.resolve(
          [SHELF, UNREG].includes(where.id) ? { warehouseId: WAREHOUSE } : null,
        ),
    },
    inventory: {
      findMany: ({ where }: any) =>
        Promise.resolve(
          rows
            .filter((r) => r.productId === where.productId && r.quantity < 0)
            .sort((a, b) => a.locationId.localeCompare(b.locationId))
            .map((r) => ({ locationId: r.locationId, quantity: r.quantity })),
        ),
      update: ({ where, data }: any) => {
        const r = rows.find(
          (x) =>
            x.productId === where.productId_locationId.productId &&
            x.locationId === where.productId_locationId.locationId,
        )!;
        r.quantity = data.quantity;
        return Promise.resolve(r);
      },
      upsert: ({ where, update, create }: any) => {
        const key = where.productId_locationId;
        const found = rows.find(
          (x) => x.productId === key.productId && x.locationId === key.locationId,
        );
        if (found) {
          found.quantity += update.quantity.increment;
          return Promise.resolve(found);
        }
        const made = { ...create };
        rows.push(made);
        return Promise.resolve(made);
      },
    },
    inventoryLog: {
      create: ({ data }: any) => {
        logs.push(data);
        return Promise.resolve({ id: `log-${logs.length}`, ...data });
      },
    },
    inventorySession: { findUnique: jest.fn() },
  };

  const prisma = {
    $transaction: (fn: any) => fn(tx),
    ...tx,
  };

  beforeEach(async () => {
    rows = [];
    logs = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryOperationService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsGateway, useValue: { broadcast: jest.fn() } },
      ],
    }).compile();

    service = module.get(InventoryOperationService);
  });

  const qtyAt = (locationId: string) =>
    rows.find((r) => r.locationId === locationId)?.quantity ?? 0;

  it('کسریِ ثبت‌نشده صفر می‌شود و عددِ کارگر کامل اضافه می‌شود', async () => {
    rows.push({ productId: 'p1', locationId: UNREG, quantity: -33 });

    await service.execute({
      type: 'IN',
      productId: 'p1',
      locationId: SHELF,
      quantity: 20,
      userId: 'u1',
    });

    // عددِ کارگر دست‌نخورده روی قفسه می‌نشیند — نه ۲۰ منهای ۳۳.
    expect(qtyAt(SHELF)).toBe(20);
    expect(qtyAt(UNREG)).toBe(0);
  });

  it('صفرکردن با ADJUST ثبت می‌شود، نه IN', async () => {
    rows.push({ productId: 'p1', locationId: UNREG, quantity: -33 });

    await service.execute({
      type: 'IN',
      productId: 'p1',
      locationId: SHELF,
      quantity: 20,
    });

    const adjust = logs.find((l) => l.action === 'ADJUST');
    const income = logs.find((l) => l.action === 'IN');

    // جنسی وارد نشده که IN باشد؛ یک تصحیح انجام شده.
    expect(adjust).toBeDefined();
    expect(adjust.locationId).toBe(UNREG);
    expect(adjust.quantity).toBe(33); // قرینه‌ی منفی، طبق قراردادِ دلتای ADJUST
    expect(adjust.note).toContain('کسری');

    expect(income.locationId).toBe(SHELF);
    expect(income.quantity).toBe(20);
  });

  it('کالایی که کسری ندارد هیچ ADJUSTی نمی‌گیرد', async () => {
    await service.execute({
      type: 'IN',
      productId: 'p1',
      locationId: SHELF,
      quantity: 5,
    });

    expect(logs.filter((l) => l.action === 'ADJUST')).toHaveLength(0);
    expect(qtyAt(SHELF)).toBe(5);
  });

  it('کسریِ روی خودِ همان قفسه هم اول صفر می‌شود', async () => {
    // ۵− روی همان قفسه‌ای که کارگر دارد ثبت می‌کند: نتیجه باید ۲۰ باشد نه ۱۵.
    rows.push({ productId: 'p1', locationId: SHELF, quantity: -5 });

    await service.execute({
      type: 'IN',
      productId: 'p1',
      locationId: SHELF,
      quantity: 20,
    });

    expect(qtyAt(SHELF)).toBe(20);
  });

  it('فاکتور خرید کسری را صفر نمی‌کند', async () => {
    // عددِ روی برگه‌ی فروشنده «چه چیزی رسید» است، نه «چه چیزی روی قفسه است».
    rows.push({ productId: 'p1', locationId: UNREG, quantity: -33 });

    await service.execute({
      type: 'IN',
      productId: 'p1',
      locationId: SHELF,
      quantity: 500,
      purchaseId: 'purchase-1',
      unitPrice: 1000,
    });

    expect(qtyAt(UNREG)).toBe(-33);
    expect(logs.filter((l) => l.action === 'ADJUST')).toHaveLength(0);
  });

  it('RETURN کسری را صفر نمی‌کند', async () => {
    // برگشت از فروش یک حرکتِ جبرانیِ سندِ دیگری است، نه شمارشِ قفسه.
    rows.push({ productId: 'p1', locationId: UNREG, quantity: -33 });

    await service.execute({
      type: 'RETURN',
      productId: 'p1',
      locationId: SHELF,
      quantity: 2,
    });

    expect(qtyAt(UNREG)).toBe(-33);
  });
});
