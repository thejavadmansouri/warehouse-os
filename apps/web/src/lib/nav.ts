// پیکربندی ناوبری سایدبار — طبق پیوست نقش‌های مجاز هر endpoint
import type { Role } from "./types";
import {
  BadgeDollarSign,
  LayoutDashboard,
  LayoutGrid,
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
  ShoppingCart,
  BarChart3,
  HandCoins,
  FileClock,
  DatabaseBackup,
  Tags,
  Store,
  Undo2,
  Files,
  FileText,
  Wallet,
  Warehouse,
  LibraryBig,
  Settings,
  PackagePlus,
  ScrollText,
} from "lucide-react";

export interface NavItem {
  title: string;
  /** برگ‌ها href دارند؛ هاب‌ها (فقط گروه‌بندی) می‌توانند نداشته باشند. */
  href?: string;
  icon: typeof LayoutDashboard;
  roles: Role[] | "ALL";
  /** زیرمجموعه‌ها — اگر باشد، این آیتم یک هابِ جمع‌شونده است. */
  children?: NavItem[];
}

export interface NavSection {
  /** خالی یعنی بدون سرتیتر — فقط برای بخشِ سنجاق‌شده. */
  title: string;
  /** آیکنِ سرتیترِ بخش — تا سرتیتر هم‌زبانِ بقیه‌ی ردیف‌ها باشد، نه یک برچسبِ ریز. */
  icon: typeof LayoutDashboard;
  /** بدونِ سرتیتر و همیشه باز — ردیف‌هایش مستقیم بالای سایدبار می‌نشینند. */
  pinned?: boolean;
  items: NavItem[];
}

// نقش‌های مجاز برای دیدن هر منو (بر اساس حداقل عملیات خواندن)
export const NAV_SECTIONS: NavSection[] = [
  /*
   * بخشِ سنجاق‌شده — بدون سرتیتر، همیشه باز.
   *
   * فقط کاری که هر روز انجام می‌شود: فروختن، دیدنِ مشتری، دیدنِ فاکتور، و
   * نگاهِ روزانه به اعداد. بقیه‌ی پنل (کاتالوگ، انبار، ابزارها) یک بار در ماه
   * لازم می‌شود و نباید هر روز جلوی چشم باشد و ارتفاع بگیرد.
   *
   * انباردار هیچ‌کدام از این چهار تا را نمی‌بیند، پس میان‌برهای خودش اینجا
   * سنجاق شده‌اند — وگرنه این بخش برایش خالی می‌ماند و همه‌چیزش می‌رفت زیرِ
   * «بیشتر».
   */
  {
    title: "",
    icon: Store,
    pinned: true,
    items: [
      {
        title: "صندوق فروش",
        href: "/admin/pos",
        icon: ShoppingCart,
        roles: ["ADMIN", "MANAGER", "SALES"],
      },
      {
        title: "مشتریان",
        href: "/admin/customers",
        icon: Users,
        roles: ["ADMIN", "MANAGER", "SALES"],
      },
      {
        title: "فاکتورها",
        href: "/admin/invoices",
        icon: FileText,
        roles: ["ADMIN", "MANAGER", "SALES"],
      },
      {
        title: "گزارش‌ها",
        href: "/admin/reports",
        icon: BarChart3,
        roles: ["ADMIN", "MANAGER"],
      },

      // ---- میان‌برهای انباردار ----
      {
        title: "موجودی",
        href: "/admin/inventory",
        icon: Boxes,
        roles: ["STAFF"],
      },
      {
        title: "انبارگردانی",
        href: "/admin/inventory-count",
        icon: ClipboardList,
        roles: ["STAFF"],
      },
    ],
  },

  {
    title: "بیشتر",
    icon: LayoutGrid,
    items: [
      {
        // اسنادِ فروشی که هر روز باز نمی‌شوند — فاکتور خودش بالا سنجاق است.
        title: "اسناد فروش",
        icon: Files,
        roles: ["ADMIN", "MANAGER", "SALES"],
        children: [
          {
            title: "پیش‌فاکتورها",
            href: "/admin/quotations",
            icon: FileClock,
            roles: ["ADMIN", "MANAGER", "SALES"],
          },
          {
            title: "مرجوعی‌ها",
            href: "/admin/returns",
            icon: Undo2,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "تاریخچه دریافت‌ها",
            href: "/admin/receipts",
            icon: HandCoins,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "داشبورد",
            href: "/admin",
            icon: LayoutDashboard,
            roles: ["ADMIN", "MANAGER"],
          },
        ],
      },
      {
        title: "کاتالوگ",
        icon: LibraryBig,
        roles: ["ADMIN", "MANAGER", "STAFF"],
        children: [
          {
            title: "محصولات",
            href: "/admin/products",
            icon: Package,
            roles: ["ADMIN", "MANAGER", "STAFF"],
          },
          {
            // قیمت‌گذاری فقط برای مدیر — انباردار نباید قیمت بگذارد.
            title: "قیمت‌گذاری",
            href: "/admin/pricing",
            icon: BadgeDollarSign,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "برندها",
            href: "/admin/brands",
            icon: Tag,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "مدل‌های خودرو",
            href: "/admin/vehicle-models",
            icon: Car,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "کاتالوگ قطعات",
            href: "/admin/part-catalog",
            icon: BookAudio,
            roles: ["ADMIN", "MANAGER"],
          },
        ],
      },
      {
        title: "انبار",
        icon: Warehouse,
        roles: ["ADMIN", "MANAGER", "STAFF"],
        children: [
          {
            title: "موجودی",
            href: "/admin/inventory",
            icon: Boxes,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "لاگ موجودی",
            href: "/admin/inventory/logs",
            icon: ClipboardList,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            // کاردکس — گردشِ هر کالا؛ نقطهٔ ورود از پرفروش‌ها یا جستجو.
            title: "کاردکس کالا",
            href: "/admin/inventory/kardex",
            icon: ScrollText,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "فاکتور خرید",
            href: "/admin/purchases",
            icon: PackagePlus,
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
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "موقعیت‌ها / قفسه‌ها",
            href: "/admin/locations",
            icon: MapPin,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "انواع موقعیت",
            href: "/admin/location-types",
            icon: Layers,
            roles: ["ADMIN", "MANAGER"],
          },
        ],
      },
      {
        /*
         * کارتابل — هر چیزی که منتظرِ تصمیمِ مدیر است، یک‌جا.
         * قبلاً سه صفحه‌ی جدا در سه گوشه‌ی منو بودند و هیچ‌کس نمی‌دانست کدام‌شان
         * کار دارد.
         */
        title: "کارتابل",
        icon: ClipboardCheck,
        roles: ["ADMIN", "MANAGER"],
        children: [
          {
            title: "بازبینی عملیات",
            href: "/admin/review",
            icon: ClipboardCheck,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "درخواست‌های افزودن کالا",
            href: "/admin/product-requests",
            icon: ClipboardCheck,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "لیبل‌های در انتظار",
            href: "/admin/labels",
            icon: Tags,
            roles: ["ADMIN", "MANAGER"],
          },
        ],
      },
      {
        title: "ابزارها",
        icon: Settings,
        roles: ["ADMIN", "MANAGER", "STAFF"],
        children: [
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
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "پشتیبان‌گیری",
            href: "/admin/backups",
            icon: DatabaseBackup,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "مشخصات مغازه",
            href: "/admin/shop-settings",
            icon: Store,
            roles: ["ADMIN", "MANAGER"],
          },
          {
            title: "کاربران",
            href: "/admin/users",
            icon: Users,
            roles: ["ADMIN"],
          },
        ],
      },
    ],
  },
];

/** یک آیتم را برای نقش فیلتر می‌کند؛ برای هاب، بازگشتی روی فرزندان. */
function itemForRole(item: NavItem, role: Role): NavItem | null {
  if (item.children) {
    const kids = item.children
      .map((c) => itemForRole(c, role))
      .filter((c): c is NavItem => c !== null);
    // هابِ بدون فرزندِ مجاز اصلاً نشان داده نمی‌شود.
    return kids.length ? { ...item, children: kids } : null;
  }
  return item.roles === "ALL" || item.roles.includes(role) ? item : null;
}

export function filterNavByRole(
  sections: NavSection[],
  role: Role | undefined
): NavSection[] {
  if (!role) return [];
  return sections
    .map((s) => ({
      ...s,
      items: s.items
        .map((i) => itemForRole(i, role))
        .filter((i): i is NavItem => i !== null),
    }))
    .filter((s) => s.items.length > 0);
}

/**
 * صفحه‌ای که هر نقش بعد از ورود روی آن فرود می‌آید.
 *
 * فروشنده باید مستقیم پشت صندوق بنشیند، نه اینکه از داشبورد رد شود — روی
 * ویندوزِ پیشخوان، هر کلیک اضافه یعنی تأخیر در فروش.
 *
 * مدیر کل هم فعلاً روی صندوق فرود می‌آید چون خودش فروشنده است؛ دسترسی‌اش به
 * بقیه‌ی پنل کامل می‌ماند و فقط نقطه‌ی شروع عوض می‌شود.
 */
export function landingPathForRole(role: Role | undefined): string {
  switch (role) {
    case "SALES":
    case "ADMIN":
    case "MANAGER":
      return "/admin/pos";
    // انباردار کارش روی گوشی است؛ اگر از وب وارد شد، «یافتن کالا» تنها چیزی
    // است که واقعاً به کارش می‌آید.
    case "STAFF":
      return "/admin/inventory";
    default:
      return "/admin";
  }
}

/**
 * نقش‌هایی که پنل برایشان یک ابزار فروش است، نه یک پنل مدیریت.
 * برای اینها پوسته‌ی ادمین جمع می‌شود تا تمرکز روی فروش بماند.
 */
export function isSalesFocused(role: Role | undefined): boolean {
  return role === "SALES";
}
