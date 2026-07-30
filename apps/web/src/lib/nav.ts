// پیکربندی ناوبری سایدبار — طبق پیوست نقش‌های مجاز هر endpoint
import type { Role } from "./types";
import {
  LayoutDashboard,
  Package,
  Tag,
  Car,
  MapPin,
  Boxes,
  ArrowLeftRight,
  ClipboardList,
  ClipboardCheck,
  Mic,
  Users,
  FileSpreadsheet,
  BookAudio,
  Layers,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles: Role[] | "ALL";
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

// نقش‌های مجاز برای دیدن هر منو (بر اساس حداقل عملیات خواندن)
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "اصلی",
    items: [
      {
        title: "داشبورد",
        href: "/admin",
        icon: LayoutDashboard,
        roles: "ALL",
      },
    ],
  },
  {
    title: "کاتالوگ",
    items: [
      {
        title: "محصولات",
        href: "/admin/products",
        icon: Package,
        roles: ["ADMIN", "MANAGER", "STAFF"],
      },
      {
        title: "برندها",
        href: "/admin/brands",
        icon: Tag,
        roles: "ALL",
      },
      {
        title: "مدل‌های خودرو",
        href: "/admin/vehicle-models",
        icon: Car,
        roles: "ALL",
      },
      {
        title: "کاتالوگ قطعات",
        href: "/admin/part-catalog",
        icon: BookAudio,
        roles: "ALL",
      },
    ],
  },
  {
    title: "انبار",
    items: [
      {
        title: "موجودی",
        href: "/admin/inventory",
        icon: Boxes,
        roles: ["ADMIN", "MANAGER", "STAFF"],
      },
      {
        title: "لاگ موجودی",
        href: "/admin/inventory/logs",
        icon: ClipboardList,
        roles: ["ADMIN", "MANAGER"],
      },
      {
        title: "انتقال بین قفسه‌ها",
        href: "/admin/inventory-transfer",
        icon: ArrowLeftRight,
        roles: ["ADMIN", "MANAGER", "STAFF"],
      },
      {
        title: "انبارگردانی",
        href: "/admin/inventory-count",
        icon: ClipboardList,
        roles: ["ADMIN", "MANAGER", "STAFF"],
      },
      {
        title: "بازبینی عملیات",
        href: "/admin/review",
        icon: ClipboardCheck,
        roles: ["ADMIN", "MANAGER"],
      },
    ],
  },
  {
    title: "موقعیت‌ها",
    items: [
      {
        title: "موقعیت‌ها / قفسه‌ها",
        href: "/admin/locations",
        icon: MapPin,
        roles: "ALL",
      },
      {
        title: "انواع موقعیت",
        href: "/admin/location-types",
        icon: Layers,
        roles: "ALL",
      },
    ],
  },
  {
    title: "ابزارها",
    items: [
      {
        title: "مانیتور ورودی صوتی",
        href: "/admin/voice-input",
        icon: Mic,
        roles: ["ADMIN", "MANAGER", "STAFF"],
      },
      {
        title: "ورود اکسل",
        href: "/admin/imports",
        icon: FileSpreadsheet,
        roles: "ALL",
      },
      {
        title: "کاربران",
        href: "/admin/users",
        icon: Users,
        roles: ["ADMIN"],
      },
    ],
  },
];

export function filterNavByRole(
  sections: NavSection[],
  role: Role | undefined
): NavSection[] {
  if (!role) return [];
  return sections
    .map((s) => ({
      ...s,
      items: s.items.filter(
        (i) => i.roles === "ALL" || i.roles.includes(role)
      ),
    }))
    .filter((s) => s.items.length > 0);
}
