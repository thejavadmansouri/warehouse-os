import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { verifySession } from "@/lib/session";
import { readSessionToken } from "@/lib/auth-cookie";
import { normalizePhone } from "@/lib/phone";
import { walletBalance } from "@/lib/wallet";
import argon2 from "argon2";

/*
 * مدیریت ۳۶۰ درجه مشتری توسط ادمین:
 *   GET   — دریافت پرونده کامل مشتری، فاکتورها، تحلیل رفتار خرید و تاریخچه سرچ
 *   PATCH — ویرایش مشخصات یا تغییر وضعیت حساب
 */
async function requireAdmin(req: NextRequest) {
  const session = await verifySession(readSessionToken(req) ?? "");
  if (!session || session.role !== "admin") return null;
  return prisma.adminUser.findUnique({ where: { id: session.sub } });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin(req))) {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  const { id } = await ctx.params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      tier: true,
      orders: {
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            include: {
              product: {
                select: { name: true, sku: true, brand: true, category: true },
              },
            },
          },
          shipment: true,
        },
      },
      cheques: {
        orderBy: { dueDate: "asc" },
      },
      searchLogs: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      rmaRequests: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) {
    return apiError(404, "NOT_FOUND", "مشتری پیدا نشد");
  }

  // ۱. محاسبات مالی کیف پول و اعتبارات
  const [wallet, openCredit] = await Promise.all([
    walletBalance(customer.id),
    prisma.order.aggregate({
      where: { customerId: customer.id, status: "APPROVED_CREDIT" },
      _sum: { creditAmount: true },
    }),
  ]);

  const creditLimit = Number(customer.creditLimitOverride ?? customer.tier?.creditLimit ?? 0);
  const usedCredit = Number(openCredit._sum.creditAmount ?? 0);
  const availableCredit = Math.max(0, creditLimit - usedCredit);

  // ۲. تحلیل نحوه و الگوی خرید همکار (Purchase Behavior Analysis)
  const paidOrApprovedOrders = customer.orders.filter(
    (o) => o.status === "PAID" || o.status === "APPROVED_CREDIT"
  );
  const totalLifetimePurchase = paidOrApprovedOrders.reduce(
    (sum, o) => sum + Number(o.total),
    0
  );
  const averageOrderValue =
    paidOrApprovedOrders.length > 0
      ? Math.round(totalLifetimePurchase / paidOrApprovedOrders.length)
      : 0;

  // محاسبه نسبت خرید اعتباری به نقدی
  let totalCreditPaid = 0;
  let totalCashPaid = 0;
  paidOrApprovedOrders.forEach((o) => {
    totalCreditPaid += Number(o.creditAmount || 0);
    totalCashPaid += Number(o.paidWallet || 0) + Number(o.paidGateway || 0);
  });
  const creditPreferenceRatio =
    totalLifetimePurchase > 0
      ? Math.round((totalCreditPaid / totalLifetimePurchase) * 100)
      : 0;

  // تحلیل قطعات پرخرید این مشتری
  const productFrequency: Record<string, { name: string; sku: string; qty: number; count: number }> = {};
  customer.orders.forEach((o) => {
    o.items.forEach((it) => {
      const key = it.productId;
      if (!productFrequency[key]) {
        productFrequency[key] = {
          name: it.product?.name || it.name,
          sku: it.product?.sku || it.sku,
          qty: 0,
          count: 0,
        };
      }
      productFrequency[key].qty += it.qty;
      productFrequency[key].count += 1;
    });
  });
  const topPurchasedProducts = Object.values(productFrequency)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);

  // ۳. تحلیل تاریخچه سرچ مشتری (Search Analytics & Keywords)
  const queryCounts: Record<string, number> = {};
  customer.searchLogs.forEach((log) => {
    const q = log.query.trim();
    if (q) {
      queryCounts[q] = (queryCounts[q] || 0) + 1;
    }
  });

  const topSearchedKeywords = Object.entries(queryCounts)
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return NextResponse.json({
    ok: true,
    customer: {
      id: customer.id,
      companyName: customer.companyName,
      contactName: customer.contactName,
      phone: customer.phone,
      username: customer.username,
      nationalId: customer.nationalId,
      address: customer.address,
      status: customer.status,
      createdAt: customer.createdAt,
      tier: customer.tier ? { id: customer.tier.id, name: customer.tier.name } : null,
      tierDiscount: Number(customer.tier?.baseDiscount ?? 0),
      discountPercent: Number(customer.discountPercent),
      creditLimitOverride: customer.creditLimitOverride ? Number(customer.creditLimitOverride) : null,
      financials: {
        wallet,
        creditLimit,
        usedCredit,
        availableCredit,
      },
      behavior: {
        totalOrdersCount: customer.orders.length,
        paidOrdersCount: paidOrApprovedOrders.length,
        totalLifetimePurchase,
        averageOrderValue,
        creditPreferenceRatio,
        topPurchasedProducts,
      },
      searchAnalytics: {
        totalSearchesLogged: customer.searchLogs.length,
        topSearchedKeywords,
        recentSearchLogs: customer.searchLogs.slice(0, 20).map((l) => ({
          id: l.id,
          query: l.query,
          category: l.category,
          brand: l.brand,
          partBrand: l.partBrand,
          resultsCount: l.resultsCount,
          createdAt: l.createdAt,
        })),
      },
      orders: customer.orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        createdAt: o.createdAt,
        total: Number(o.total),
        paidWallet: Number(o.paidWallet || 0),
        paidGateway: Number(o.paidGateway || 0),
        creditAmount: Number(o.creditAmount || 0),
        itemsCount: o.items.length,
        shipmentStatus: o.shipment?.status ?? null,
        waybillNumber: o.shipment?.waybillNumber ?? null,
        carrierName: o.shipment?.carrierName ?? null,
      })),
      cheques: customer.cheques.map((ch) => ({
        id: ch.id,
        sayadNumber: ch.sayadId,
        bankName: ch.bankName,
        amount: Number(ch.amount),
        dueDate: ch.dueDate,
        status: ch.status,
      })),
    },
  });
}

const updateSchema = z.object({
  action: z.enum(["activate", "reject", "block", "unblock"]).optional(),
  companyName: z.string().trim().min(2).optional(),
  contactName: z.string().trim().min(2).optional(),
  phone: z.string().min(10).optional(),
  username: z.string().trim().min(3).optional().nullable(),
  nationalId: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  tierId: z.string().trim().optional().nullable(),
  discountPercent: z.number().min(0).max(100).optional(),
  creditLimitOverride: z.number().min(0).optional().nullable(),
  password: z.string().min(6).optional(),
  status: z.enum(["ACTIVE", "PENDING", "BLOCKED", "REJECTED"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin(req))) {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "داده ارسالی نامعتبر است");
  }

  const input = parsed.data;

  // ۱. اگر اکشن سریع تغییر وضعیت بود
  if (input.action) {
    const statusOf: Record<string, "ACTIVE" | "REJECTED" | "BLOCKED"> = {
      activate: "ACTIVE",
      reject: "REJECTED",
      block: "BLOCKED",
      unblock: "ACTIVE",
    };

    const updated = await prisma.customer.update({
      where: { id },
      data: { status: statusOf[input.action] },
    });
    return NextResponse.json({ ok: true, status: updated.status });
  }

  // ۲. ویرایش کامل اطلاعات مشتری
  const updateData: any = {};

  if (input.companyName) updateData.companyName = input.companyName;
  if (input.contactName) updateData.contactName = input.contactName;

  if (input.phone) {
    const phone = normalizePhone(input.phone);
    if (!phone) return apiError(400, "INVALID_PHONE", "شماره موبایل نامعتبر است");
    const existing = await prisma.customer.findFirst({
      where: { phone, id: { not: id } },
    });
    if (existing) return apiError(409, "PHONE_EXISTS", "این شماره موبایل به مشتری دیگری اختصاص دارد");
    updateData.phone = phone;
  }

  if (input.username !== undefined) {
    if (input.username) {
      const existing = await prisma.customer.findFirst({
        where: { username: input.username, id: { not: id } },
      });
      if (existing) return apiError(409, "USERNAME_EXISTS", "این نام کاربری قبلاً استفاده شده است");
      updateData.username = input.username;
    } else {
      updateData.username = null;
    }
  }

  if (input.nationalId !== undefined) updateData.nationalId = input.nationalId;
  if (input.address !== undefined) updateData.address = input.address;
  if (input.tierId !== undefined) updateData.tierId = input.tierId;
  if (input.discountPercent !== undefined) updateData.discountPercent = input.discountPercent;
  if (input.creditLimitOverride !== undefined) updateData.creditLimitOverride = input.creditLimitOverride;
  if (input.status) updateData.status = input.status;

  if (input.password) {
    updateData.passwordHash = await argon2.hash(input.password);
  }

  const updatedCustomer = await prisma.customer.update({
    where: { id },
    data: updateData,
    include: { tier: true },
  });

  return NextResponse.json({
    ok: true,
    message: "مشخصات همکار با موفقیت به‌روزرسانی شد.",
    customer: {
      id: updatedCustomer.id,
      companyName: updatedCustomer.companyName,
      contactName: updatedCustomer.contactName,
      phone: updatedCustomer.phone,
      status: updatedCustomer.status,
      tier: updatedCustomer.tier?.name,
    },
  });
}
