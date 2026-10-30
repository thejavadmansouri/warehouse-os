import { connection } from "next/server";
// داده‌ی پویا — بدون پیش‌ساخت
export const instant = false;

import { prisma } from "@/lib/prisma";
import { faDateTime } from "@/lib/date";
import { formatToman } from "@/lib/digits";
import { ORDER_STATUS } from "@/lib/status";
import { OrdersAdminList } from "./orders-admin-list";
import { sweepExpired } from "@/lib/orders";

export default async function AdminOrdersPage() {
  await connection();
  await sweepExpired();

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { companyName: true, phone: true } },
      _count: { select: { items: true } },
    },
    take: 100,
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="text-lg font-bold tracking-tight">اسناد</h1>
      <p className="text-xs text-ink-soft mt-0.5">تأیید خریدهای اعتباری و پیگیری پیش‌فاکتورها</p>

      <OrdersAdminList
        orders={orders.map((o) => ({
          id: o.id,
          number: o.number,
          status: o.status,
          statusLabel: (ORDER_STATUS[o.status] ?? ORDER_STATUS.PROFORMA).label,
          total: Number(o.total),
          creditAmount: Number(o.creditAmount),
          createdAtLabel: faDateTime(o.createdAt),
          itemCount: o._count.items,
          companyName: o.customer.companyName,
          phone: o.customer.phone,
        }))}
      />
    </div>
  );
}
