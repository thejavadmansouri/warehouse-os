import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireAdminPage } from "@/lib/server-account";
import { prisma } from "@/lib/prisma";
import { InquiryAdminPricing } from "./inquiry-admin-pricing";

export const instant = false;

export default async function AdminInquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  await requireAdminPage();
  const { id } = await params;

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
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
  });

  if (!inquiry) notFound();

  const serialized = {
    id: inquiry.id,
    number: inquiry.number,
    status: inquiry.status,
    customerNote: inquiry.customerNote,
    adminNote: inquiry.adminNote,
    totalQuoted: inquiry.totalQuoted ? Number(inquiry.totalQuoted) : null,
    createdAt: inquiry.createdAt.toISOString(),
    customer: inquiry.customer,
    items: inquiry.items.map((i) => ({
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
  };

  return <InquiryAdminPricing inquiry={serialized} />;
}
