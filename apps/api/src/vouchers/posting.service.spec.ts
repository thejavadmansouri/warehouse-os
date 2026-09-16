import { Test, TestingModule } from '@nestjs/testing';
import { FixedAccount, VoucherSourceType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PostingService } from './posting.service';

/**
 * تست‌های هسته‌ی سند خودکار (PostingService).
 *
 * قواعدِ موضوعِ تست:
 *   • جمعِ مبلغِ خطوط هر سند باید صفر باشد — وگرنه کل اکشنِ مبدأ می‌شکند.
 *   • مبلغِ هر خط باید عددِ صحیحِ ریال باشد.
 *   • ارسالِ دوباره با همان idempotencyKey سندِ دوباره نمی‌سازد — همان برمی‌گردد.
 *   • آخرین قیمتِ خرید هر کالا مبنای بهای تمام‌شده است (تازه‌ترین ردیف برنده).
 */

const TX: any = {
  voucher: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  voucherLine: {
    createMany: jest.fn(),
  },
  productPrice: {
    findMany: jest.fn(),
  },
};

describe('PostingService', () => {
  let service: PostingService;

  const prisma: any = {};

  beforeEach(async () => {
    jest.clearAllMocks();

    TX.voucher.findUnique.mockResolvedValue(null);
    TX.voucher.create.mockResolvedValue({ id: 'v1', number: 7 });
    TX.voucherLine.createMany.mockResolvedValue({ count: 2 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [PostingService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PostingService);
  });

  const balanced = () => ({
    sourceType: VoucherSourceType.SALE_INVOICE,
    sourceId: 'inv1',
    idempotencyKey: 'sale:inv1',
    lines: [
      { account: FixedAccount.CASH, amount: 1_000_000 },
      { account: FixedAccount.SALES, amount: -1_000_000 },
    ],
  });

  it('سندِ موازنه‌شده ثبت می‌شود: سرصفحه + خطوط', async () => {
    const res = await service.post(TX, balanced());

    expect(res).toEqual({ id: 'v1', number: 7 });
    expect(TX.voucher.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType: 'SALE_INVOICE',
        sourceId: 'inv1',
        idempotencyKey: 'sale:inv1',
      }),
      select: { id: true, number: true },
    });
    expect(TX.voucherLine.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          voucherId: 'v1',
          account: FixedAccount.CASH,
          amount: 1_000_000,
        }),
        expect.objectContaining({
          voucherId: 'v1',
          account: FixedAccount.SALES,
          amount: -1_000_000,
        }),
      ]),
    });
  });

  it('عدمِ موازنه (جمع ≠ صفر) کلِ اکشن را می‌شکند و چیزی ثبت نمی‌شود', async () => {
    await expect(
      service.post(TX, {
        ...balanced(),
        lines: [
          { account: FixedAccount.CASH, amount: 1_000_000 },
          { account: FixedAccount.SALES, amount: -999_000 },
        ],
      }),
    ).rejects.toThrow('VOUCHER_UNBALANCED');

    expect(TX.voucher.create).not.toHaveBeenCalled();
    expect(TX.voucherLine.createMany).not.toHaveBeenCalled();
  });

  it('مبلغِ غیرِصحیح (اعشاری) رد می‌شود', async () => {
    await expect(
      service.post(TX, {
        ...balanced(),
        lines: [
          { account: FixedAccount.CASH, amount: 1_000_000.5 },
          { account: FixedAccount.SALES, amount: -1_000_000.5 },
        ],
      }),
    ).rejects.toThrow('VOUCHER_INVALID_AMOUNT');

    expect(TX.voucher.create).not.toHaveBeenCalled();
  });

  it('سندِ خالی معنا ندارد و رد می‌شود', async () => {
    await expect(
      service.post(TX, { ...balanced(), lines: [] }),
    ).rejects.toThrow('VOUCHER_EMPTY');
  });

  it('idempotency: کلیدِ تکراری سندِ دوباره نمی‌سازد — همان قبلی برمی‌گردد', async () => {
    TX.voucher.findUnique.mockResolvedValue({ id: 'v1', number: 7 });

    const res = await service.post(TX, balanced());

    expect(res).toEqual({ id: 'v1', number: 7 });
    expect(TX.voucher.create).not.toHaveBeenCalled();
    expect(TX.voucherLine.createMany).not.toHaveBeenCalled();
  });

  it('آخرین قیمتِ خرید: تازه‌ترین ردیف هر کالا برنده است', async () => {
    // خروجیِ mock نمایانگرِ ترتیبِ orderBy desc است — تازه‌ترین اول.
    TX.productPrice.findMany.mockResolvedValue([
      { productId: 'p1', purchasePrice: 150 }, // تازه — برنده
      { productId: 'p1', purchasePrice: 100 }, // قدیمی
      { productId: 'p2', purchasePrice: null }, // بی‌قیمت → نمی‌آید
    ]);

    const map = await service.latestPurchasePrices(TX, ['p1', 'p2']);

    expect(map.get('p1')).toBe(150);
    expect(map.has('p2')).toBe(false);
    expect(TX.productPrice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId: { in: ['p1', 'p2'] },
          purchasePrice: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});
