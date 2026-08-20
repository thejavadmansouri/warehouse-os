import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { InvoiceEffectsService } from './invoice-effects.service';
import { StatementsService } from './statements.service';

/**
 * صورت‌حسابِ کاملِ مشتری.
 *
 * چیزی که این تست‌ها محافظت می‌کنند: «تمام کالاهایی که برده» و «تمام مبالغی که
 * پرداخته» واقعاً تمام باشند — چون پرداخت از دو مسیرِ متفاوت می‌آید و افتادنِ
 * یکی از آن‌ها روی کاغذ، همان جایی است که مشتری می‌گوید «من که دادم».
 */

const DATE = new Date('2026-08-18T08:00:00Z');

/** شرطِ `where` اولین فراخوانی — تایپ‌دار، تا خواندنِ ماک به `any` نیفتد. */
function firstWhere(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as unknown as {
    where?: Record<string, unknown>;
  }[][];
  return calls[0]?.[0]?.where ?? {};
}

describe('StatementsService', () => {
  let service: StatementsService;

  const prisma = {
    customer: { findUnique: jest.fn() },
    saleInvoice: { findMany: jest.fn() },
    receipt: { findMany: jest.fn() },
    customerLedger: { aggregate: jest.fn() },
    saleReturn: { groupBy: jest.fn() },
    saleCorrection: { groupBy: jest.fn() },
    saleReturnLine: { groupBy: jest.fn() },
    saleCorrectionLine: { findMany: jest.fn() },
  };
  const ledger = { balance: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1',
      firstName: 'رضا',
      lastName: 'کریمی',
      address: null,
      creditDays: 30,
      creditLimit: 0,
      phones: [{ phone: '09120000000', isPrimary: true }],
    });
    prisma.saleInvoice.findMany.mockResolvedValue([]);
    prisma.receipt.findMany.mockResolvedValue([]);
    prisma.customerLedger.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prisma.saleReturn.groupBy.mockResolvedValue([]);
    prisma.saleCorrection.groupBy.mockResolvedValue([]);
    prisma.saleReturnLine.groupBy.mockResolvedValue([]);
    prisma.saleCorrectionLine.findMany.mockResolvedValue([]);
    ledger.balance.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatementsService,
        InvoiceEffectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LedgerService, useValue: ledger },
      ],
    }).compile();
    service = module.get<StatementsService>(StatementsService);
  });

  function invoice(over: Record<string, unknown> = {}) {
    return {
      id: 'inv1',
      number: 1001,
      status: 'CONFIRMED',
      createdAt: DATE,
      dueDate: null,
      discount: 0,
      note: null,
      total: 1_000_000,
      dueAmount: 0,
      lines: [
        {
          id: 'L1',
          quantity: 10,
          unitPrice: 100_000,
          lineDiscount: 0,
          product: {
            id: 'p1',
            name: 'لنت جلو پراید',
            sku: '1234',
            unit: 'عدد',
          },
        },
      ],
      payments: [],
      returns: [],
      corrections: [],
      ...over,
    };
  }

  it('پرداختِ سرِ خرید و رسیدِ بعدی هر دو در جمعِ پرداختی می‌آیند', async () => {
    prisma.saleInvoice.findMany.mockResolvedValue([
      invoice({
        payments: [
          { id: 'pm1', method: 'CARD', amount: 400_000, cheque: null },
          // نسیه پول نیست — نباید در جمعِ پرداختی بیاید.
          { id: 'pm2', method: 'CREDIT', amount: 600_000, cheque: null },
        ],
      }),
    ]);
    prisma.receipt.findMany.mockResolvedValue([
      {
        id: 'r1',
        number: 55,
        createdAt: DATE,
        amount: 300_000,
        note: null,
        payments: [
          {
            id: 'rp1',
            method: 'CHEQUE',
            amount: 300_000,
            cheque: {
              number: '123456',
              bankName: 'ملت',
              dueDate: DATE,
              status: 'IN_HAND',
            },
          },
        ],
        allocations: [{ invoiceId: 'inv1', amount: 300_000 }],
      },
    ]);

    const res = await service.fullStatement('c1');

    expect(res.totals.paidAtSale).toBe(400_000);
    expect(res.totals.paidLater).toBe(300_000);
    expect(res.totals.paidTotal).toBe(700_000);

    // سطرِ نسیه از فهرستِ پرداخت‌های فاکتور حذف شده.
    expect(res.purchases[0].payments).toHaveLength(1);
    expect(res.purchases[0].payments[0].method).toBe('CARD');

    // چک با مشخصاتش می‌آید تا روی کاغذ قابلِ پیگیری باشد.
    expect(res.payments[0].rows[0].cheque?.number).toBe('123456');
    // و معلوم است بابتِ کدام فاکتور نشسته.
    expect(res.payments[0].appliedTo[0].invoiceNumber).toBe(1001);
  });

  it('مرجوعی از تعدادِ قلم و از مبلغِ خرید کم می‌شود', async () => {
    prisma.saleInvoice.findMany.mockResolvedValue([
      invoice({
        returns: [
          {
            id: 'ret1',
            number: 7,
            createdAt: DATE,
            refundMethod: 'CREDIT',
            refundAmount: 200_000,
            reason: 'معیوب بود',
            lines: [
              {
                id: 'rl1',
                quantity: 2,
                unitRefund: 100_000,
                lineRefund: 200_000,
                product: { name: 'لنت جلو پراید', unit: 'عدد' },
              },
            ],
          },
        ],
      }),
    ]);
    prisma.saleReturn.groupBy.mockResolvedValue([
      { invoiceId: 'inv1', _sum: { refundAmount: 200_000 } },
    ]);
    prisma.saleReturnLine.groupBy.mockResolvedValue([
      { saleLogId: 'L1', _sum: { quantity: 2 } },
    ]);

    const res = await service.fullStatement('c1');

    const line = res.purchases[0].lines[0];
    expect(line.quantity).toBe(10); // آنچه برده، دست‌نخورده
    expect(line.returnedQuantity).toBe(2);
    expect(line.effectiveQuantity).toBe(8);
    expect(line.lineTotal).toBe(800_000);

    expect(res.totals.purchasedGross).toBe(1_000_000);
    expect(res.totals.purchasedNet).toBe(800_000);
    expect(res.totals.returned).toBe(200_000);
  });

  it('فاکتورِ حساب باز هم روی صورت‌حساب می‌آید', async () => {
    prisma.saleInvoice.findMany.mockResolvedValue([
      invoice({ status: 'OPEN', dueAmount: 1_000_000 }),
    ]);

    const res = await service.fullStatement('c1');

    expect(res.purchases).toHaveLength(1);
    expect(res.purchases[0].status).toBe('OPEN');

    // و کوئری خودش باطل‌شده‌ها را کنار می‌گذارد، نه اینکه فقط نهایی‌ها را بگیرد.
    expect(firstWhere(prisma.saleInvoice.findMany).status).toEqual({
      not: 'CANCELLED',
    });
  });

  it('بازه‌ی تاریخ روی خرید و پرداخت هر دو اعمال می‌شود', async () => {
    await service.fullStatement('c1', {
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T23:59:59.999Z',
    });

    expect(firstWhere(prisma.saleInvoice.findMany).createdAt).toBeDefined();
    expect(firstWhere(prisma.receipt.findMany).createdAt).toBeDefined();

    // مانده‌ی اول دوره از ردیف‌های پیش از شروعِ بازه می‌آید.
    expect(prisma.customerLedger.aggregate).toHaveBeenCalled();
  });

  it('مشتریِ ناموجود خطای روشن می‌دهد', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.fullStatement('nope')).rejects.toMatchObject({
      response: { error: 'CUSTOMER_NOT_FOUND' },
    });
  });
});
