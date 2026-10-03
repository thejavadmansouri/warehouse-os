"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { LoadingState } from "@/components/states";
import { cn } from "@/lib/utils";
import { BackupCloseGuard } from "@/components/backup-close-guard";
import { ConnectionBanner } from "@/components/connection-banner";
import { isSalesFocused } from "@/lib/nav";
import { CartsProvider } from "@/app/admin/pos/_lib/carts-context";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isPos = pathname === "/admin/pos";
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const [hydrated, setHydrated] = React.useState(false);
  /**
   * برای فروشنده، پنل یک ابزار فروش است نه پنل مدیریت.
   *
   * سایدبار روی ویندوزِ پیشخوان فقط عرض می‌گیرد و حواس را پرت می‌کند، پس
   * پیش‌فرض جمع است. باز کردنش ممکن است — قفل نیست، فقط از سر راه کنار رفته.
   */
  const [collapsed, setCollapsed] = React.useState(false);
  const [appliedRoleDefault, setAppliedRoleDefault] = React.useState(false);

  React.useEffect(() => {
    if (!hydrated || appliedRoleDefault || !role) return;
    if (isSalesFocused(role)) setCollapsed(true);
    setAppliedRoleDefault(true);
  }, [hydrated, role, appliedRoleDefault]);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (hydrated && !token) {
      router.replace("/login");
    }
  }, [hydrated, token, router]);

  /*
   * صفحه‌های چاپ، پوسته‌ی پنل را اصلاً نمی‌گیرند.
   *
   * در App Router لایه‌ی فرزند نمی‌تواند لایه‌ی والد را حذف کند، پس نوار بالا و
   * سایدبار روی برگه‌ی چاپی هم می‌آمدند — و روی کاغذ چاپ می‌شدند. پنهان‌کردنشان
   * با CSS هم فضای مرده و صفحه‌ی دوم می‌ساخت. اینجا از ریشه رندر نمی‌شوند.
   *
   * بررسی نشست سرِ جایش می‌ماند: برگه‌ی چاپ هم بدون ورود باز نمی‌شود.
   */
  const isPrint = pathname.startsWith("/admin/print");

  if (!hydrated || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingState label="در حال بررسی نشست..." />
      </div>
    );
  }

  if (isPrint) return <>{children}</>;

  return (
    <CartsProvider>
    <div className="flex min-h-screen bg-background">
      {/*
        سایدبار ثابت سمت راست (RTL: اولین فرزند flex در راست قرار می‌گیرد).

        روی صندوق اصلاً رندر نمی‌شود. صندوق یک ابزارِ تمام‌صفحه است، نه یک صفحه
        داخل پنل: هر پیکسلی که سایدبار می‌گیرد یعنی یک ردیف کالای کم‌تر در سبد.
        دسترسی به منو از دست نمی‌رود — دکمه‌ی «منو» در نوار بالا آن را به‌صورت
        روکش باز می‌کند.
      */}
      {!isPos && (
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 border-l bg-sidebar transition-[width] duration-200 lg:block",
            collapsed ? "w-[72px]" : "w-64"
          )}
        >
          <AdminSidebar collapsed={collapsed} />
        </aside>
      )}

      {/* محتوای اصلی */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* بالاتر از نوار بالا می‌نشیند: وقتی سرور نیست، این اولین چیزی است
            که باید دیده شود. */}
        <ConnectionBanner />

        <AdminTopbar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
        {/*
          صندوق فروش خودش ارتفاع کامل را مدیریت می‌کند و padding بیرونی از
          ارتفاعِ در دسترسش کم می‌کند. بقیه‌ی صفحه‌ها padding عادی می‌گیرند.
        */}
        <main className={cn("flex-1", isPos ? "p-0" : "p-4 sm:p-6")}>{children}</main>
        {/* در مرورگر بی‌اثر است؛ فقط داخل قاب دسکتاپ فعال می‌شود. */}
        <BackupCloseGuard />
      </div>
    </div>
    </CartsProvider>
  );
}
