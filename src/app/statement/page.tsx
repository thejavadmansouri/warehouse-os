import { connection } from "next/server";
import { requireCustomer } from "@/lib/server-account";
import { CustomerShell } from "@/components/customer-shell";
import { StatementClient } from "./statement-client";

export const instant = false;

export default async function StatementPage() {
  await connection();
  const acc = await requireCustomer();

  return (
    <CustomerShell
      active="statement"
      companyName={acc.customer.companyName}
      contactName={acc.customer.contactName}
      phone={acc.customer.phone}
      wallet={acc.wallet}
      availableCredit={acc.availableCredit}
      creditLimit={acc.creditLimit}
      tierName={acc.customer.tier?.name}
      tierDiscount={acc.tierDiscount}
      customerDiscount={acc.customerDiscount}
    >
      <StatementClient />
    </CustomerShell>
  );
}
