import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { ImageDownloadService } from './image-download.service';
import { ImageProcessService } from './image-process.service';
import { ImageSearchService } from './image-search.service';
import { ProductImagesService } from './product-images.service';

/**
 * The site gate: showOnline flips only when the product has a site photo,
 * a printed label and stock. Every rejection carries the Persian reason the
 * /admin/site-products page shows.
 */
describe('ProductImagesService.publishProductPage (site gate)', () => {
  let service: ProductImagesService;
  const prisma = {
    product: { findFirst: jest.fn(), update: jest.fn() },
  };

  const baseProduct = {
    id: 'p1',
    name: 'x',
    sku: '1',
    showOnline: false,
    labelPrintedAt: new Date(),
    isActive: true,
    assets: [{ id: 'a1' }],
    inventories: [{ quantity: 3 }],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductImagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ImageSearchService, useValue: {} },
        { provide: ImageDownloadService, useValue: {} },
        { provide: ImageProcessService, useValue: {} },
      ],
    }).compile();
    // The real constructor takes typed services; for the gate only prisma
    // matters, so plain stubs stand in for the rest.
    service = module.get<ProductImagesService>(ProductImagesService);
  });

  it('rejects an inactive product', async () => {
    prisma.product.findFirst.mockResolvedValue({ ...baseProduct, isActive: false });
    const res = await service.publishProductPage('p1');
    expect(res).toMatchObject({ published: false });
    expect(res.reason).toBeTruthy();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('rejects a product with no site photo', async () => {
    prisma.product.findFirst.mockResolvedValue({ ...baseProduct, assets: [] });
    const res = await service.publishProductPage('p1');
    expect(res).toMatchObject({ published: false });
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('rejects a product whose label was never printed', async () => {
    prisma.product.findFirst.mockResolvedValue({
      ...baseProduct,
      labelPrintedAt: null,
    });
    const res = await service.publishProductPage('p1');
    expect(res).toMatchObject({ published: false });
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('rejects a product with zero stock', async () => {
    prisma.product.findFirst.mockResolvedValue({
      ...baseProduct,
      inventories: [{ quantity: 0 }],
    });
    const res = await service.publishProductPage('p1');
    expect(res).toMatchObject({ published: false });
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('publishes when photo + label + stock are all present', async () => {
    prisma.product.findFirst.mockResolvedValue({ ...baseProduct });
    const res = await service.publishProductPage('p1');
    expect(res).toMatchObject({ published: true, productId: 'p1' });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { showOnline: true },
    });
  });

  it('does not rewrite a product that is already online', async () => {
    prisma.product.findFirst.mockResolvedValue({
      ...baseProduct,
      showOnline: true,
    });
    const res = await service.publishProductPage('p1');
    expect(res).toMatchObject({ published: true });
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});
