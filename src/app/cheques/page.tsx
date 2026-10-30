import { connection } from "next/server";
// داده‌ی شخصی/پویا — بدون پیش‌ساخت
export const instant = false;

import { requireCustomer } from "@/lib/server-account";
import { CustomerShell } from "@/components/customer-shell";
import { getActiveChequesSummary } from "@/lib/cheques";
import { ChequesView, type ChequeItem } from "./cheques-view";

export default async function CustomerChequesPage() {
  await connection();
  const acc = await requireCustomer();

  const summary = await getActiveChequesSummary(acc.customer.id);

  const initialCheques: ChequeItem[] = summary.cheques.map((c) => ({
    id: c.id,
    sayadId: c.sayadId,
    chequeNumber: c.chequeNumber,
    bankName: c.bankName,
    branchName: c.branchName,
    drawerName: c.drawerName,
    amount: Number(c.amount),
    issueDate: c.issueDate.toISOString(),
    dueDate: c.dueDate.toISOString(),
    status: c.status as any,
    adminNote: c.adminNote,
    sayadVerified: c.sayadVerified,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <CustomerShell
      companyName={acc.customer.companyName}
      contactName={acc.customer.contactName}
      phone={acc.customer.phone}
      tierName={acc.customer.tier?.name}
      tierDiscount={acc.tierDiscount}
      wallet={acc.wallet}
      availableCredit={acc.availableCredit}
      active="cheques"
    >
      <div className="mx-auto w-full max-w-4xl px-3 sm:px-6 py-6 pb-24">
        <ChequesView
          initialCheques={initialCheques}
          initialSummary={{
            activeRegisteredAmount: summary.activeRegisteredAmount,
            pendingAmount: summary.pendingAmount,
            clearedAmount: summary.clearedAmount,
            hasBounced: summary.hasBounced,
          }}
        />
      </div>
    </CustomerShell>
  );
}
