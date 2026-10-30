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
      <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-24">
        <h1 className="text-lg font-bold tracking-tight">کیف پول</h1>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_16rem]">
          {/* موجودی */}
          <div className="card p-5 flex flex-col justify-between">
            <div>
              <p className="label">موجودی قابل استفاده</p>
              <p className="nums text-3xl font-bold mt-1">
                {formatToman(acc.wallet)} <span className="text-sm font-normal">تومان</span>
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="label">سقف اعتبار</p>
                <p className="nums font-bold mt-0.5">{formatToman(acc.creditLimit)}</p>
              </div>
              <div>
                <p className="label">اعتبار قابل استفاده</p>
                <p className="nums font-bold mt-0.5 text-ledger-green">
                  {formatToman(acc.availableCredit)}
                </p>
              </div>
            </div>
          </div>

          <TopupForm />
        </div>

        {/* دفتر تراکنش */}
        <div className="mt-6">
          <h2 className="font-bold text-sm mb-2">دفتر تراکنش‌ها</h2>
          <div className="card overflow-hidden">
            {transactions.length === 0 ? (
              <p className="p-8 text-center text-sm text-ink-soft">هنوز تراکنشی ندارید.</p>
            ) : (
              <ul>
                {transactions.map((t) => {
                  const amount = Number(t.amount);
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-rule/60 last:border-0 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {WALLET_TX_LABEL[t.type] ?? t.type}
                          {t.note && <span className="text-[11px] text-ink-soft"> — {t.note}</span>}
                        </p>
                        <p className="text-[11px] text-ink-soft mt-0.5">{faDateTime(t.createdAt)}</p>
                      </div>
                      <div className="text-end shrink-0">
                        <p className={`nums font-bold ${amount >= 0 ? "text-ledger-green" : "text-alarm"}`}>
                          {amount >= 0 ? "+" : "−"} {formatToman(Math.abs(amount))}
                        </p>
                        <p className="text-[10px] text-ink-soft nums">
                          مانده: {formatToman(t.balanceAfter)}
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
