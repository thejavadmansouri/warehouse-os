import { connection } from "next/server";
// داده‌ی پویا — بدون پیش‌ساخت
export const instant = false;

import { prisma } from "@/lib/prisma";
import { ChequesAdminView, type AdminChequeItem } from "./cheques-admin-view";

export default async function AdminChequesPage() {
  await connection();

  const cheques = await prisma.cheque.findMany({
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

  const initialCheques: AdminChequeItem[] = cheques.map((c) => ({
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
    status: c.status as any,
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
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 pb-20">
      <div className="pb-4 border-b border-slate-200">
        <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
          مدیریت چک‌های صیادی و تضامین مالی همکاران
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          استعلام اهلیت صیاد، بررسی سررسیدها، وصول اسناد و افزایش خودکار خط اعتبار مشتریان عمده
        </p>
      </div>

      <div className="mt-6">
        <ChequesAdminView initialCheques={initialCheques} />
      </div>
    </div>
  );
}
