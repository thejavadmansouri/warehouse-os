"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { LoadingState } from "@/components/states";
import { cn } from "@/lib/utils";
import { BackupCloseGuard } from "@/components/backup-close-guard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [hydrated, setHydrated] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (hydrated && !token) {
      router.replace("/login");
    }
  }, [hydrated, token, router]);

  if (!hydrated || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingState label="در حال بررسی نشست..." />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* سایدبار ثابت سمت راست (RTL: اولین فرزند flex در راست قرار می‌گیرد) */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-l bg-sidebar transition-[width] duration-200 lg:block",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        <AdminSidebar collapsed={collapsed} />
      </aside>

      {/* محتوای اصلی */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
        {/* در مرورگر بی‌اثر است؛ فقط داخل قاب دسکتاپ فعال می‌شود. */}
        <BackupCloseGuard />
      </div>
    </div>
  );
}
