import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت به گزارشات الزامی است");
  }

  // ۱. آمار کلی فروش و سفارشات
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["PAID", "APPROVED_CREDIT"] },
    },
    include: {
      items: true,
      shipment: { select: { destinationCity: true } },
    },
  });

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
  const totalPaidOnline = orders.reduce((sum, o) => sum + Number(o.paidGateway), 0);
  const totalPaidWallet = orders.reduce((sum, o) => sum + Number(o.paidWallet), 0);
  const totalCreditOrders = orders.reduce((sum, o) => sum + Number(o.creditAmount), 0);
  const totalOrdersCount = orders.length;
  const avgOrderValue = totalOrdersCount > 0 ? Math.round(totalRevenue / totalOrdersCount) : 0;

  // ۲. تفکیک جغرافیایی فروش بر اساس شهرستان‌های استان کرمان
  const cityRevenueMap = new Map<string, { city: string; revenue: number; orderCount: number }>();

  for (const order of orders) {
    const city = order.shipment?.destinationCity || "کرمان (نامشخص)";
    const existing = cityRevenueMap.get(city) || { city, revenue: 0, orderCount: 0 };
    existing.revenue += Number(order.total);
    existing.orderCount += 1;
    cityRevenueMap.set(city, existing);
  }

  const citySales = Array.from(cityRevenueMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((c) => ({
      city: c.city,
      revenue: c.revenue,
      orderCount: c.orderCount,
      percentage: totalRevenue > 0 ? Math.round((c.revenue / totalRevenue) * 100) : 0,
    }));

  // ۳. پرفروش‌ترین قطعات استان کرمان (Top 10 Parts)
  const productSalesMap = new Map<
    string,
    { sku: string; name: string; qty: number; revenue: number }
  >();

  for (const order of orders) {
    for (const it of order.items) {
      const existing = productSalesMap.get(it.sku) || {
        sku: it.sku,
        name: it.name,
        qty: 0,
        revenue: 0,
      };
      existing.qty += it.qty;
      existing.revenue += Number(it.lineTotal);
      productSalesMap.set(it.sku, existing);
    }
  }

  const topProducts = Array.from(productSalesMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // ۴. وضعیت چک‌های صیادی و ریسک اعتباری
  const now = new Date();
  const next30Days = new Date(Date.now() + 30 * 86400_000);

  const [
    totalSayadCheques,
    registeredSayadSum,
    clearedSayadSum,
    bouncedSayadSum,
    upcomingCheques,
    overdueOrders,
    totalRmas,
    totalRefundedRmas,
  ] = await Promise.all([
    prisma.cheque.count(),
    prisma.cheque.aggregate({
      _sum: { amount: true },
      where: { status: "REGISTERED_SAYAD" },
    }),
    prisma.cheque.aggregate({
      _sum: { amount: true },
      where: { status: "CLEARED" },
    }),
    prisma.cheque.aggregate({
      _sum: { amount: true },
      where: { status: "BOUNCED" },
    }),
    prisma.cheque.findMany({
      where: {
        status: "REGISTERED_SAYAD",
        dueDate: { gte: now, lte: next30Days },
      },
      include: {
        customer: { select: { companyName: true, phone: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.order.findMany({
      where: {
        status: "APPROVED_CREDIT",
        creditDueAt: { lt: now },
      },
      include: {
        customer: { select: { companyName: true, phone: true } },
      },
      take: 10,
    }),
    prisma.rmaRequest.count(),
    prisma.rmaRequest.count({ where: { status: "REFUNDED" } }),
  ]);

  const rmaRate = totalOrdersCount > 0 ? ((totalRmas / totalOrdersCount) * 100).toFixed(1) : "0.0";

  return NextResponse.json({
    ok: true,
    kpis: {
      totalRevenue,
      totalPaidOnline,
      totalPaidWallet,
      totalCreditOrders,
      totalOrdersCount,
      avgOrderValue,
      rmaRate: Number(rmaRate),
      totalRmas,
      totalRefundedRmas,
    },
    citySales,
    topProducts,
    creditAndCheques: {
      totalSayadCheques,
      registeredSayadAmount: Number(registeredSayadSum._sum.amount ?? 0),
      clearedSayadAmount: Number(clearedSayadSum._sum.amount ?? 0),
      bouncedSayadAmount: Number(bouncedSayadSum._sum.amount ?? 0),
      upcomingChequesCount: upcomingCheques.length,
      upcomingCheques: upcomingCheques.map((c) => ({
        id: c.id,
        sayadId: c.sayadId,
        bankName: c.bankName,
        customerName: c.customer.companyName,
        phone: c.customer.phone,
        amount: Number(c.amount),
        dueDate: c.dueDate.toISOString(),
      })),
      overdueOrdersCount: overdueOrders.length,
      overdueOrders: overdueOrders.map((o) => ({
        id: o.id,
        number: o.number,
        customerName: o.customer.companyName,
        phone: o.customer.phone,
        creditAmount: Number(o.creditAmount),
        creditDueAt: o.creditDueAt?.toISOString() || null,
      })),
    },
  });
}
