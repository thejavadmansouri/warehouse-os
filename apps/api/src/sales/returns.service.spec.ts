import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { EventsGateway } from '../realtime/events.gateway';
import { PostingService } from '../vouchers/posting.service';
import { LedgerService } from './ledger.service';
import { ReturnsService } from './returns.service';

/**
 * تست‌های «مرجوعی» — فقط همان دو تصمیمی که روی **خودِ سندِ فاکتور** اثر دارند.
 *
 * قاعده‌ای که اینجا قفل می‌شود:
 *
 *   • مرجوعیِ **اعتباری** (کسر از حساب) بدهی را کم می‌کند و باید `dueAmount` و
 *     `total` را با هم پایین بیاورد. تا پیش از این `total` دست‌نخورده می‌ماند و
 *     هر مصرف‌کننده مجبور بود دلتای مرجوعی را خودش اضافه کند؛ یکی می‌کرد و
 *     دیگری نه، و همان «۴ میلیون به‌جای ۲ میلیون» بیرون می‌زد.
 *
 *   • مرجوعیِ **نقد/کارت** پول را از صندوق برمی‌گرداند و به `total` دست نمی‌زند؛
 *     اثرش همان‌جا در `InvoiceEffectsService.deltaByInvoice` به‌صورت دلتا
 *     اضافه می‌شود. اگر اینجا هم کم شود، دو بار حساب می‌شود.
 *
 * بقیه‌ی زنجیره (انبار، سند، دفتر) ماک است؛ موضوعِ تست خودِ تصمیمِ مقادیر است.
 */

const INVOICE_ID = 'inv1';
const CUSTOMER_ID = 'c1';

/** فاکتورِ ۱۰×۱۰۰۰ نسیه: هنوز هیچ‌چیزش پرداخت نشده. */
function makeInvoice() {
  return {
    id: INVOICE_ID,
    number: 1001,
    status: InvoiceStatus.CONFIRMED as string,
    subtotal: 10_000,
    discount: 0,
    total: 10_000,
    paidAmount: 0,
    dueAmount: 10_000,
    dueDate: null as Date | null,
    customerId: CUSTOMER_ID as string | null,
    warehouseId: 'w1',
    accountId: null,
    createdAt: new Date(),
  };
}

const SALE_LINE = {
  id: 's1',
  invoiceId: INVOICE_ID,
  productId: 'p1',
  locationId: 'l1',
  quantity: 10,
  unitPrice: 1000,
  lineDiscount: 0,
};

function dto(refundMethod: PaymentMethod) {
  return {
    idempotencyKey: 'key-1',
    invoiceId: INVOICE_ID,
    refundMethod,
    reason: 'مرجوعی تست',
    lines: [{ saleLogId: 's1', quantity: 3 }],
  } as any;
}

describe('ReturnsService — اثرِ مرجوعی روی مبلغِ فاکتور', () => {
  let service: ReturnsService;
  let invoice: ReturnType<typeof makeInvoice>;
  /** همان چیزی که `saleInvoice.updateMany` داخل تراکنش می‌نویسد. */
  let updates: any[];

  const ledger = {
    record: jest.fn(),
    balance: jest.fn(async () => 0),
  };
  const operation = { execute: jest.fn() };
  const posting = {
    post: jest.fn(),
    latestPurchasePrices: jest.fn(async () => new Map<string, number>()),
  };
  const events = { broadcast: jest.fn() };

  const tx: any = {
    $queryRaw: jest.fn(async () => [invoice]),
    inventoryLog: { findMany: jest.fn(async () => [{ ...SALE_LINE }]) },
    saleCorrectionLine: { groupBy: jest.fn(async () => []) },
    saleReturnLine: {
      groupBy: jest.fn(async () => []),
      createMany: jest.fn(async () => ({ count: 1 })),
    },
    saleReturn: {
      create: jest.fn(async () => ({ id: 'r1', number: 500 })),
    },
    saleInvoice: {
      updateMany: jest.fn(async (args: any) => {
        updates.push(args);
        return { count: 1 };
      }),
    },
  };

  const prisma: any = {};

  beforeEach(async () => {
    jest.clearAllMocks();
    invoice = makeInvoice();
    updates = [];
    tx.$queryRaw.mockImplementation(async () => [invoice]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryOperationService, useValue: operation },
        { provide: LedgerService, useValue: ledger },
        { provide: EventsGateway, useValue: events },
        { provide: PostingService, useValue: posting },
      ],
    }).compile();
    service = module.get(ReturnsService);
  });

  it('مرجوعیِ اعتباری: هم بدهیِ فاکتور و هم مبلغش کم می‌شود', async () => {
    const res = await service.createReturnInTx(tx, dto(PaymentMethod.CREDIT), {
      userId: 'u1',
    });

    // ۳ عدد از ۱۰ عدد با قیمتِ مؤثرِ ۱۰۰۰ ⇒ ۳۰۰۰ برگشت.
    expect(res.refundAmount).toBe(3_000);

    const due = updates.find((u) => 'dueAmount' in (u.data ?? {}));
    const total = updates.find((u) => 'total' in (u.data ?? {}));

    expect(due?.data).toEqual({ dueAmount: { decrement: 3_000 } });
    expect(total?.data).toEqual({ total: { decrement: 3_000 } });

    // نگهبانِ شرطی: نوشتنِ مقدارِ مطلق نباشد تا کاهشِ هم‌زمانِ رسید پاک نشود.
    expect(due?.where).toMatchObject({ dueAmount: { gte: 3_000 } });
    expect(total?.where).toMatchObject({ total: { gte: 3_000 } });

    // بستانکاریِ کامل در دفتر ثبت می‌شود.
    expect(ledger.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        customerId: CUSTOMER_ID,
        type: 'RETURN',
        amount: -3_000,
      }),
    );
  });

  it('مرجوعیِ نقد: مبلغِ فاکتور دست‌نخورده می‌ماند و دفتر ردیف نمی‌سازد', async () => {
    await service.createReturnInTx(tx, dto(PaymentMethod.CASH), {
      userId: 'u1',
    });

    expect(updates).toEqual([]);
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('مرجوعیِ اعتباری بیشتر از مبلغِ فاکتور، مبلغ را منفی نمی‌کند', async () => {
    // فاکتورِ ۱۰۰۰ ریالی که ۳۰۰۰ ریال مرجوعی می‌خورد (حالتِ لبه): مبلغ تا
    // صفر کم می‌شود، ولی هرگز منفی نمی‌نویسیم.
    invoice.total = 1_000;
    invoice.dueAmount = 1_000;

    await service.createReturnInTx(tx, dto(PaymentMethod.CREDIT), {
      userId: 'u1',
    });

    const total = updates.find((u) => 'total' in (u.data ?? {}));
    expect(total?.data).toEqual({ total: { decrement: 1_000 } });
  });
});
