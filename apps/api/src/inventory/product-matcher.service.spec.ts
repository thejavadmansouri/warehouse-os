import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ProductMatcherService } from './product-matcher.service';

// Product shape the matcher scores against.
function product(over: Record<string, unknown>) {
  return {
    id: 'x',
    name: '',
    description: null,
    partCatalogId: null,
    partCatalog: null,
    vehicleModelId: null,
    vehicleModel: null,
    brandId: null,
    brand: null,
    ...over,
  };
}

describe('ProductMatcherService.match ranking', () => {
  let service: ProductMatcherService;
  const prisma = { product: { findMany: jest.fn() }, $queryRawUnsafe: jest.fn() };

  // Retrieval now ranks in Postgres ($queryRawUnsafe → ids), then hydrates via
  // findMany. Mock both from one candidate list.
  function mockCandidates(list: Array<{ id: string }>) {
    prisma.$queryRawUnsafe.mockResolvedValue(list.map((p) => ({ id: p.id })));
    prisma.product.findMany.mockResolvedValue(list);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ProductMatcherService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(ProductMatcherService);
  });

  it('ranks the product whose NAME contains the spoken part over a vehicle-only match', async () => {
    // «پنج تا سوپرموتور سمند» — both products are for سمند, only one is a سوپرموتور.
    const correct = product({
      id: 'correct',
      name: 'سوپرموتور سمند استورن دیناپارت',
      vehicleModelId: 'v-samand',
      vehicleModel: { name: 'سمند', aliases: [] },
    });
    const wrong = product({
      id: 'wrong',
      name: 'واشر در قالپاق موتور سمند ملی',
      vehicleModelId: 'v-samand',
      vehicleModel: { name: 'سمند', aliases: [] },
    });
    mockCandidates([wrong, correct]);

    const res = await service.match({
      partName: 'سوپرموتور',
      vehicleModelIds: ['v-samand'],
      vehicleName: 'سمند',
      keywordTokens: [],
      modelIsExplicit: false,
    });

    expect(res.suggestions.length).toBeGreaterThan(0);
    expect(res.suggestions[0].product.id).toBe('correct');
    const correctC = res.suggestions.find((s) => s.product.id === 'correct')!;
    const wrongC = res.suggestions.find((s) => s.product.id === 'wrong');
    // The vehicle-only match must rank strictly below, and be low-confidence.
    if (wrongC) expect(correctC.confidence).toBeGreaterThan(wrongC.confidence);
  });

  it('does not treat a position word (جلو) as part identity', async () => {
    // «لنت جلو …» must not confidently match a «کمک فنر جلو» just because both say جلو.
    const lent = product({
      id: 'lent',
      name: 'لنت ترمز جلو پراید تکستار',
      vehicleModelId: 'v-pride',
      vehicleModel: { name: 'پراید', aliases: [] },
    });
    const shock = product({
      id: 'shock',
      name: 'کمک فنر جلو پراید عظام',
      vehicleModelId: 'v-pride',
      vehicleModel: { name: 'پراید', aliases: [] },
    });
    mockCandidates([shock, lent]);

    const res = await service.match({
      partName: 'لنت ترمز جلو',
      vehicleModelIds: ['v-pride'],
      vehicleName: 'پراید',
      keywordTokens: [],
      modelIsExplicit: false,
    });

    expect(res.suggestions[0].product.id).toBe('lent');
    const shockC = res.suggestions.find((s) => s.product.id === 'shock');
    const lentC = res.suggestions.find((s) => s.product.id === 'lent')!;
    if (shockC) expect(lentC.confidence).toBeGreaterThan(shockC.confidence);
  });

  it('does not surface an unrelated product as a confident match', async () => {
    // «پنج تا تسمه تایم ۲۰۶» with only an unrelated pump in the DB.
    const unrelated = product({ id: 'pump', name: 'پمپ هیدرولیک فرمان' });
    mockCandidates([unrelated]);

    const res = await service.match({
      partName: 'تسمه تایم',
      vehicleName: 'پژو ۲۰۶',
      keywordTokens: [],
      modelIsExplicit: false,
    });

    // Either nothing, or nothing confident — the pump must not be presented.
    const top = res.suggestions[0];
    expect(top?.product?.id !== 'pump' || top.confidence < 60).toBe(true);
  });
});
