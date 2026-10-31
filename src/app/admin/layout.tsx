export const instant = false;

import { requireAdminPage } from "@/lib/server-account";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();

  return (
    <AdminShell
      admin={{
        id: admin.id,
        username: admin.username,
        name: admin.name,
        role: admin.role,
      }}
    >
      {children}
    </AdminShell>
  );
}
