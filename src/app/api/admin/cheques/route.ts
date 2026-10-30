import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";
import type { ChequeStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت سامانه الزامی است");
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as ChequeStatus | null;
  const customerId = searchParams.get("customerId");

  const where: any = {};
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;

  const cheques = await prisma.cheque.findMany({
    where,
    orderBy: { dueDate: "asc" },
    include: {
      customer: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          phone: true,
          creditLimitOverride: true,
        },
      },
    },
    take: 200,
  });

  return NextResponse.json({
    ok: true,
    cheques: cheques.map((c) => ({
      id: c.id,
      sayadId: c.sayadId,
      chequeNumber: c.chequeNumber,
      bankName: c.bankName,
      branchName: c.branchName,
      accountNumber: c.accountNumber,
      drawerName: c.drawerName,
      drawerNationalId: c.drawerNationalId,
      amount: Number(c.amount),
      issueDate: c.issueDate.toISOString(),
      dueDate: c.dueDate.toISOString(),
      status: c.status,
      adminNote: c.adminNote,
      sayadVerified: c.sayadVerified,
      createdAt: c.createdAt.toISOString(),
      customer: {
        id: c.customer.id,
        companyName: c.customer.companyName,
        contactName: c.customer.contactName,
        phone: c.customer.phone,
        creditLimit: Number(c.customer.creditLimitOverride ?? 0),
      },
    })),
  });
}
