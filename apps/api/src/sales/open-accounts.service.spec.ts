import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { OpenAccountsService } from './open-accounts.service';
import { InvoiceEffectsService } from './invoice-effects.service';

/**
 * سناریوی مرجع، همان چیزی که پشتِ پیشخوان اتفاق می‌افتد:
 * صبح ۱۰ قلم می‌برد، عصر ۵ قلم، فردا ۲ قلم پس می‌دهد و تسویه می‌کند.
 *
 * چیزی که این تست‌ها محافظت می‌کنند: عددی که فروشنده در صندوق می‌بیند، عددی که
 * روی برگه‌ی چاپی می‌رود، و عددی که مشتری باید بدهد باید یکی باشند.
 */

const DATE = new Date('2026-08-18T08:00:00Z');

function line(over: Record<string, unknown> = {}) {
  return {
    id: 'L1',
    productId: 'p1',
    quantity: 10,
    unitPrice: 100_000,
    lineDiscount: 0,
    createdAt: DATE,
    product: { id: 'p1', name: 'لنت جلو پراید', sku: '1234', unit: 'عدد' },
    ...over,
  };
}

function invoice(over: Record<string, unknown> = {}) {
  return {
    id: 'inv1',
    number: 1001,
    total: 1_000_000,
    dueAmount: 1_000_000,
    discount: 0,
    note: null,
    createdAt: DATE,
    lines: [line()],
    ...over,
  };
}

describe('OpenAccountsService', () => {
  let service: OpenAccountsService;

  const prisma = {
    $transaction: jest.fn(),
    saleInvoice: { findMany: jest.fn(), updateMany: jest.fn() },
    openAccount: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    saleReturn: { groupBy: jest.fn(), findMany: jest.fn() },
    saleCorrection: { groupBy: jest.fn(), findMany: jest.fn() },
    saleReturnLine: { groupBy: jest.fn() },
    saleCorrectionLine: { findMany: jest.fn() },
    receiptAllocation: { findMany: jest.fn() },
  };
  const events = { broadcast: jest.fn() };

  /** پیش‌فرضِ «هیچ سند جبرانی‌ای وجود ندارد» — هر تست فقط تفاوتش را می‌گوید. */
  function noDocuments() {
    prisma.saleReturn.groupBy.mockResolvedValue([]);
    prisma.saleCorrection.groupBy.mockResolvedValue([]);
    prisma.saleReturnLine.groupBy.mockResolvedValue([]);
    prisma.saleCorrectionLine.findMany.mockResolvedValue([]);
    prisma.saleReturn.findMany.mockResolvedValue([]);
    prisma.saleCorrection.findMany.mockResolvedValue([]);
    prisma.receiptAllocation.findMany.mockResolvedValue([]);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    noDocuments();
    // تراکنش همان کلاینت را می‌دهد؛ اینجا رفتار قفل موضوعِ تست نیست.
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.saleInvoice.updateMany.mockResolvedValue({ count: 1 });
    prisma.openAccount.update.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAccountsService,
        // سرویسِ واقعی با همان prismaِ ماک — حسابِ اثرِ اسناد خودش موضوعِ تست است
        // و ماک‌کردنش یعنی تستِ چیزی که واقعاً اجرا نمی‌شود.
        InvoiceEffectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsGateway, useValue: events },
      ],
    }).compile();
    service = module.get<OpenAccountsService>(OpenAccountsService);
  });

  const account = (invoices: unknown[]) => ({
    id: 'acc1',
    number: 7,
    customerId: 'c1',
    status: 'OPEN',
    note: null,
    settledAt: null,
    createdAt: DATE,
    customer: {
      id: 'c1',
      firstName: 'رضا',
      lastName: 'کریمی',
      phones: [{ phone: '09120000000' }],
    },
    invoices,
  });

  describe('get', () => {
    it('مرجوعی را از جمعِ حساب و از تعدادِ همان ردیف کم می‌کند', async () => {
      prisma.openAccount.findUnique.mockResolvedValue(
        account([
          invoice(),
          invoice({ id: 'inv2', number: 1002, total: 500_000, dueAmount: 500_000, lines: [line({ id: 'L2', quantity: 5 })] }),
        ]),
      );
      // ۲ قلم از ردیفِ اول برگشت؛ مبلغِ برگشت ۲۰۰٬۰۰۰.
      prisma.saleReturn.groupBy.mockResolvedValue([
        { invoiceId: 'inv1', _sum: { refundAmount: 200_000 } },
      ]);
      prisma.saleReturnLine.groupBy.mockResolvedValue([
        { saleLogId: 'L1', _sum: { quantity: 2 } },
      ]);

      const res = await service.get('acc1');

      // ۱٬۵۰۰٬۰۰۰ برداشته، ۲۰۰٬۰۰۰ برگشته.
      expect(res.grossTotal).toBe(1_500_000);
      expect(res.total).toBe(1_300_000);

      const l1 = res.invoices[0].lines[0];
      expect(l1.quantity).toBe(10); // آنچه برده — دست‌نخورده
      expect(l1.returnedQuantity).toBe(2);
      expect(l1.effectiveQuantity).toBe(8);
      expect(res.invoices[0].netTotal).toBe(800_000);
    });

    it('اصلاحیه‌ی قیمت را روی قیمتِ نمایشی و جمع اعمال می‌کند', async () => {
      prisma.openAccount.findUnique.mockResolvedValue(account([invoice()]));
      prisma.saleCorrection.groupBy.mockResolvedValue([
        { invoiceId: 'inv1', _sum: { amountAdjust: -100_000 } },
      ]);
      prisma.saleCorrectionLine.findMany.mockResolvedValue([
        { saleLogId: 'L1', oldQuantity: 10, newQuantity: 10, newUnitPrice: 90_000 },
      ]);

      const res = await service.get('acc1');

      expect(res.total).toBe(900_000);
      expect(res.invoices[0].lines[0].unitPrice).toBe(90_000);
      expect(res.invoices[0].lines[0].originalUnitPrice).toBe(100_000);
    });

    it('قیمتِ نداشتهی لاگ را صفر می‌کند تا ضربِ سمتِ کلاینت NaN نشود', async () => {
      prisma.openAccount.findUnique.mockResolvedValue(
        account([invoice({ lines: [line({ unitPrice: null })] })]),
      );

      const res = await service.get('acc1');

      expect(res.invoices[0].lines[0].unitPrice).toBe(0);
      expect(res.invoices[0].lines[0].originalUnitPrice).toBe(0);
    });
  });

  describe('list', () => {
    it('جمعِ فهرستِ صندوق خالص است، نه ناخالص', async () => {
      prisma.openAccount.findMany.mockResolvedValue([
        {
          ...account([]),
          invoices: [
            { id: 'inv1', total: 1_000_000, createdAt: DATE },
            { id: 'inv2', total: 500_000, createdAt: DATE },
          ],
        },
      ]);
      prisma.saleReturn.groupBy.mockResolvedValue([
        { invoiceId: 'inv1', _sum: { refundAmount: 200_000 } },
      ]);

      const res = await service.list();

      expect(res[0].total).toBe(1_300_000);
      expect(res[0].invoiceCount).toBe(2);
    });
  });

  describe('settle', () => {
    /**
     * تسویه نباید ساعتِ بدهی را از نو راه بیندازد.
     *
     * قبلاً سررسیدِ همه‌ی نوبت‌ها روی «امروز + مهلتِ مشتری» نوشته می‌شد. حالا که
     * هر فروشِ نسیه روی تب می‌نشیند، آن یعنی بدهیِ شش‌ماهه با یک بار تسویه دوباره
     * «جاری» می‌شد و از گزارشِ معوقات بیرون می‌رفت.
     */
    it('سررسیدِ نوبت‌هایی که سررسید دارند را دست نمی‌زند', async () => {
      prisma.openAccount.findUnique.mockResolvedValue({
        ...account([invoice()]),
        customer: { id: 'c1', firstName: 'رضا', lastName: 'کریمی', phones: [], creditDays: 30 },
      });
      prisma.saleInvoice.findMany.mockResolvedValue([{ id: 'inv1' }]);

      await service.settle('acc1');

      const calls = prisma.saleInvoice.updateMany.mock.calls;

      // تنها جایی که سررسید نوشته می‌شود، مشروط به null بودنِ آن است.
      const dateWrites = calls.filter((c: any[]) => 'dueDate' in (c[0].data ?? {}));
      expect(dateWrites).toHaveLength(1);
      expect(dateWrites[0][0].where.dueDate).toBeNull();

      // و تغییرِ وضعیت جداگانه است و سررسید را همراه خودش نمی‌برد.
      const statusWrite = calls.find((c: any[]) => c[0].data?.status === 'CONFIRMED');
      expect(statusWrite).toBeDefined();
      expect(statusWrite![0].data).not.toHaveProperty('dueDate');
    });

    it('حسابِ بدونِ خرید تسویه نمی‌شود', async () => {
      prisma.openAccount.findUnique.mockResolvedValue({
        ...account([]),
        customer: { id: 'c1', firstName: 'رضا', lastName: 'کریمی', phones: [], creditDays: 0 },
      });
      prisma.saleInvoice.findMany.mockResolvedValue([]);

      await expect(service.settle('acc1')).rejects.toMatchObject({
        response: { error: 'OPEN_ACCOUNT_EMPTY' },
      });
    });
  });

  describe('sheet', () => {
    it('جمعِ ردیف‌ها با مبلغِ قابل پرداخت سرجمع می‌خورد — بدون تخفیفِ فاکتور', async () => {
      prisma.openAccount.findUnique.mockResolvedValue(
        account([
          invoice(),
          invoice({ id: 'inv2', number: 1002, total: 500_000, dueAmount: 500_000, lines: [line({ id: 'L2', quantity: 5 })] }),
        ]),
      );
      prisma.saleReturn.groupBy.mockResolvedValue([
        { invoiceId: 'inv1', _sum: { refundAmount: 200_000 } },
      ]);
      prisma.saleReturnLine.groupBy.mockResolvedValue([
        { saleLogId: 'L1', _sum: { quantity: 2 } },
      ]);

      const res = await service.sheet('acc1');

      const itemsGross = res.visits.reduce(
        (s, v) => s + v.lines.reduce((ls, l) => ls + l.lineTotal, 0),
        0,
      );
      // ۸×۱۰۰٬۰۰۰ + ۵×۱۰۰٬۰۰۰ = ۱٬۳۰۰٬۰۰۰ و همان هم مبلغِ قابل پرداخت است.
      expect(itemsGross).toBe(1_300_000);
      expect(res.totals.net).toBe(1_300_000);
      expect(itemsGross - res.totals.net).toBe(0);
    });

    it('با تخفیفِ فاکتور، اختلافِ ردیف‌ها و مبلغِ نهایی دقیقاً همان تخفیف است', async () => {
      // فروش ۱٬۰۰۰٬۰۰۰ با ۵۰٬۰۰۰ تخفیفِ فاکتور → total = ۹۵۰٬۰۰۰
      prisma.openAccount.findUnique.mockResolvedValue(
        account([invoice({ total: 950_000, dueAmount: 950_000, discount: 50_000 })]),
      );

      const res = await service.sheet('acc1');

      const itemsGross = res.visits.reduce(
        (s, v) => s + v.lines.reduce((ls, l) => ls + l.lineTotal, 0),
        0,
      );
      expect(itemsGross).toBe(1_000_000);
      expect(res.totals.net).toBe(950_000);
      // همان عددی که برگه به‌عنوان «تخفیف» چاپ می‌کند.
      expect(itemsGross - res.totals.net).toBe(50_000);
    });

    it('دریافت‌ها فقط از تخصیصِ همین فاکتورها می‌آید و رسیدِ تکراری دو بار نمی‌آید', async () => {
      prisma.openAccount.findUnique.mockResolvedValue(
        account([
          invoice(),
          invoice({ id: 'inv2', number: 1002, total: 500_000, dueAmount: 0, lines: [line({ id: 'L2', quantity: 5 })] }),
        ]),
      );

      // یک رسیدِ واحد که هر دو فاکتور را پوشش داده — دو ردیفِ تخصیص، یک چک.
      const receipt = {
        number: 55,
        createdAt: DATE,
        payments: [
          {
            method: 'CHEQUE',
            amount: 900_000,
            cheque: { number: '123456', bankName: 'ملت', dueDate: DATE },
          },
        ],
      };
      prisma.receiptAllocation.findMany.mockResolvedValue([
        { receiptId: 'r1', invoiceId: 'inv1', amount: 400_000, receipt },
        { receiptId: 'r1', invoiceId: 'inv2', amount: 500_000, receipt },
      ]);

      const res = await service.sheet('acc1');

      expect(res.totals.paid).toBe(900_000);
      // چک یک بار چاپ می‌شود، نه دو بار.
      expect(res.payments).toHaveLength(1);
      expect(res.payments[0].cheque?.number).toBe('123456');
      // مانده از خودِ فاکتورها می‌آید.
      expect(res.totals.remaining).toBe(1_000_000);
    });
  });
});
