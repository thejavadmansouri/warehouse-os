"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Moon, Sun, LogOut } from "lucide-react";
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
import { FullscreenToggle } from "./fullscreen-toggle";
import { ReadabilityToggle } from "./readability-toggle";
import { ConnectionInfoDialog } from "@/components/connection-info-dialog";
import { cn } from "@/lib/utils";
import { LiveClock } from "@/components/live-clock";
import { NotificationBell } from "@/components/notification-bell";
import { SiteOrdersBell } from "@/components/site-orders-bell";
import { useAuthStore } from "@/lib/auth-store";
import { logoutServer } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";

/**
 * هیدریشن را به‌صورت external store می‌خوانیم — نه setState در effect.
 * سرور همیشه false می‌گوید؛ بعد از mount دوباره رندر می‌شود و تم دیده می‌شود.
 */
const mountedSubscribe = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    mountedSubscribe,
    getMounted,
    getServerMounted,
  );
  if (!mounted) return <div className="size-7" />;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title="تغییر تم"
    >
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
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
  const canManageSite = user?.canManageSite === true;
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
    /*
      ارتفاع از ۶۴ به ۴۰ پیکسل آمد و همه‌ی کنترل‌ها هم‌اندازه‌ی آیکن‌های نوار
      فرمان شدند. آن ۲۴ پیکسل مستقیماً به ارتفاعِ جدولِ فروش اضافه می‌شود —
      یعنی یک ردیف کالای بیشتر در هر صفحه.
    */
    <header className="sticky top-0 z-30 flex h-10 items-center gap-1 border-b bg-background px-2">
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
            className={cn("size-7", !isPos && "lg:hidden")}
            title="منو"
          >
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>منوی پنل</SheetTitle>
          </SheetHeader>
          <AdminSidebar
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* دکمه collapse سایدبار دسکتاپ — روی صندوق سایدباری نیست که جمع شود. */}
      {!isPos && (
        <div className="hidden lg:block">
          <SidebarCollapseToggle
            collapsed={collapsed}
            onToggle={onToggleCollapse}
          />
        </div>
      )}

      <div className="flex-1" />

      {/*
        دکمه‌های صندوق (حساب باز، کارهای انبار، افزودن کالا، کسری، فاکتورهای
        امروز، مشتری‌ها) از اینجا برداشته شدند.

        همه‌شان حالا آیکنِ نوار فرمانِ خودِ سند هستند (components/document/
        commands.ts) — یعنی هم کلید دارند، هم جایشان ثابت است، هم این نوار
        دیگر نیمی از عرضش را به دکمه‌هایی نمی‌دهد که فقط در یک صفحه معنی دارند.
      */}

      <LiveClock />

      {/*
        زنگِ سفارشِ اینترنتی — فقط برای دارندگانِ `canManageSite` و فقط در
        صفحه‌هایِ غیر از صندوق. خودِ صندوق هیچ ردی از سایت نمی‌گیرد.
      */}
      {!isPos && canManageSite && <SiteOrdersBell />}

      <NotificationBell />

      {/* تمام‌صفحه فقط سرِ صندوق معنا دارد؛ جای دیگر فقط یک دکمه‌ی اضافه است. */}
      {isPos && <FullscreenToggle />}

      <ReadabilityToggle />

      <ThemeToggle />

      {/* منوی کاربر */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/*
            فقط حرفِ اولِ نام. نامِ کامل و نقش داخلِ منو هستند — روی نوار،
            نامِ فروشنده هیچ تصمیمی را عوض نمی‌کند و فقط عرض می‌گیرد.
          */}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full bg-primary text-xs font-bold text-primary-foreground
                       hover:bg-primary/90 hover:text-primary-foreground"
            title={user?.fullName ?? "حساب کاربری"}
          >
            {user?.fullName?.charAt(0) ?? user?.username.charAt(0)}
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
          <ConnectionInfoDialog />
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
