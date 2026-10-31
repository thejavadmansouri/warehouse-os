import { requireAdminPage } from "@/lib/server-account";
import { prisma } from "@/lib/prisma";
import { StaffClient } from "./staff-client";

export const instant = false;

export const metadata = {
  title: "مدیریت پرسنل و حسابداران | کاردو B2B",
};

export default async function StaffPage() {
  await requireAdminPage();

  const staff = await prisma.adminUser.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return <StaffClient initialStaff={staff} />;
}
