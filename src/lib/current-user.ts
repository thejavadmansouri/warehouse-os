import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";
import { readSessionToken } from "@/lib/auth-cookie";

/*
 * کاربر جاری برای API — نقش و وضعیت همیشه از DB خوانده می‌شود،
 * چون وضعیت مشتری ممکن است بعد از صدور توکن عوض شده باشد.
 */
export type CurrentUser =
  | { role: "admin"; admin: { id: string; username: string; name: string | null } }
  | {
      role: "customer";
      customer: {
        id: string;
        companyName: string;
        contactName: string;
        phone: string;
        status: string;
        tierName: string | null;
        tierDiscount: number;
        customerDiscount: number;
        creditLimit: number;
        creditLimitOverride: number | null;
      };
    };

export async function currentUser(req: NextRequest): Promise<CurrentUser | null> {
  const session = await verifySession(readSessionToken(req) ?? "");

  if (!session) return null;

  if (session.role === "admin") {
    const admin = await prisma.adminUser.findUnique({
      where: { id: session.sub },
      select: { id: true, username: true, name: true },
    });

    return admin ? { role: "admin", admin } : null;
  }

  const customer = await prisma.customer.findUnique({
    where: { id: session.sub },
    include: { tier: true },
  });

  if (!customer || customer.deletedAt) return null;

  return {
    role: "customer",
    customer: {
      id: customer.id,
      companyName: customer.companyName,
      contactName: customer.contactName,
      phone: customer.phone,
      status: customer.status,
      tierName: customer.tier?.name ?? null,
      tierDiscount: Number(customer.tier?.baseDiscount ?? 0),
      customerDiscount: Number(customer.discountPercent ?? 0),
      creditLimit: Number(customer.creditLimitOverride ?? customer.tier?.creditLimit ?? 0),
      creditLimitOverride: customer.creditLimitOverride
        ? Number(customer.creditLimitOverride)
        : null,
    },
  };
}
