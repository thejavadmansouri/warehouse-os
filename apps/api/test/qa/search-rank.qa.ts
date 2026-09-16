/**
 * رتبه‌بندیِ جستجو با سیگنالِ «چقدر واقعاً فروخته می‌شود».
 * روی دیتابیس واقعی، با فروشِ واقعی — نه mock.
 */
import { PrismaClient } from '@prisma/client';
import { ProductsService } from '../../src/products/products.service';
import {
  prisma,
  sales,
  baseFixture,
  makeProduct,
  uniq,
  close,
} from './harness';
import { note } from './evlog';

let f: any;
let products: ProductsService;

beforeAll(async () => {
  f = await baseFixture();
  // سازنده در f3bd9c0 تک‌آرگومانی شد (تولیدکننده‌ی بارکد حذف شد).
  products = new ProductsService(prisma);
});
afterAll(close);

const refresh = () =>
  (prisma as unknown as PrismaClient).$executeRawUnsafe(
    'REFRESH MATERIALIZED VIEW CONCURRENTLY "ProductPopularity"',
  );

const sell = (p: any, qty: number) =>
  sales.createInvoice(
    {
      idempotencyKey: uniq('sr'),
      warehouseId: f.warehouseId,
      lines: [
        {
          productId: p.id,
          locationId: f.locationId,
          quantity: qty,
          unitPrice: 1000,
        },
      ],
    },
    f.userId,
  );

describe('SEARCH RANKING — popularity signal', () => {
  it('S1 the view exists and is refreshable concurrently', async () => {
    await expect(refresh()).resolves.toBeDefined();
  });

  it('S2 a best-seller outranks an identical never-sold product', async () => {
    const tag = uniq('زززکالا').replace(/-/g, '');
    // دو کالای با نامِ عملاً یکسان — تنها تفاوتشان فروش است.
    const cold = await makeProduct({ stock: 100, name: `${tag} سرد` });
    const hot = await makeProduct({ stock: 100, name: `${tag} داغ` });

    const before = await products.search(tag);
    const beforeOrder = before.map((p: any) => p.id);

    for (let i = 0; i < 5; i++) await sell(hot, 1);
    await refresh();

    const after = await products.search(tag);
    const afterOrder = after.map((p: any) => p.id);

    note('S2_popularity_ranking', {
      query: tag,
      beforeFirst: beforeOrder[0] === hot.id ? 'hot' : 'cold',
      afterFirst: afterOrder[0] === hot.id ? 'hot' : 'cold',
      afterOrder: afterOrder.map((id: string) =>
        id === hot.id ? 'hot' : 'cold',
      ),
    });

    expect(afterOrder[0]).toBe(hot.id);
  });

  it('S3 popularity NEVER beats an exact code match', async () => {
    const tag = uniq('یییکالا').replace(/-/g, '');
    const hot = await makeProduct({ stock: 100, name: `${tag} پرفروش` });
    const exact = await makeProduct({ stock: 0, name: `${tag} کم‌فروش` });

    for (let i = 0; i < 30; i++) await sell(hot, 1);
    await refresh();

    // جستجو با SKUِ دقیقِ کالای کم‌فروش — باید اول باشد، هرچقدر آن یکی پرفروش باشد.
    const res = await products.search(exact.sku);
    expect(res[0]?.id).toBe(exact.id);
  });

  it('S4 popularity does not override a clearly better text match', async () => {
    const tag = uniq('خخخ').replace(/-/g, '');
    // پرفروش ولی با نامِ شلوغ‌تر و تطبیقِ ضعیف‌تر
    const hot = await makeProduct({
      stock: 100,
      name: `چیز دیگر ${tag} با کلی کلمه اضافه`,
    });
    const exactName = await makeProduct({ stock: 100, name: tag });

    for (let i = 0; i < 40; i++) await sell(hot, 1);
    await refresh();

    const res = await products.search(tag);
    note('S4_text_beats_popularity', {
      first: res[0]?.id === exactName.id ? 'exact-name' : 'popular',
      names: res.slice(0, 3).map((p: any) => p.name),
    });
    // نامِ دقیق باید بچربد — سقفِ پاداشِ پرفروشی دقیقاً برای همین گذاشته شد.
    expect(res[0]?.id).toBe(exactName.id);
  });

  it('S5 search still works when the view is empty (LEFT JOIN safety)', async () => {
    const tag = uniq('ققق').replace(/-/g, '');
    const p = await makeProduct({ stock: 10, name: `${tag} تست` });
    // بدون هیچ فروشی و بدون refresh — یعنی هیچ ردیفی در view ندارد.
    const res = await products.search(tag);
    expect(res.map((r: any) => r.id)).toContain(p.id);
  });
});
