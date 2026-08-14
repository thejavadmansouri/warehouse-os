import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../sales/ledger.service';


/**
 * منطقه‌ی زمانی گزارش‌ها.
 *
 * تاریخ‌ها UTC ذخیره می‌شوند ولی «روز» برای کاربر یعنی روز تهران. هر تجمیع
 * روزانه‌ای باید از این استفاده کند، وگرنه فروشِ بامداد روی روز قبل می‌افتد.
 */
const REPORT_TZ = process.env.REPORT_TIMEZONE ?? 'Asia/Tehran';

export interface RangeQuery {
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

function range(q: RangeQuery) {
  // پیش‌فرض «امروز» — کاربر برای گزارش روزانه نباید تاریخ انتخاب کند.
  const end = q.endDate ? new Date(q.endDate) : new Date();
  const start = q.startDate ? new Date(q.startDate) : new Date(new Date().setHours(0, 0, 0, 0));
  return { start, end };
}

function paging(q: RangeQuery) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(q.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function meta(total: number, page: number, limit: number) {
  return { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) };
}


@Injectable()
export class ReportsService {

  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
  ) {}


  /** فروش دوره‌ای — خلاصه + نمودار روزانه + فاکتورها. */
  async periodicSales(q: RangeQuery) {
    const { start, end } = range(q);
    const { page, limit, skip } = paging(q);

    const where: Prisma.SaleInvoiceWhereInput = {
      status: 'CONFIRMED',
      createdAt: { gte: start, lte: end },
    };

    const [agg, retAgg, total, invoices, chart] = await Promise.all([
      this.prisma.saleInvoice.aggregate({
        where,
        _sum: { total: true },
        _avg: { total: true },
        _count: true,
      }),
      // برگشت از فروشِ همین بازه — تا «فروشِ خالص» با واقعیت بخواند و عددِ
      // فروش با مرجوعی‌ها متورم نماند.
      this.prisma.saleReturn.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _sum: { refundAmount: true },
        _count: true,
      }),
      this.prisma.saleInvoice.count({ where }),
      this.prisma.saleInvoice.findMany({
        where,
        include: {
          customer: { select: { firstName: true, lastName: true } },
          user: { select: { fullName: true } },
          // فقط ردیف‌های فروش — وگرنه حرکت‌های RETURNِ ابطال/مرجوعی هم شمرده
          // می‌شوند و «تعداد اقلام» فاکتور بعد از هر برگشتی بزرگ‌تر می‌شود.
          _count: { select: { lines: { where: { action: 'SALE' } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      // تجمیع روزانه در خود دیتابیس — کشیدن همه‌ی ردیف‌ها به Node اشتباه است.
      //
      // مرز روز باید به وقت تهران باشد، نه UTC. تاریخ‌ها UTC ذخیره می‌شوند و
      // تهران +۳:۳۰ است؛ اگر مستقیم روی UTC گروه‌بندی کنیم، فروشِ بین نیمه‌شب
      // تا ۳:۳۰ بامداد روی ستون روز قبل می‌نشیند.
      this.prisma.$queryRaw<{ day: Date; amount: bigint; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${REPORT_TZ})
                 AS day,
               SUM("total")::bigint AS amount,
               COUNT(*)::bigint     AS count
        FROM "SaleInvoice"
        WHERE "status" = 'CONFIRMED'
          AND "createdAt" BETWEEN ${start} AND ${end}
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    const totalAmount = agg._sum.total ?? 0;
    const returnsAmount = retAgg._sum.refundAmount ?? 0;

    return {
      summary: {
        // فروشِ ناخالص (پیش از کسرِ مرجوعی) — همان عددِ قبلی، بی‌تغییر.
        totalAmount,
        // برگشت از فروش در همین بازه.
        returnsAmount,
        returnCount: retAgg._count,
        // فروشِ خالص = ناخالص − مرجوعی.
        netAmount: totalAmount - returnsAmount,
        invoiceCount: agg._count,
        averageInvoiceAmount: Math.round(agg._avg.total ?? 0),
      },
      // برچسب شمسی سمت کلاینت ساخته می‌شود؛ سرور تاریخ خام می‌دهد.
      chartData: chart.map((r) => ({
        date: r.day.toISOString(),
        amount: Number(r.amount),
        count: Number(r.count),
      })),
      invoices: {
        data: invoices.map((i) => ({
          id: i.id,
          number: i.number,
          createdAt: i.createdAt,
          customerName: i.customer
            ? [i.customer.firstName, i.customer.lastName].filter(Boolean).join(' ')
            : null,
          sellerName: i.user?.fullName ?? null,
          amount: i.total,
          itemCount: i._count.lines,
        })),
        meta: meta(total, page, limit),
      },
    };
  }


  /**
   * سود دوره‌ای.
   *
   * سود کل از `SaleInvoice.profit` می‌آید که در لحظه‌ی فروش ذخیره شده — نه
   * محاسبه‌ی دوباره با قیمت خرید امروز، که عدد را غلط می‌کند.
   *
   * تفکیک به‌ازای کالا ناچار از آخرین قیمت خرید استفاده می‌کند (لجر قیمت خرید
   * لحظه‌ی فروش را به‌ازای ردیف نگه نمی‌دارد)، پس تقریبی است. `costIsApproximate`
   * این را صریح اعلام می‌کند تا کسی عدد را قطعی نگیرد.
   */
  async periodicProfit(q: RangeQuery) {
    const { start, end } = range(q);
    const { page, limit, skip } = paging(q);

    const agg = await this.prisma.saleInvoice.aggregate({
      where: { status: 'CONFIRMED', createdAt: { gte: start, lte: end } },
      _sum: { total: true, profit: true },
    });

    const rows = await this.prisma.$queryRaw<
      {
        productId: string;
        productName: string;
        sku: string;
        quantitySold: bigint;
        revenue: bigint;
        cost: bigint;
      }[]
    >`
      SELECT p."id"                                        AS "productId",
             p."name"                                      AS "productName",
             p."sku"                                       AS "sku",
             SUM(l."quantity")::bigint                     AS "quantitySold",
             SUM(l."quantity" * COALESCE(l."unitPrice",0))::bigint AS "revenue",
             SUM(l."quantity" * COALESCE(pp."purchasePrice",0))::bigint AS "cost"
      FROM "InventoryLog" l
      JOIN "SaleInvoice" si ON si."id" = l."invoiceId" AND si."status" = 'CONFIRMED'
      JOIN "Product" p ON p."id" = l."productId"
      LEFT JOIN LATERAL (
        SELECT "purchasePrice" FROM "ProductPrice"
        WHERE "productId" = p."id" AND "purchasePrice" IS NOT NULL
        ORDER BY "createdAt" DESC LIMIT 1
      ) pp ON TRUE
      WHERE l."action" = 'SALE'
        AND l."createdAt" BETWEEN ${start} AND ${end}
      GROUP BY p."id", p."name", p."sku"
      ORDER BY (SUM(l."quantity" * COALESCE(l."unitPrice",0))
                - SUM(l."quantity" * COALESCE(pp."purchasePrice",0))) DESC
      OFFSET ${skip} LIMIT ${limit}
    `;

    const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT l."productId")::bigint AS count
      FROM "InventoryLog" l
      JOIN "SaleInvoice" si ON si."id" = l."invoiceId" AND si."status" = 'CONFIRMED'
      WHERE l."action" = 'SALE' AND l."createdAt" BETWEEN ${start} AND ${end}
    `;

    const totalRevenue = agg._sum.total ?? 0;
    const grossProfit = agg._sum.profit ?? 0;

    return {
      summary: {
        totalRevenue,
        totalCost: totalRevenue - grossProfit,
        grossProfit,
        profitMarginPercent:
          totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(2)) : 0,
      },
      costIsApproximate: true,
      items: {
        data: rows.map((r) => {
          const revenue = Number(r.revenue);
          const cost = Number(r.cost);
          return {
            productId: r.productId,
            productName: r.productName,
            sku: r.sku,
            quantitySold: Number(r.quantitySold),
            totalRevenue: revenue,
            totalCost: cost,
            profit: revenue - cost,
            marginPercent: revenue > 0 ? Number((((revenue - cost) / revenue) * 100).toFixed(1)) : 0,
          };
        }),
        meta: meta(Number(count), page, limit),
      },
    };
  }


  /**
   * بدهکاران.
   *
   * ⚠️ «روزهای تأخیر» برگردانده نمی‌شود چون فاکتور تاریخ سررسید ندارد؛ ساختنش
   * یعنی عدد ساختگی. به‌جایش تاریخ آخرین فاکتور نسیه داده می‌شود.
   */
  /**
   * بدهکاران.
   *
   * محاسبه‌ی مستقلِ قبلی (جمعِ `SaleInvoice.dueAmount`) برداشته شد: مانده‌ی اول
   * دوره، برگشت از فروش و چک برگشتی را نمی‌دید، پس این گزارش از امروز با
   * صفحه‌ی مشتری اختلاف پیدا می‌کرد. حالا هر دو از یک فرمولِ دفتر می‌خورند.
   */
  async debtors(q: RangeQuery) {
    const { page, limit } = paging(q);

    const [rows, summary] = await Promise.all([
      this.ledger.debtors({ page, limit }),
      this.ledger.receivablesSummary(),
    ]);

    return {
      summary: {
        totalDebtors: summary.customerCount,
        totalCreditBalance: summary.totalDue,
        current: summary.current,
        dueToday: summary.dueToday,
        overdue: summary.overdue,
      },
      debtors: {
        data: rows.data.map((r) => ({
          customerId: r.id,
          customerName: r.fullName,
          phone: r.phone,
          creditBalance: r.totalDue,
          current: r.current,
          dueToday: r.dueToday,
          overdue: r.overdue,
          nextDueDate: r.nextDueDate,
          creditLimit: r.creditLimit,
        })),
        meta: meta(rows.meta.total, page, limit),
      },
    };
  }


  /** چک‌ها. فیلتر UI به وضعیت‌های واقعی مدل نگاشت می‌شود. */
  async cheques(q: RangeQuery & { status?: string }) {
    const { page, limit, skip } = paging(q);

    const where: Prisma.ChequeWhereInput =
      q.status === 'CASHED'
        ? { status: 'CASHED' }
        : q.status === 'BOUNCED'
          ? { status: 'BOUNCED' }
          : { status: { in: ['IN_HAND', 'DEPOSITED'] } }; // سررسید پیش‌رو

    const [rows, total, fromPayments, fromReceipts] = await Promise.all([
      this.prisma.cheque.findMany({
        where,
        include: {
          // چک یا بابت فاکتور است یا بابت تسویه‌ی بدهی قبلی — هر دو باید
          // در این گزارش دیده شوند، وگرنه چک‌های تسویه نامرئی می‌مانند.
          payment: {
            select: {
              amount: true,
              invoice: {
                select: {
                  number: true,
                  customer: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
          receipt: {
            select: {
              number: true,
              amount: true,
              customer: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { dueDate: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.cheque.count({ where }),
      this.prisma.payment.aggregate({
        where: { cheque: { is: where } },
        _sum: { amount: true },
      }),
      this.prisma.receipt.aggregate({
        where: { cheque: { is: where } },
        _sum: { amount: true },
      }),
    ]);

    const fullName = (c?: { firstName: string; lastName: string | null } | null) =>
      c ? [c.firstName, c.lastName].filter(Boolean).join(' ') : null;

    return {
      summary: {
        totalCount: total,
        totalAmount: (fromPayments._sum.amount ?? 0) + (fromReceipts._sum.amount ?? 0),
      },
      cheques: {
        data: rows.map((c) => ({
          id: c.id,
          number: c.number,
          bankName: c.bankName,
          holderName:
            c.holderName ??
            fullName(c.payment?.invoice.customer) ??
            fullName(c.receipt?.customer),
          amount: c.payment?.amount ?? c.receipt?.amount ?? 0,
          dueDate: c.dueDate,
          status: c.status,
          /** منبع چک: فروش یا تسویه‌ی بدهی. */
          source: c.payment ? 'INVOICE' : 'RECEIPT',
          invoiceNumber: c.payment?.invoice.number ?? null,
          receiptNumber: c.receipt?.number ?? null,
        })),
        meta: meta(total, page, limit),
      },
    };
  }


  /** پرفروش‌ها و راکدها. */
  async productPerformance(q: RangeQuery & { type?: string }) {
    const { start, end } = range(q);
    const { page, limit, skip } = paging(q);

    if (q.type === 'STAGNANT') {
      // کالاهایی که موجودی دارند ولی در این بازه هیچ فروشی نداشته‌اند.
      const rows = await this.prisma.$queryRaw<
        { productId: string; productName: string; sku: string; stock: bigint; lastSoldAt: Date | null }[]
      >`
        SELECT p."id" AS "productId", p."name" AS "productName", p."sku",
               SUM(i."quantity")::bigint AS "stock",
               (SELECT MAX(l2."createdAt") FROM "InventoryLog" l2
                 WHERE l2."productId" = p."id" AND l2."action" = 'SALE') AS "lastSoldAt"
        FROM "Product" p
        JOIN "Inventory" i ON i."productId" = p."id"
        WHERE p."deletedAt" IS NULL
        GROUP BY p."id", p."name", p."sku"
        HAVING SUM(i."quantity") > 0
           AND NOT EXISTS (
             SELECT 1 FROM "InventoryLog" l
             WHERE l."productId" = p."id" AND l."action" = 'SALE'
               AND l."createdAt" BETWEEN ${start} AND ${end}
           )
        ORDER BY SUM(i."quantity") DESC
        OFFSET ${skip} LIMIT ${limit}
      `;

      // شمارشِ کل، جدا از صفحه. قبلاً `rows.length` بود — یعنی تعدادِ همین صفحه،
      // پس lastPage همیشه ۱ می‌شد و صفحه‌ی دوم از UI قابل رفتن نبود.
      const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT p."id"
          FROM "Product" p
          JOIN "Inventory" i ON i."productId" = p."id"
          WHERE p."deletedAt" IS NULL
          GROUP BY p."id"
          HAVING SUM(i."quantity") > 0
             AND NOT EXISTS (
               SELECT 1 FROM "InventoryLog" l
               WHERE l."productId" = p."id" AND l."action" = 'SALE'
                 AND l."createdAt" BETWEEN ${start} AND ${end}
             )
        ) t
      `;

      return {
        products: {
          data: rows.map((r) => ({
            productId: r.productId,
            productName: r.productName,
            sku: r.sku,
            currentStock: Number(r.stock),
            quantitySold: 0,
            totalSalesAmount: 0,
            lastSoldAt: r.lastSoldAt,
          })),
          meta: meta(Number(count), page, limit),
        },
      };
    }

    const rows = await this.prisma.$queryRaw<
      {
        productId: string;
        productName: string;
        sku: string;
        sold: bigint;
        amount: bigint;
        stock: bigint;
        lastSoldAt: Date;
      }[]
    >`
      SELECT p."id" AS "productId", p."name" AS "productName", p."sku",
             SUM(l."quantity")::bigint AS "sold",
             SUM(l."quantity" * COALESCE(l."unitPrice",0))::bigint AS "amount",
             COALESCE((SELECT SUM(i."quantity") FROM "Inventory" i
                        WHERE i."productId" = p."id"),0)::bigint AS "stock",
             MAX(l."createdAt") AS "lastSoldAt"
      FROM "InventoryLog" l
      JOIN "Product" p ON p."id" = l."productId"
      WHERE l."action" = 'SALE' AND l."createdAt" BETWEEN ${start} AND ${end}
      GROUP BY p."id", p."name", p."sku"
      ORDER BY SUM(l."quantity") DESC
      OFFSET ${skip} LIMIT ${limit}
    `;

    const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "productId")::bigint AS count FROM "InventoryLog"
      WHERE "action" = 'SALE' AND "createdAt" BETWEEN ${start} AND ${end}
    `;

    return {
      products: {
        data: rows.map((r) => ({
          productId: r.productId,
          productName: r.productName,
          sku: r.sku,
          currentStock: Number(r.stock),
          quantitySold: Number(r.sold),
          totalSalesAmount: Number(r.amount),
          lastSoldAt: r.lastSoldAt,
        })),
        meta: meta(Number(count), page, limit),
      },
    };
  }


  /** موجودی زیر حد — بر اساس Product.minStock (فیلد واقعی مدل). */
  async lowStock(q: RangeQuery) {
    const { page, limit, skip } = paging(q);

    const rows = await this.prisma.$queryRaw<
      { productId: string; productName: string; sku: string; stock: bigint; minStock: number }[]
    >`
      SELECT p."id" AS "productId", p."name" AS "productName", p."sku",
             COALESCE(SUM(i."quantity"),0)::bigint AS "stock",
             p."minStock"
      FROM "Product" p
      LEFT JOIN "Inventory" i ON i."productId" = p."id"
      WHERE p."deletedAt" IS NULL AND p."minStock" > 0
      GROUP BY p."id", p."name", p."sku", p."minStock"
      HAVING COALESCE(SUM(i."quantity"),0) < p."minStock"
      ORDER BY (COALESCE(SUM(i."quantity"),0) - p."minStock") ASC
      OFFSET ${skip} LIMIT ${limit}
    `;

    const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT p."id" FROM "Product" p
        LEFT JOIN "Inventory" i ON i."productId" = p."id"
        WHERE p."deletedAt" IS NULL AND p."minStock" > 0
        GROUP BY p."id", p."minStock"
        HAVING COALESCE(SUM(i."quantity"),0) < p."minStock"
      ) t
    `;

    return {
      summary: { totalLowStockItems: Number(count) },
      items: {
        data: rows.map((r) => ({
          productId: r.productId,
          productName: r.productName,
          sku: r.sku,
          currentStock: Number(r.stock),
          minStock: r.minStock,
          shortage: r.minStock - Number(r.stock),
        })),
        meta: meta(Number(count), page, limit),
      },
    };
  }


  /**
   * عملکرد فروشنده.
   *
   * مرجوعی به فروشنده‌ی **فاکتور اصلی** نسبت داده می‌شود، نه به کسی که سندِ
   * مرجوعی را زده — چون معیارِ عملکرد این است که فروشِ خودِ او چقدر برگشت خورده.
   */
  async sellerPerformance(q: RangeQuery) {
    const { start, end } = range(q);
    const { page, limit, skip } = paging(q);

    const rows = await this.prisma.$queryRaw<
      {
        sellerId: string;
        sellerName: string;
        invoices: bigint;
        amount: bigint;
        profit: bigint;
        cancelled: bigint;
        returnsAmount: bigint;
        returnsCount: bigint;
      }[]
    >`
      SELECT u."id" AS "sellerId", u."fullName" AS "sellerName",
             COUNT(*) FILTER (WHERE si."status" = 'CONFIRMED')::bigint AS "invoices",
             COALESCE(SUM(si."total")  FILTER (WHERE si."status" = 'CONFIRMED'),0)::bigint AS "amount",
             COALESCE(SUM(si."profit") FILTER (WHERE si."status" = 'CONFIRMED'),0)::bigint AS "profit",
             COUNT(*) FILTER (WHERE si."status" = 'CANCELLED')::bigint AS "cancelled",
             COALESCE((
               SELECT SUM(sr."refundAmount") FROM "SaleReturn" sr
               JOIN "SaleInvoice" si2 ON si2."id" = sr."invoiceId"
               WHERE si2."userId" = u."id" AND sr."createdAt" BETWEEN ${start} AND ${end}
             ),0)::bigint AS "returnsAmount",
             COALESCE((
               SELECT COUNT(*) FROM "SaleReturn" sr
               JOIN "SaleInvoice" si2 ON si2."id" = sr."invoiceId"
               WHERE si2."userId" = u."id" AND sr."createdAt" BETWEEN ${start} AND ${end}
             ),0)::bigint AS "returnsCount"
      FROM "SaleInvoice" si
      JOIN "User" u ON u."id" = si."userId"
      WHERE si."createdAt" BETWEEN ${start} AND ${end}
      GROUP BY u."id", u."fullName"
      ORDER BY 4 DESC
      OFFSET ${skip} LIMIT ${limit}
    `;

    // تعدادِ کلِ فروشنده‌های این بازه — قبلاً `rows.length` بود، یعنی تعدادِ
    // همین صفحه، و صفحه‌ی دوم هیچ‌وقت در دسترس نبود.
    const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT si."userId")::bigint AS count
      FROM "SaleInvoice" si
      WHERE si."userId" IS NOT NULL
        AND si."createdAt" BETWEEN ${start} AND ${end}
    `;

    return {
      sellers: {
        data: rows.map((r) => {
          const invoices = Number(r.invoices);
          const amount = Number(r.amount);
          return {
            sellerId: r.sellerId,
            sellerName: r.sellerName,
            totalInvoices: invoices,
            totalSalesAmount: amount,
            totalProfit: Number(r.profit),
            averageInvoiceAmount: invoices > 0 ? Math.round(amount / invoices) : 0,
            cancelledInvoicesCount: Number(r.cancelled),
            returnsAmount: Number(r.returnsAmount),
            returnsCount: Number(r.returnsCount),
          };
        }),
        meta: meta(Number(count), page, limit),
      },
    };
  }


  /**
   * سهم هر دسته‌ی مشتری از فروش.
   *
   * مشتریِ بی‌دسته در سطل «بدون دسته» می‌افتد تا سهم‌ها با هم روی ۱۰۰٪ بسته
   * شوند — ناپیدا کردن آن یعنی مدیر فکر کند داده گم شده.
   */
  async salesByCategory(q: RangeQuery) {
    const { start, end } = range(q);

    const rows = await this.prisma.$queryRaw<
      {
        categoryId: string | null;
        categoryName: string | null;
        color: string | null;
        amount: bigint;
        profit: bigint;
        invoiceCount: bigint;
      }[]
    >`
      SELECT cc."id"   AS "categoryId",
             cc."name" AS "categoryName",
             cc."color" AS "color",
             COALESCE(SUM(si."total"), 0)::bigint  AS "amount",
             COALESCE(SUM(si."profit"), 0)::bigint AS "profit",
             COUNT(*)::bigint                        AS "invoiceCount"
      FROM "SaleInvoice" si
      LEFT JOIN "Customer" c ON c."id" = si."customerId"
      LEFT JOIN "CustomerCategory" cc ON cc."id" = c."categoryId"
      WHERE si."status" = 'CONFIRMED'
        AND si."createdAt" BETWEEN ${start} AND ${end}
      GROUP BY cc."id", cc."name", cc."color"
      ORDER BY 4 DESC
    `;

    const totalSales = rows.reduce((a, r) => a + Number(r.amount), 0);

    const categories = rows.map((r) => {
      const amount = Number(r.amount);
      const invoiceCount = Number(r.invoiceCount);
      return {
        categoryId: r.categoryId,
        categoryName: r.categoryName ?? 'بدون دسته',
        color: r.color ?? '#94a3b8',
        totalAmount: amount,
        totalProfit: Number(r.profit),
        invoiceCount,
        sharePercent: totalSales > 0 ? Number(((amount / totalSales) * 100).toFixed(1)) : 0,
        averageInvoiceAmount: invoiceCount > 0 ? Math.round(amount / invoiceCount) : 0,
      };
    });

    const categorized = categories.filter((c) => c.categoryId !== null);
    const uncategorized = categories.find((c) => c.categoryId === null);

    return {
      summary: {
        totalSales,
        categorizedSales: categorized.reduce((a, c) => a + c.totalAmount, 0),
        uncategorizedSales: uncategorized?.totalAmount ?? 0,
        categoryCount: categorized.length,
        topCategory: categories[0]
          ? { name: categories[0].categoryName, amount: categories[0].totalAmount }
          : null,
      },
      categories,
    };
  }
}
