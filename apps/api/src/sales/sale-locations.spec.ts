import {
  firstWithoutInventory,
  inventoryKey,
  locationsWithoutRecord,
  saleLineRefs,
} from './sale-locations';

/**
 * تست‌های سیاستِ «مکانِ ردیف‌های فاکتور».
 *
 * مهم‌ترین تستِ این فایل، تستِ اول است: قفسه‌ی انبارِ دیگر نباید فاکتور را رد
 * کند. تا شهریور همین‌جا یک قاعده‌ی `LOCATION_NOT_IN_WAREHOUSE` بود که در مغازه
 * هر روز جلوی فروش را می‌گرفت (اقلام یک خرید از دو انبارِ پشتِ یک پیشخوان)، و
 * چون صندوق قفسه را خودکار از پرموجودی‌ترین مکان برمی‌دارد، فروشنده حتی کاری هم
 * نمی‌کرد که خطا بگیرد. این تست آن قاعده را برنمی‌گرداند.
 */
describe('sale line locations', () => {
  const lines = [
    { productId: 'p1', locationId: 'shelf-in-warehouse-A' },
    { productId: 'p2', locationId: 'shelf-in-warehouse-B' },
  ];

  it('قفسه‌ی انبارِ دیگر را رد نمی‌کند', () => {
    const refs = saleLineRefs(lines);
    // هر دو قفسه در دیتابیس وجود دارند — حتی اگر مالِ دو انبار مختلف باشند.
    const known = new Set(['shelf-in-warehouse-A', 'shelf-in-warehouse-B']);

    expect(locationsWithoutRecord(refs, known)).toEqual([]);
  });

  it('انبار جایی در تصمیم‌گیری ندارد — تابع حتی ورودیِ انبار نمی‌گیرد', () => {
    // اگر کسی روزی قاعده‌ی «مکان باید در همین انبار باشد» را برگرداند، باید یک
    // پارامترِ انبار به همین توابع اضافه شود؛ این تست همان لحظه می‌شکند.
    expect(saleLineRefs.length).toBe(1);
    expect(saleLineRefs(lines).every((r) => !('warehouseId' in r))).toBe(true);
  });

  it('ردیفِ بدونِ قفسه را وارد اعتبارسنجی نمی‌کند', () => {
    const refs = saleLineRefs([
      { productId: 'p1', locationId: null },
      { productId: 'p2', locationId: 'loc-2' },
      { productId: 'p3' },
    ]);

    expect(refs).toEqual([
      { index: 1, productId: 'p2', locationId: 'loc-2' },
    ]);
  });

  it('اندیسِ اصلیِ کلاینت را نگه می‌دارد تا خطا سطرِ درست را نشان بدهد', () => {
    const refs = saleLineRefs([
      { productId: 'p1' },
      { productId: 'p2', locationId: 'loc-2' },
    ]);

    expect(refs[0].index).toBe(1);
  });

  it('قفسه‌ی بی‌رکورد را با موجودیِ همان کالا می‌پذیرد', () => {
    const refs = saleLineRefs([
      { productId: 'p1', locationId: 'ghost-1' },
      { productId: 'p2', locationId: 'ghost-2' },
    ]);
    const known = new Set<string>();
    const missing = locationsWithoutRecord(refs, known);
    expect(missing.map((r) => r.locationId)).toEqual(['ghost-1', 'ghost-2']);

    // فقط ghost-2 واقعاً جنس رویش دارد.
    const stocked = new Set([inventoryKey('p2', 'ghost-2')]);
    expect(firstWithoutInventory(missing, stocked)?.locationId).toBe('ghost-1');
  });

  it('مکانِ کاملاً ساختگی را برمی‌گرداند', () => {
    const refs = saleLineRefs([{ productId: 'p1', locationId: 'ghost-1' }]);

    expect(firstWithoutInventory(refs, new Set())).toEqual({
      index: 0,
      productId: 'p1',
      locationId: 'ghost-1',
    });
  });

  it('وقتی همه‌ی قفسه‌ها موجودی دارند چیزی را برنمی‌گرداند', () => {
    const refs = saleLineRefs([
      { productId: 'p1', locationId: 'ghost-1' },
    ]);

    expect(
      firstWithoutInventory(refs, new Set([inventoryKey('p1', 'ghost-1')])),
    ).toBeNull();
  });
});
