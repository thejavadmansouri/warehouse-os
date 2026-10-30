// داده‌ی شخصی/پویا — بدون پیش‌ساخت
export const instant = false;

import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/server-account";
import { CustomerShell } from "@/components/customer-shell";
import { faDateTime } from "@/lib/date";
import { formatToman } from "@/lib/digits";
import { toFaDigits } from "@/lib/digits";
import { ORDER_STATUS } from "@/lib/status";
import { sweepExpired } from "@/lib/orders";

const toneClass: Record<string, string> = {
  amber: "text-brass border-brass/40 bg-brass-soft/40",
  green: "text-ledger-green border-ledger-green/30 bg-ledger-green/5",
  red: "text-alarm border-alarm/30 bg-alarm-soft",
  ink: "text-ink border-rule bg-paper",
};

export default async function OrdersPage() {
  await connection();
  const acc = await requireCustomer();

  await sweepExpired(acc.customer.id);

  const orders = await prisma.order.findMany({
    where: { customerId: acc.customer.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
    take: 50,
  });

  return (
    <CustomerShell companyName={acc.customer.companyName} wallet={acc.wallet} active="orders">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-24">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">اسناد من</h1>
            <p className="text-xs text-ink-soft mt-0.5">پیش‌فاکتورها و فاکتورها</p>
          </div>
          <Link href="/catalog" className="btn btn-ghost text-xs">
            خرید جدید
          </Link>
        </div>

        <div className="mt-4 card overflow-hidden">
          {orders.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-soft">
              هنوز سندی ندارید — از کاتالوگ شروع کنید.
            </div>
          ) : (
            <ul>
              {orders.map((o) => {
                const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.PROFORMA;

                return (
                  <li key={o.id} className="border-b border-rule/60 last:border-0">
                    <Link
                      href={`/orders/${o.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brass-soft/20 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="nums font-bold text-sm">{o.number}</p>
                        <p className="text-[11px] text-ink-soft mt-0.5">
                          {faDateTime(o.createdAt)} · {toFaDigits(o._count.items)} قلم کالا
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[11px] border rounded-[2px] px-2 py-0.5 ${toneClass[st.tone]}`}>
                          {st.label}
                        </span>
                        <span className="nums font-bold text-sm whitespace-nowrap">
                          {formatToman(o.total)} <span className="text-[10px] font-normal">ت</span>
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </CustomerShell>
  );
}
