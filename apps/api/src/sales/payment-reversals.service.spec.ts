import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMethod } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { PaymentReversalsService } from './payment-reversals.service';
import { LedgerService } from './ledger.service';
import { PostingService } from '../vouchers/posting.service';

/**
 * تست‌های برگشتِ پرداخت (PaymentReversal).
 *
 * قواعدِ موضوعِ تست:
 *   • برگشت فقط تا سقفِ پرداخت‌شده‌ی فاکتور — بیشترش رد می‌شود.
 *   • فاکتورِ بی‌مشتری و باطل‌شده سندِ برگشت نمی‌گیرند.
 *   • همه‌چیز در یک تراکنش است: ردیفِ منفی + مانده + دفتر، یا هیچ‌کدام.
 *   • retry با همان کلیدِ idempotency = همان سند، بدون اثرِ اضافه.
 *
 * قفلِ فاکتور (`lockInvoice`) `$queryRaw` را صدا می‌زند؛ ماکِ $queryRaw همان
 * ردیفِ قفل‌شده را می‌دهد — صحتِ SQL قفل جای دیگری تست می‌شود.
 */

const LOCKED_INVOICE = {
  id: 'inv1',
  number: 1001,
  status: 'CONFIRMED',
  subtotal: 1_000_000,
  discount: 0,
  total: 1_000_000,
  paidAmount: 1_000_000,
  dueAmount: 0,
  customerId: 'c1',
  warehouseId: 'w1',
  accountId: null,
};

const REVERSAL = {
  id: 'rev1',
  invoiceId: 'inv1',
  method: PaymentMethod.CARD,
  amount: 1_000_000,
  reason: 'کارتخوان برگشت زد',
  userId: 'u1',
  idempotencyKey: 'key-1',
};

function baseDto(over: Record<string, unknown> = {}) {
  return {
    amount: 1_000_000,
    method: PaymentMethod.CARD,
    reason: 'کارتخوان برگشت زد',
    ...over,
  };
}

describe('PaymentReversalsService', () => {
  let service: PaymentReversalsService;

  const ledger = { record: jest.fn() };
  const events = { broadcast: jest.fn() };
  const posting = { post: jest.fn() };

  const prisma: any = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    saleInvoice: { findUnique: jest.fn(), update: jest.fn() },
    payment: { create: jest.fn() },
    paymentReversal: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.$queryRaw.mockResolvedValue([LOCKED_INVOICE]);
    prisma.saleInvoice.findUnique.mockResolvedValue({
      status: 'CONFIRMED',
      paidAmount: 1_000_000,
      dueAmount: 0,
      customerId: 'c1',
    });
    prisma.paymentReversal.findUnique.mockImplementation(async (args: any) =>
      /* کلیدِ idempotency → فقط اگر قبلاً ثبت شده باشد سند می‌دهد؛ بر اساسِ id → همیشه سندِ نمونه (مسیرِ findOne). */
      args.where.idempotencyKey
        ? args.where.idempotencyKey === 'key-1'
          ? REVERSAL
          : null
        : {
            ...REVERSAL,
            invoice: { number: 1001, customerId: 'c1' },
            user: null,
          },
    );
    prisma.paymentReversal.create.mockResolvedValue(REVERSAL);
    prisma.payment.create.mockResolvedValue({ id: 'pay-neg' });
    prisma.saleInvoice.update.mockResolvedValue({});
    prisma.paymentReversal.findMany.mockResolvedValue([REVERSAL]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentReversalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LedgerService, useValue: ledger },
        { provide: EventsGateway, useValue: events },
        { provide: PostingService, useValue: posting },
      ],
    }).compile();
    service = module.get(PaymentReversalsService);
  });

  it('برگشتِ کامل: ردیفِ منفی + مانده + دفترِ مثبت + اعلان — همه در یک تراکنش', async () => {
    const result = await service.reverse('inv1', baseDto(), 'u1');

    expect(result.id).toBe('rev1');

    // ردیفِ پرداختِ منفی — قلبِ خنثی‌سازی.
    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId: 'inv1',
        method: PaymentMethod.CARD,
        amount: -1_000_000,
      }),
    });

    // مانده‌ی فاکتور به بدهی برمی‌گردد — نوشتنِ نسبی.
    expect(prisma.saleInvoice.update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: {
        paidAmount: { decrement: 1_000_000 },
        dueAmount: { increment: 1_000_000 },
      },
    });

    // دفتر: مثبت = بدهی زیاد، وصل به سندِ برگشت.
    expect(ledger.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        customerId: 'c1',
        amount: 1_000_000,
        invoiceId: 'inv1',
        reversalId: 'rev1',
        type: 'PAYMENT_REVERSED',
      }),
    );

    // اعلانِ realtime برای تازه‌شدنِ پنل‌های باز.
    expect(events.broadcast).toHaveBeenCalledWith({
      type: 'payment.reversed',
      customerId: 'c1',
      invoiceId: 'inv1',
    });

    // سندِ خودکار: بدهکارِ مشتری / بستانکارِ صندوق — پول به جایی که از آن آمده بود برمی‌گردد.
    expect(posting.post).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        sourceType: 'PAYMENT_REVERSAL',
        idempotencyKey: 'payment-reversal:rev1',
        lines: expect.arrayContaining([
          expect.objectContaining({
            account: 'CUSTOMERS',
            amount: 1_000_000,
            customerId: 'c1',
          }),
          expect.objectContaining({ account: 'CASH', amount: -1_000_000 }),
        ]),
      }),
    );
  });

  it('برگشتِ بیشتر از پرداخت‌شده رد می‌شود', async () => {
    prisma.saleInvoice.findUnique.mockResolvedValue({
      status: 'CONFIRMED',
      paidAmount: 500_000,
      dueAmount: 500_000,
      customerId: 'c1',
    });
    prisma.$queryRaw.mockResolvedValue([
      { ...LOCKED_INVOICE, paidAmount: 500_000, dueAmount: 500_000 },
    ]);

    await expect(
      service.reverse('inv1', baseDto({ amount: 600_000 }), 'u1'),
    ).rejects.toMatchObject({ response: { error: 'REVERSAL_EXCEEDS_PAID' } });

    expect(prisma.paymentReversal.create).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('فاکتورِ بی‌مشتری برگشتِ دفتری ندارد', async () => {
    prisma.saleInvoice.findUnique.mockResolvedValue({
      status: 'CONFIRMED',
      paidAmount: 1_000_000,
      dueAmount: 0,
      customerId: null,
    });
    prisma.$queryRaw.mockResolvedValue([
      { ...LOCKED_INVOICE, customerId: null },
    ]);

    await expect(
      service.reverse('inv1', baseDto(), 'u1'),
    ).rejects.toMatchObject({
      response: { error: 'CUSTOMER_REQUIRED' },
    });
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('نسیه روشِ برگشتِ وجه نیست', async () => {
    await expect(
      service.reverse('inv1', baseDto({ method: PaymentMethod.CREDIT }), 'u1'),
    ).rejects.toMatchObject({ response: { error: 'INVALID_METHOD' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('فاکتورِ باطل‌شده پرداختی برای برگشت ندارد', async () => {
    prisma.saleInvoice.findUnique.mockResolvedValue({
      status: 'CANCELLED',
      paidAmount: 0,
      dueAmount: 0,
      customerId: 'c1',
    });

    await expect(
      service.reverse('inv1', baseDto(), 'u1'),
    ).rejects.toMatchObject({
      response: { error: 'INVOICE_CANCELLED' },
    });
  });

  it('فاکتورِ بی‌پرداخت هیچ چیز برای برگشت ندارد', async () => {
    prisma.saleInvoice.findUnique.mockResolvedValue({
      status: 'CONFIRMED',
      paidAmount: 0,
      dueAmount: 1_000_000,
      customerId: 'c1',
    });

    await expect(
      service.reverse('inv1', baseDto(), 'u1'),
    ).rejects.toMatchObject({
      response: { error: 'NOTHING_PAID' },
    });
  });

  it('برگشتِ جزئی: فقط همان مبلغ برمی‌گردد و بقیه پرداخت‌شده می‌ماند', async () => {
    prisma.saleInvoice.findUnique.mockResolvedValue({
      status: 'CONFIRMED',
      paidAmount: 700_000,
      dueAmount: 300_000,
      customerId: 'c1',
    });
    prisma.$queryRaw.mockResolvedValue([
      { ...LOCKED_INVOICE, paidAmount: 700_000, dueAmount: 300_000 },
    ]);

    await service.reverse('inv1', baseDto({ amount: 300_000 }), 'u1');

    expect(prisma.saleInvoice.update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: {
        paidAmount: { decrement: 300_000 },
        dueAmount: { increment: 300_000 },
      },
    });
    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: -300_000 }),
    });
  });

  it('retry با همان کلیدِ idempotency = همان سند، بدون اثرِ اضافه', async () => {
    const result = await service.reverse(
      'inv1',
      baseDto({ idempotencyKey: 'key-1' }),
      'u1',
    );

    expect(result.id).toBe('rev1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.paymentReversal.create).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('رقابتِ هم‌زمان: سقفِ داخلِ قفل دوباره چک می‌شود', async () => {
    // بیرونِ تراکنش پرداخت‌شده ۱٬۰۰۰٬۰۰۰ دیده می‌شود، ولی داخلِ قفل رسیدِ
    // هم‌زمانی آن را صفر کرده — باید رد شود.
    prisma.$queryRaw.mockResolvedValue([
      { ...LOCKED_INVOICE, paidAmount: 0, dueAmount: 1_000_000 },
    ]);

    await expect(
      service.reverse('inv1', baseDto(), 'u1'),
    ).rejects.toMatchObject({
      response: { error: 'REVERSAL_EXCEEDS_PAID' },
    });
  });

  it('سندهای برگشتِ یک فاکتور فهرست می‌شوند', async () => {
    const rows = await service.listByInvoice('inv1');
    expect(rows).toHaveLength(1);
    expect(prisma.paymentReversal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { invoiceId: 'inv1' } }),
    );
  });
});
