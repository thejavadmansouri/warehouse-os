import { connection } from "next/server";
import { requireAdminPage } from "@/lib/server-account";
import { prisma } from "@/lib/prisma";
import { InquiriesAdminList } from "./inquiries-admin-list";

export const instant = false;

export default async function AdminInquiriesPage() {
  await connection();
  await requireAdminPage();

  const inquiries = await prisma.inquiry.findMany({
    include: {
      customer: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          phone: true,
        },
      },
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
    createdAt: inq.createdAt.toISOString(),
    customer: inq.customer,
    items: inq.items.map((i) => ({
      id: i.id,
      partName: i.partName,
      brand: i.brand,
      model: i.model,
      sku: i.sku,
      qty: i.qty,
      unit: i.unit,
      targetPrice: i.targetPrice ? Number(i.targetPrice) : null,
      quotedUnitPrice: i.quotedUnitPrice ? Number(i.quotedUnitPrice) : null,
      lineTotal: i.lineTotal ? Number(i.lineTotal) : null,
    })),
  }));

  return <InquiriesAdminList initialInquiries={serialized} />;
}
