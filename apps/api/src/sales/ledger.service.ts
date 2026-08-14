import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerEntryType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { normalizePersian } from '../engine/utils/persian-normalize';


/** چکی که تا این تعداد روز دیگر سررسید می‌شود، در اعلان‌ها می‌آید. */
const CHEQUE_ALERT_DAYS = 7;


/** کلاینت تراکنشی یا خودِ prisma — تا نوشتن در دفتر همیشه داخل تراکنشِ صدازننده بماند. */
type Db = Prisma.TransactionClient | PrismaService;


export interface LedgerEntryInput {
  customerId: string;
  type: LedgerEntryType;
  /** مثبت = بدهی زیاد می‌شود، منفی = کم می‌شود. */
  amount: number;
  invoiceId?: string | null;
  receiptId?: string | null;
  returnId?: string | null;
  note?: string | null;
  userId?: string | null;
}


/**
 * دفتر حساب مشتری — تنها جایی که «مانده» محاسبه می‌شود.
 *
 * قاعده‌ی کل این کلاس یک جمله است: **مانده = SUM(amount)**. هیچ ستون مانده‌ای
 * نگه‌داری نمی‌شود که بشود از واقعیت جدا بیفتد. هر جای سیستم که عدد بدهی نشان
 * می‌دهد باید از همین‌جا بپرسد، وگرنه دوباره به «یک صفحه ۳۸۵ و صفحه‌ی دیگر
 * ۳۷۵» برمی‌گردیم.
 *
 * نوشتن همیشه با `tx` صدا زده می‌شود تا ردیف دفتر و رویدادی که ساخته‌اش
 * (فاکتور، رسید، ابطال) یا هر دو ثبت شوند یا هیچ‌کدام.
 */
@Injectable()
export class LedgerService {

  constructor(private readonly prisma: PrismaService) {}


  /**
   * ثبت یک رویداد در دفتر.
   *
   * مبلغ صفر عمداً رد می‌شود: ردیفی که مانده را عوض نمی‌کند فقط گردش حساب را
   * شلوغ می‌کند و خواندنش را برای مدیر سخت‌تر.
   */
  async record(db: Db, entry: LedgerEntryInput) {
    if (entry.amount === 0) return null;

    return db.customerLedger.create({
      data: {
        customerId: entry.customerId,
        type: entry.type,
        amount: entry.amount,
        invoiceId: entry.invoiceId ?? null,
        receiptId: entry.receiptId ?? null,
        returnId: entry.returnId ?? null,
        note: entry.note ?? null,
        userId: entry.userId ?? null,
      },
    });
  }


  /** مانده‌ی مشتری به ریال. مثبت یعنی بدهکار است. */
  async balance(customerId: string, db: Db = this.prisma): Promise<number> {
    const agg = await db.customerLedger.aggregate({
      where: { customerId },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }


  /**
   * همان چهار عددی که مدیر باید در پنج ثانیه ببیند، به‌علاوه‌ی چک‌های وصول‌نشده.
   *
   * تفکیک جاری/سررسید/معوق از `SaleInvoice.dueDate` می‌آید نه از خود دفتر، چون
   * سررسید خاصیتِ فاکتور است نه خاصیتِ حرکتِ حساب. مانده‌ی کل اما همچنان از
   * دفتر می‌آید — این دو نباید قاطی شوند.
   */
  async summary(customerId: string) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const [totalDue, openInvoices, chequesInHand] = await Promise.all([
      this.balance(customerId),

      this.prisma.saleInvoice.findMany({
        where: {
          customerId,
          status: 'CONFIRMED',
          dueAmount: { gt: 0 },
        },
        select: { dueAmount: true, dueDate: true },
      }),

      /*
       * چکِ دریافت‌شده بدهی را همان لحظه کم کرده، ولی هنوز پول نشده. اگر جدا
       * نشان داده نشود، مدیر فکر می‌کند این مبلغ وصول شده — و اگر چک برگشت
       * بخورد غافلگیر می‌شود.
       */
      this.prisma.cheque.findMany({
        where: {
          status: 'IN_HAND',
          OR: [
            { receipt: { customerId } },
            { payment: { invoice: { customerId } } },
          ],
        },
        select: { id: true },
      }),
    ]);

    let current = 0;
    let dueToday = 0;
    let overdue = 0;

    for (const inv of openInvoices) {
      // فاکتور بدون سررسید هنوز مهلت‌دار حساب می‌شود، نه معوق — عددِ معوق
      // نباید به‌خاطر داده‌ی ناقص متورم شود.
      if (!inv.dueDate || inv.dueDate >= startOfTomorrow) current += inv.dueAmount;
      else if (inv.dueDate >= startOfToday) dueToday += inv.dueAmount;
      else overdue += inv.dueAmount;
    }

    return {
      totalDue,
      current,
      dueToday,
      overdue,
      chequesInHandCount: chequesInHand.length,
    };
  }


  /**
   * صورتحساب مشتری — گردشِ حساب با مانده‌ی متحرک، همترازِ الگوی کاردکس.
   *
   * دو قاعده‌ی صحت:
   *
   * ۱) مانده‌ی هر ردیف = SUM(amount) روی **کلِ** تاریخچه (window بدون فیلتر)، نه
   *    فقط بازه. اگر window را روی خودِ بازه ببندیم، مانده‌ی اول دوره صفر
   *    می‌افتد و «پایان دوره = مانده‌ی واقعی» دیگر برقرار نیست. فیلترِ تاریخ
   *    بیرونِ window اعمال می‌شود — صفحه‌بندی هم مانده را خراب نمی‌کند.
   *
   * ۲) openingBalance = جمعِ ردیف‌های قبل از startDate. چون window از ردیفِ صفرِ
   *    تاریخچه شروع می‌شود، خودِ opening داخلِ هر balance هست؛ جداگانه هم برای
   *    نوارِ خلاصه برمی‌گردد.
   */
  async statement(
    customerId: string,
    q: { startDate?: string; endDate?: string; page?: number; limit?: number } = {},
  ) {
    const take = Math.min(Math.max(q.limit ?? 50, 1), 10_000);
    const page = Math.max(q.page ?? 1, 1);
    const skip = (page - 1) * take;
    const start = q.startDate ? new Date(q.startDate) : null;
    const end = q.endDate ? new Date(q.endDate) : null;

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        createdAt: Date;
        type: string;
        amount: number;
        note: string | null;
        invoiceId: string | null;
        receiptId: string | null;
        returnId: string | null;
        userId: string | null;
        invoiceNumber: number | null;
        receiptNumber: number | null;
        userName: string | null;
        balance: bigint;
      }[]
    >`
      WITH all_entries AS (
        SELECT l."id", l."createdAt", l."type", l."amount", l."note",
               l."invoiceId", l."receiptId", l."returnId", l."userId",
               si."number"  AS "invoiceNumber",
               rc."number"  AS "receiptNumber",
               u."fullName" AS "userName",
               SUM(l."amount") OVER (ORDER BY l."createdAt", l."id") AS "balance"
        FROM "CustomerLedger" l
        LEFT JOIN "SaleInvoice" si ON si."id"  = l."invoiceId"
        LEFT JOIN "Receipt"     rc ON rc."id"  = l."receiptId"
        LEFT JOIN "User"        u  ON u."id"   = l."userId"
        WHERE l."customerId" = ${customerId}
      )
      SELECT * FROM all_entries
      WHERE (${start}::timestamptz IS NULL OR "createdAt" >= ${start})
        AND (${end}::timestamptz   IS NULL OR "createdAt" <= ${end})
      ORDER BY "createdAt" ASC, "id" ASC
      OFFSET ${skip} LIMIT ${take}
    `;

    // مانده‌ی اول دوره — جمعِ ردیف‌های قبل از startDate (اگر بازه نداشتیم = ۰)
    const opening = start
      ? await this.prisma.$queryRaw<{ opening: bigint }[]>`
          SELECT COALESCE(SUM(l."amount"), 0)::bigint AS "opening"
          FROM "CustomerLedger" l
          WHERE l."customerId" = ${customerId} AND l."createdAt" < ${start}
        `
      : null;

    // جمع‌های بازه — بدهکار/بستانکار/خالص، همه در خودِ پستگرس.
    const [rangeAgg] = await this.prisma.$queryRaw<
      { totalDebit: bigint; totalCredit: bigint; net: bigint }[]
    >`
      SELECT
        COALESCE(SUM(CASE WHEN l."amount" > 0 THEN l."amount" ELSE 0 END), 0)::bigint AS "totalDebit",
        COALESCE(SUM(CASE WHEN l."amount" < 0 THEN -l."amount" ELSE 0 END), 0)::bigint AS "totalCredit",
        COALESCE(SUM(l."amount"), 0)::bigint AS "net"
      FROM "CustomerLedger" l
      WHERE l."customerId" = ${customerId}
        AND (${start}::timestamptz IS NULL OR l."createdAt" >= ${start})
        AND (${end}::timestamptz   IS NULL OR l."createdAt" <= ${end})
    `;

    const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "CustomerLedger" l
      WHERE l."customerId" = ${customerId}
        AND (${start}::timestamptz IS NULL OR l."createdAt" >= ${start})
        AND (${end}::timestamptz   IS NULL OR l."createdAt" <= ${end})
    `;

    const data = rows.map((r) => {
      const amount = Number(r.amount);
      return {
        id: r.id,
        type: r.type,
        amount,
        note: r.note,
        createdAt: r.createdAt,
        invoice: r.invoiceId ? { id: r.invoiceId, number: r.invoiceNumber } : null,
        receipt: r.receiptId ? { id: r.receiptId, number: r.receiptNumber } : null,
        user: r.userId ? { id: r.userId, fullName: r.userName } : null,
        debit: amount > 0 ? amount : 0,
        credit: amount < 0 ? -amount : 0,
        balance: Number(r.balance),
      };
    });

    const openingBalance = opening ? Number(opening[0].opening) : 0;

    /*
     * پایان دوره: بدون بازه، همان مانده‌ی واقعیِ دفتر (ledger.balance) — تنها
     * منبعِ حقیقتِ مانده. با بازه، opening + خالصِ بازه که با همین حساب درست است.
     */
    const closingBalance =
      !start && !end
        ? await this.balance(customerId)
        : openingBalance + Number(rangeAgg.net);

    const total = Number(count);
    return {
      rows: {
        data,
        meta: {
          total,
          page,
          limit: take,
          lastPage: Math.max(1, Math.ceil(total / take)),
        },
      },
      summary: {
        openingBalance,
        totalDebit: Number(rangeAgg.totalDebit),
        totalCredit: Number(rangeAgg.totalCredit),
        closingBalance,
      },
    };
  }


  /**
   * همه‌ی مشتریانی که حساب باز دارند.
   *
   * یک کوئری برای سه مصرف‌کننده: دکمه‌ی «حساب باز» در صندوق، گزارش مطالبات، و
   * زنگ اعلان‌ها. اگر هرکدام فرمول خودش را داشتند، همان‌جا بود که سه صفحه سه
   * عدد متفاوت نشان می‌دادند.
   *
   * مانده از دفتر می‌آید (پس مانده‌ی اول دوره و برگشتی را می‌بیند) ولی تفکیک
   * سنی از سررسیدِ فاکتورهاست.
   */
  async debtors(params: {
    q?: string;
    onlyOverdue?: boolean;
    page?: number;
    limit?: number;
  } = {}) {
    const take = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const skip = (Math.max(params.page ?? 1, 1) - 1) * take;

    const rows = await this.debtorRows(params);

    return {
      data: rows.slice(skip, skip + take),
      meta: { total: rows.length, page: Math.max(params.page ?? 1, 1), limit: take },
    };
  }


  /**
   * ردیف‌های کاملِ بدهکاران — بدون صفحه‌بندی.
   *
   * جدا شد چون `receivablesSummary` و `alerts` قبلاً `debtors({ limit: 200 })`
   * صدا می‌زدند و روی `data`ی صفحه‌بندی‌شده جمع می‌بستند. یعنی از مشتریِ ۲۰۱ به
   * بعد، بدهی‌اش در جمعِ کلِ مطالبات و در شمارشِ معوق‌ها **اصلاً نمی‌آمد** —
   * عددِ سرصفحه بی‌سروصدا کمتر از واقعیت بود. جمع باید کلِ مجموعه را ببیند،
   * صفحه‌بندی فقط برای نمایش است.
   */
  private async debtorRows(params: {
    q?: string;
    onlyOverdue?: boolean;
  } = {}) {

    // بدهکار = مانده‌ی مثبت در دفتر. جمع در خود پستگرس زده می‌شود.
    const groups = await this.prisma.customerLedger.groupBy({
      by: ['customerId'],
      _sum: { amount: true },
      having: { amount: { _sum: { gt: 0 } } },
    });

    const balances = new Map(
      groups.map((g) => [g.customerId, g._sum.amount ?? 0]),
    );
    if (balances.size === 0) return [];

    const ids = [...balances.keys()];

    const customers = await this.prisma.customer.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        ...(params.q?.trim()
          ? { searchName: { contains: normalizePersian(params.q) } }
          : {}),
      },
      include: { phones: { where: { isPrimary: true }, take: 1 } },
    });

    const openInvoices = await this.prisma.saleInvoice.findMany({
      where: {
        customerId: { in: ids },
        status: 'CONFIRMED',
        dueAmount: { gt: 0 },
      },
      select: { customerId: true, dueAmount: true, dueDate: true },
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    type Aging = {
      current: number;
      dueToday: number;
      overdue: number;
      nextDueDate: Date | null;
    };
    const aging = new Map<string, Aging>();

    for (const inv of openInvoices) {
      if (!inv.customerId) continue;
      const a =
        aging.get(inv.customerId) ??
        { current: 0, dueToday: 0, overdue: 0, nextDueDate: null };

      if (!inv.dueDate || inv.dueDate >= startOfTomorrow) a.current += inv.dueAmount;
      else if (inv.dueDate >= startOfToday) a.dueToday += inv.dueAmount;
      else a.overdue += inv.dueAmount;

      // نزدیک‌ترین سررسیدِ باز — همان چیزی که «چقدر وقت داریم» را جواب می‌دهد.
      if (inv.dueDate && (!a.nextDueDate || inv.dueDate < a.nextDueDate)) {
        a.nextDueDate = inv.dueDate;
      }

      aging.set(inv.customerId, a);
    }

    let rows = customers.map((c) => {
      const a = aging.get(c.id) ?? {
        current: 0, dueToday: 0, overdue: 0, nextDueDate: null,
      };
      const totalDue = balances.get(c.id) ?? 0;
      return {
        id: c.id,
        fullName: [c.firstName, c.lastName].filter(Boolean).join(' '),
        phone: c.phones[0]?.phone ?? null,
        creditLimit: c.creditLimit,
        creditDays: c.creditDays,
        totalDue,
        available: c.creditLimit > 0 ? c.creditLimit - totalDue : null,
        ...a,
      };
    });

    if (params.onlyOverdue) rows = rows.filter((r) => r.overdue > 0);

    // بدترین وضعیت اول: معوق، بعد سررسید امروز، بعد بزرگ‌ترین بدهی.
    rows.sort(
      (x, y) =>
        y.overdue - x.overdue || y.dueToday - x.dueToday || y.totalDue - x.totalDue,
    );

    return rows;
  }


  /**
   * خلاصه‌ی مطالبات برای گزارش — همان چهار عددِ بالای صفحه.
   * روی **کلِ** بدهکاران جمع می‌بندد، نه صفحه‌ی اول.
   */
  async receivablesSummary() {
    const rows = await this.debtorRows();

    return rows.reduce(
      (acc, r) => ({
        customerCount: acc.customerCount + 1,
        totalDue: acc.totalDue + r.totalDue,
        current: acc.current + r.current,
        dueToday: acc.dueToday + r.dueToday,
        overdue: acc.overdue + r.overdue,
      }),
      { customerCount: 0, totalDue: 0, current: 0, dueToday: 0, overdue: 0 },
    );
  }


  /**
   * اعلان‌ها — چیزهایی که مدیر باید بداند بدون اینکه دنبالشان بگردد.
   *
   * عمداً کم و مشخص: هر اعلانی که کسی رویش عمل نمی‌کند، بقیه را هم بی‌اثر
   * می‌کند. فعلاً فقط پول: بدهیِ معوق و چکی که دارد سررسید می‌شود.
   */
  async alerts() {
    const soon = new Date();
    soon.setDate(soon.getDate() + CHEQUE_ALERT_DAYS);

    // کلِ معوق‌ها، نه صفحه‌ی اول — شمارش و مبلغِ اعلان نباید سقف داشته باشد.
    const [rows, chequesDueSoon] = await Promise.all([
      this.debtorRows({ onlyOverdue: true }),
      this.prisma.cheque.findMany({
        where: { status: 'IN_HAND', dueDate: { lte: soon } },
        select: { id: true, number: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
        take: 20,
      }),
    ]);

    return {
      overdue: {
        customerCount: rows.length,
        amount: rows.reduce((s, r) => s + r.overdue, 0),
        top: rows.slice(0, 5).map((r) => ({
          id: r.id,
          fullName: r.fullName,
          amount: r.overdue,
        })),
      },
      cheques: {
        count: chequesDueSoon.length,
        withinDays: CHEQUE_ALERT_DAYS,
        items: chequesDueSoon,
      },
    };
  }


  /**
   * ثبت مانده‌ی اول دوره — بدهیِ مشتری از پیش از نرم‌افزار.
   *
   * بدون این، اعداد از روز اول غلط‌اند و کل سیستم بی‌اعتبار می‌شود. عمداً فقط
   * یک بار برای هر مشتری مجاز است: «اصلاح» مانده‌ی اول دوره کارِ ADJUSTMENT است
   * که رد باقی می‌گذارد، نه بازنویسیِ بی‌سروصدای یک عدد.
   */
  async setOpeningBalance(
    customerId: string,
    amount: number,
    userId?: string | null,
    note?: string | null,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException({
        error: 'CUSTOMER_NOT_FOUND',
        message: 'مشتری پیدا نشد',
      });
    }

    const existing = await this.prisma.customerLedger.findFirst({
      where: { customerId, type: LedgerEntryType.OPENING },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException({
        error: 'OPENING_BALANCE_EXISTS',
        message:
          'مانده‌ی اول دوره برای این مشتری قبلاً ثبت شده — برای اصلاح از «اصلاح حساب» استفاده کنید',
      });
    }

    return this.record(this.prisma, {
      customerId,
      type: LedgerEntryType.OPENING,
      amount,
      note: note ?? 'مانده‌ی اول دوره',
      userId,
    });
  }


  /**
   * اصلاح دستیِ حساب. دلیل اجباری است — ردیفی که دلیل ندارد، بعداً قابل دفاع نیست.
   */
  async adjust(
    customerId: string,
    amount: number,
    reason: string,
    userId?: string | null,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException({
        error: 'REASON_REQUIRED',
        message: 'برای اصلاح حساب، ذکر دلیل الزامی است',
      });
    }
    if (amount === 0) {
      throw new BadRequestException({
        error: 'AMOUNT_REQUIRED',
        message: 'مبلغ اصلاح نمی‌تواند صفر باشد',
      });
    }

    return this.record(this.prisma, {
      customerId,
      type: LedgerEntryType.ADJUSTMENT,
      amount,
      note: reason.trim(),
      userId,
    });
  }


  /**
   * بررسی سقف اعتبار — **هشدار می‌دهد، جلوی فروش را نمی‌گیرد.**
   *
   * فعلاً مدیر خودش فروشنده است؛ قفل‌کردن فروش یعنی نرم‌افزار جلوی کار را
   * بگیرد. اگر بعداً فروشنده‌ی مستقل اضافه شد، تصمیمِ «قفل یا هشدار» اینجا
   * یک‌جا عوض می‌شود.
   */
  async creditCheck(customerId: string, additionalDebt: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { creditLimit: true },
    });

    const limit = customer?.creditLimit ?? 0;
    const currentDebt = await this.balance(customerId);
    const projected = currentDebt + additionalDebt;

    // سقف صفر یعنی «تعیین نشده»، نه «اعتبار ندارد».
    const exceeded = limit > 0 && projected > limit;

    return {
      limit,
      currentDebt,
      projected,
      available: limit > 0 ? limit - currentDebt : null,
      exceeded,
      exceededBy: exceeded ? projected - limit : 0,
    };
  }
}
