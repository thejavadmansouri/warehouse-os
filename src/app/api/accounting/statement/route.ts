import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return apiError(401, "ANON", "وارد نشده‌اید");
  if (user.role !== "customer") return apiError(403, "CUSTOMER_ONLY", "مسیر مخصوص مشتریان تجاری است");

  const customerId = user.customer.id;
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "90"; // 30, 90, 365, all

  let fromDate: Date | undefined;
  const now = new Date();
  if (period === "30") {
    fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (period === "90") {
    fromDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  } else if (period === "365") {
    fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }

  const [customer, orders, walletTxs, cheques] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      include: { tier: true },
    }),
    prisma.order.findMany({
      where: {
        customerId,
        status: { in: ["PAID", "APPROVED_CREDIT", "PROFORMA", "AWAITING_CREDIT_APPROVAL"] },
        ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        number: true,
        total: true,
        status: true,
        createdAt: true,
        shipping: { select: { name: true } },
      },
    }),
    prisma.walletTransaction.findMany({
      where: {
        customerId,
        ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.cheque.findMany({
      where: {
        customerId,
        status: { in: ["RECEIVED", "REGISTERED_SAYAD"] },
      },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  if (!customer) return apiError(404, "NOT_FOUND", "مشتری یافت نشد");

  // ساخت ردیف‌های ترکیبی معین حساب
  interface StatementRow {
    date: Date;
    docNumber: string;
    description: string;
    debit: number; // بدهکار (خرید قطعه / افزایش بدهی)
    credit: number; // بستانکار (پرداخت / تسویه / چک / شارژ)
    balanceAfter?: number;
  }

  const rows: StatementRow[] = [];

  for (const o of orders) {
    rows.push({
      date: o.createdAt,
      docNumber: o.number,
      description: `فاکتور فروش قطعات یدکی — ارسال: ${o.shipping?.name || "انبار مرکزی کرمان"}`,
      debit: Number(o.total),
      credit: 0,
    });
  }

  for (const w of walletTxs) {
    const amount = Number(w.amount);
    if (amount > 0) {
      rows.push({
        date: w.createdAt,
        docNumber: w.refId || "TX-DEPOSIT",
        description: w.note || (w.type === "REFUND" ? "عودت وجه مرجوعی کالا به کیف پول" : "شارژ / افزایش بستانکاری کیف پول"),
        debit: 0,
        credit: amount,
      });
    }
  }

  // مرتب‌سازی زمانی
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  // محاسبه مانده ردیف‌به‌ردیف
  let runningBalance = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  for (const r of rows) {
    totalDebit += r.debit;
    totalCredit += r.credit;
    runningBalance += r.debit - r.credit;
    r.balanceAfter = runningBalance;
  }

  // چک‌های در جریان
  const inClearingChequesTotal = cheques.reduce((acc, c) => acc + Number(c.amount), 0);

  return NextResponse.json({
    ok: true,
    companyInfo: {
      name: "شرکت بازرگانی کاردو قطعه پیشرو دیار کریمان (سهامی خاص)",
      regNumber: "۱۸۹۵۲ - ثبت کرمان",
      nationalId: "۱۴۰۰۹۸۷۴۱۲۵",
      economicCode: "۴۱۱۶۸۷۹۳۴۵۲۱",
      address: "کرمان، بلوار جمهوری اسلامی، تقاطع آزادی، مجتمع بازرگانی کاردو",
      warehouseAddress: "کرمان، شهرک صنعتی شماره ۱، فاز قطعات یدکی، سوله مرکزی ۴",
      phone: "۰۳۴-۳۳۲۰۰۰۰۰",
      postalCode: "۷۶۱۸۸-۴۵۹۱۱",
    },
    customerInfo: {
      companyName: customer.companyName,
      contactName: customer.contactName,
      phone: customer.phone,
      nationalId: customer.nationalId || "ثبت‌نشده",
      address: customer.address || "استان کرمان",
      tier: customer.tier?.name || "برنزی",
    },
    summary: {
      totalDebit,
      totalCredit,
      netBalance: runningBalance, // مثبت = بدهکار به کاردو، منفی = بستانکار
      inClearingChequesCount: cheques.length,
      inClearingChequesTotal,
      activeWallet: Number(customer.creditLimitOverride || 0),
    },
    rows: rows.map((r) => ({
      date: r.date.toISOString(),
      docNumber: r.docNumber,
      description: r.description,
      debit: r.debit,
      credit: r.credit,
      balanceAfter: r.balanceAfter,
    })),
  });
}
