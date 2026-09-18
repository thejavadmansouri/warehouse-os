import { LedgerService } from './ledger.service';

/**
 * فهرستِ حساب‌بازها — بدهکار و طلبکار با هم.
 *
 * این تست‌ها محافظت می‌کنند که:
 *   • مانده از خودِ دفتر می‌آید (groupBy روی CustomerLedger) — پس نسیه‌های
 *     معمولی که «حسابِ کلی» ندارند هم دیده می‌شوند.
 *   • طلبکار (مانده‌ی منفی از مرجوعی/پرداخت) هم در فهرست است.
 *   • بدهکارها به بدیِ وضعیت مرتب می‌شوند (معوق → امروز → بزرگ‌ترین) و
 *     طلبکارها به بزرگیِ اعتبار.
 *   • گزارش مطالبات (debtors) رفتار قبلی‌اش را از دست نداده باشد.
 */
describe('LedgerService — accountBalances', () => {
  let service: LedgerService;

  const prisma = {
    customerLedger: {
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    customer: { findMany: jest.fn(), findUnique: jest.fn() },
    saleInvoice: { findMany: jest.fn() },
    cheque: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LedgerService(prisma as never);
  });

  function mockGroups(
    debtors: { customerId: string }[],
    creditors: { customerId: string }[],
  ) {
    prisma.customerLedger.groupBy.mockImplementation(
      (args: {
        having?: { amount?: { _sum?: { gt?: number; lt?: number } } };
      }) => {
        // دقت: مقدارِ فیلتر صفر است (gt: 0) — با truthy بودن نمی‌شود تشخیص داد.
        const having = args?.having?.amount?._sum;
        if (having && 'gt' in having) {
          return Promise.resolve(
            debtors.map((d) => ({
              customerId: d.customerId,
              _sum: { amount: 500_000 },
            })),
          );
        }
        if (having && 'lt' in having) {
          return Promise.resolve(
            creditors.map((c) => ({
              customerId: c.customerId,
              _sum: { amount: -300_000 },
            })),
          );
        }
        return Promise.resolve([]);
      },
    );
  }

  it('بدهکار و طلبکار را با هم می‌آورد — بدهکار اول، به بدیِ وضعیت', async () => {
    // دو بدهکار: یکی معوق، یکی جاری — و یک طلبکار.
    mockGroups(
      [{ customerId: 'd1' }, { customerId: 'd2' }],
      [{ customerId: 'c1' }],
    );

    prisma.customer.findMany.mockResolvedValue([
      {
        id: 'd1',
        firstName: 'علی',
        lastName: 'معوق',
        creditLimit: 0,
        creditDays: 0,
        phones: [],
      },
      {
        id: 'd2',
        firstName: 'رضا',
        lastName: 'جاری',
        creditLimit: 0,
        creditDays: 0,
        phones: [{ phone: '09120000001', isPrimary: true }],
      },
      {
        id: 'c1',
        firstName: 'حسن',
        lastName: 'طلبکار',
        creditLimit: 0,
        creditDays: 0,
        phones: [],
      },
    ]);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const yesterday = new Date(startOfToday);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(startOfToday);
    tomorrow.setDate(tomorrow.getDate() + 1);

    prisma.saleInvoice.findMany.mockResolvedValue([
      // معوقِ d1 — فاکتور ۸۰۰ هزار، ولی مانده‌ی دفتر ۵۰۰ هزار است؛ یعنی ۳۰۰ هزار
      // اعتبار (مثلاً مرجوعیِ «کسر از حساب») روی حساب نشسته و معوقِ خالص ۵۰۰ هزار است.
      { customerId: 'd1', dueAmount: 800_000, dueDate: yesterday },
      // جاریِ d2 — ۵۰۰ هزار
      { customerId: 'd2', dueAmount: 500_000, dueDate: tomorrow },
    ]);

    const rows = await service.accountBalances();

    expect(rows).toHaveLength(3);
    // بدهکارِ معوق اول، بعد بدهکارِ جاری، آخر طلبکار.
    expect(rows.map((r) => r.kind)).toEqual(['debtor', 'debtor', 'creditor']);
    expect(rows[0].id).toBe('d1');
    expect(rows[0].overdue).toBe(500_000);
    expect(rows[0].accountCredit).toBe(300_000);
    expect(rows[1].id).toBe('d2');
    expect(rows[1].overdue).toBe(0);
    expect(rows[2].id).toBe('c1');
    // مانده‌ی طلبکار منفی است — قراردادِ مثبت/منفی.
    expect(rows[2].balance).toBe(-300_000);
  });

  it('تعداد فاکتورهای مانده‌دار هر بدهکار را می‌شمارد', async () => {
    mockGroups([{ customerId: 'd1' }], []);
    prisma.customer.findMany.mockResolvedValue([
      {
        id: 'd1',
        firstName: 'علی',
        lastName: null,
        creditLimit: 0,
        creditDays: 0,
        phones: [],
      },
    ]);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    prisma.saleInvoice.findMany.mockResolvedValue([
      { customerId: 'd1', dueAmount: 300_000, dueDate: tomorrow },
      { customerId: 'd1', dueAmount: 200_000, dueDate: tomorrow },
    ]);

    const [row] = await service.accountBalances();
    expect(row.invoiceCount).toBe(2);
  });

  it('جست‌وجو را به findMany مشتری می‌دهد (نرمال‌شده)', async () => {
    mockGroups([{ customerId: 'd1' }], []);
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.saleInvoice.findMany.mockResolvedValue([]);

    await service.accountBalances({ q: 'علی' });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          searchName: expect.objectContaining({ contains: expect.any(String) }),
        }),
      }),
    );
  });

  it('هیچ مانده‌ی غیرصفری نباشد → فهرست خالی', async () => {
    mockGroups([], []);
    const rows = await service.accountBalances();
    expect(rows).toEqual([]);
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it('مرجوعیِ «کسر از حساب» معوق را از مانده‌ی واقعی کم می‌کند — پرونده‌ی «تبای»', async () => {
    // فاکتورِ معوق ۲ میلیون، مانده‌ی دفتر ۱.۸۵ میلیون (مرجوعی ۱۵۰ هزار بستانکار).
    prisma.customerLedger.groupBy.mockResolvedValue([
      { customerId: 'tabay', _sum: { amount: 1_850_000 } },
    ]);
    prisma.customer.findMany.mockResolvedValue([
      {
        id: 'tabay',
        firstName: 'تبای',
        lastName: null,
        creditLimit: 0,
        creditDays: 0,
        phones: [],
      },
    ]);
    const past = new Date();
    past.setDate(past.getDate() - 1);
    prisma.saleInvoice.findMany.mockResolvedValue([
      { customerId: 'tabay', dueAmount: 2_000_000, dueDate: past },
    ]);

    const rows = await service.accountBalances();

    // معوقِ خالص = ۲م − ۱۵۰هزار، نه ۲م — وگرنه عددِ دوگانه صندوقدار را می‌گم کرد.
    expect(rows[0].overdue).toBe(1_850_000);
    expect(rows[0].accountCredit).toBe(150_000);
    // در فهرستِ حساب‌بازها فیلدِ مانده «balance» است.
    expect(rows[0].balance).toBe(1_850_000);
  });

  it('summary هم اعتبار حساب را در سطل‌ها اعمال می‌کند', async () => {
    mockGroups([{ customerId: 'd1' }], []);
    prisma.customer.findMany.mockResolvedValue([]);
    const past = new Date();
    past.setDate(past.getDate() - 1);
    prisma.saleInvoice.findMany.mockResolvedValue([
      { dueAmount: 2_000_000, dueDate: past },
    ]);
    prisma.customerLedger.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 1_850_000 } }) // balance
      .mockResolvedValueOnce({ _sum: { amount: 1_850_000 } }); // sum ردیف‌های دفتر در summary
    prisma.cheque.findMany.mockResolvedValue([]);

    const s = await service.summary('d1');

    expect(s.totalDue).toBe(1_850_000);
    expect(s.overdue).toBe(1_850_000);
    expect(s.accountCredit).toBe(150_000);
  });

  it('گزارش مطالبات (debtors) فقط بدهکارها را می‌دهد — رفتار قبلی دست‌نخورده', async () => {
    mockGroups([{ customerId: 'd1' }], [{ customerId: 'c1' }]);
    prisma.customer.findMany.mockResolvedValue([
      {
        id: 'd1',
        firstName: 'علی',
        lastName: null,
        creditLimit: 0,
        creditDays: 0,
        phones: [],
      },
    ]);
    prisma.saleInvoice.findMany.mockResolvedValue([]);

    const res = await service.debtors();

    // طلبکار در بدهکاران جایی ندارد.
    expect(res.data.map((r) => r.id)).toEqual(['d1']);
    expect(res.meta.total).toBe(1);
  });
});
