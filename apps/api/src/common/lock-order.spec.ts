import { inLockOrder } from './lock-order';

describe('inLockOrder', () => {
  it('دو ترتیبِ معکوس از یک مجموعه، به یک ترتیب درمی‌آیند', () => {
    // این خودِ خاصیتی است که deadlock را ممکن نمی‌کند: مهم نیست صندوق اقلام را
    // به چه ترتیبی فرستاده، قفل‌ها همیشه با یک ترتیب گرفته می‌شوند.
    const cashier1 = [
      { productId: 'p-a', locationId: 'loc-1' },
      { productId: 'p-b', locationId: 'loc-1' },
    ];
    const cashier2 = [
      { productId: 'p-b', locationId: 'loc-1' },
      { productId: 'p-a', locationId: 'loc-1' },
    ];

    expect(inLockOrder(cashier1)).toEqual(inLockOrder(cashier2));
  });

  it('یک کالا در دو مکان هم ترتیبِ قطعی دارد', () => {
    const rows = [
      { productId: 'p-a', locationId: 'loc-9' },
      { productId: 'p-a', locationId: 'loc-2' },
    ];

    expect(inLockOrder(rows).map((r) => r.locationId)).toEqual([
      'loc-2',
      'loc-9',
    ]);
  });

  it('ردیفِ بی‌مکان جای ثابتی دارد و ترتیب را بی‌قاعده نمی‌کند', () => {
    const withNull = [
      { productId: 'p-a', locationId: 'loc-1' },
      { productId: 'p-a', locationId: null },
    ];

    expect(inLockOrder(withNull)).toEqual(inLockOrder([...withNull].reverse()));
    expect(inLockOrder(withNull)[0].locationId).toBeNull();
  });

  it('آرایه‌ی ورودی را جابه‌جا نمی‌کند', () => {
    // ترتیبِ اصلی معنا دارد — `lineIndex` در خطای کمبودِ موجودی به آن اشاره
    // می‌کند تا صندوق سطرِ درست را قرمز کند.
    const lines = [
      { productId: 'p-z', locationId: 'loc-1' },
      { productId: 'p-a', locationId: 'loc-1' },
    ];

    inLockOrder(lines);

    expect(lines.map((l) => l.productId)).toEqual(['p-z', 'p-a']);
  });

  it('با کلیدِ استخراجی روی ردیفِ پیچیده هم کار می‌کند', () => {
    // شکلی که فاکتور فروش دارد: ردیف در یک wrapper با اندیسِ اصلی نشسته.
    const wrapped = [
      { line: { productId: 'p-z' }, index: 0, locationId: 'loc-1' },
      { line: { productId: 'p-a' }, index: 1, locationId: 'loc-1' },
    ];

    const ordered = inLockOrder(wrapped, (w) => ({
      productId: w.line.productId,
      locationId: w.locationId,
    }));

    expect(ordered.map((w) => w.index)).toEqual([1, 0]);
  });
});
