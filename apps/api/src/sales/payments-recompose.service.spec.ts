import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMethod, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { PostingService } from '../vouchers/posting.service';
import { LedgerService } from './ledger.service';
import { PaymentsRecomposeService } from './payments-recompose.service';

/**
 * تست‌های «اصلاح نحوهٔ پرداخت».
 *
 * موضوعِ تست، همان سناریوی پیشخوان است: فاکتورِ ۱۰۰ میلیونی که همه‌اش کارتخوان
 * زده شده، در حالی که واقعیت ۳۰ نقد بوده و ۷۰ نسیه.
 *
 * قواعدی که اینجا قفل می‌شوند:
 *   • نوشتن **تفاضلی** است: فقط آنچه عوض شده ردیف می‌سازد (کارتِ −۱۰۰م، نقدِ
 *     +۳۰م، نسیهٔ +۷۰م) — تاریخچه حذف نمی‌شود.
 *   • اگر تقسیم فقط جای نقد و کارت را عوض کند، پولی جابه‌جا نشده ⇒ نه ردیفِ دفتر
 *     و نه سند.
 *   • فاکتورِ چکدار، فاکتوری که پولش از «دریافت» خورده، و فاکتورِ باطل از این
 *     مسیر اصلاح نمی‌شوند.
 *   • فروشنده روی فاکتورهای گذشته دست نمی‌برد؛ مدیر همه‌جا.
 *   • همان کلیدِ idempotency ⇒ همان نتیجه، بدون ردیفِ اضافه.
 *
 * قفلِ فاکتور (`lockInvoice`) `$queryRaw` می‌زند؛ ماک همان ردیفِ قفل‌شده را
 * می‌دهد و صحتِ خودِ SQL جای دیگری تست می‌شود. `saleInvoice.update` هم روی
 * «وضعیتِ زنده» اعمال می‌شود تا خودبررسیِ پایانِ تراکنش واقعاً معنا داشته باشد.
 */

const CUSTOMER_ID = 'c1';

type Row = { method: PaymentMethod; amount: number; cheque?: { id: string } | null };

/** وضعیتِ زنده‌ی فاکتور و ردیف‌های پرداختش — ماک‌ها روی همین می‌نویسند. */
function makeState() {
  return {
    status: 'CONFIRMED' as string,
    total: 100_000_000,
    paidAmount: 100_000_000,
    dueAmount: 0,
    dueDate: null as Date | null,
    customerId: CUSTOMER_ID as string | null,
    createdAt: new Date(),
    rows: [
      { method: PaymentMethod.CARD, amount: 100_000_000 },
    ] as Row[],
  };
}

function baseDto(over: Record<string, unknown> = {}) {
  return {
    idempotencyKey: 'key-1',
    reason: 'اشتباه ثبت شده بود',
    payments: [
      { method: PaymentMethod.CASH, amount: 30_000_000 },
      { method: PaymentMethod.CREDIT, amount: 70_000_000 },
    ],
    ...over,
  } as any;
}

describe('PaymentsRecomposeService', () => {
  let service: PaymentsRecomposeService;
  let state: ReturnType<typeof makeState>;

  const ledger = { record: jest.fn() };
  const events = { broadcast: jest.fn() };
  const posting = { post: jest.fn() };

  const prisma: any = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    saleInvoice: { findUnique: jest.fn(), update: jest.fn() },
    payment: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    receiptAllocation: { count: jest.fn() },
    customer: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    state = makeState();

    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));

    // قفلِ فاکتور — همان ردیفی که واقعاً در دیتابیس قفل می‌شود.
    prisma.$queryRaw.mockImplementation(async () => [
      {
        id: 'inv1',
        number: 1001,
        status: state.status,
        subtotal: state.total,
        discount: 0,
        total: state.total,
        paidAmount: state.paidAmount,
        dueAmount: state.dueAmount,
        dueDate: state.dueDate,
        customerId: state.customerId,
        warehouseId: 'w1',
        accountId: null,
        createdAt: state.createdAt,
      },
    ]);

    /*
     * دو خواندنِ متفاوت از یک مدل:
     *   • خواندنِ تسویه (select.payments دارد) → شکلِ کاملِ پنل.
     *   • خواندنِ خودبررسیِ پایانِ تراکنش (فقط paidAmount/dueAmount) → وضعیتِ زنده.
     */
    prisma.saleInvoice.findUnique.mockImplementation(async (args: any) => {
      if (!args?.select?.payments) {
        return { paidAmount: state.paidAmount, dueAmount: state.dueAmount };
      }
      return {
        id: 'inv1',
        number: 1001,
        status: state.status,
        total: state.total,
        paidAmount: state.paidAmount,
        dueAmount: state.dueAmount,
        dueDate: state.dueDate,
        createdAt: state.createdAt,
        customerId: state.customerId,
        customer: state.customerId
          ? { id: state.customerId, firstName: 'علی', lastName: 'محمدی' }
          : null,
        payments: state.rows.map((r, i) => ({
          id: `pay-${i}`,
          method: r.method,
          amount: r.amount,
          note: null,
          createdAt: new Date(),
          cheque: r.cheque ?? null,
        })),
      };
    });

    // نوشتنِ نسبی — همان کاری که Prisma با increment/decrement می‌کند.
    prisma.saleInvoice.update.mockImplementation(async (args: any) => {
      const d = args.data ?? {};
      applyDelta(d.paidAmount, (v) => (state.paidAmount += v));
      applyDelta(d.dueAmount, (v) => (state.dueAmount += v));
      if ('dueDate' in d) state.dueDate = d.dueDate ?? null;
      if (typeof d.customerId === 'string') state.customerId = d.customerId;
      return {};
    });

    prisma.payment.create.mockImplementation(async (args: any) => {
      state.rows.push({ method: args.data.method, amount: args.data.amount });
      return { id: `new-${state.rows.length}` };
    });
    prisma.payment.findMany.mockImplementation(async () =>
      state.rows.map((r) => ({ ...r })),
    );
    prisma.payment.findFirst.mockImplementation(async (args: any) => {
      // کلیدِ عملیات روی ردیف‌ها مهر می‌شود؛ وجودش یعنی «قبلاً ثبت شده».
      const key = args?.where?.operationKey;
      if (key === 'key-done') return { id: 'pay-done' };
      return null;
    });

    prisma.receiptAllocation.count.mockResolvedValue(0);
    prisma.customer.findUnique.mockResolvedValue({ creditDays: 10 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsRecomposeService,
        { provide: PrismaService, useValue: prisma },
        { provide: LedgerService, useValue: ledger },
        { provide: EventsGateway, useValue: events },
        { provide: PostingService, useValue: posting },
      ],
    }).compile();
    service = module.get(PaymentsRecomposeService);
  });

  function applyDelta(value: any, apply: (v: number) => void) {
    if (typeof value === 'number') return apply(value);
    if (value && typeof value === 'object' && 'increment' in value) {
      return apply(value.increment);
    }
    if (value && typeof value === 'object' && 'decrement' in value) {
      return apply(-value.decrement);
    }
  }

  function createdRows() {
    return prisma.payment.create.mock.calls.map((c: any) => c[0].data);
  }

  // ---------- خواندن ----------

  describe('settlement', () => {
    it('فاکتورِ نقدی/کارتیِ سالم: تقسیمِ خالصِ هر روش و مجوزِ اصلاح', async () => {
      const s = await service.settlement('inv1');

      expect(s.canRecompose).toBe(true);
      expect(s.blockedReason).toBeNull();
      expect(s.needsCustomer).toBe(false);
      expect(s.received).toBe(100_000_000);
      expect(s.credit).toBe(0);
      expect(s.byMethod).toEqual([
        { method: PaymentMethod.CASH, amount: 0 },
        { method: PaymentMethod.CARD, amount: 100_000_000 },
        { method: PaymentMethod.CREDIT, amount: 0 },
      ]);
    });

    it('فاکتورِ باطل، چکدار و رسیدخورده با دلیلِ فارسی بسته می‌شوند', async () => {
      state.status = 'CANCELLED';
      expect((await service.settlement('inv1')).blockedReason).toContain('باطل');

      jest.clearAllMocks();
      state = makeState();
      state.rows = [{ method: PaymentMethod.CARD, amount: 100_000_000, cheque: { id: 'ch1' } }];
      expect((await service.settlement('inv1')).canRecompose).toBe(false);
      expect((await service.settlement('inv1')).blockedReason).toContain('چک');
    });
  });

  // ---------- نوشتن ----------

  it('کارت ۱۰۰م ← نقد ۳۰م + نسیه ۷۰م: ردیف‌های تفاضلی، دفتر، سند و سررسید', async () => {
    const s = await service.recompose('inv1', baseDto(), 'u1', Role.MANAGER);

    // تفاضل به‌ازای هر روش — نه حذفِ تاریخچه.
    expect(createdRows()).toEqual([
      expect.objectContaining({ method: PaymentMethod.CARD, amount: -100_000_000 }),
      expect.objectContaining({ method: PaymentMethod.CASH, amount: 30_000_000 }),
      expect.objectContaining({ method: PaymentMethod.CREDIT, amount: 70_000_000 }),
    ]);

    // مانده‌ی فاکتور با تقسیمِ تازه می‌خواند.
    expect(state.paidAmount).toBe(30_000_000);
    expect(state.dueAmount).toBe(70_000_000);
    expect(state.dueDate).not.toBeNull();

    // یک ردیفِ دفتر برای کلِ عملیات: بدهی +۷۰م.
    expect(ledger.record).toHaveBeenCalledTimes(1);
    expect(ledger.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        customerId: CUSTOMER_ID,
        type: 'RECOMPOSE',
        amount: 70_000_000,
        invoiceId: 'inv1',
      }),
    );

    // یک سندِ خودکار: مشتریان +۷۰م / صندوق −۷۰م.
    expect(posting.post).toHaveBeenCalledTimes(1);
    expect(posting.post).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        sourceType: 'PAYMENT_RECOMPOSE',
        idempotencyKey: 'payment-recompose:key-1',
        lines: expect.arrayContaining([
          expect.objectContaining({
            account: 'CUSTOMERS',
            amount: 70_000_000,
            customerId: CUSTOMER_ID,
          }),
          expect.objectContaining({ account: 'CASH', amount: -70_000_000 }),
        ]),
      }),
    );

    // پاسخ، تسویه‌ی تازه است و اعلان برای پنل‌های باز.
    expect(s.canRecompose).toBe(true);
    expect(s.byMethod).toEqual([
      { method: PaymentMethod.CASH, amount: 30_000_000 },
      { method: PaymentMethod.CARD, amount: 0 },
      { method: PaymentMethod.CREDIT, amount: 70_000_000 },
    ]);
    expect(events.broadcast).toHaveBeenCalledWith({
      type: 'payment.recomposed',
      invoiceId: 'inv1',
    });
  });

  it('جابه‌جاییِ نقد و کارت (نسیه بی‌تغییر) پولی جابه‌جا نمی‌کند ⇒ بدون دفتر و سند', async () => {
    const s = await service.recompose(
      'inv1',
      baseDto({
        payments: [
          { method: PaymentMethod.CARD, amount: 70_000_000 },
          { method: PaymentMethod.CASH, amount: 30_000_000 },
        ],
      }),
      'u1',
      Role.MANAGER,
    );

    expect(createdRows()).toEqual([
      expect.objectContaining({ method: PaymentMethod.CARD, amount: -30_000_000 }),
      expect.objectContaining({ method: PaymentMethod.CASH, amount: 30_000_000 }),
    ]);
    expect(state.paidAmount).toBe(100_000_000);
    expect(state.dueAmount).toBe(0);
    expect(ledger.record).not.toHaveBeenCalled();
    expect(posting.post).not.toHaveBeenCalled();
    expect(s.invoice.dueAmount).toBe(0);
    expect(s.invoice.dueDate).toBeNull();
  });

  it('تقسیمِ بی‌تغییر رد می‌شود — چیزی برای ثبت نیست', async () => {
    await expect(
      service.recompose(
        'inv1',
        baseDto({ payments: [{ method: PaymentMethod.CARD, amount: 100_000_000 }] }),
        'u1',
        Role.MANAGER,
      ),
    ).rejects.toMatchObject({ response: { error: 'NO_CHANGE' } });

    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('retry با همان کلیدِ عملیات: بی‌اثر و بدون ردیفِ اضافه', async () => {
    const s = await service.recompose(
      'inv1',
      baseDto({ idempotencyKey: 'key-done' }),
      'u1',
      Role.MANAGER,
    );

    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
    expect(posting.post).not.toHaveBeenCalled();
    expect(events.broadcast).not.toHaveBeenCalled();
    // پاسخ همچنان تسویه‌ی فعلی است.
    expect(s.invoice.id).toBe('inv1');
  });

  it('فاکتورِ چکدار از این مسیر اصلاح نمی‌شود', async () => {
    state.rows = [{ method: PaymentMethod.CARD, amount: 100_000_000, cheque: { id: 'ch1' } }];

    await expect(
      service.recompose('inv1', baseDto(), 'u1', Role.MANAGER),
    ).rejects.toMatchObject({ response: { error: 'CHEQUE_NOT_EDITABLE' } });

    // و چک حتی به‌عنوان روشِ مقصد هم پذیرفته نمی‌شود.
    await expect(
      service.recompose(
        'inv1',
        baseDto({ payments: [{ method: PaymentMethod.CHEQUE, amount: 100_000_000 }] }),
        'u1',
        Role.MANAGER,
      ),
    ).rejects.toMatchObject({ response: { error: 'CHEQUE_NOT_EDITABLE' } });
  });

  it('پولی که از «دریافت/تسویه» خورده بازنویسی نمی‌شود', async () => {
    prisma.receiptAllocation.count.mockResolvedValue(1);

    await expect(
      service.recompose('inv1', baseDto(), 'u1', Role.MANAGER),
    ).rejects.toMatchObject({ response: { error: 'PAYMENT_FROM_RECEIPT' } });

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('جمعِ ردیف‌ها با paidAmount نخواند ⇒ پول از جای دیگری آمده', async () => {
    state.paidAmount = 100_000_000;
    state.rows = [{ method: PaymentMethod.CARD, amount: 80_000_000 }];

    await expect(
      service.recompose('inv1', baseDto(), 'u1', Role.MANAGER),
    ).rejects.toMatchObject({ response: { error: 'PAYMENT_FROM_RECEIPT' } });
  });

  it('نسیه‌کردنِ فاکتورِ بی‌مشتری، مشتری می‌خواهد', async () => {
    state.customerId = null;

    await expect(
      service.recompose('inv1', baseDto(), 'u1', Role.MANAGER),
    ).rejects.toMatchObject({
      response: { error: 'CUSTOMER_REQUIRED_FOR_CREDIT' },
    });

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('فاکتورِ بی‌مشتری با مشتریِ داده‌شده وصل می‌شود و بدهی به نامش می‌نشیند', async () => {
    state.customerId = null;

    await service.recompose(
      'inv1',
      baseDto({ customerId: 'c9' }),
      'u1',
      Role.MANAGER,
    );

    expect(state.customerId).toBe('c9');
    expect(ledger.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ customerId: 'c9', amount: 70_000_000 }),
    );
    expect(posting.post).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ account: 'CUSTOMERS', customerId: 'c9' }),
        ]),
      }),
    );
  });

  it('مشتریِ فاکتوری که از قبل مشتری دارد عوض نمی‌شود', async () => {
    await expect(
      service.recompose('inv1', baseDto({ customerId: 'c9' }), 'u1', Role.MANAGER),
    ).rejects.toMatchObject({ response: { error: 'CUSTOMER_ALREADY_SET' } });
  });

  it('فروشنده روی فاکتورِ گذشته دست نمی‌برد، ولی روی فاکتورِ امروز می‌تواند', async () => {
    state.createdAt = new Date('2020-01-01T10:00:00Z');

    await expect(
      service.recompose('inv1', baseDto(), 'u1', Role.SALES),
    ).rejects.toMatchObject({ response: { error: 'RECOMPOSE_REQUIRES_MANAGER' } });

    state.createdAt = new Date();
    await expect(
      service.recompose('inv1', baseDto(), 'u1', Role.SALES),
    ).resolves.toMatchObject({ canRecompose: true });
  });

  it('فاکتورِ باطل‌شده اصلاح نمی‌شود', async () => {
    state.status = 'CANCELLED';

    await expect(
      service.recompose('inv1', baseDto(), 'u1', Role.MANAGER),
    ).rejects.toMatchObject({ response: { error: 'INVOICE_NOT_CORRECTABLE' } });
  });

  it('پرداختِ بیشتر از مبلغِ فاکتور رد می‌شود', async () => {
    await expect(
      service.recompose(
        'inv1',
        baseDto({ payments: [{ method: PaymentMethod.CASH, amount: 120_000_000 }] }),
        'u1',
        Role.MANAGER,
      ),
    ).rejects.toMatchObject({ response: { error: 'OVERPAYMENT' } });

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('نسیه‌ی بیشتر از باقی‌مانده رد می‌شود', async () => {
    await expect(
      service.recompose(
        'inv1',
        baseDto({
          payments: [
            { method: PaymentMethod.CASH, amount: 50_000_000 },
            { method: PaymentMethod.CREDIT, amount: 60_000_000 },
          ],
        }),
        'u1',
        Role.MANAGER,
      ),
    ).rejects.toMatchObject({ response: { error: 'CREDIT_EXCEEDS_REMAINDER' } });
  });
});
