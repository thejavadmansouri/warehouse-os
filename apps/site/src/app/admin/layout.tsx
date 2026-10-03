"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Globe,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquareText,
  PackageCheck,
  SearchCheck,
  Ticket,
  Truck,
} from "lucide-react";
import { useSiteAuthStore } from "@/lib/auth-store";
import { logoutServer } from "@/lib/api";
import { LoadingState } from "@/components/loading-state";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { title: "نمای کلی", href: "/admin", icon: LayoutDashboard },
  { title: "سفارش‌های آنلاین", href: "/admin/orders", icon: PackageCheck },
  { title: "کوپن‌ها", href: "/admin/site/coupons", icon: Ticket },
  { title: "بنرها", href: "/admin/site/banners", icon: Megaphone },
  { title: "نظرات", href: "/admin/site/reviews", icon: MessageSquareText },
  { title: "مناطق ارسال", href: "/admin/site/shipping-zones", icon: Truck },
  { title: "اعلان موجودی", href: "/admin/site/stock-notify", icon: SearchCheck },
  { title: "سئو", href: "/admin/site/seo", icon: Globe },
];

export default function SiteAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const token = useSiteAuthStore((s) => s.token);
  const user = useSiteAuthStore((s) => s.user);
  const logout = useSiteAuthStore((s) => s.logout);
  /**
   * هیدریشنِ استورِ persist. setStateِ همزمان در بدنه‌ی effect ممنوع است
   * (react-hooks/set-state-in-effect)؛ تأخیرِ صفر عملاً همان فریم اول است.
   */
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setHydrated(true), 0);
    return () => clearTimeout(t);
  }, []);

  /*
   * صفحه‌ی لاگین خودش فرم را نشان می‌دهد؛ guard فقط صفحاتِ داخلِ پنل را
   * قفل می‌کند. اگر اینجا هم ریدایرکت شود، لاگین هرگز دیده نمی‌شود.
   */
  const isLogin = pathname === "/admin/login";

  React.useEffect(() => {
    if (hydrated && !token && !isLogin) {
      router.replace("/admin/login");
    }
  }, [hydrated, token, isLogin, router]);

  const onLogout = async () => {
    try {
      await logoutServer();
    } catch {
      // حتی اگر سرور جواب نداد، نشستِ محلی باید بسته شود.
    }
    logout();
    router.replace("/admin/login");
  };

  if (!hydrated || (!token && !isLogin)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingState label="در حال بررسی نشست..." />
      </div>
    );
  }

  // صفحه‌ی لاگین بدون پوسته‌ی پنل — فرمِ ورود تمام‌صفحه است.
  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-l bg-sidebar lg:block">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <img
              src="/logo.png"
              alt="فروشگاه"
              className="h-8 w-8 rounded-lg"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">فروشگاه اینترنتی</div>
              <div className="truncate text-xs text-muted-foreground">
                پنل مدیریت سایت
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4" />
                  {item.title}
                </Link>
              );
            })}
          </nav>

          <div className="border-t p-3">
            <div className="mb-2 px-1 text-xs text-muted-foreground">
              {user?.fullName || user?.username || ""}
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="size-4" />
              خروج
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="فروشگاه" className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-bold">پنل مدیریت سایت</span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1 text-sm text-destructive"
          >
            <LogOut className="size-4" />
            خروج
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
