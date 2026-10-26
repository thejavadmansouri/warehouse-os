import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { InventoryOperationService } from './inventory-operation.service';

/**
 * رگرسیونِ باگِ H‑1 گزارشِ QA: تعدادِ اعشاری.
 *
 * سناریوی واقعی: کالا از Excel یا صفِ آفلاینِ موبایل با `quantity: 2.5` وارد
 * می‌شود. مبلغِ فاکتور در جاوااسکریپت با همان ۲.۵ حساب می‌شود، ولی ستونِ
 * `quantity` در پستگرس `INT4` است و بی‌صدا ۲ ذخیره می‌کند — مشتری بابتِ ۲.۵
 * پول می‌دهد و انبار ۲ کم می‌شود. اختلاف هیچ‌جا گزارش نمی‌شد.
 *
 * گارد در `runOperation` نشسته، نه فقط در `@IsInt()` لبه‌ی HTTP، چون صفِ آفلاین
 * و sync و صوت از آن پایپ رد نمی‌شوند. این تست همان گارد را قفل می‌کند.
 *
 * ADJUST دو تفاوت دارد که در همین فایل پوشش داده شده‌اند:
 * ۱. عددش «موجودیِ مقصد» است نه دلتا → `targetQuantity`.
 * ۲. صداکننده‌هایش اصلاً `quantity` نمی‌فرستند؛ گاردی که `quantity` را برای همه
 *    چک می‌کرد، هر تعدیلِ دستی و هر پایانِ انبارگردانی را رد می‌کرد.
 */

interface Row {
  productId: string;
  locationId: string;
  quantity: number;
}

interface LogRow {
  action: string;
  quantity: number;
  locationId?: string;
  note?: string | null;
  [key: string]: unknown;
}

interface Where {
  productId_locationId: { productId: string; locationId: string };
}

interface UpsertArgs {
  where: Where;
  update: { quantity: number | { increment: number } };
  create: Row;
}

interface AdjustResult {
  success: boolean;
  operation: string;
  oldQty: number;
  newQty: number;
  diff: number;
}

describe('تعدادِ اعشاری هرگز به موجودی نمی‌رسد', () => {
  let service: InventoryOperationService;
  let rows: Row[];
  let logs: LogRow[];

  const SHELF = 'shelf-1';

  const findRow = (where: Where) =>
    rows.find(
      (x) =>
        x.productId === where.productId_locationId.productId &&
        x.locationId === where.productId_locationId.locationId,
    );

  const tx = {
    location: {
      findUnique: () => Promise.resolve({ warehouseId: 'w1' }),
    },
    inventory: {
      findMany: () => Promise.resolve([]),
      findUnique: ({ where }: { where: Where }) =>
        Promise.resolve(findRow(where) ?? null),
      update: ({
        where,
        data,
      }: {
        where: Where;
        data: { quantity: number };
      }) => {
        const row = findRow(where)!;
        row.quantity = data.quantity;
        return Promise.resolve(row);
      },
      upsert: ({ where, update, create }: UpsertArgs) => {
        const found = findRow(where);
        if (found) {
          // دو شکلِ update: افزایشی (`{ increment }`) برای IN/SALE و مقدارِ
          // مطلق برای ADJUST.
          const quantity = update.quantity;
          found.quantity =
            typeof quantity === 'number'
              ? quantity
              : found.quantity + quantity.increment;
          return Promise.resolve(found);
        }
        rows.push(create);
        return Promise.resolve(create);
      },
    },
    inventoryLog: {
      create: ({ data }: { data: LogRow }) => {
        logs.push(data);
        return Promise.resolve({ id: `log-${logs.length}`, ...data });
      },
    },
    inventorySession: { findUnique: jest.fn() },
  };

  const prisma = {
    $transaction: <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
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

  const adjust = (dto: Record<string, unknown>) =>
    service.execute({ type: 'ADJUST', locationId: SHELF, ...dto });

  it('ورودِ ۲.۵ رد می‌شود و موجودی دست‌نخورده می‌ماند', async () => {
    await expect(
      service.execute({
        type: 'IN',
        productId: 'p1',
        locationId: SHELF,
        quantity: 2.5,
      }),
    ).rejects.toMatchObject({
      response: { error: 'INVALID_QUANTITY' },
    });

    // هیچ ردیفِ موجودی و هیچ سطرِ لجرِ نیمه‌کاره‌ای نباید ساخته شود.
    expect(rows).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it('خروجِ اعشاری هم رد می‌شود (نه فقط ورود)', async () => {
    rows.push({ productId: 'p1', locationId: SHELF, quantity: 10 });

    await expect(
      service.execute({
        type: 'OUT',
        productId: 'p1',
        locationId: SHELF,
        quantity: 1.5,
      }),
    ).rejects.toMatchObject({
      response: { error: 'INVALID_QUANTITY' },
    });

    expect(rows[0].quantity).toBe(10);
    expect(logs).toHaveLength(0);
  });

  it('فروش و انتقال هم عددِ اعشاری نمی‌پذیرند', async () => {
    rows.push({ productId: 'p1', locationId: SHELF, quantity: 10 });

    await expect(
      service.execute({
        type: 'SALE',
        productId: 'p1',
        locationId: SHELF,
        quantity: 0.5,
        unitPrice: 100_000,
      }),
    ).rejects.toMatchObject({
      response: { error: 'INVALID_QUANTITY' },
    });

    await expect(
      service.execute({
        type: 'TRANSFER',
        productId: 'p1',
        locationId: SHELF,
        toLocationId: 'shelf-2',
        quantity: 2.5,
      }),
    ).rejects.toMatchObject({
      response: { error: 'INVALID_QUANTITY' },
    });

    expect(rows[0].quantity).toBe(10);
    expect(logs).toHaveLength(0);
  });

  it('NaN و رشتهٔ نامعتبر هم رد می‌شوند', async () => {
    for (const quantity of [NaN, 'abc' as unknown as number]) {
      await expect(
        service.execute({
          type: 'IN',
          productId: 'p1',
          locationId: SHELF,
          quantity,
        }),
      ).rejects.toMatchObject({
        response: { error: 'INVALID_QUANTITY' },
      });
    }

    expect(rows).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  describe('ADJUST', () => {
    it('تعدیلِ دستی با targetQuantity صحیح کار می‌کند', async () => {
      // رگرسیونِ باگ: صداکننده‌ها `quantity` نمی‌فرستند. گاردِ قبلی همین‌جا
      // هر تعدیلِ دستی را با INVALID_QUANTITY رد می‌کرد.
      rows.push({ productId: 'p1', locationId: SHELF, quantity: 10 });

      const result = (await adjust({
        productId: 'p1',
        targetQuantity: 7,
      })) as AdjustResult;

      expect(rows[0].quantity).toBe(7);
      expect(result.oldQty).toBe(10);
      expect(result.newQty).toBe(7);
      expect(result.diff).toBe(-3);

      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('ADJUST');
      expect(logs[0].quantity).toBe(-3);
    });

    it('targetQuantity اعشاری رد می‌شود', async () => {
      rows.push({ productId: 'p1', locationId: SHELF, quantity: 10 });

      await expect(
        adjust({ productId: 'p1', targetQuantity: 2.5 }),
      ).rejects.toMatchObject({
        response: { error: 'INVALID_TARGET_QUANTITY' },
      });

      expect(rows[0].quantity).toBe(10);
      expect(logs).toHaveLength(0);
    });

    it('targetQuantity منفی یا نبودِ آن رد می‌شود', async () => {
      rows.push({ productId: 'p1', locationId: SHELF, quantity: 10 });

      for (const targetQuantity of [-1, undefined, NaN]) {
        await expect(
          adjust({ productId: 'p1', targetQuantity }),
        ).rejects.toMatchObject({
          response: { error: 'INVALID_TARGET_QUANTITY' },
        });
      }

      expect(rows[0].quantity).toBe(10);
      expect(logs).toHaveLength(0);
    });

    it('صفرکردن هم مجاز است (کالا در این قفسه تمام شده)', async () => {
      rows.push({ productId: 'p1', locationId: SHELF, quantity: 4 });

      await adjust({ productId: 'p1', targetQuantity: 0 });

      expect(rows[0].quantity).toBe(0);
      expect(logs[0].quantity).toBe(-4);
    });
  });
});
