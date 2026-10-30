import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { walletBalance } from "@/lib/wallet";

/*
 * نشست مشتری برای Server Components — همیشه از DB.
 * اگر نشست نباشد یا حساب پاک شده باشد → /login
 */
export async function requireCustomer() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token ?? "");

  if (!session || session.role !== "customer") redirect("/login?next=/catalog");

  const customer = await prisma.customer.findUnique({
    where: { id: session.sub },
    include: { tier: true },
  });

  if (!customer || customer.deletedAt) redirect("/login");

  const [wallet, openCredit] = await Promise.all([
    walletBalance(customer.id),
    prisma.order.aggregate({
      where: { customerId: customer.id, status: "APPROVED_CREDIT" },
      _sum: { creditAmount: true },
    }),
  ]);

  const creditLimit = Number(customer.creditLimitOverride ?? customer.tier?.creditLimit ?? 0);
  const usedCredit = Number(openCredit._sum.creditAmount ?? 0);

  return {
    customer,
    wallet,
    creditLimit,
    usedCredit,
    availableCredit: Math.max(0, creditLimit - usedCredit),
    tierDiscount: Number(customer.tier?.baseDiscount ?? 0),
    customerDiscount: Number(customer.discountPercent ?? 0),
  };
}

export async function requireAdminPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token ?? "");

  if (!session || session.role !== "admin") redirect("/login?next=/admin");

  const admin = await prisma.adminUser.findUnique({ where: { id: session.sub } });

  if (!admin) redirect("/login");

  return admin;
}
