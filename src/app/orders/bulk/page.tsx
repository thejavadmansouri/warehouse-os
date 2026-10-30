import { connection } from "next/server";
import { requireCustomer } from "@/lib/server-account";
import { prisma } from "@/lib/prisma";
import { CustomerShell } from "@/components/customer-shell";
import { BulkOrderClient } from "./bulk-order-client";

export const instant = false;

export default async function BulkOrderPage() {
  await connection();
  const acc = await requireCustomer();

  const shipping = await prisma.shippingMethod.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <CustomerShell
      active="bulk-order"
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
      <BulkOrderClient
        canOrder={acc.customer.status === "ACTIVE"}
        shipping={shipping.map((s) => ({
          id: s.id,
          name: s.name,
          cost: Number(s.cost),
          freeAbove: s.freeAbove ? Number(s.freeAbove) : null,
          note: s.note,
        }))}
      />
    </CustomerShell>
  );
}
