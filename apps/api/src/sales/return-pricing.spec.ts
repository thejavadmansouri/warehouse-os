import { effectiveTotal, refundFor } from './return-pricing';

describe('return-pricing', () => {
  it('بدون تخفیفِ فاکتور، کلِ مؤثر همان خالصِ ردیف است', () => {
    expect(effectiveTotal(100_000, 0, 10, 1_000_000, 0)).toBe(1_000_000);
    expect(effectiveTotal(100_000, 10_000, 10, 1_000_000, 0)).toBe(990_000);
  });

  it('سهمِ نسبتیِ تخفیفِ کلِ فاکتور از ردیف کم می‌شود', () => {
    // فاکتور ۱٬۰۰۰٬۰۰۰ با ۱۰۰٬۰۰۰ تخفیف کل → سهمِ این ردیف ۱۰٪ = ۱۰۰٬۰۰۰.
    expect(effectiveTotal(100_000, 0, 10, 1_000_000, 100_000)).toBe(900_000);
  });

  it('گردکردنِ سازگار: lineRefund و unitRefund با هم می‌خوانند', () => {
    // ۷ از ۱۰ قلمِ ۹۰۰٬۰۰۰‌تومانیِ مؤثر: ۶۳۰٬۰۰۰؛ هر واحد ۹۰٬۰۰۰.
    const { lineRefund, unitRefund } = refundFor(900_000, 10, 7);
    expect(lineRefund).toBe(630_000);
    expect(unitRefund).toBe(90_000);
    expect(unitRefund * 7).toBe(lineRefund);
  });

  it('مبلغِ برگشت هرگز بیشتر از کلِ مؤثرِ ردیف نیست', () => {
    const { lineRefund } = refundFor(900_000, 10, 10);
    expect(lineRefund).toBe(900_000);
  });

  it('تعداد صفر یعنی مبلغ صفر', () => {
    expect(refundFor(900_000, 10, 0).lineRefund).toBe(0);
  });
});
