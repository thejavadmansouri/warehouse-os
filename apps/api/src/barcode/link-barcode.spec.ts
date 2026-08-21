import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { BarcodeService } from './barcode.service';

/**
 * چسباندنِ بارکدِ خودِ جنس به کالا.
 *
 * چیزی که این تست‌ها محافظت می‌کنند: **یک بارکد هرگز نباید بی‌صدا صاحبش عوض
 * شود.** اگر بشود، اسکنِ بعدی کالای اشتباه می‌آورد، فروشنده همان را می‌فروشد،
 * و هیچ‌کس نمی‌فهمد چرا موجودیِ دو کالا خراب شده.
 */
describe('BarcodeService — اتصال بارکد', () => {
  let service: BarcodeService;

  const prisma = {
    product: { findFirst: jest.fn() },
    productBarcode: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.product.findFirst.mockResolvedValue({ id: 'p1', name: 'لنت جلو پراید' });
    prisma.productBarcode.findUnique.mockResolvedValue(null);
    prisma.productBarcode.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'b1', ...data }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BarcodeService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryOperationService, useValue: { execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(BarcodeService);
  });

  it('بارکد تازه به کالا وصل می‌شود و نوعش پیش‌فرض کارخانه است', async () => {
    const r = await service.linkBarcode('p1', '  6221031492834 ');

    expect(prisma.productBarcode.create).toHaveBeenCalledWith({
      // فاصله‌های اطراف پاک می‌شوند، وگرنه همان بارکد بار بعد پیدا نمی‌شود.
      data: { barcode: '6221031492834', productId: 'p1', type: 'FACTORY' },
    });
    expect(r.alreadyLinked).toBe(false);
  });

  it('اسکنِ دوباره‌ی همان بارکد روی همان کالا خطا نیست', async () => {
    // کارگری که دوبار اسکن کرده نباید پیغام قرمز ببیند؛ کار از قبل انجام شده.
    prisma.productBarcode.findUnique.mockResolvedValue({
      id: 'b1',
      barcode: '123456',
      productId: 'p1',
      product: { id: 'p1', name: 'لنت جلو پراید' },
    });

    const r = await service.linkBarcode('p1', '123456');

    expect(r.alreadyLinked).toBe(true);
    expect(prisma.productBarcode.create).not.toHaveBeenCalled();
  });

  it('بارکدِ متعلق به کالای دیگر رد می‌شود و نامِ آن کالا را می‌گوید', async () => {
    prisma.productBarcode.findUnique.mockResolvedValue({
      id: 'b9',
      barcode: '123456',
      productId: 'p2',
      product: { id: 'p2', name: 'لنت عقب پژو' },
    });

    const e = await service.linkBarcode('p1', '123456').catch((x) => x);

    expect(e).toBeInstanceOf(BadRequestException);
    expect(e.getResponse().error).toBe('BARCODE_TAKEN');
    // بدونِ نامِ کالای مقصد، کاربر نمی‌فهمد چه اتفاقی افتاده.
    expect(e.getResponse().productName).toBe('لنت عقب پژو');
    expect(prisma.productBarcode.create).not.toHaveBeenCalled();
  });

  it('بارکدِ خیلی کوتاه رد می‌شود', async () => {
    const e = await service.linkBarcode('p1', '12').catch((x) => x);
    expect(e.getResponse().error).toBe('BARCODE_TOO_SHORT');
  });

  it('کالای ناموجود رد می‌شود، نه اینکه خطای FK بگیرد', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    const e = await service.linkBarcode('nope', '123456').catch((x) => x);
    expect(e).toBeInstanceOf(NotFoundException);
  });

  it('بارکد داخلی برداشته نمی‌شود', async () => {
    // روی برچسبِ چاپ‌شده است؛ برداشتنش کالا را از مسیر اسکن گم می‌کند.
    prisma.productBarcode.findUnique.mockResolvedValue({
      id: 'b1',
      barcode: 'WOS000000001',
      type: 'INTERNAL',
      product: { internalBarcode: 'WOS000000001' },
    });

    const e = await service.unlinkBarcode('b1').catch((x) => x);

    expect(e.getResponse().error).toBe('CANNOT_UNLINK_INTERNAL');
    expect(prisma.productBarcode.delete).not.toHaveBeenCalled();
  });

  it('بارکد بیرونی برداشته می‌شود', async () => {
    prisma.productBarcode.findUnique.mockResolvedValue({
      id: 'b2',
      barcode: '6221031492834',
      type: 'FACTORY',
      product: { internalBarcode: 'WOS000000001' },
    });

    await service.unlinkBarcode('b2');

    expect(prisma.productBarcode.delete).toHaveBeenCalledWith({ where: { id: 'b2' } });
  });
});
