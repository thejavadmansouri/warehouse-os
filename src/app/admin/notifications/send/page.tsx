import { requireAdminPage } from "@/lib/server-account";
import { prisma } from "@/lib/prisma";
import { SendNotificationClient } from "./send-client";

export const metadata = {
  title: "ارسال نوتیفیکیشن به کاربران | کاردو B2B",
};

export default async function SendNotificationPage() {
  await requireAdminPage();

  const tiers = await prisma.customerTier.findMany({
    select: { id: true, name: true },
    orderBy: { priority: "desc" },
  });

  const customers = await prisma.customer.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, companyName: true, phone: true },
    orderBy: { companyName: "asc" },
  });

  return <SendNotificationClient tiers={tiers} customers={customers} />;
}
