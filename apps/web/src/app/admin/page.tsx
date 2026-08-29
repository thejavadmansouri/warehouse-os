"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  Files,
  HandCoins,
  PackagePlus,
  Package,
  Settings,
  ShoppingCart,
  Users,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

import { useAuthStore } from "@/lib/auth-store";
import { toFa } from "@/lib/format";
import type { Role } from "@/lib/types";

/**
 * صفحه‌ی اول — تخته‌ی کلید، نه داشبورد.
 *
 * داشبوردِ قبلی نمودارِ فروش و کارتِ آمار داشت. آن اعداد جای خودشان را در
 * «گزارش‌ها» دارند؛ چیزی که کاربر صبح اول وقت از این صفحه می‌خواهد این است
 * که با یک حرکت برود سرِ کارش.
 *
 * الگو از پارسیان است، با یک قاعده‌ی صریح: **رنگ شناسه است، نه تزئین.**
 * کاربر بعد از یک هفته «کاشیِ آبیِ بالا» را می‌زند بدون اینکه متن را بخواند،
 * پس رنگ هر کاشی ثابت می‌ماند و هرگز جابه‌جا نمی‌شود. کاشیِ تمام‌عرض یعنی
 * «این از بقیه پرکاربردتر است».
 *
 * هر کاشی یک شماره دارد و همان عدد رویش کار می‌کند — سریع‌ترین راه، بدون
 * برداشتن دست از کیبورد.
 */
interface Tile {
  title: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  /** رنگِ ثابتِ همین کاشی. عمداً از توکن‌های تم جدا است. */
  color: string;
  /** تمام‌عرض = پرکاربردتر از بقیه. */
  wide?: boolean;
  roles: Role[];
}

const TILES: Tile[] = [
  {
    title: "فاکتور فروش",
    hint: "صندوق — بارکد بزن و بفروش",
    href: "/admin/pos",
    icon: ShoppingCart,
    color: "bg-[#1f7ae0]",
    wide: true,
    roles: ["ADMIN", "MANAGER", "SALES"],
  },
  {
    title: "فاکتور خرید",
    hint: "ورود کالا از تأمین‌کننده",
    href: "/admin/purchases",
    icon: PackagePlus,
    color: "bg-[#5b3fa8]",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    title: "دریافت وجه",
    hint: "پول گرفتن از بدهکار",
    href: "/admin/receipts",
    icon: HandCoins,
    color: "bg-[#d4681e]",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    title: "کارت حساب مشتری",
    hint: "فاکتورها، مانده و گردش حساب",
    href: "/admin/customers",
    icon: Users,
    color: "bg-[#a3123f]",
    wide: true,
    roles: ["ADMIN", "MANAGER", "SALES"],
  },
  {
    title: "اسناد",
    hint: "فاکتور، پیش‌فاکتور، مرجوعی، دریافت",
    href: "/admin/documents",
    icon: Files,
    color: "bg-[#0e7a53]",
    roles: ["ADMIN", "MANAGER", "SALES"],
  },
  {
    title: "گزارش‌ها",
    hint: "فروش، سود، موجودی",
    href: "/admin/reports",
    icon: BarChart3,
    color: "bg-[#8a1a9c]",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    title: "کاردکس کالا",
    hint: "کالاها، قیمت‌ها و گردش هر کالا",
    href: "/admin/products",
    icon: Package,
    color: "bg-[#a3123f]",
    wide: true,
    roles: ["ADMIN", "MANAGER", "STAFF"],
  },
  {
    title: "موجودی انبار",
    hint: "چه چیزی کجاست",
    href: "/admin/inventory",
    icon: Boxes,
    color: "bg-[#0e7a53]",
    roles: ["ADMIN", "MANAGER", "STAFF"],
  },
  {
    title: "انبارگردانی",
    hint: "شمارش و تطبیق",
    href: "/admin/inventory-count",
    icon: ClipboardList,
    color: "bg-[#5b3fa8]",
    roles: ["ADMIN", "MANAGER", "STAFF"],
  },
  {
    title: "تنظیمات",
    hint: "فروشگاه، کاربران، پشتیبان‌گیری",
    href: "/admin/settings",
    icon: Settings,
    color: "bg-[#d4681e]",
    wide: true,
    roles: ["ADMIN"],
  },
];

export default function AdminHome() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const name = useAuthStore((s) => s.user?.fullName);

  const tiles = React.useMemo(
    () => (role ? TILES.filter((t) => t.roles.includes(role)) : []),
    [role],
  );

  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /*
       * عددِ روی کاشی مستقیم بازش می‌کند. تا ۹ می‌رود چون کاشی دهم به بعد
       * دیگر «حفظ‌شدنی» نیست و ناوبری با فلش برایش سریع‌تر است.
       */
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && tiles[n - 1]) {
        e.preventDefault();
        router.push(tiles[n - 1].href);
        return;
      }

      switch (e.key) {
        case "ArrowDown":
        case "ArrowLeft":
          e.preventDefault();
          setActive((i) => Math.min(i + 1, tiles.length - 1));
          break;
        case "ArrowUp":
        case "ArrowRight":
          e.preventDefault();
          setActive((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (tiles[active]) router.push(tiles[active].href);
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tiles, active, router]);

  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col">
      <div className="flex shrink-0 items-baseline gap-3 border-b px-3 py-2">
        <span className="font-bold">{name ?? "کاردو"}</span>
        <span className="text-xs text-muted-foreground">
          عددِ روی هر کاشی را بزنید، یا با فلش‌ها حرکت کنید و Enter
        </span>
      </div>

      {/*
        دو ستون روی صفحه‌ی عادی. کاشیِ تمام‌عرض هر دو ستون را می‌گیرد و همین
        ریتمِ نامنظم است که سلسله‌مراتب می‌سازد — بدون آن، ده کاشیِ هم‌اندازه
        یک شبکه‌ی بی‌تفاوت می‌شوند که چشم رویش نمی‌ایستد.
      */}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="grid max-w-3xl grid-cols-2 gap-2">
          {tiles.map((t, i) => (
            <button
              key={t.href}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => router.push(t.href)}
              className={`${t.color} ${t.wide ? "col-span-2" : ""} ${
                i === active ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""
              } group relative flex min-h-24 flex-col justify-between rounded p-3 text-start text-white
                 transition-transform hover:brightness-110 focus:outline-none`}
            >
              <div className="flex items-start justify-between gap-2">
                <t.icon className="size-7 opacity-90" />
                {i < 9 && (
                  <kbd className="rounded bg-black/25 px-1.5 py-0.5 text-xs font-bold tabular-nums">
                    {toFa(i + 1)}
                  </kbd>
                )}
              </div>

              <div>
                <div className="text-lg font-bold leading-tight">{t.title}</div>
                <div className="text-xs opacity-80">{t.hint}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
