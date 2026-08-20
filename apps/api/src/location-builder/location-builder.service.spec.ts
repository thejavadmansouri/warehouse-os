import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { LocationBuilderService } from './location-builder.service';

/**
 * چیزی که این تست‌ها محافظت می‌کنند: **کدِ روی برچسبِ چاپ‌شده**.
 *
 * کد و بارکدِ هر قفسه یک بار چاپ و روی فلز چسبانده می‌شود. اگر فرمولِ ساختِ کد
 * عوض شود یا اجرای دوباره کدِ متفاوتی بدهد، برچسب‌های چسبیده روی قفسه‌ها به
 * چیزی اشاره می‌کنند که در سیستم نیست — و تنها راهِ برگشت، برچسب‌زدنِ دوباره‌ی
 * کلِ انبار است.
 *
 * به همین دلیل «اجرای دوباره» اینجا یک تستِ درجه‌یک است، نه یک حالتِ حاشیه‌ای:
 * مدیر در انبار با گوشی/لپ‌تاپ کار می‌کند و دوباره‌زدنِ دکمه اتفاق می‌افتد.
 */

/** درختِ در حافظه — جای جدولِ location. */
interface Row {
  id: string;
  name: string;
  code: string;
  barcode: string;
  path: string;
  depth: number;
  warehouseId: string;
  typeId: string;
  parentId: string | null;
  sortOrder: number;
}

const TYPES = [
  { id: 't-floor', name: 'طبقه', depth: 1, warehouseId: 'w1' },
  { id: 't-row', name: 'ردیف', depth: 2, warehouseId: 'w1' },
  { id: 't-box', name: 'باکس', depth: 3, warehouseId: 'w1' },
];

describe('LocationBuilderService', () => {
  let service: LocationBuilderService;
  let rows: Row[];

  const prisma = {
    warehouse: { findUnique: jest.fn() },
    locationType: { findMany: jest.fn() },
    location: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    rows = [];
    jest.clearAllMocks();

    prisma.warehouse.findUnique.mockResolvedValue({ id: 'w1', code: 'WH' });
    prisma.locationType.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(TYPES.filter((t) => where.id.in.includes(t.id))),
    );

    // تراکنش با همان مخزنِ در حافظه اجرا می‌شود تا رفتارِ skip واقعی بماند.
    prisma.$transaction.mockImplementation((fn: any) =>
      fn({
        location: {
          findMany: ({ where }: any) =>
            Promise.resolve(
              rows.filter((r) => where.code.in.includes(r.code)),
            ),
          createMany: ({ data }: any) => {
            rows.push(...data);
            return Promise.resolve({ count: data.length });
          },
        },
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationBuilderService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(LocationBuilderService);
  });

  const generate = (levels: any[], parentId?: string) =>
    service.generateTree({ warehouseId: 'w1', parentId, levels } as any);

  it('درختِ چندسطحی را با کدِ زنجیره‌ای می‌سازد', async () => {
    const result = await generate([
      { locationTypeId: 't-floor', count: 2 },
      { locationTypeId: 't-row', count: 3 },
    ]);

    // ۲ طبقه + (۲ × ۳) ردیف
    expect(result.createdCount).toBe(8);
    expect(result.skippedCount).toBe(0);
    expect(result.leafCount).toBe(6);

    expect(rows.map((r) => r.code)).toEqual([
      'WH-01',
      'WH-02',
      'WH-01-01',
      'WH-01-02',
      'WH-01-03',
      'WH-02-01',
      'WH-02-02',
      'WH-02-03',
    ]);
  });

  it('بارکد همیشه LOC-<code> است و مسیر خوانا ساخته می‌شود', async () => {
    await generate([
      { locationTypeId: 't-floor', count: 1 },
      { locationTypeId: 't-row', count: 1 },
    ]);

    const leaf = rows.find((r) => r.code === 'WH-01-01')!;

    expect(leaf.barcode).toBe('LOC-WH-01-01');
    expect(leaf.path).toBe('WH > طبقه 01 > ردیف 01');
    expect(leaf.name).toBe('ردیف 01');
    expect(leaf.depth).toBe(2);
  });

  it('اجرای دوباره با همان اعداد هیچ مکانِ تازه‌ای نمی‌سازد', async () => {
    const levels = [
      { locationTypeId: 't-floor', count: 2 },
      { locationTypeId: 't-row', count: 3 },
    ];

    await generate(levels);
    const again = await generate(levels);

    expect(again.createdCount).toBe(0);
    expect(again.skippedCount).toBe(8);
    expect(rows).toHaveLength(8);
  });

  it('اجرای دوباره با تعدادِ بیشتر فقط تازه‌ها را اضافه می‌کند', async () => {
    // این همان چیزی است که به مدیر گفته شده: لازم نیست عددها روزِ اول دقیق باشد.
    await generate([
      { locationTypeId: 't-floor', count: 1 },
      { locationTypeId: 't-row', count: 2 },
    ]);

    const grown = await generate([
      { locationTypeId: 't-floor', count: 1 },
      { locationTypeId: 't-row', count: 4 },
    ]);

    expect(grown.createdCount).toBe(2);
    expect(grown.skippedCount).toBe(3); // ۱ طبقه + ۲ ردیفِ قبلی

    // و مهم‌تر: کدِ ردیف‌های قبلی دست‌نخورده مانده — برچسبِ چسبیده معتبر است.
    expect(rows.filter((r) => r.depth === 2).map((r) => r.code)).toEqual([
      'WH-01-01',
      'WH-01-02',
      'WH-01-03',
      'WH-01-04',
    ]);
  });

  it('با parentId فقط زیرِ همان شاخه می‌سازد', async () => {
    // شاخه‌های نامتقارن از همین راه ساخته می‌شوند: هر طبقه اعدادِ خودش را دارد.
    prisma.location.findUnique.mockResolvedValue({
      id: 'floor-2',
      code: 'WH-02',
      path: 'WH > طبقه 02',
      depth: 1,
    });

    const result = await generate(
      [{ locationTypeId: 't-row', count: 2 }],
      'floor-2',
    );

    expect(result.createdCount).toBe(2);
    expect(rows.map((r) => r.code)).toEqual(['WH-02-01', 'WH-02-02']);
    expect(rows[0].parentId).toBe('floor-2');
    expect(rows[0].path).toBe('WH > طبقه 02 > ردیف 01');
  });

  it('نام‌گذاری حرفی برای سطحی که بخواهد', async () => {
    await generate([
      { locationTypeId: 't-floor', count: 2, naming: 'alpha' },
    ]);

    expect(rows.map((r) => r.code)).toEqual(['WH-A', 'WH-B']);
  });

  it('پیشوندِ دلخواه جای نامِ نوع می‌نشیند', async () => {
    await generate([
      { locationTypeId: 't-floor', count: 1, prefix: 'سالن' },
    ]);

    expect(rows[0].name).toBe('سالن 01');
  });

  it('نوعِ متعلق به انبارِ دیگر رد می‌شود', async () => {
    prisma.locationType.findMany.mockResolvedValue([]);

    await expect(
      generate([{ locationTypeId: 't-foreign', count: 1 }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('انبارِ ناموجود رد می‌شود', async () => {
    prisma.warehouse.findUnique.mockResolvedValue(null);

    await expect(
      generate([{ locationTypeId: 't-floor', count: 1 }]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('بدون سطح چیزی نمی‌سازد', async () => {
    await expect(generate([])).rejects.toBeInstanceOf(BadRequestException);
  });
});
