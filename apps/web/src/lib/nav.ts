// پیکربندی ناوبری سایدبار — طبق پیوست نقش‌های مجاز هر endpoint
import type { Role } from "./types";
import {
  LayoutDashboard,
  LayoutGrid,
  Package,
  MapPin,
  Boxes,
  ArrowLeftRight,
  ClipboardList,
  ClipboardCheck,
  Users,
  ShoppingCart,
  BarChart3,
  Store,
  Files,
  FileText,
  Wallet,
  Warehouse,
  LibraryBig,
  Settings,
  PackagePlus,
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
        /*
         * چهار سندِ فروش یک صفحه شدند و نوعِ سند یک تب است، نه ردیفِ منو.
         * قبلاً «فاکتورها» اینجا سنجاق بود و بقیه زیرِ «بیشتر» — یعنی برای
         * دیدنِ مرجوعیِ همان مشتری باید جای دیگری می‌گشتی.
         */
        title: "اسناد",
        href: "/admin/documents",
        icon: Files,
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
        /*
         * داشبورد تا دیروز داخلِ هابِ «اسناد فروش» دفن بود — جایی که هیچ‌کس
         * دنبالِ نمای کلی نمی‌گردد.
         *
         * سنجاق هم نمی‌شود: صفحه‌ی فرودِ ادمین صندوق است نه داشبورد
         * (`landingPathForRole`)، و پنج تا از شش کارتش در گزارش‌ها › «یک نگاه»
         * تکرار شده‌اند. تا وقتی آن دوگانگی حل نشده، ردیفِ دائمی در بالای منو
         * نمی‌گیرد.
         */
        title: "داشبورد",
        href: "/admin",
        icon: LayoutDashboard,
        roles: ["ADMIN", "MANAGER"],
      },
      {
        /*
         * محصولات دیگر هابِ چندشاخه نیست: صفحه‌ی کالا خودش مشخصات، موجودی،
         * کاردکس و تاریخچه‌ی قیمت را دارد، و قیمت‌گذاریِ گروهی از نوارِ ابزارِ
         * همین فهرست باز می‌شود. «کار» آیتمِ منو نمی‌شود.
         */
        title: "محصولات",
        href: "/admin/products",
        icon: Package,
        roles: ["ADMIN", "MANAGER", "STAFF"],
      },
      {
        // چهار جدولِ مرجع که ماهی یک بار باز می‌شوند، یک ردیف بس است.
        title: "داده‌های پایه",
        href: "/admin/base-data",
        icon: LibraryBig,
        roles: ["ADMIN", "MANAGER"],
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
        ],
      },
      {
        /*
         * کارتابل — هر چیزی که منتظرِ تصمیمِ مدیر است، یک‌جا و با شمارنده.
         * قبلاً سه صفحه‌ی جدا بود و صفِ هیچ‌کدام دیده نمی‌شد مگر بازش می‌کردی.
         * مسیرهای قدیمی هنوز کار می‌کنند، فقط از منو برداشته شده‌اند.
         */
        title: "کارتابل",
        href: "/admin/inbox",
        icon: ClipboardCheck,
        roles: ["ADMIN", "MANAGER"],
      },
      {
        // پنج صفحه‌ی تنظیمات، یک ردیف. نقش‌ها روی تب‌ها اعمال می‌شوند.
        title: "تنظیمات",
        href: "/admin/settings",
        icon: Settings,
        roles: ["ADMIN", "MANAGER"],
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
