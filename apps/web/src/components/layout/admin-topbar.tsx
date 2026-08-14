"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Menu, Moon, Sun, LogOut, UserCircle } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminSidebar, SidebarCollapseToggle } from "./admin-sidebar";
import { LiveClock } from "@/components/live-clock";
import { NotificationBell } from "@/components/notification-bell";
import { useAuthStore } from "@/lib/auth-store";
import { logoutServer } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted)
    return <div className="h-9 w-9" />;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title="تغییر تم"
    >
      {theme === "dark" ? (
        <Sun className="h-[18px] w-[18px]" />
      ) : (
        <Moon className="h-[18px] w-[18px]" />
      )}
    </Button>
  );
}

export function AdminTopbar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const handleLogout = async () => {
    // نشستِ سمت سرور هم آزاد شود، وگرنه حساب تا ورود بعدی «اشغال» می‌ماند.
    // اگر شبکه قطع بود هم خروجِ محلی باید انجام شود، پس خطا خورده می‌شود.
    try {
      await logoutServer();
    } catch {
      /* سرور در دسترس نبود — خروج محلی به‌هرحال انجام می‌شود. */
    }
    logout();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      {/* دکمه منوی موبایل */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 lg:hidden"
            title="منو"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>منوی پنل</SheetTitle>
          </SheetHeader>
          <AdminSidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* دکمه collapse سایدبار دسکتاپ */}
      <div className="hidden lg:block">
        <SidebarCollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} />
      </div>

      <div className="flex-1" />

      {/* چیدمان راست‌به‌چپ است، پس هرچه بعد از فاصله‌انداز بیاید سمت چپ می‌نشیند. */}
      <LiveClock />

      <NotificationBell />

      <ThemeToggle />

      {/* منوی کاربر */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 gap-2 px-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {user?.fullName?.charAt(0) ?? user?.username.charAt(0)}
            </div>
            <span className="hidden text-sm font-medium sm:inline">
              {user?.fullName}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user?.fullName}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {user ? ROLE_LABELS[user.role] : ""}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="ms-2 h-4 w-4" />
            خروج از حساب
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
