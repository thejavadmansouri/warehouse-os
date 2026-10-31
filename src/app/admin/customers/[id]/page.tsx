export const instant = false;

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server-account";
import { CustomerProfileView } from "./customer-profile-view";

export const metadata = {
  title: "پروفایل ۳۶۰ درجه مشتری و تحلیل CRM | کاردو B2B",
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;

  const customerExists = await prisma.customer.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!customerExists) notFound();

  const tiers = await prisma.tier.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, baseDiscount: true, creditLimit: true },
  });

  return (
    <div className="space-y-6">
      <CustomerProfileView
        customerId={id}
        availableTiers={tiers.map((t) => ({
          id: t.id,
          name: t.name,
          baseDiscount: Number(t.baseDiscount || 0),
          creditLimit: Number(t.creditLimit || 0),
        }))}
      />
    </div>
  );
}
