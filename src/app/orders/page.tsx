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
  amber: "text-amber-700 border-amber-200 bg-amber-50",
  green: "text-emerald-700 border-emerald-200 bg-emerald-50",
  red: "text-rose-700 border-rose-200 bg-rose-50",
  ink: "text-slate-700 border-slate-200 bg-slate-100",
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
      <div className="mx-auto w-full max-w-4xl px-3 sm:px-6 py-6 pb-24">
        {/* هدر صفحه */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">اسناد و سفارش‌های من</h1>
            <p className="text-xs text-slate-500 mt-0.5">فهرست پیش‌فاکتورهای رزرو شده و فاکتورهای رسمی پرداخت‌شده</p>
          </div>
          <Link
            href="/catalog"
            prefetch={false}
            className="btn btn-brass text-xs px-3.5 sm:px-4 py-2 font-bold shadow-xs shrink-0"
          >
            + خرید جدید از کاتالوگ
          </Link>
        </div>

        {/* لیست اسناد */}
        <div className="mt-5">
          {orders.length === 0 ? (
            <div className="card p-12 text-center text-slate-500 bg-white border border-slate-200 rounded-xl space-y-3">
              <div className="size-12 rounded-full bg-slate-100 text-slate-400 grid place-items-center mx-auto text-xl">
                📋
              </div>
              <p className="font-bold text-slate-800 text-base">هنوز سندی برای شما صادر نشده است.</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                می‌توانید قطعات مورد نیاز خود را از کاتالوگ انتخاب و پیش‌فاکتور رسمی صادر کنید.
              </p>
              <Link href="/catalog" prefetch={false} className="btn btn-brass text-xs px-5 py-2.5 inline-block">
                ورود به کاتالوگ قطعات
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => {
                const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.PROFORMA;

                return (
                  <Link
                    key={o.id}
                    href={`/orders/${o.id}`}
                    prefetch={false}
                    className="block card p-4 sm:p-5 bg-white border border-slate-200/90 hover:border-blue-400 rounded-xl shadow-2xs hover:shadow-xs transition-all group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="nums font-mono font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
                          {o.number}
                        </span>
                        <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${toneClass[st.tone]}`}>
                          {st.label}
                        </span>
                      </div>

                      <div className="text-left nums">
                        <span className="font-extrabold text-base text-slate-900">
                          {formatToman(o.total)}
                        </span>
                        <span className="text-xs text-slate-500 ms-1 font-normal">تومان</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <span>{faDateTime(o.createdAt)}</span>
                        <span>·</span>
                        <span className="nums font-medium text-slate-700">
                          {toFaDigits(o._count.items)} قلم کالا
                        </span>
                      </div>

                      <span className="text-blue-600 group-hover:underline font-bold text-[11px] flex items-center gap-1">
                        <span>مشاهده سند و پرداخت</span>
                        <span>←</span>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </CustomerShell>
  );
}
