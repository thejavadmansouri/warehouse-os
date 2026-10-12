import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SeoService } from './seo.service';

/**
 * The sitemap must send Google to the real product route (/shop/product/:id)
 * with the product photo — never to a query-string URL that renders nothing.
 */
describe('SeoService.sitemap', () => {
  let service: SeoService;
  const prisma = {
    shopSettings: { findUnique: jest.fn() },
    product: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SeoService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<SeoService>(SeoService);
  });

  const online = (rows: unknown[]) => {
    prisma.shopSettings.findUnique.mockResolvedValue({ onlineEnabled: true });
    prisma.product.findMany.mockResolvedValue(rows);
  };

  it('links products at /shop/product/:id, never /?product=', async () => {
    online([
      {
        id: 'p1',
        updatedAt: new Date('2026-10-01T00:00:00Z'),
        assets: [{ path: '/storage/products/1.webp' }],
      },
    ]);
    const xml = await service.sitemap('https://shop.example');
    expect(xml).toContain('<loc>https://shop.example/shop/product/p1</loc>');
    expect(xml).not.toContain('?product=');
  });

  it('embeds the product photo with the image extension', async () => {
    online([
      {
        id: 'p1',
        updatedAt: new Date('2026-10-01T00:00:00Z'),
        assets: [{ path: '/storage/products/1.webp' }],
      },
    ]);
    const xml = await service.sitemap('https://shop.example');
    expect(xml).toContain('xmlns:image=');
    expect(xml).toContain(
      '<image:loc>https://shop.example/storage/products/1.webp</image:loc>',
    );
  });

  it('emits no product urls when the shop is offline', async () => {
    prisma.shopSettings.findUnique.mockResolvedValue({ onlineEnabled: false });
    const xml = await service.sitemap('https://shop.example');
    expect(xml).not.toContain('/shop/product/');
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('escapes hostile characters in urls', async () => {
    online([
      {
        id: 'p<1>&"',
        updatedAt: new Date('2026-10-01T00:00:00Z'),
        assets: [],
      },
    ]);
    const xml = await service.sitemap('https://shop.example');
    expect(xml).not.toContain('p<1>');
    expect(xml).toContain('p&lt;1&gt;&amp;&quot;');
  });
});
