"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Mic, History, Boxes, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "داشبورد", href: "/", icon: LayoutDashboard },
  { name: "مدیریت کالاها", href: "/products", icon: Package },
  { name: "ثبت صوتی موجودی", href: "/voice-entry", icon: Mic },
  { name: "موقعیت‌های انبار", href: "/locations", icon: Boxes },
  { name: "تراکنش‌ها و لاگ‌ها", href: "/logs", icon: History },
  { name: "تنظیمات", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-l bg-card text-card-foreground">
      {/* هدر سایدبار / لوگو */}
      <div className="flex h-16 items-center px-6 border-b gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
          W
        </div>
        <div>
          <h1 className="font-bold text-base leading-none">انبارداری هوشمند</h1>
          <span className="text-xs text-muted-foreground">لوازم یدکی خودرو</span>
        </div>
      </div>

      {/* منوی ناوبری */}
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* فوتر سایدبار */}
      <div className="p-4 border-t text-xs text-muted-foreground text-center">
        نسخه ۱.۰.۰ — Warehouse OS
      </div>
    </aside>
  );
}
