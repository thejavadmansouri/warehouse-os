import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { AdjustmentsService } from './adjustments.service';
import { ReturnsService } from './returns.service';
import { CorrectionsService } from './corrections.service';
import { ReceiptsService } from './receipts.service';
import { LedgerService } from './ledger.service';

/**
 * تست‌های عملیاتِ یکپارچه (adjust).
 *
 * زیرسرویس‌ها (returns/corrections/receipts) ماک می‌شوند — اینجا رفتارِ
 * **خودِ** orchestrator موضوعِ تست است: اعتبارسنجی، محاسبه‌ی اختلاف، و
 * تصمیمِ تسویه (کدام سند با کدام روش، رسید یا نه). صحتِ محاسباتِ داخلیِ
 * هر سند در تست‌های خودِ آن سرویس‌ها و در `line-balance.spec.ts` پوشیده شده.
 */

const INVOICE = {
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

const SALE_LINES = [
  {
    id: 'log1',
    productId: 'p1',
    locationId: 'loc1',
    quantity: 10,
    unitPrice: 100_000,
    lineDiscount: 0,
  },
  {
    id: 'log2',
    productId: 'p2',
    locationId: 'loc2',
    quantity: 1,
    unitPrice: 200_000,
    lineDiscount: 0,
  },
  {
    id: 'log3',
    productId: 'p3',
    locationId: 'loc3',
    quantity: 5,
    unitPrice: 50_000,
    lineDiscount: 0,
  },
];

/** ردیفِ SALEِ تست — همان سناریوی واقعی: لنت ۱۰، روغن ۱، چراغ ۵. */
function saleLog(id: string, over: Record<string, unknown> = {}) {
  return { ...SALE_LINES.find((l) => l.id === id)!, ...over };
}

describe('AdjustmentsService', () => {
  let service: AdjustmentsService;

  const returns = {
    createReturnInTx: jest.fn(),
  };
  const corrections = {
    createCorrectionInTx: jest.fn(),
  };
  const receipts = {
    createReceiptInTx: jest.fn(),
  };
  const ledger = { record: jest.fn() };
  const events = { broadcast: jest.fn() };

  const prisma: any = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    saleReturn: { findUnique: jest.fn(), findFirst: jest.fn() },
    saleCorrection: { findUnique: jest.fn(), findFirst: jest.fn() },
    receipt: { findUnique: jest.fn() },
    saleInvoice: { findUnique: jest.fn() },
    inventoryLog: { findMany: jest.fn() },
    saleCorrectionLine: { groupBy: jest.fn(), findMany: jest.fn() },
    saleReturnLine: { groupBy: jest.fn() },
  };

  /** تراکنش همان کلاینت را می‌دهد؛ رفتارِ قفل اینجا موضوع نیست. */
  function noDocs() {
    prisma.saleCorrectionLine.groupBy.mockResolvedValue([]);
    prisma.saleReturnLine.groupBy.mockResolvedValue([]);
    prisma.saleCorrectionLine.findMany.mockResolvedValue([]);
    prisma.saleReturn.findUnique.mockResolvedValue(null);
    prisma.saleCorrection.findUnique.mockResolvedValue(null);
  }

  /** خوراکِ `loadCombined` — بعد از موفقیتِ تراکنش صدا زده می‌شود. */
  function mockCombined() {
    prisma.saleReturn.findFirst.mockResolvedValue({
      id: 'ret1',
      operationKey: 'op-1',
      refundAmount: 150_000,
      lines: [],
    });
    prisma.saleCorrection.findFirst.mockResolvedValue({
      id: 'corr1',
      operationKey: 'op-1',
      amountAdjust: 60_000,
      lines: [],
    });
    prisma.receipt.findUnique.mockResolvedValue(null);
    prisma.saleInvoice.findUnique.mockResolvedValue({
      ...INVOICE,
      customer: { id: 'c1', firstName: 'رضا', lastName: 'کریمی' },
      lines: [
        {
          id: 'log1',
          productId: 'p1',
          quantity: 10,
          unitPrice: 100_000,
          product: { id: 'p1', name: 'لنت', unit: 'عدد' },
        },
        {
          id: 'log2',
          productId: 'p2',
          quantity: 1,
          unitPrice: 200_000,
          product: { id: 'p2', name: 'روغن', unit: 'عدد' },
        },
        {
          id: 'log3',
          productId: 'p3',
          quantity: 5,
          unitPrice: 50_000,
          product: { id: 'p3', name: 'چراغ', unit: 'عدد' },
        },
      ],
    });
  }

  beforeEach(async () => {
    mockCombined();
    jest.clearAllMocks();
    noDocs();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.$queryRaw.mockImplementation(
      async (strings: any, ...vals: any[]) => {
        void strings;
        void vals;
        return [INVOICE];
      },
    );
    prisma.inventoryLog.findMany.mockResolvedValue([
      saleLog('log1'),
      saleLog('log2'),
      saleLog('log3'),
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdjustmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReturnsService, useValue: returns },
        { provide: CorrectionsService, useValue: corrections },
        { provide: ReceiptsService, useValue: receipts },
        { provide: LedgerService, useValue: ledger },
        { provide: EventsGateway, useValue: events },
      ],
    }).compile();
    service = module.get(AdjustmentsService);
  });

  /** ساختارِ درخواستِ پایه — هر تست فقط تفاوتش را می‌گوید. */
  function baseDto(over: Record<string, unknown> = {}) {
    return {
      idempotencyKey: 'op-1',
      reason: 'بازگشت و خرید مجدد مشتری',
      returns: [{ saleLogId: 'log3', quantity: 3, restock: true }],
      changes: [{ saleLogId: 'log1', newQuantity: 7, newUnitPrice: 100_000 }],
      additions: [{ productId: 'p4', quantity: 2, unitPrice: 30_000 }],
      settlement: { method: PaymentMethod.CREDIT },
      ...over,
    } as any;
  }

  /** پاسخِ پیش‌فرضِ سندِ مرجوعیِ ماک‌شده. */
  function mockReturn(lines: { saleLogId: string; quantity: number }[]) {
    returns.createReturnInTx.mockResolvedValue({
      returnId: 'ret1',
      number: 55,
      refundAmount: lines.reduce((s, l) => s + l.quantity * 50_000, 0),
    });
  }

  function mockCorrection(amountAdjust: number) {
    corrections.createCorrectionInTx.mockResolvedValue({
      correctionId: 'corr1',
      number: 33,
      amountAdjust,
    });
  }

  describe('اعتبارسنجی ورودی', () => {
    it('بدون هیچ ردیفی رد می‌شود', async () => {
      await expect(
        service.adjust(
          'inv1',
          baseDto({ returns: [], changes: [], additions: [] }),
        ),
      ).rejects.toMatchObject({ response: { error: 'EMPTY_ADJUST' } });
    });

    it('دلیل اختیاری است — با دلیلِ خالی، اعتبارسنجیِ بعدی (ردیف) رد می‌کند نه دلیل', async () => {
      await expect(
        service.adjust(
          'inv1',
          baseDto({ reason: '   ', returns: [], changes: [], additions: [] }),
        ),
      ).rejects.toMatchObject({ response: { error: 'EMPTY_ADJUST' } });
    });

    it('برگشت + تصحیحِ قیمت روی یک ردیف مجاز است — برگشت با قیمتِ مؤثر، تصحیح فقط روی مانده', async () => {
      mockReturn([{ saleLogId: 'log1', quantity: 2 }]); // ۲×۱۰۰هزار = ۲۰۰هزار برگشت
      mockCorrection(-40_000); // ۸×۱۲۰هزار − ۱۰×۱۰۰هزار
      await service.adjust(
        'inv1',
        baseDto({
          returns: [{ saleLogId: 'log1', quantity: 2, restock: true }],
          changes: [
            { saleLogId: 'log1', newQuantity: 8, newUnitPrice: 120_000 },
          ],
          additions: [],
        }),
      );
      // هر دو سند ساخته می‌شوند و تصحیح با همان تعدادِ مانده می‌رود.
      expect(returns.createReturnInTx).toHaveBeenCalled();
      expect(corrections.createCorrectionInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          lines: [{ saleLogId: 'log1', newQuantity: 8, newUnitPrice: 120_000 }],
        }),
        expect.anything(),
      );
    });

    it('برگشت + تصحیح با تعدادِ ناسازگار رد می‌شود', async () => {
      await expect(
        service.adjust(
          'inv1',
          baseDto({
            returns: [{ saleLogId: 'log1', quantity: 2, restock: true }],
            changes: [
              { saleLogId: 'log1', newQuantity: 7, newUnitPrice: 120_000 },
            ],
            additions: [],
          }),
        ),
      ).rejects.toMatchObject({
        response: { error: 'COMBINED_LINE_QUANTITY' },
      });
    });

    it('مجموع ردیف‌های بیشتر از ۵۰۰ رد می‌شود', async () => {
      const many = Array.from({ length: 501 }, (_, i) => ({
        saleLogId: `x${i}`,
        quantity: 1,
      }));
      await expect(
        service.adjust(
          'inv1',
          baseDto({ returns: many, changes: [], additions: [] }),
        ),
      ).rejects.toMatchObject({ response: { error: 'TOO_MANY_LINES' } });
    });
  });

  describe('قفل و وضعیت فاکتور', () => {
    it('فاکتورِ باطل‌شده رد می‌شود', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { ...INVOICE, status: InvoiceStatus.CANCELLED },
      ]);
      await expect(service.adjust('inv1', baseDto())).rejects.toMatchObject({
        response: { error: 'INVOICE_NOT_ADJUSTABLE' },
      });
    });

    it('فاکتورِ نبود رد می‌شود', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.adjust('inv1', baseDto())).rejects.toMatchObject({
        response: { error: 'INVOICE_NOT_FOUND' },
      });
    });

    it('مرجوعیِ بیش از مقدار قابل‌برگشت رد می‌شود', async () => {
      await expect(
        service.adjust(
          'inv1',
          baseDto({ returns: [{ saleLogId: 'log3', quantity: 6 }] }),
        ),
      ).rejects.toMatchObject({ response: { error: 'EXCESS_RETURN' } });
    });

    it('مرجوعیِ ردیفی که به این فاکتور تعلق ندارد رد می‌شود', async () => {
      await expect(
        service.adjust(
          'inv1',
          baseDto({ returns: [{ saleLogId: 'other-inv-log', quantity: 1 }] }),
        ),
      ).rejects.toMatchObject({ response: { error: 'LINE_NOT_IN_INVOICE' } });
    });
  });

  describe('تسویه', () => {
    it('با CREDIT: مرجوعی به‌صورت کسر از حساب — بدون رسید', async () => {
      // مرجوعی ۳ چراغ (۱۵۰هزار) + افزودن ۲ کاسه‌نمد (۶۰هزار) ⇒ اختلاف = −۹۰هزار.
      mockReturn([{ saleLogId: 'log3', quantity: 3 }]);
      mockCorrection(60_000);
      await service.adjust('inv1', baseDto());
      expect(returns.createReturnInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ refundMethod: PaymentMethod.CREDIT }),
        expect.objectContaining({ operationKey: 'op-1' }),
      );
      expect(receipts.createReceiptInTx).not.toHaveBeenCalled();
    });

    it('اختلافِ مثبت با CASH: رسید داخل همان تراکنش برای همان مبلغ', async () => {
      // فقط افزودن ۵ قلم × ۱۰۰هزار ⇒ اختلاف = +۵۰۰هزار؛ تسویه‌ی نقدی ⇒ رسید.
      mockCorrection(500_000);
      await service.adjust(
        'inv1',
        baseDto({
          returns: [],
          changes: [],
          additions: [{ productId: 'p5', quantity: 5, unitPrice: 100_000 }],
          settlement: { method: PaymentMethod.CASH },
        }),
      );
      expect(receipts.createReceiptInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          customerId: 'c1',
          payments: [
            expect.objectContaining({
              method: PaymentMethod.CASH,
              amount: 500_000,
            }),
          ],
        }),
        undefined,
      );
    });

    it('اختلافِ مثبت با CHEQUE: رسیدِ چکی داخل همان تراکنش', async () => {
      mockCorrection(500_000);
      await service.adjust(
        'inv1',
        baseDto({
          returns: [],
          changes: [],
          additions: [{ productId: 'p5', quantity: 5, unitPrice: 100_000 }],
          settlement: {
            method: PaymentMethod.CHEQUE,
            cheque: { number: '123', dueDate: '2026-10-01' },
          },
        }),
      );
      expect(receipts.createReceiptInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          payments: [expect.objectContaining({ method: PaymentMethod.CHEQUE })],
        }),
        undefined,
      );
    });

    it('اختلافِ منفی با CASH: مرجوعی نقدی + اصلاحیه‌ی settleAsCash — بدون رسید', async () => {
      mockReturn([{ saleLogId: 'log3', quantity: 3 }]);
      mockCorrection(0);
      await service.adjust(
        'inv1',
        baseDto({ settlement: { method: PaymentMethod.CASH } }),
      );
      expect(returns.createReturnInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ refundMethod: PaymentMethod.CASH }),
        expect.anything(),
      );
      expect(corrections.createCorrectionInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ settleAsCash: true }),
      );
      expect(receipts.createReceiptInTx).not.toHaveBeenCalled();
    });

    it('اختلافِ منفی با CREDIT: بستانکاری در حساب — مرجوعی CREDIT', async () => {
      mockReturn([{ saleLogId: 'log3', quantity: 3 }]);
      mockCorrection(0);
      await service.adjust(
        'inv1',
        baseDto({ settlement: { method: PaymentMethod.CREDIT } }),
      );
      expect(returns.createReturnInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ refundMethod: PaymentMethod.CREDIT }),
        expect.anything(),
      );
      expect(receipts.createReceiptInTx).not.toHaveBeenCalled();
    });

    it('اختلافِ صفر: هیچ رسید و هیچ settleAsCash‌ای', async () => {
      mockReturn([{ saleLogId: 'log3', quantity: 3 }]);
      mockCorrection(150_000); // تغییر/افزودن دقیقاً جبرانِ مرجوعی
      await service.adjust('inv1', baseDto());
      expect(receipts.createReceiptInTx).not.toHaveBeenCalled();
      expect(corrections.createCorrectionInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ settleAsCash: false }),
      );
    });

    it('فاکتورِ بدون مشتری با CREDIT رد می‌شود', async () => {
      prisma.$queryRaw.mockResolvedValue([{ ...INVOICE, customerId: null }]);
      await expect(
        service.adjust(
          'inv1',
          baseDto({ settlement: { method: PaymentMethod.CREDIT } }),
        ),
      ).rejects.toMatchObject({
        response: { error: 'CUSTOMER_REQUIRED_FOR_CREDIT' },
      });
    });

    it('چک برای اختلافِ منفی رد می‌شود', async () => {
      mockReturn([{ saleLogId: 'log3', quantity: 3 }]);
      mockCorrection(0);
      await expect(
        service.adjust(
          'inv1',
          baseDto({ settlement: { method: PaymentMethod.CHEQUE } }),
        ),
      ).rejects.toMatchObject({ response: { error: 'CHEQUE_NOT_A_REFUND' } });
    });

    it('مبلغِ تسویه‌ی ناهمخوان رد می‌شود', async () => {
      mockReturn([{ saleLogId: 'log3', quantity: 3 }]);
      mockCorrection(60_000);
      await expect(
        service.adjust(
          'inv1',
          baseDto({
            settlement: { method: PaymentMethod.CREDIT, amount: 999 },
          }),
        ),
      ).rejects.toMatchObject({
        response: { error: 'SETTLEMENT_AMOUNT_MISMATCH' },
      });
    });
  });

  describe('idempotency و هم‌زمانی', () => {
    it('retry با همان کلید، عملیاتِ قبلی را برمی‌گرداند — دوباره ثبت نمی‌کند', async () => {
      prisma.saleReturn.findUnique.mockResolvedValue({
        id: 'ret1',
        operationKey: 'op-1',
      });
      prisma.saleReturn.findFirst.mockResolvedValue({
        id: 'ret1',
        operationKey: 'op-1',
        refundAmount: 150_000,
        lines: [],
      });
      prisma.saleCorrection.findFirst.mockResolvedValue({
        id: 'corr1',
        operationKey: 'op-1',
        amountAdjust: 60_000,
        lines: [],
      });
      prisma.receipt.findUnique.mockResolvedValue(null);
      prisma.saleInvoice.findUnique.mockResolvedValue({
        ...INVOICE,
        customer: { id: 'c1', firstName: 'رضا', lastName: 'کریمی' },
        lines: [
          {
            id: 'log1',
            productId: 'p1',
            quantity: 10,
            unitPrice: 100_000,
            product: { id: 'p1', name: 'لنت', unit: 'عدد' },
          },
          {
            id: 'log3',
            productId: 'p3',
            quantity: 5,
            unitPrice: 50_000,
            product: { id: 'p3', name: 'چراغ', unit: 'عدد' },
          },
        ],
      });

      const res = await service.adjust('inv1', baseDto());

      expect(returns.createReturnInTx).not.toHaveBeenCalled();
      expect(corrections.createCorrectionInTx).not.toHaveBeenCalled();
      expect(res.operationKey).toBe('op-1');
      expect(res.settlement.direction).toBe('PAY');
      expect(res.settlement.amount).toBe(90_000);
    });

    it('برخوردِ همزمان (P2002) روی کلیدِ فرزند، عملیاتِ قبلی را برمی‌گرداند', async () => {
      prisma.saleReturn.findUnique.mockResolvedValue(null);
      prisma.saleCorrection.findUnique.mockResolvedValue(null);
      // در تراکنش، برخوردِ یکتایی:
      prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
      prisma.saleReturn.findUnique
        .mockResolvedValueOnce(null) // پیش‌بررسی
        .mockResolvedValueOnce({ id: 'ret1', operationKey: 'op-1' }); // بازیابیِ P2002
      prisma.saleReturn.findFirst.mockResolvedValue({
        id: 'ret1',
        operationKey: 'op-1',
        refundAmount: 150_000,
        lines: [],
      });
      prisma.saleCorrection.findFirst.mockResolvedValue({
        id: 'corr1',
        operationKey: 'op-1',
        amountAdjust: 60_000,
        lines: [],
      });
      prisma.receipt.findUnique.mockResolvedValue(null);
      prisma.saleInvoice.findUnique.mockResolvedValue({
        ...INVOICE,
        customer: { id: 'c1', firstName: 'رضا', lastName: 'کریمی' },
        lines: [],
      });

      const res = await service.adjust('inv1', baseDto());
      expect(res.returnId).toBe('ret1');
    });
  });

  describe('پاسخِ ترکیبی (loadCombined)', () => {
    it('ردیف‌ها را با وضعیتِ درست می‌سازد', async () => {
      prisma.saleReturn.findFirst.mockResolvedValue({
        id: 'ret1',
        operationKey: 'op-1',
        refundAmount: 150_000,
        lines: [],
      });
      prisma.saleCorrection.findFirst.mockResolvedValue({
        id: 'corr1',
        operationKey: 'op-1',
        amountAdjust: 160_000,
        lines: [
          {
            saleLogId: 'log1',
            isNewLine: false,
            newUnitPrice: 120_000,
            lineAdjust: -200_000,
          },
          {
            saleLogId: 'log4',
            isNewLine: true,
            newQuantity: 2,
            newUnitPrice: 30_000,
            lineAdjust: 60_000,
          },
        ],
      });
      prisma.receipt.findUnique.mockResolvedValue(null);
      prisma.saleInvoice.findUnique.mockResolvedValue({
        ...INVOICE,
        total: 860_000, // پس از اصلاحیه
        customer: { id: 'c1', firstName: 'رضا', lastName: 'کریمی' },
        lines: [
          {
            id: 'log1',
            productId: 'p1',
            quantity: 10,
            unitPrice: 100_000,
            product: { id: 'p1', name: 'لنت', unit: 'عدد' },
          },
          {
            id: 'log3',
            productId: 'p3',
            quantity: 5,
            unitPrice: 50_000,
            product: { id: 'p3', name: 'چراغ', unit: 'عدد' },
          },
          {
            id: 'log4',
            productId: 'p4',
            quantity: 2,
            unitPrice: 30_000,
            product: { id: 'p4', name: 'کاسه‌نمد', unit: 'عدد' },
          },
        ],
      });
      prisma.saleReturnLine.groupBy.mockResolvedValue([
        { saleLogId: 'log3', _sum: { quantity: 3 } },
      ]);
      prisma.saleCorrectionLine.groupBy.mockResolvedValue([
        { saleLogId: 'log1', _sum: { oldQuantity: 10, newQuantity: 7 } },
      ]);

      const res = await service.loadCombined('inv1', 'op-1');

      expect(res.invoice.difference).toBe(10_000); // 160 - 150
      expect(res.lines.find((l: any) => l.saleLogId === 'log1')).toMatchObject({
        originalQuantity: 10,
        currentQuantity: 7,
        lineStatus: 'ACTIVE',
      });
      expect(res.lines.find((l: any) => l.saleLogId === 'log3')).toMatchObject({
        returnedQuantity: 3,
        currentQuantity: 2,
        lineStatus: 'PARTIALLY_RETURNED',
      });
      expect(res.lines.find((l: any) => l.saleLogId === 'log4')).toMatchObject({
        originalQuantity: 0,
        addedQuantity: 2,
        lineStatus: 'ADDED_LATER',
      });
    });
  });
});
