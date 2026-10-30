import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { sweepExpired } from "@/lib/orders";

/** ادمین: لیست اسناد — همه یا بر اساس وضعیت */
export async function GET(req: NextRequest) {
  const user = await currentUser(req);

  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  await sweepExpired();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const valid = [
    "PROFORMA",
    "AWAITING_CREDIT_APPROVAL",
    "APPROVED_CREDIT",
    "PAID",
    "CANCELLED",
    "EXPIRED",
  ];

  const orders = await prisma.order.findMany({
    where: status && valid.includes(status) ? { status: status as never } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      customer: { select: { companyName: true, phone: true } },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      total: Number(o.total),
      createdAt: o.createdAt,
      companyName: o.customer.companyName,
      phone: o.customer.phone,
      itemCount: o._count.items,
      creditAmount: Number(o.creditAmount),
    })),
  });
}
