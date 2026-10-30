import { connection } from "next/server";
// داده‌ی پویا — بدون پیش‌ساخت
export const instant = false;

import { prisma } from "@/lib/prisma";
import { formatToman, toFaDigits } from "@/lib/digits";
import { walletBalance } from "@/lib/wallet";
import { WalletAdminPanel } from "./wallet-admin-panel";

export default async function AdminWalletPage() {
  await connection();
  const customers = await prisma.customer.findMany({
    where: { deletedAt: null },
    orderBy: { companyName: "asc" },
    select: { id: true, companyName: true, phone: true, status: true },
    take: 300,
  });

  const balances = await Promise.all(
    customers.map(async (c) => ({ id: c.id, balance: await walletBalance(c.id) })),
  );

  const balanceById = new Map(balances.map((b) => [b.id, b.balance]));
  const total = balances.reduce((sum, b) => sum + Math.max(0, b.balance), 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-16">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold tracking-tight">کیف پول مشتریان</h1>
          <p className="text-xs text-ink-soft mt-0.5">
            شارژ دستی (تسویه نقدی/چک) و اصلاح موجودی — هر تراکنش در دفتر ثبت می‌شود
          </p>
        </div>
        <div className="text-end">
          <p className="label">مجموع موجودی</p>
          <p className="nums font-bold">{formatToman(total)} تومان</p>
        </div>
      </div>

      <WalletAdminPanel
        customers={customers.map((c) => ({
          id: c.id,
          companyName: c.companyName,
          phone: c.phone,
          status: c.status,
          balance: balanceById.get(c.id) ?? 0,
          balanceLabel: formatToman(balanceById.get(c.id) ?? 0),
        }))}
      />

      <p className="mt-4 text-[11px] text-ink-soft">
        {toFaDigits(customers.length)} مشتری — مبلغ منفی برای اصلاح/کسر موجودی استفاده می‌شود.
      </p>
    </div>
  );
}
