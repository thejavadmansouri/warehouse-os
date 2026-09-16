import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMethod } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { PayoutsService } from './payouts.service';
import { LedgerService } from './ledger.service';
import { PostingService } from '../vouchers/posting.service';

/**
 * تست‌های پرداخت به مشتری بستانکار (CustomerPayout).
 *
 * قواعدِ موضوعِ تست:
 *   • مبلغ فقط تا سقفِ بستانکاری — بیشترِ آن رد می‌شود.
 *   • مشتریِ غیرِ بستانکار رد می‌شود.
 *   • نسیه روشِ پرداخت نیست.
 *   • ثبت موفق = سند + ردیفِ لجرِ مثبت (PAYOUT) با پیوندِ payoutId.
 *   • retry با همان idempotencyKey همان سند را برمی‌گرداند.
 */
describe('PayoutsService', () => {
  let service: PayoutsService;

  const prisma: any = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    customer: { findUnique: jest.fn() },
    customerPayout: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    voucherLine: { findMany: jest.fn() },
  };
  const ledger = { balance: jest.fn(), record: jest.fn() };
  const events = { broadcast: jest.fn() };
  const posting = { post: jest.fn() };

  const PAYOUT = {
    id: 'po1',
    number: 7,
    amount: 13_000_000,
    method: 'CASH',
    customer: { id: 'c1', firstName: 'رضا', lastName: 'کریمی' },
    user: { id: 'u1', fullName: 'مدیر' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    // قفلِ مشتری — یک سطر برمی‌گرداند یعنی مشتری هست.
    prisma.$queryRaw.mockResolvedValue([{ id: 'c1' }]);
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.customerPayout.create.mockImplementation(async ({ data }: any) => ({
      ...PAYOUT,
      ...data,
    }));
    // findOne بعد از ساخت، سندِ تازه‌ساخته‌شده را می‌خواند؛ جست‌وجوی
    // idempotency پیش‌فرض هیچ سندِ قبلی ندارد (تستِ retry خودش مقدار می‌دهد).
    prisma.customerPayout.findUnique.mockImplementation(async (args: any) =>
      args?.where?.idempotencyKey !== undefined ? null : PAYOUT,
    );
    ledger.balance.mockResolvedValue(-13_000_000);
    ledger.record.mockResolvedValue({ id: 'ledger-row' });
    // بدون سندِ ابطالی — بازپرداختِ معوقی وجود ندارد.
    prisma.voucherLine.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LedgerService, useValue: ledger },
        { provide: EventsGateway, useValue: events },
        { provide: PostingService, useValue: posting },
      ],
    }).compile();
    service = module.get(PayoutsService);
  });

  function dto(over: Record<string, unknown> = {}) {
    return {
      customerId: 'c1',
      amount: 13_000_000,
      method: PaymentMethod.CASH,
      reason: 'تسویه بستانکاری',
      ...over,
    } as any;
  }

  it('ثبت موفق: سند ساخته می‌شود و ردیفِ لجرِ مثبتِ PAYOUT با پیوندِ payout ثبت می‌شود', async () => {
    const res = await service.create(dto());

    expect(res.number).toBe(7);
    expect(prisma.customerPayout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 'c1',
          amount: 13_000_000,
          method: 'CASH',
          reason: 'تسویه بستانکاری',
        }),
      }),
    );
    expect(ledger.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        customerId: 'c1',
        type: 'PAYOUT',
        amount: 13_000_000,
        payoutId: PAYOUT.id,
      }),
    );
    expect(events.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payout.created', customerId: 'c1' }),
    );
    // سندِ خودکار: بدهکارِ مشتری / بستانکارِ صندوق.
    expect(posting.post).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        sourceType: 'CUSTOMER_PAYOUT',
        idempotencyKey: 'payout:po1',
        lines: expect.arrayContaining([
          expect.objectContaining({
            account: 'CUSTOMERS',
            amount: 13_000_000,
            customerId: 'c1',
          }),
          expect.objectContaining({ account: 'CASH', amount: -13_000_000 }),
        ]),
      }),
    );
  });

  it('پرداختِ بابتِ فاکتورِ باطل‌شده: حسابِ «بازپرداخت مشتری» صاف می‌شود', async () => {
    // فاکتورِ نقدی باطل شده → مشتری نه بدهکار است نه بستانکار (مانده صفر)،
    // ولی ۵ میلیون «بازپرداختِ معوق» در سندِ ابطال نشسته.
    prisma.voucherLine.findMany.mockResolvedValue([{ amount: -5_000_000 }]);
    ledger.balance.mockResolvedValue(0);

    await service.create(dto({ amount: 5_000_000 }));

    // هیچ ردیفِ دفتری — مانده‌ی مشتری از قبل صفر بود و نباید دست بخورد.
    expect(ledger.record).not.toHaveBeenCalled();
    // سند: صندوق (بستانکار) در برابرِ بازپرداخت مشتری (بدهکار).
    expect(posting.post).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        sourceType: 'CUSTOMER_PAYOUT',
        lines: expect.arrayContaining([
          expect.objectContaining({
            account: 'REFUND_PAYABLE',
            amount: 5_000_000,
            customerId: 'c1',
          }),
          expect.objectContaining({ account: 'CASH', amount: -5_000_000 }),
        ]),
      }),
    );
  });

  it('مشتریِ بدهکار یا تسویه‌شده رد می‌شود', async () => {
    ledger.balance.mockResolvedValue(5_000_000);
    await expect(service.create(dto())).rejects.toMatchObject({
      response: { error: 'NO_CREDIT' },
    });

    ledger.balance.mockResolvedValue(0);
    await expect(service.create(dto())).rejects.toMatchObject({
      response: { error: 'NO_CREDIT' },
    });
  });

  it('پرداختِ بیش از بستانکاری رد می‌شود', async () => {
    await expect(
      service.create(dto({ amount: 20_000_000 })),
    ).rejects.toMatchObject({
      response: {
        error: 'EXCEEDS_CREDIT',
        credit: 13_000_000,
      },
    });
  });

  it('مشتریِ تسویه‌شده با بازپرداختِ معوق پذیرفته می‌شود', async () => {
    prisma.voucherLine.findMany.mockResolvedValue([{ amount: -5_000_000 }]);
    ledger.balance.mockResolvedValue(0);

    await expect(
      service.create(dto({ amount: 3_000_000 })),
    ).resolves.toBeDefined();
  });

  it('پرداختِ بیش از بستانکاری با allowBeyondCredit پذیرفته و مازاد به بدهی اضافه می‌شود', async () => {
    // بستانکاری ۱۳ میلیون؛ ۲۰ میلیون پرداخت می‌شود → ۷ میلیون مازادِ آزاد.
    await expect(
      service.create(dto({ amount: 20_000_000, allowBeyondCredit: true })),
    ).resolves.toBeDefined();

    // کلِ مبلغ (۲۰) در دفتر می‌نشیند — مانده از ۱۳- به ۷+ می‌رود.
    expect(ledger.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        type: 'PAYOUT',
        amount: 20_000_000,
        payoutId: 'po1',
      }),
    );
    expect(posting.post).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ account: 'CUSTOMERS', amount: 20_000_000 }),
          expect.objectContaining({ account: 'CASH', amount: -20_000_000 }),
        ]),
      }),
    );
  });

  it('مشتریِ بدهکار با allowBeyondCredit پذیرفته و بدهکارتر می‌شود', async () => {
    // بدهکارِ ۵ میلیونی ۳ میلیون «پرداختِ آزاد» می‌گیرد → بدهی ۸ میلیون.
    ledger.balance.mockResolvedValue(5_000_000);

    await expect(
      service.create(dto({ amount: 3_000_000, allowBeyondCredit: true })),
    ).resolves.toBeDefined();

    expect(ledger.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ type: 'PAYOUT', amount: 3_000_000 }),
    );
    expect(posting.post).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ account: 'CUSTOMERS', amount: 3_000_000 }),
          expect.objectContaining({ account: 'CASH', amount: -3_000_000 }),
        ]),
      }),
    );
  });

  it('مشتریِ بدهکار بدون allowBeyondCredit همچنان رد می‌شود', async () => {
    ledger.balance.mockResolvedValue(5_000_000);
    await expect(
      service.create(dto({ amount: 3_000_000 })),
    ).rejects.toMatchObject({
      response: { error: 'NO_CREDIT' },
    });
  });

  it('مبلغِ صفر، نسیه و چکِ بی‌مشخصات رد می‌شوند — دلیل اختیاری است', async () => {
    await expect(service.create(dto({ amount: 0 }))).rejects.toMatchObject({
      response: { error: 'INVALID_AMOUNT' },
    });

    await expect(
      service.create(dto({ method: PaymentMethod.CREDIT })),
    ).rejects.toMatchObject({ response: { error: 'INVALID_METHOD' } });

    await expect(
      service.create(dto({ method: PaymentMethod.CHEQUE, cheque: undefined })),
    ).rejects.toMatchObject({ response: { error: 'CHEQUE_DETAILS_REQUIRED' } });
  });

  it('چکِ پرداختی با مشخصاتش روی سند می‌نشیند', async () => {
    await service.create(
      dto({
        method: PaymentMethod.CHEQUE,
        cheque: {
          number: 'CH-102',
          bankName: 'بانک ملی',
          dueDate: new Date('2026-10-01').toISOString(),
        },
      }),
    );

    expect(prisma.customerPayout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          method: 'CHEQUE',
          chequeNumber: 'CH-102',
          bankName: 'بانک ملی',
        }),
      }),
    );
  });

  it('retry با همان idempotencyKey همان سند را برمی‌گرداند — دوباره ثبت نمی‌شود', async () => {
    prisma.customerPayout.findUnique.mockResolvedValue(PAYOUT);

    const res = await service.create(dto({ idempotencyKey: 'op-1' }));

    expect(res.id).toBe('po1');
    expect(prisma.customerPayout.create).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('مشتریِ نبود رد می‌شود', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.create(dto())).rejects.toMatchObject({
      response: { error: 'CUSTOMER_NOT_FOUND' },
    });
  });
});
