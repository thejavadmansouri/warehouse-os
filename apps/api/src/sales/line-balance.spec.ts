import { lineBalances } from './line-balance';

/**
 * سناریوی واقعیِ مغازه که این تعریف را لازم کرد:
 *
 *   فاکتور ۵۰ قلمی → ۱۰ روز بعد ۲۰ تا پس می‌دهد → ۱۰ تا را عوض می‌کند.
 *
 * تا پیش از این، اصلاحیه و مرجوعی هرکدام فقط سابقه‌ی خودشان را می‌دیدند و
 * همین دو خطا را می‌ساخت: انبارِ اضافه‌آمده، و مرجوعیِ بیشتر از خریده‌شده.
 */

type Row = {
  saleLogId: string;
  _sum: {
    newQuantity?: number | null;
    oldQuantity?: number | null;
    quantity?: number | null;
  };
};

/** یک Prisma قلابی که فقط دو groupBy را جواب می‌دهد. */
function db(corrections: Row[], returns: Row[]) {
  return {
    saleCorrectionLine: { groupBy: async () => corrections },
    saleReturnLine: { groupBy: async () => returns },
  } as never;
}

const LINE = 'log-1';
const sold = new Map([[LINE, 50]]);

describe('lineBalances', () => {
  it('بدونِ اصلاحیه و مرجوعی، مانده همان فروش است', async () => {
    const b = await lineBalances(db([], []), [LINE], sold);
    expect(b.get(LINE)).toEqual({
      sold: 50,
      correctionDelta: 0,
      returned: 0,
      outstanding: 50,
    });
  });

  it('۲۰ تا برگشت خورده ⇒ مانده ۳۰ است، نه ۵۰', async () => {
    const b = await lineBalances(
      db([], [{ saleLogId: LINE, _sum: { quantity: 20 } }]),
      [LINE],
      sold,
    );
    expect(b.get(LINE)!.outstanding).toBe(30);
  });

  it('اصلاحیه‌ی ۵۰ به ۱۰ ⇒ قابل‌برگشت ۱۰ است، نه ۵۰', async () => {
    const b = await lineBalances(
      db([{ saleLogId: LINE, _sum: { oldQuantity: 50, newQuantity: 10 } }], []),
      [LINE],
      sold,
    );
    expect(b.get(LINE)!.correctionDelta).toBe(-40);
    expect(b.get(LINE)!.outstanding).toBe(10);
  });

  it('۲۰ برگشت + اصلاحیه‌ی ۳۰ به ۲۵ ⇒ مانده ۲۵', async () => {
    const b = await lineBalances(
      db(
        // اصلاحیه روی مانده‌ی همان لحظه نوشته می‌شود: ۳۰ ← ۲۵.
        [{ saleLogId: LINE, _sum: { oldQuantity: 30, newQuantity: 25 } }],
        [{ saleLogId: LINE, _sum: { quantity: 20 } }],
      ),
      [LINE],
      sold,
    );
    expect(b.get(LINE)!.outstanding).toBe(25);
  });

  it('مانده هیچ‌وقت منفی نمی‌شود', async () => {
    const b = await lineBalances(
      db([], [{ saleLogId: LINE, _sum: { quantity: 80 } }]),
      [LINE],
      sold,
    );
    expect(b.get(LINE)!.outstanding).toBe(0);
  });

  it('ردیفِ بدونِ سابقه هم کلید دارد — نبودنش یعنی undefined در صداکننده', async () => {
    const b = await lineBalances(db([], []), [LINE, 'log-2'], sold);
    expect(b.get('log-2')).toEqual({
      sold: 0,
      correctionDelta: 0,
      returned: 0,
      outstanding: 0,
    });
  });
});
