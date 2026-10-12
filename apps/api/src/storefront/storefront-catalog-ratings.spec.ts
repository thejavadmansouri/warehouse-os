import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { StorefrontCatalogService } from './storefront-catalog.service';

/**
 * کارت‌های کاتالوگ باید میانگین ستاره را همراهشان داشته باشند — با یک
 * groupBy برای کل صفحه (نه N+1)، و پیش‌فرض صفر برای کالای بدون نظر.
 */
describe('StorefrontCatalogService ratings', () => {
  let service: StorefrontCatalogService;
  const prisma = {
    shopSettings: { upsert: jest.fn() },
    product: { findMany: jest.fn() },
    onlineOrderLine: { groupBy: jest.fn() },
    productReview: { groupBy: jest.fn() },
  };

  const onlineShop = {
    id: 'singleton',
    onlineEnabled: true,
    name: 's',
    phone: null,
    address: null,
    cardNumber: null,
    cardHolder: null,
    footer: null,
    shippingFee: 0,
    freeShipOver: null,
    siteUnit: 'TOMAN',
    storedUnit: 'TOMAN',
    showUnpriced: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.shopSettings.upsert.mockResolvedValue(onlineShop);
    prisma.onlineOrderLine.groupBy.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorefrontCatalogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<StorefrontCatalogService>(StorefrontCatalogService);
  });

  const pricedRow = (id: string) => ({
    id,
    name: `p-${id}`,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    prices: [{ salePrice: 100000, compareAtPrice: null }],
    inventories: [{ quantity: 5 }],
  });

  const hydratedRow = (id: string) => ({
    id,
    name: `p-${id}`,
    sku: null,
    unit: null,
    partNumber: null,
    brand: null,
    category: null,
    assets: [],
  });

  it('attaches the approved-review average to every card in one query', async () => {
    prisma.product.findMany
      .mockResolvedValueOnce([pricedRow('a'), pricedRow('b')])
      .mockResolvedValueOnce([hydratedRow('a'), hydratedRow('b')]);
    prisma.productReview.groupBy.mockResolvedValue([
      {
        productId: 'a',
        _avg: { rating: 4.5 },
        _count: { _all: 2 },
      },
    ]);

    const res = await service.list({});
    expect(prisma.productReview.groupBy).toHaveBeenCalledTimes(1);
    const byId = new Map(res.items.map((i: any) => [i.id, i]));
    expect(byId.get('a').rating).toEqual({ average: 4.5, count: 2 });
    // کالای بدون نظر: صفر، نه undefined — کلاینت بدون گارد رندر می‌کند.
    expect(byId.get('b').rating).toEqual({ average: 0, count: 0 });
  });

  it('never leaks purchase/wholesale prices through the card payload', async () => {
    prisma.product.findMany
      .mockResolvedValueOnce([pricedRow('a')])
      .mockResolvedValueOnce([hydratedRow('a')]);
    prisma.productReview.groupBy.mockResolvedValue([]);

    const res = await service.list({});
    const keys = Object.keys(res.items[0]!);
    expect(keys).not.toContain('purchasePrice');
    expect(keys).not.toContain('wholesalePrice');
    expect(keys).toContain('rating');
  });
});
