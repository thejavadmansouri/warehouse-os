import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { walletBalance } from "@/lib/wallet";

/*
 * «حساب من» — اعتبار، کیف پول و تخفیف‌ها.
 * این endpoint تمام اعدادِ شیت خرید را تأمین می‌کند.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser(req);

  if (!user) return apiError(401, "ANON", "وارد نشده‌اید");
  if (user.role === "admin") return apiError(403, "ADMIN", "این مسیر مخصوص مشتری است");

  const { customer } = user;

  const [wallet, openCreditAgg] = await Promise.all([
    walletBalance(customer.id),
    prisma.order.aggregate({
      where: { customerId: customer.id, status: "APPROVED_CREDIT" },
      _sum: { creditAmount: true },
    }),
  ]);

  const creditLimit = customer.creditLimit;
  const openCredit = Number(openCreditAgg._sum.creditAmount ?? 0);

  return NextResponse.json({
    ok: true,
    companyName: customer.companyName,
    contactName: customer.contactName,
    phone: customer.phone,
    status: customer.status,
    tierName: customer.tierName,
    tierDiscount: customer.tierDiscount,
    customerDiscount: customer.customerDiscount,
    wallet,
    creditLimit,
    openCredit,
    availableCredit: Math.max(0, creditLimit - openCredit),
  });
}
