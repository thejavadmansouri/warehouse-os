import { requireAdminPage } from "@/lib/server-account";
import { prisma } from "@/lib/prisma";
import { ApiKeysClient } from "./api-keys-client";

export const instant = false;

export const metadata = {
  title: "اتصال وب‌سرویس حسابداری | کاردو B2B",
};

export default async function ApiKeysPage() {
  await requireAdminPage();

  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
  });

  return <ApiKeysClient initialKeys={keys} />;
}
