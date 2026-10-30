import { connection } from "next/server";
// داده‌ی شخصی/پویا — بدون پیش‌ساخت
export const instant = false;

import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/server-account";
import { CustomerShell } from "@/components/customer-shell";
import { faDateTime } from "@/lib/date";
import { formatToman } from "@/lib/digits";
import { WALLET_TX_LABEL } from "@/lib/status";
import { TopupForm } from "./topup-form";

export default async function WalletPage() {
  await connection();
  const acc = await requireCustomer();

  const transactions = await prisma.walletTransaction.findMany({
    where: { customerId: acc.customer.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <CustomerShell companyName={acc.customer.companyName} wallet={acc.wallet} active="wallet">
      <div className="mx-auto w-full max-w-4xl px-3 sm:px-6 py-6 pb-24">
        <div className="pb-4 border-b border-slate-200">
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">کیف پول و اعتبار مالی</h1>
          <p className="text-xs text-slate-500 mt-0.5">مدیریت موجودی نقد، خط اعتبار ۳۰ روزه و تاریخچه تراکنش‌ها</p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_18rem]">
          {/* موجودی */}
          <div className="card p-5 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-xs text-slate-500 font-medium">موجودی نقدی قابل استفاده</span>
              <div className="nums text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1.5 flex items-baseline gap-1.5">
                <span>{formatToman(acc.wallet)}</span>
                <span className="text-sm font-normal text-slate-500">تومان</span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block mb-0.5">سقف اعتبار تخصیص‌یافته</span>
                <p className="nums font-bold text-slate-800 text-sm">{formatToman(acc.creditLimit)} ت</p>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">اعتبار آزاد برای خرید</span>
                <p className="nums font-bold text-emerald-600 text-sm">
                  {formatToman(acc.availableCredit)} ت
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">نیاز به خط اعتبار بالاتر دارید؟</span>
              <a
                href="/cheques"
                className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
              >
                <span>ثبت چک صیادی و افزایش سقف اعتبار</span>
                <span>←</span>
              </a>
            </div>
          </div>

          <TopupForm />
        </div>

        {/* دفتر تراکنش */}
        <div className="mt-8">
          <h2 className="font-extrabold text-sm sm:text-base text-slate-900 mb-3">دفتر گردش حساب و تراکنش‌ها</h2>
          <div className="card overflow-hidden bg-white border border-slate-200 rounded-xl shadow-2xs">
            {transactions.length === 0 ? (
              <p className="p-10 text-center text-xs text-slate-500">هنوز تراکنشی در این حساب ثبت نشده است.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {transactions.map((t) => {
                  const amount = Number(t.amount);
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 p-3.5 sm:px-5 sm:py-3.5 hover:bg-slate-50/60 transition-colors text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">
                          {WALLET_TX_LABEL[t.type] ?? t.type}
                          {t.note && <span className="text-slate-500 font-normal"> — {t.note}</span>}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{faDateTime(t.createdAt)}</p>
                      </div>
                      <div className="text-end shrink-0">
                        <p className={`nums font-extrabold text-sm ${amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {amount >= 0 ? "+" : "−"} {formatToman(Math.abs(amount))} ت
                        </p>
                        <p className="text-[10px] text-slate-400 nums mt-0.5">
                          مانده حساب: {formatToman(t.balanceAfter)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}
