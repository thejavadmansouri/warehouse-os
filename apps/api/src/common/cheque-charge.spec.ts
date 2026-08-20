import {
  computeChequeCharge,
  suggestMonths,
  MAX_CHARGE_RATIO,
} from './cheque-charge';

describe('computeChequeCharge', () => {
  it('ماهانه ساده حساب می‌شود، نه مرکب', () => {
    // ۱۰۰ میلیون، ۲٪ در ماه، ۳ ماه → ۶ میلیون (نه ۶٬۱۲۰٬۸۰۰ که مرکب می‌دهد)
    expect(
      computeChequeCharge({
        base: 100_000_000,
        rateBp: 200,
        months: 3,
        mode: 'MONTHLY',
      }),
    ).toBe(6_000_000);
  });

  it('حالتِ ثابت به مدت کاری ندارد', () => {
    const flat = { base: 100_000_000, rateBp: 500, mode: 'FLAT' as const };
    expect(computeChequeCharge({ ...flat, months: 1 })).toBe(5_000_000);
    expect(computeChequeCharge({ ...flat, months: 9 })).toBe(5_000_000);
  });

  it('نرخِ اعشاری با پایه‌ی هزارم بدونِ خطای ممیز کار می‌کند', () => {
    // ۲.۵٪ در ماه × ۲ ماه روی ۳۳٬۳۳۳٬۳۳۳
    expect(
      computeChequeCharge({
        base: 33_333_333,
        rateBp: 250,
        months: 2,
        mode: 'MONTHLY',
      }),
    ).toBe(1_666_667); // گردشده، عددِ صحیح
  });

  it('صفر و ورودیِ بی‌معنا صفر می‌دهد، نه NaN', () => {
    expect(
      computeChequeCharge({ base: 0, rateBp: 200, months: 3, mode: 'MONTHLY' }),
    ).toBe(0);
    expect(
      computeChequeCharge({
        base: 1_000,
        rateBp: 0,
        months: 3,
        mode: 'MONTHLY',
      }),
    ).toBe(0);
    expect(
      computeChequeCharge({
        base: 1_000,
        rateBp: 200,
        months: 0,
        mode: 'MONTHLY',
      }),
    ).toBe(0);
    expect(
      computeChequeCharge({
        base: 1_000,
        rateBp: 200,
        months: -5,
        mode: 'MONTHLY',
      }),
    ).toBe(0);
  });

  it('نرخِ تایپ‌شده‌ی فاجعه‌بار در سقف می‌ماند', () => {
    // ۲۵۰۰۰bp یعنی ۲۵۰٪ — تایپِ اشتباهِ ۲۵۰. سقف نمی‌گذارد فاکتور بترکد.
    const base = 10_000_000;
    expect(
      computeChequeCharge({ base, rateBp: 25_000, months: 3, mode: 'MONTHLY' }),
    ).toBe(base * MAX_CHARGE_RATIO);
  });
});

describe('suggestMonths', () => {
  const from = new Date('2026-08-18T00:00:00Z');

  it('روز را به ماهِ گردشده تبدیل می‌کند', () => {
    expect(suggestMonths(new Date('2026-11-16T00:00:00Z'), from)).toBe(3); // ۹۰ روز
    expect(suggestMonths(new Date('2026-09-17T00:00:00Z'), from)).toBe(1); // ۳۰ روز
    expect(suggestMonths(new Date('2026-10-05T00:00:00Z'), from)).toBe(2); // ۴۸ روز → ۱.۶ → ۲
  });

  it('سررسیدِ نزدیک دستِ‌کم یک ماه است، سررسیدِ گذشته صفر', () => {
    expect(suggestMonths(new Date('2026-08-25T00:00:00Z'), from)).toBe(1); // ۷ روز
    expect(suggestMonths(new Date('2026-08-10T00:00:00Z'), from)).toBe(0);
  });
});
