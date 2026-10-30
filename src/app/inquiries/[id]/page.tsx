import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireCustomer } from "@/lib/server-account";
import { prisma } from "@/lib/prisma";
import { CustomerShell } from "@/components/customer-shell";
import { InquiryDetail } from "./inquiry-detail";

export const instant = false;

export default async function InquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const acc = await requireCustomer();
  const { customer, wallet } = acc;
  const { id } = await params;

  const [inquiry, shippingMethods] = await Promise.all([
    prisma.inquiry.findFirst({
      where: { id, customerId: customer.id },
      include: { items: true },
    }),
    prisma.shippingMethod.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!inquiry) notFound();

  const serialized = {
    id: inquiry.id,
    number: inquiry.number,
    status: inquiry.status,
    customerNote: inquiry.customerNote,
    adminNote: inquiry.adminNote,
    totalQuoted: inquiry.totalQuoted ? Number(inquiry.totalQuoted) : null,
    convertedOrderId: inquiry.convertedOrderId,
    createdAt: inquiry.createdAt.toISOString(),
    items: inquiry.items.map((i) => ({
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
  };

  const formattedShipping = shippingMethods.map((s) => ({
    id: s.id,
    name: s.name,
    cost: Number(s.cost),
    freeAbove: s.freeAbove ? Number(s.freeAbove) : null,
    note: s.note,
  }));

  return (
    <CustomerShell
      companyName={customer.companyName}
      contactName={customer.contactName}
      phone={customer.phone}
      tierName={customer.tier?.name}
      tierDiscount={acc.tierDiscount}
      wallet={wallet}
      availableCredit={acc.availableCredit}
      active="inquiries"
    >
      <InquiryDetail inquiry={serialized} shippingMethods={formattedShipping} />
    </CustomerShell>
  );
}
