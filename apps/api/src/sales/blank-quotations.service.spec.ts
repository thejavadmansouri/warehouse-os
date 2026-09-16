import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BlankQuotationStatus } from '@prisma/client';

import { BlankQuotationsService } from './blank-quotations.service';

/**
 * تست‌های «پیش‌فاکتور سفید» (برگه‌ی قیمت).
 *
 * قواعدی که اینجا قفل می‌شوند — هیچ‌کدام قابل مذاکره نیستند:
 *
 *   • **قیمت پیشنهادیِ گوشی هیچ‌وقت وارد جمع نمی‌شود.** جمع فقط از قیمت نهایی
 *     مدیر ساخته می‌شود. اگر این خط بشکند، مشتری برگه‌ای می‌گیرد که با فاکتور
 *     نمی‌خواند.
 *   • **تا لحظه‌ی تبدیل هیچ موجودی‌ای کم نمی‌شود** (Rule 1). این سرویس خودش
 *     هیچ‌جا InventoryOperation صدا نمی‌زند؛ تنها `SalesService.createInvoice`
 *     این کار را می‌کند.
 *   • **تبدیل تا وقتی همه‌ی اقلام کالا و قیمت ندارند قفل است**؛ و کلید یکتای
 *     فاکتور از شناسه‌ی خودِ برگه ساخته می‌شود تا تبدیلِ دوباره فاکتور دوم
 *     نسازد (موجودی دو بار کم نشود).
 *   • **صف آفلاین گوشی**: تکرار `clientRequestId` برگه‌ی دوم نمی‌سازد، حتی اگر
 *     دو درخواست هم‌زمان برسند.
 *
 * ماکِ Prisma، درون‌حافظه‌ای است و روی همان چیزی می‌نویسد که سرویس می‌خواند؛
 * `update`/`updateMany` واقعاً وضعیت را عوض می‌کنند تا خودِ گاردها معنا داشته
 * باشند (مثلاً تبدیل دوباره باید به گاردِ وضعیت بخورد، نه به یک ماکِ ثابت).
 */

type FakeLine = {
  id: string;
  blankQuotationId: string;
  text: string;
  quantity: number;
  suggestedPrice: number | null;
  finalPrice: number | null;
  pricedAt: Date | null;
  productId: string | null;
  locationId: string | null;
};

type FakeSheet = {
  id: string;
  number: number;
  idempotencyKey: string | null;
  warehouseId: string;
  userId: string | null;
  customerName: string | null;
  note: string | null;
  status: BlankQuotationStatus;
  validUntil: Date | null;
  convertedInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makePrisma() {
  const sheets: FakeSheet[] = [];
  const lines: FakeLine[] = [];
  const users = [{ id: 'u1', fullName: 'فروشنده' }];
  const products = [
    { id: 'p1', name: 'لنت ترمز پراید جلو', sku: 'LP-100', unit: 'عدد' },
    { id: 'p2', name: 'فیلتر روغن پژو', sku: 'FR-200', unit: 'عدد' },
  ];
  const locations = [{ id: 'loc1', path: 'قفسه A-3-2' }];

  let seq = 0;

  const matchWhere = (s: FakeSheet, where: any): boolean => {
    if (!where) return true;
    if (where.id && s.id !== where.id) return false;
    if (where.idempotencyKey && s.idempotencyKey !== where.idempotencyKey) return false;
    if (where.status) {
      if (typeof where.status === 'string') {
        if (s.status !== where.status) return false;
      } else if (Array.isArray(where.status.in)) {
        if (!where.status.in.includes(s.status)) return false;
      }
    }
    if (where.validUntil) {
      if (where.validUntil.lt && !(s.validUntil && s.validUntil < where.validUntil.lt)) return false;
      if (where.validUntil.gte && !(s.validUntil && s.validUntil >= where.validUntil.gte)) return false;
    }
    if (Array.isArray(where.OR)) {
      const any = where.OR.some((cond: any) => {
        if (cond.validUntil === null) return s.validUntil === null;
        if (cond.validUntil?.gte) return s.validUntil !== null && s.validUntil >= cond.validUntil.gte;
        return false;
      });
      if (!any) return false;
    }
    return true;
  };

  const prisma: any = {
    // --- خودِ برگه ---
    blankQuotation: {
      findUnique: jest.fn(async ({ where, include }: any) => {
        const sheet =
          sheets.find((s) => matchWhere(s, where)) ??
          (where.id ? sheets.find((s) => s.id === where.id) : undefined);
        if (!sheet) return null;
        return {
          ...sheet,
          ...(include?.user ? { user: users.find((u) => u.id === sheet.userId) ?? null } : {}),
          ...(include?.lines ? { lines: lines.filter((l) => l.blankQuotationId === sheet.id) } : {}),
        };
      }),

      create: jest.fn(async ({ data, select }: any) => {
        if (data.idempotencyKey && sheets.some((s) => s.idempotencyKey === data.idempotencyKey)) {
          // همان چیزی که دیتابیس واقعی می‌دهد: P2002 روی کلید یکتا.
          const err: any = new Error('unique constraint');
          err.code = 'P2002';
          err.meta = { target: ['idempotencyKey'] };
          throw err;
        }
        const sheet: FakeSheet = {
          id: `bq${++seq}`,
          number: seq,
          idempotencyKey: data.idempotencyKey ?? null,
          warehouseId: data.warehouseId,
          userId: data.userId ?? null,
          customerName: data.customerName ?? null,
          note: data.note ?? null,
          status: BlankQuotationStatus.OPEN,
          validUntil: data.validUntil ?? null,
          convertedInvoiceId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        sheets.push(sheet);
        for (const l of data.lines?.create ?? []) {
          lines.push({
            id: `bl${++seq}`,
            blankQuotationId: sheet.id,
            text: l.text,
            quantity: l.quantity,
            suggestedPrice: l.suggestedPrice ?? null,
            finalPrice: l.finalPrice ?? null,
            pricedAt: l.pricedAt ?? null,
            productId: l.productId ?? null,
            locationId: l.locationId ?? null,
          });
        }
        return select ? { id: sheet.id } : sheet;
      }),

      findMany: jest.fn(async ({ where, skip, take }: any) => {
        const rows = sheets.filter((s) => matchWhere(s, where));
        return rows.slice(skip ?? 0, (skip ?? 0) + (take ?? rows.length)).map((s) => ({
          ...s,
          user: users.find((u) => u.id === s.userId) ?? null,
          lines: lines.filter((l) => l.blankQuotationId === s.id),
        }));
      }),

      count: jest.fn(async ({ where }: any) => sheets.filter((s) => matchWhere(s, where)).length),

      update: jest.fn(async ({ where, data }: any) => {
        const sheet = sheets.find((s) => s.id === where.id)!;
        Object.assign(sheet, data, { updatedAt: new Date() });
        return sheet;
      }),

      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = sheets.filter((s) => {
          if (s.id !== where.id) return false;
          if (typeof where.status === 'string') return s.status === where.status;
          if (where.status?.in) return where.status.in.includes(s.status);
          return true;
        });
        rows.forEach((s) => Object.assign(s, data));
        return { count: rows.length };
      }),
    },

    // --- قلم‌ها ---
    blankQuotationLine: {
      update: jest.fn(async ({ where, data }: any) => {
        const line = lines.find((l) => l.id === where.id)!;
        Object.assign(line, data);
        return line;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        lines.filter((l) => l.blankQuotationId === where.blankQuotationId),
      ),
    },

    // --- وابستگی‌های کمکی ---
    user: { findUnique: jest.fn(async ({ where }: any) => users.find((u) => u.id === where.id) ?? null) },

    product: {
      findUnique: jest.fn(async ({ where }: any) => products.find((p) => p.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        products.filter((p) => (where.id?.in ?? []).includes(p.id)),
      ),
    },

    location: {
      findUnique: jest.fn(async ({ where }: any) => locations.find((l) => l.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        locations.filter((l) => (where.id?.in ?? []).includes(l.id)),
      ),
    },

    warehouse: { findFirst: jest.fn(async () => ({ id: 'w1' })) },

    // --- تراکنش: هم شکلِ آرایه‌ای (فهرست) و هم callback (قیمت‌گذاری) ---
    $transaction: jest.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    ),

    // هیچ‌جای این سرویس نباید موجودی را دست بزند؛ این‌ها برای اثباتِ همان هستند.
    inventoryOperation: { create: jest.fn() },
    inventoryLog: { create: jest.fn(), createMany: jest.fn() },
  };

  return { prisma, sheets, lines };
}

function makeService(prisma: any) {
  const sales = {
    createInvoice: jest.fn(async () => ({ id: 'inv1', number: 7, total: 500_000 })),
  };
  const products = {
    searchWithStock: jest.fn(async () => [] as any[]),
  };
  const service = new BlankQuotationsService(prisma, sales as any, products as any);
  return { service, sales, products };
}

const createDto = (over: Record<string, unknown> = {}) =>
  ({
    clientRequestId: 'req-12345678',
    customerName: 'محسن',
    lines: [{ text: 'لنت پراید', quantity: 3, suggestedPrice: 200_000 }],
    ...over,
  }) as any;

describe('BlankQuotationsService — ساخت (مسیر آفلاین گوشی)', () => {
  it('برگه را با انبارِ سرور می‌سازد و قیمتِ نهایی/کالا را خالی می‌گذارد', async () => {
    const { prisma, sheets, lines } = makePrisma();
    const { service } = makeService(prisma);

    const created = await service.create(createDto(), 'u1');

    expect(created.number).toBe(1);
    expect(created.status).toBe(BlankQuotationStatus.OPEN);
    // انبار از سرور می‌آید: گوشی هیچ‌وقت warehouseId نمی‌فرستد.
    expect(sheets[0].warehouseId).toBe('w1');
    expect(sheets[0].idempotencyKey).toBe('mobile-req-12345678');
    // قیمت پیشنهادی ذخیره می‌شود ولی قیمتِ نهایی مدیر جای خالی دارد.
    expect(lines[0].suggestedPrice).toBe(200_000);
    expect(lines[0].finalPrice).toBeNull();
    expect(lines[0].pricedAt).toBeNull();
    expect(created.unpricedCount).toBe(1);
    expect(created.unlinkedCount).toBe(1);
  });

  it('ترتیبِ گفتنِ قلم‌ها ذخیره می‌شود — وگرنه برگه بی‌ترتیب خوانده می‌شود', async () => {
    const { prisma } = makePrisma();
    const { service } = makeService(prisma);

    await service.create(
      createDto({
        lines: [
          { text: 'لنت پراید جلو', quantity: 2 },
          { text: 'فیلتر روغن', quantity: 1 },
          { text: 'واشر', quantity: 4 },
        ],
      }),
    );

    /*
     * `position` روی خودِ ردیف نوشته می‌شود، چون هیچ ترتیب دیگری وجود ندارد:
     * `createdAt` در یک تراکنش برای همه یکسان است و `id` هم uuidِ تصادفی است.
     * این تست همان باگی را می‌گیرد که تست دود روی دیتابیس واقعی پیدا کرد
     * (ردیف‌ها جابه‌جا برمی‌گشتند).
     */
    const payload = prisma.blankQuotation.create.mock.calls[0][0] as any;
    expect(payload.data.lines.create.map((l: any) => l.position)).toEqual([0, 1, 2]);
  });

  it('همان clientRequestId ⇒ همان برگه، بدون ساختن دومی', async () => {
    const { prisma, sheets } = makePrisma();
    const { service } = makeService(prisma);

    const first = await service.create(createDto());
    const second = await service.create(createDto());

    expect(second.id).toBe(first.id);
    expect(sheets).toHaveLength(1);
  });

  it('دو درخواستِ هم‌زمان با یک کلید: دومی به قیدِ یکتا می‌خورد و همان برگه را می‌گیرد', async () => {
    const { prisma, sheets } = makePrisma();
    const { service } = makeService(prisma);

    // نگاهِ اولِ سرویس را خالی می‌کنیم تا مسیرِ «برخورد با P2002» اجرا شود.
    const spy = jest.spyOn(prisma.blankQuotation, 'findUnique');
    spy.mockResolvedValueOnce(null);

    const first = await service.create(createDto());
    const raced = await service.create(createDto());

    expect(raced.id).toBe(first.id);
    expect(sheets).toHaveLength(1);
  });

  it('قلمِ بی‌متن، تعدادِ صفر و قیمتِ منفی رد می‌شوند', async () => {
    const { prisma } = makePrisma();
    const { service } = makeService(prisma);

    await expect(
      service.create(createDto({ lines: [{ text: '   ', quantity: 1 }] })),
    ).rejects.toMatchObject({ response: { error: 'EMPTY_TEXT' } });

    await expect(
      service.create(createDto({ lines: [{ text: 'لنت', quantity: 0 }] })),
    ).rejects.toMatchObject({ response: { error: 'INVALID_QUANTITY' } });

    await expect(
      service.create(createDto({ lines: [{ text: 'لنت', quantity: 1, suggestedPrice: -5 }] })),
    ).rejects.toMatchObject({ response: { error: 'INVALID_PRICE' } });
  });

  it('بدون انبار، برگه ساخته نمی‌شود', async () => {
    const { prisma } = makePrisma();
    prisma.warehouse.findFirst.mockResolvedValue(null);
    const { service } = makeService(prisma);

    await expect(service.create(createDto())).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BlankQuotationsService — قیمت‌گذاری مدیر', () => {
  it('قیمت نهایی را می‌نویسد و وضعیت را PRICED می‌کند؛ پیشنهاد گوشی در جمع نمی‌آید', async () => {
    const { prisma, lines } = makePrisma();
    const { service } = makeService(prisma);

    const created = await service.create(
      createDto({
        lines: [
          { text: 'لنت پراید', quantity: 3, suggestedPrice: 999_999 },
          { text: 'فیلتر روغن', quantity: 2, suggestedPrice: 111_111 },
        ],
      }),
    );

    const priced = await service.savePrices(created.id, {
      lines: created.lines.map((l) => ({ lineId: l.id, finalPrice: 100_000 })),
    } as any);

    expect(priced.status).toBe(BlankQuotationStatus.PRICED);
    expect(priced.unpricedCount).toBe(0);
    // ۳×۱۰۰٬۰۰۰ + ۲×۱۰۰٬۰۰۰ — عددهای پیشنهادی (۹۹۹٬۹۹۹ و ۱۱۱٬۱۱۱) هیچ سهمی ندارند.
    expect(priced.total).toBe(500_000);
    expect(lines.every((l) => l.pricedAt !== null)).toBe(true);
  });

  it('تا وقتی یک قلم قیمت نخورده، وضعیت OPEN می‌ماند', async () => {
    const { prisma } = makePrisma();
    const { service } = makeService(prisma);
    const created = await service.create(
      createDto({
        lines: [
          { text: 'لنت پراید', quantity: 1 },
          { text: 'فیلتر روغن', quantity: 1 },
        ],
      }),
    );

    const partly = await service.savePrices(created.id, {
      lines: [{ lineId: created.lines[0].id, finalPrice: 50_000 }],
    } as any);

    expect(partly.status).toBe(BlankQuotationStatus.OPEN);
    expect(partly.unpricedCount).toBe(1);
  });

  it('وصل کردن قلم به کالای واقعی و قفسه ذخیره می‌شود', async () => {
    const { prisma } = makePrisma();
    const { service } = makeService(prisma);
    const created = await service.create(createDto());

    const linked = await service.savePrices(created.id, {
      lines: [
        { lineId: created.lines[0].id, finalPrice: 120_000, productId: 'p1', locationId: 'loc1' },
      ],
    } as any);

    expect(linked.unlinkedCount).toBe(0);
    expect(linked.lines[0].product?.name).toBe('لنت ترمز پراید جلو');
    expect(linked.lines[0].locationPath).toBe('قفسه A-3-2');
  });

  it('ردیفِ ناشناس، کالای ناشناس و برگه‌ی تبدیل‌شده رد می‌شوند', async () => {
    const { prisma, sheets } = makePrisma();
    const { service } = makeService(prisma);
    const created = await service.create(createDto());

    await expect(
      service.savePrices(created.id, { lines: [{ lineId: 'nope', finalPrice: 1 }] } as any),
    ).rejects.toMatchObject({ response: { error: 'LINE_NOT_FOUND' } });

    await expect(
      service.savePrices(created.id, {
        lines: [{ lineId: created.lines[0].id, productId: 'ghost' }],
      } as any),
    ).rejects.toMatchObject({ response: { error: 'PRODUCT_NOT_FOUND' } });

    sheets[0].status = BlankQuotationStatus.CONVERTED;
    await expect(
      service.savePrices(created.id, {
        lines: [{ lineId: created.lines[0].id, finalPrice: 1 }],
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('BlankQuotationsService — قاعده‌ی تبدیل', () => {
  async function readyToConvert(prisma: any, service: BlankQuotationsService) {
    const created = await service.create(
      createDto({ lines: [{ text: 'لنت پراید', quantity: 3 }] }),
    );
    await service.savePrices(created.id, {
      lines: [
        { lineId: created.lines[0].id, finalPrice: 120_000, productId: 'p1', locationId: 'loc1' },
      ],
    } as any);
    return service.findOne(created.id);
  }

  it('قلمِ بدون کالا ⇒ تبدیل قفل است', async () => {
    const { prisma } = makePrisma();
    const { service } = makeService(prisma);
    const created = await service.create(createDto());
    await service.savePrices(created.id, {
      lines: [{ lineId: created.lines[0].id, finalPrice: 100_000 }],
    } as any);

    await expect(service.convert(created.id, {})).rejects.toMatchObject({
      response: { error: 'PRODUCT_REQUIRED', lineIndex: 0 },
    });
  });

  it('قلمِ بی‌قیمت ⇒ تبدیل قفل است', async () => {
    const { prisma } = makePrisma();
    const { service } = makeService(prisma);
    const created = await service.create(createDto());
    await service.savePrices(created.id, {
      lines: [{ lineId: created.lines[0].id, productId: 'p1' }],
    } as any);

    await expect(service.convert(created.id, {})).rejects.toMatchObject({
      response: { error: 'UNPRICED_LINE', lineIndex: 0 },
    });
  });

  it('برگه‌ی لغو‌شده و برگه‌ی منقضی تبدیل نمی‌شوند', async () => {
    const { prisma } = makePrisma();
    const { service } = makeService(prisma);

    const cancelled = await service.create(createDto());
    await service.cancel(cancelled.id);
    await expect(service.convert(cancelled.id, {})).rejects.toMatchObject({
      response: { error: 'NOT_OPEN' },
    });

    const expired = await service.create(createDto({ clientRequestId: 'req-87654321' }));
    await service.savePrices(expired.id, {
      lines: [
        { lineId: expired.lines[0].id, finalPrice: 100_000, productId: 'p1', locationId: 'loc1' },
      ],
    } as any);
    // گذشتِ زمان را روی خودِ رکورد شبیه‌سازی می‌کنیم.
    prisma.blankQuotation.findUnique.mockImplementationOnce(async () => ({
      id: expired.id,
      number: expired.number,
      idempotencyKey: 'mobile-req-87654321',
      warehouseId: 'w1',
      userId: null,
      customerName: null,
      note: null,
      status: BlankQuotationStatus.PRICED,
      validUntil: new Date(Date.now() - 60_000),
      convertedInvoiceId: null,
      createdAt: new Date(),
      user: null,
      lines: [
        {
          id: expired.lines[0].id,
          blankQuotationId: expired.id,
          text: 'لنت پراید',
          quantity: 3,
          suggestedPrice: null,
          finalPrice: 100_000,
          pricedAt: new Date(),
          productId: 'p1',
          locationId: 'loc1',
        },
      ],
    }));

    await expect(service.convert(expired.id, {})).rejects.toMatchObject({
      response: { error: 'BLANK_QUOTATION_EXPIRED' },
    });
  });

  it('تبدیلِ معتبر: فاکتور با کلیدِ برگه، قیمتِ نهایی و متنِ قلم ساخته می‌شود', async () => {
    const { prisma, sheets } = makePrisma();
    const { service, sales } = makeService(prisma);
    const ready = await readyToConvert(prisma, service);

    const invoice = await service.convert(ready.id, {}, 'u1');

    expect(invoice).toMatchObject({ id: 'inv1', number: 7 });
    expect(sales.createInvoice).toHaveBeenCalledTimes(1);
    // آرگومان‌های فراخوانی مقلد بی‌نوع‌اند، پس صریح قالب‌بندی می‌شوند.
    const dto = (
      sales.createInvoice.mock.calls as unknown as Array<[Record<string, any>]>
    )[0][0];

    // کلیدِ ثابت و غیرقابل‌تغییر: دو تبدیل هم‌زمان نمی‌توانند دو فاکتور بسازند.
    expect(dto.idempotencyKey).toBe(`blank-${ready.id}`);
    expect(dto.warehouseId).toBe('w1');
    // نام آزاد مشتری رکورد Customer نمی‌سازد، پس پیوندی هم نیست.
    expect(dto.customerId).toBeUndefined();
    expect(dto.lines[0]).toMatchObject({
      productId: 'p1',
      locationId: 'loc1',
      quantity: 3,
      unitPrice: 120_000,
      lineNote: 'لنت پراید',
    });

    expect(sheets[0].status).toBe(BlankQuotationStatus.CONVERTED);
    expect(sheets[0].convertedInvoiceId).toBe('inv1');
  });

  it('تا لحظه‌ی تبدیل، این سرویس هیچ حرکتی در موجودی نمی‌زند', async () => {
    const { prisma } = makePrisma();
    const { service, sales } = makeService(prisma);
    await readyToConvert(prisma, service);

    expect(prisma.inventoryOperation.create).not.toHaveBeenCalled();
    expect(prisma.inventoryLog.create).not.toHaveBeenCalled();
    expect(prisma.inventoryLog.createMany).not.toHaveBeenCalled();
    expect(sales.createInvoice).not.toHaveBeenCalled();
  });

  it('تبدیلِ دوباره ⇒ ALREADY_CONVERTED و فاکتورِ دوم ساخته نمی‌شود', async () => {
    const { prisma } = makePrisma();
    const { service, sales } = makeService(prisma);
    const ready = await readyToConvert(prisma, service);

    await service.convert(ready.id, {});
    await expect(service.convert(ready.id, {})).rejects.toMatchObject({
      response: { error: 'ALREADY_CONVERTED', invoiceId: 'inv1' },
    });

    expect(sales.createInvoice).toHaveBeenCalledTimes(1);
  });

  it('برگه‌ی ناموجود ⇒ ۴۰۴', async () => {
    const { prisma } = makePrisma();
    const { service } = makeService(prisma);

    await expect(service.convert('ghost', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BlankQuotationsService — پیشنهاد کالا و فهرست', () => {
  it('قلمِ وصل‌شده پیشنهاد نمی‌گیرد و قلمِ متنی از موتور جست‌وجو پیشنهاد می‌گیرد', async () => {
    const { prisma } = makePrisma();
    const { service, products } = makeService(prisma);
    products.searchWithStock.mockResolvedValue([
      {
        id: 'p1',
        name: 'لنت ترمز پراید جلو',
        sku: 'LP-100',
        unit: 'عدد',
        salePrice: 120_000,
        totalStock: 9,
        locations: [{ locationId: 'loc1', path: 'قفسه A-3-2', quantity: 9 }],
      },
    ]);

    const created = await service.create(
      createDto({
        lines: [
          { text: 'لنت پراید', quantity: 1 },
          { text: 'فیلتر روغن', quantity: 1 },
        ],
      }),
    );
    await service.savePrices(created.id, {
      lines: [{ lineId: created.lines[1].id, productId: 'p1' }],
    } as any);

    const out = await service.suggestions(created.id);

    expect(out[0].status).toBe('SUGGEST');
    expect(out[0].best).toMatchObject({
      productId: 'p1',
      name: 'لنت ترمز پراید جلو',
      salePrice: 120_000,
      locationId: 'loc1',
      locationPath: 'قفسه A-3-2',
    });
    expect(out[0].candidates).toHaveLength(1);
    expect(out[1].status).toBe('LINKED');
  });

  it('فهرست با فیلتر وضعیت کار می‌کند و شمارش‌ها را می‌دهد', async () => {
    const { prisma } = makePrisma();
    const { service } = makeService(prisma);
    await service.create(createDto({ clientRequestId: 'req-aaaaaaaa' }));
    const second = await service.create(
      createDto({ clientRequestId: 'req-bbbbbbbb', lines: [{ text: 'چیزی', quantity: 1 }] }),
    );
    await service.cancel(second.id);

    const all = await service.findAll({});
    expect(all.meta.total).toBe(2);
    expect(all.data[0]).toHaveProperty('unpricedCount');

    const open = await service.findAll({ status: 'OPEN' });
    expect(open.meta.total).toBe(1);
    expect(open.data[0].id).not.toBe(second.id);
  });
});
