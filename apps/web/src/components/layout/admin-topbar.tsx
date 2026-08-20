"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu, Moon, Sun, LogOut, UserCircle,
  Wallet, ClipboardList, ReceiptText, Users, PackagePlus, PackageX,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { usePosUiStore } from "@/app/admin/pos/_lib/pos-ui-store";
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
import { FullscreenToggle } from "./fullscreen-toggle";
import { cn } from "@/lib/utils";
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
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  /*
   * دکمه‌های عملیات فروش فقط وقتی دیده می‌شوند که پشت صندوق هستیم — خودِ
   * دیالوگ‌های‌شان داخل صفحه‌ی POS رندر می‌شوند و این‌جا فقط سیگنالِ بازشدن
   * به pos-ui-store می‌رود (منطق فروش به نوار مشترک تزریق نمی‌شود).
   */
  const isPos = pathname === "/admin/pos";

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
            /*
              روی صندوق سایدبارِ ثابت رندر نمی‌شود، پس این دکمه تنها راهِ رسیدن
              به منوست و باید در هر اندازه‌ای دیده شود — نه فقط روی موبایل.
            */
            className={cn("h-9 w-9", !isPos && "lg:hidden")}
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

      {/* دکمه collapse سایدبار دسکتاپ — روی صندوق سایدباری نیست که جمع شود. */}
      {!isPos && (
        <div className="hidden lg:block">
          <SidebarCollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} />
        </div>
      )}

      <div className="flex-1" />

      {/* چیدمان راست‌به‌چپ است، پس هرچه بعد از فاصله‌انداز بیاید سمت چپ می‌نشیند. */}
      {isPos && (
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            className="h-9 border-amber-600/50 text-amber-600 hover:bg-amber-600/10 hover:text-amber-600/80
                       dark:border-amber-600/50 dark:text-amber-400 dark:hover:bg-amber-600/10 dark:hover:text-amber-300"
            onClick={() => usePosUiStore.getState().openAccounts(true)}
            title="فهرست بدهکاران"
          >
            <Wallet className="size-4" />
            <span className="hidden md:inline">حساب باز</span>
          </Button>

          <Button
            variant="outline"
            className="h-9"
            onClick={() => usePosUiStore.getState().workTasks(true)}
            title="کارهای ارسال‌شده به کارگران انبار"
          >
            <ClipboardList className="size-4" />
            <span className="hidden md:inline">کارهای انبار</span>
          </Button>

          <Button
            variant="outline"
            className="h-9"
            onClick={() => usePosUiStore.getState().addProduct(true)}
            title="ساخت کالای تازه بدون ترک‌کردن صندوق"
          >
            <PackagePlus className="size-4" />
            <span className="hidden md:inline">افزودن محصول</span>
          </Button>

          {/* «کسری» عمداً کنارِ کارهای انبار است نه کنارِ فروش: چیزی که ثبت
              می‌کند تقاضای جواب‌نگرفته است، و مقصدش میزِ خرید است. */}
          <Button
            variant="outline"
            className="h-9"
            onClick={() => usePosUiStore.getState().shortage(true)}
            title="کالایی که مشتری خواست و نداشتیم"
          >
            <PackageX className="size-4" />
            <span className="hidden md:inline">کسری محصول</span>
          </Button>

          {/* سبز عمدی است: تنها دکمه‌ی «نگاه به گذشته» بین ابزارهای فروش، و
              فروشنده باید بدون خواندن متن پیدایش کند. */}
          <Button
            className="h-9 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700
                       dark:bg-emerald-600 dark:hover:bg-emerald-500"
            onClick={() => usePosUiStore.getState().recent(true)}
            title="فاکتورهای ثبت‌شده‌ی امروز"
          >
            <ReceiptText className="size-4" />
            <span className="hidden md:inline">فاکتورهای امروز</span>
          </Button>

          <Button asChild variant="outline" className="h-9">
            <Link href="/admin/customers" title="پنل مشتری‌ها">
              <Users className="size-4" />
              <span className="hidden md:inline">مشتری‌ها</span>
            </Link>
          </Button>
        </div>
      )}

      <LiveClock />

      <NotificationBell />

      {/* تمام‌صفحه فقط سرِ صندوق معنا دارد؛ جای دیگر فقط یک دکمه‌ی اضافه است. */}
      {isPos && <FullscreenToggle />}

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
