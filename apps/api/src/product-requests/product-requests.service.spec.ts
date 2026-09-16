import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { ProductRequestsService } from './product-requests.service';

/**
 * These cover the scanned-barcode hand-off: a factory barcode the worker scanned
 * on the box must end up attached to the product the manager approves, or the
 * same box has to be identified by hand all over again next time.
 */
describe('ProductRequestsService — scanned barcode hand-off', () => {
  let service: ProductRequestsService;
  let createdProductArgs: any;

  const baseRequest = {
    id: 'req-1',
    status: 'PENDING',
    name: 'لنت جلو پراید',
    brandName: null,
    categoryId: null,
    vehicles: [] as string[],
    quantity: 0,
    unit: 'عدد',
    notes: null,
    voiceText: null,
    locationBarcode: null,
    locationId: null,
    // Typed explicitly so a test can null it out to mean "nothing was scanned".
    productBarcode: '6291041500213' as string | null,
  };

  const makePrisma = (over: {
    request?: Partial<typeof baseRequest>;
    existingBarcode?: { id: string } | null;
  }) => {
    const req = { ...baseRequest, ...over.request };
    return {
      productCreationRequest: {
        findUnique: jest.fn().mockResolvedValue(req),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(req),
      },
      productBarcode: {
        findUnique: jest.fn().mockResolvedValue(over.existingBarcode ?? null),
      },
      brand: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      vehicleModel: { findFirst: jest.fn().mockResolvedValue(null) },
      product: {
        create: jest.fn().mockImplementation((args: any) => {
          createdProductArgs = args;
          return Promise.resolve({ id: 'prod-1', ...args.data });
        }),
      },
      // nextSku runs a raw query against the client it is handed.
      $queryRaw: jest.fn().mockResolvedValue([{ max: '1000000' }]),
    } as any;
  };

  const build = async (prisma: any) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductRequestsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: InventoryOperationService,
          useValue: { execute: jest.fn() },
        },
      ],
    }).compile();
    return module.get(ProductRequestsService);
  };

  beforeEach(() => {
    createdProductArgs = undefined;
    jest.clearAllMocks();
  });

  it('attaches the scanned barcode as a FACTORY barcode on approval', async () => {
    const prisma = makePrisma({ existingBarcode: null });
    service = await build(prisma);

    await service.approve('req-1', 'mgr-1');

    const created = createdProductArgs.data.barcodes.create;
    expect(created).toHaveLength(2);
    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ barcode: '6291041500213', type: 'FACTORY' }),
        expect.objectContaining({ type: 'INTERNAL' }),
      ]),
    );
  });

  it('still generates the internal barcode when nothing was scanned', async () => {
    const prisma = makePrisma({
      request: { productBarcode: null },
      existingBarcode: null,
    });
    service = await build(prisma);

    await service.approve('req-1', 'mgr-1');

    const created = createdProductArgs.data.barcodes.create;
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe('INTERNAL');
    expect(created[0].barcode).toMatch(/^WOS[0-9A-F]{12}$/);
    // Nothing scanned means there is nothing to look up.
    expect(prisma.productBarcode.findUnique).not.toHaveBeenCalled();
  });

  it('skips a scanned barcode that already belongs to another product', async () => {
    // Approval must not fail, and must not steal the barcode from its owner.
    const prisma = makePrisma({ existingBarcode: { id: 'existing-row' } });
    service = await build(prisma);

    await service.approve('req-1', 'mgr-1');

    const created = createdProductArgs.data.barcodes.create;
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe('INTERNAL');
  });

  it('trims whitespace around the scanned barcode', async () => {
    const prisma = makePrisma({
      request: { productBarcode: '  6291041500213  ' },
      existingBarcode: null,
    });
    service = await build(prisma);

    await service.approve('req-1', 'mgr-1');

    expect(prisma.productBarcode.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { barcode: '6291041500213' } }),
    );
    const factory = createdProductArgs.data.barcodes.create.find(
      (b: any) => b.type === 'FACTORY',
    );
    expect(factory.barcode).toBe('6291041500213');
  });
});
