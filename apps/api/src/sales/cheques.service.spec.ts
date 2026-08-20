import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { EventsGateway } from '../realtime/events.gateway';
import { ChequesService } from './cheques.service';

/**
 * چرخه‌ی چک.
 *
 * حساسیتِ اصلی: بدهی در لحظه‌ی **گرفتنِ** چک کم شده. پس وصولِ عادی نباید هیچ
 * ردیفی در دفتر بزند — اگر بزند، بدهیِ مشتری دو بار کم می‌شود و کسی تا ماه‌ها
 * متوجه نمی‌شود.
 */

describe('ChequesService', () => {
  let service: ChequesService;

  const prisma = {
    $transaction: jest.fn(),
    cheque: { findUnique: jest.fn(), update: jest.fn() },
    saleInvoice: { findMany: jest.fn(), update: jest.fn() },
  };
  const ledger = { record: jest.fn() };
  const events = { broadcast: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    // تراکنشِ ماک: همان کلاینت را می‌دهد. رفتارِ قفل موضوعِ این تست نیست.
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn(prisma)),
    );
    prisma.cheque.update.mockResolvedValue({ id: 'ch1' });
    prisma.saleInvoice.update.mockResolvedValue({});
    prisma.saleInvoice.findMany.mockResolvedValue([]);
    ledger.record.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChequesService,
        { provide: PrismaService, useValue: prisma },
        { provide: LedgerService, useValue: ledger },
        { provide: EventsGateway, useValue: events },
      ],
    }).compile();
    service = module.get<ChequesService>(ChequesService);
  });

  /** چکی که بابتِ یک فاکتور گرفته شده. */
  function onInvoice(status: string, over: Record<string, unknown> = {}) {
    return {
      id: 'ch1',
      number: '123456',
      status,
      note: null,
      payment: {
        amount: 5_000_000,
        invoice: {
          id: 'inv1',
          number: 1001,
          customerId: 'c1',
          total: 10_000_000,
          paidAmount: 5_000_000,
          dueAmount: 5_000_000,
        },
      },
      receiptPayment: null,
      ...over,
    };
  }

  /** چکی که بابتِ تسویه‌ی بدهیِ قبلی گرفته شده. */
  function onReceipt(status: string, allocations: unknown[]) {
    return {
      id: 'ch1',
      number: '654321',
      status,
      note: null,
      payment: null,
      receiptPayment: {
        amount: 8_000_000,
        receipt: { id: 'r1', number: 55, customerId: 'c1', allocations },
      },
    };
  }

  describe('cash', () => {
    it('وصولِ عادی هیچ ردیفی در دفتر نمی‌زند — بدهی از قبل کم شده', async () => {
      prisma.cheque.findUnique.mockResolvedValue(onInvoice('IN_HAND'));

      await service.cash('ch1');

      expect(ledger.record).not.toHaveBeenCalled();
      expect(prisma.saleInvoice.update).not.toHaveBeenCalled();
      const update = prisma.cheque.update.mock.calls as unknown as {
        data: { status: string };
      }[][];
      expect(update[0][0].data.status).toBe('CASHED');
    });

    it('وصولِ چکِ برگشتی، اثرِ برگشت را خنثی می‌کند', async () => {
      prisma.cheque.findUnique.mockResolvedValue(onInvoice('BOUNCED'));

      await service.cash('ch1', 'u1');

      expect(ledger.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          customerId: 'c1',
          type: 'CHEQUE_CASHED',
          amount: -5_000_000,
        }),
      );
      // و مانده‌ی فاکتور دوباره تسویه می‌شود.
      expect(prisma.saleInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv1' },
          data: {
            dueAmount: { increment: -5_000_000 },
            paidAmount: { decrement: -5_000_000 },
          },
        }),
      );
    });

    it('چکِ وصول‌شده دوباره وصول نمی‌شود', async () => {
      prisma.cheque.findUnique.mockResolvedValue(onInvoice('CASHED'));

      await expect(service.cash('ch1')).rejects.toMatchObject({
        response: { error: 'CHEQUE_ALREADY_CASHED' },
      });
    });
  });

  describe('bounce', () => {
    it('بدهی را با ردیفِ دفتر برمی‌گرداند و مانده‌ی فاکتور را زیاد می‌کند', async () => {
      prisma.cheque.findUnique.mockResolvedValue(onInvoice('IN_HAND'));

      await service.bounce('ch1', 'کسر موجودی', 'u1');

      expect(ledger.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          customerId: 'c1',
          type: 'CHEQUE_BOUNCED',
          amount: 5_000_000,
        }),
      );
      expect(prisma.saleInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv1' },
          data: {
            dueAmount: { increment: 5_000_000 },
            paidAmount: { decrement: 5_000_000 },
          },
        }),
      );
    });

    it('از سقفِ خودِ فاکتور بیشتر برنمی‌گرداند', async () => {
      // فاکتور ۱۰ میلیونی که فقط ۲ میلیونش تسویه شده، ولی چک ۵ میلیونی است.
      prisma.cheque.findUnique.mockResolvedValue(
        onInvoice('IN_HAND', {
          payment: {
            amount: 5_000_000,
            invoice: {
              id: 'inv1',
              number: 1001,
              customerId: 'c1',
              total: 10_000_000,
              paidAmount: 2_000_000,
              dueAmount: 8_000_000,
            },
          },
        }),
      );

      await service.bounce('ch1', undefined, 'u1');

      // جای خالی فقط ۲ میلیون است (۱۰ − ۸)، پس بیشتر از آن برنمی‌گردد.
      expect(prisma.saleInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            dueAmount: { increment: 2_000_000 },
            paidAmount: { decrement: 2_000_000 },
          },
        }),
      );
      // ولی دفتر کلِ مبلغِ چک را برمی‌گرداند — مانده مرجعِ نهایی است.
      expect(ledger.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: 5_000_000 }),
      );
    });

    it('چکِ رسید را به ترتیبِ همان تخصیص‌ها برمی‌گرداند و در سقفِ چک می‌ماند', async () => {
      prisma.cheque.findUnique.mockResolvedValue(
        onReceipt('DEPOSITED', [
          { invoiceId: 'inv1', amount: 6_000_000 },
          { invoiceId: 'inv2', amount: 5_000_000 },
        ]),
      );
      prisma.saleInvoice.findMany.mockResolvedValue([
        { id: 'inv1', total: 6_000_000, dueAmount: 0 },
        { id: 'inv2', total: 5_000_000, dueAmount: 0 },
      ]);

      await service.bounce('ch1', undefined, 'u1');

      const calls = prisma.saleInvoice.update.mock.calls as unknown as {
        where: { id: string };
        data: { dueAmount: { increment: number } };
      }[][];
      const moved = calls.map(
        (c) => [c[0].where.id, c[0].data.dueAmount.increment] as const,
      );

      // چک ۸ میلیون است: ۶ به فاکتور اول، ۲ به دومی — نه بیشتر.
      expect(moved).toEqual([
        ['inv1', 6_000_000],
        ['inv2', 2_000_000],
      ]);
    });

    it('چکِ وصول‌شده برگشت نمی‌خورد', async () => {
      prisma.cheque.findUnique.mockResolvedValue(onInvoice('CASHED'));

      await expect(service.bounce('ch1', undefined)).rejects.toMatchObject({
        response: { error: 'CHEQUE_NOT_PENDING' },
      });
      expect(ledger.record).not.toHaveBeenCalled();
    });
  });

  describe('deposit', () => {
    it('فقط چکِ نزد ما به بانک می‌رود', async () => {
      prisma.cheque.findUnique.mockResolvedValue(onInvoice('DEPOSITED'));

      await expect(service.deposit('ch1')).rejects.toMatchObject({
        response: { error: 'CHEQUE_NOT_IN_HAND' },
      });
    });
  });

  it('چکِ بی‌مشتری رد می‌شود، نه اینکه بی‌صدا از کار بیفتد', async () => {
    prisma.cheque.findUnique.mockResolvedValue({
      id: 'ch1',
      number: '1',
      status: 'IN_HAND',
      note: null,
      payment: null,
      receiptPayment: null,
    });

    await expect(service.bounce('ch1', undefined)).rejects.toMatchObject({
      response: { error: 'CHEQUE_HAS_NO_CUSTOMER' },
    });
  });
});
