import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { walletBalance } from "@/lib/wallet";

/** کیف پول من — موجودی + دفتر تراکنش */
export async function GET(req: NextRequest) {
  const user = await currentUser(req);

  if (!user) return apiError(401, "ANON", "وارد نشده‌اید");
  if (user.role === "admin") return apiError(403, "ADMIN", "این مسیر مخصوص مشتری است");

  const [balance, transactions] = await Promise.all([
    walletBalance(user.customer.id),
    prisma.walletTransaction.findMany({
      where: { customerId: user.customer.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    balance,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      balanceAfter: Number(t.balanceAfter),
      note: t.note,
      createdAt: t.createdAt,
    })),
  });
}
