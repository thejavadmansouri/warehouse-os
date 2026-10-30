import { connection } from "next/server";
import { requireCustomer } from "@/lib/server-account";
import { prisma } from "@/lib/prisma";
import { CustomerShell } from "@/components/customer-shell";
import { InquiriesView } from "./inquiries-view";

export const instant = false;

export default async function InquiriesPage() {
  await connection();
  const { customer, wallet } = await requireCustomer();

  const inquiries = await prisma.inquiry.findMany({
    where: { customerId: customer.id },
    include: {
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const serialized = inquiries.map((inq) => ({
    id: inq.id,
    number: inq.number,
    status: inq.status,
    customerNote: inq.customerNote,
    adminNote: inq.adminNote,
    totalQuoted: inq.totalQuoted ? Number(inq.totalQuoted) : null,
    convertedOrderId: inq.convertedOrderId,
    createdAt: inq.createdAt.toISOString(),
    items: inq.items.map((i) => ({
      id: i.id,
      partName: i.partName,
      sku: i.sku,
      brand: i.brand,
      model: i.model,
      qty: i.qty,
      unit: i.unit,
      targetPrice: i.targetPrice ? Number(i.targetPrice) : null,
      quotedUnitPrice: i.quotedUnitPrice ? Number(i.quotedUnitPrice) : null,
      lineTotal: i.lineTotal ? Number(i.lineTotal) : null,
      adminNote: i.adminNote,
    })),
  }));

  return (
    <CustomerShell
      companyName={customer.companyName}
      wallet={wallet}
      active="inquiries"
    >
      <InquiriesView initialInquiries={serialized} />
    </CustomerShell>
  );
}
