import { checkPurchasePrice } from './price-guard';

/**
 * چیزی که این تست‌ها محافظت می‌کنند: **گزارشِ سود**.
 *
 * یک قیمتِ خریدِ اشتباه هیچ‌وقت خودش را نشان نمی‌دهد — نه خطا می‌دهد، نه چیزی
 * از کار می‌افتد. فقط سودِ آن کالا تا ابد غلط می‌ماند. این تست‌ها مرزِ بینِ
 * «قیمت پریده» و «قیمت اشتباه وارد شده» را ثابت نگه می‌دارند.
 */

const NONE = { lastPurchasePrice: null, salePrice: null };

describe('checkPurchasePrice', () => {
  it('قیمتِ عادی هشدار ندارد', () => {
    expect(
      checkPurchasePrice({
        unitPrice: 110_000,
        lastPurchasePrice: 100_000,
        salePrice: 150_000,
      }),
    ).toBeNull();
  });

  it('ده‌برابر را به‌عنوان اشتباهِ تومان/ریال می‌شناسد', () => {
    const w = checkPurchasePrice({
      unitPrice: 1_000_000,
      lastPurchasePrice: 100_000,
      salePrice: null,
    });

    expect(w?.kind).toBe('TENFOLD_JUMP');
    expect(w?.previous).toBe(100_000);
  });

  it('ده‌برابر بر جهشِ ساده مقدم است', () => {
    // ۱۰ برابر هم «بیش از ۳ برابر» است؛ تشخیصِ مشخص‌تر باید برنده شود وگرنه
    // کاربر پیامِ مبهم می‌بیند و علتِ واقعی را حدس نمی‌زند.
    expect(
      checkPurchasePrice({
        unitPrice: 1_000_000,
        lastPurchasePrice: 100_000,
        salePrice: 120_000,
      })?.kind,
    ).toBe('TENFOLD_JUMP');
  });

  it('جهش و افتِ بزرگ را می‌گیرد', () => {
    expect(
      checkPurchasePrice({
        unitPrice: 400_000,
        lastPurchasePrice: 100_000,
        ...{ salePrice: null },
      })?.kind,
    ).toBe('BIG_JUMP');

    expect(
      checkPurchasePrice({
        unitPrice: 30_000,
        lastPurchasePrice: 100_000,
        salePrice: null,
      })?.kind,
    ).toBe('BIG_DROP');
  });

  it('درست روی مرز هشدار نمی‌دهد', () => {
    // ۳ برابرِ دقیق هنوز قابل قبول است — مرز باید قطعی باشد، نه سلیقه‌ای.
    expect(
      checkPurchasePrice({
        unitPrice: 300_000,
        lastPurchasePrice: 100_000,
        salePrice: null,
      }),
    ).toBeNull();
  });

  it('خرید بالاتر از فروش، حتی بدون سابقه‌ی خرید', () => {
    // کالای تازه‌وارد سابقه‌ی خرید ندارد، ولی این قاعده هنوز کار می‌کند.
    const w = checkPurchasePrice({
      unitPrice: 200_000,
      lastPurchasePrice: null,
      salePrice: 150_000,
    });

    expect(w?.kind).toBe('ABOVE_SALE_PRICE');
    expect(w?.previous).toBe(150_000);
  });

  it('قیمتِ صفر هیچ‌وقت هشدار نمی‌گیرد', () => {
    // صفر یعنی هدیه یا گارانتی؛ یاد هم گرفته نمی‌شود، پس چیزی خراب نمی‌کند.
    expect(
      checkPurchasePrice({
        unitPrice: 0,
        lastPurchasePrice: 100_000,
        salePrice: 150_000,
      }),
    ).toBeNull();
  });

  it('کالای بدون هیچ سابقه‌ای هشدار ندارد', () => {
    expect(checkPurchasePrice({ unitPrice: 500_000, ...NONE })).toBeNull();
  });

  it('خریدِ قبلیِ صفر پایه‌ی مقایسه نمی‌شود', () => {
    // جنسِ هدیه‌ی قبلی نباید باعث شود اولین خریدِ واقعی «بی‌نهایت برابر» شود.
    expect(
      checkPurchasePrice({
        unitPrice: 500_000,
        lastPurchasePrice: 0,
        salePrice: null,
      }),
    ).toBeNull();
  });
});
