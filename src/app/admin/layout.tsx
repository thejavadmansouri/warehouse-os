// داده‌ی شخصی/پویا — بدون پیش‌ساخت
export const instant = false;

import Link from "next/link";
import { requireAdminPage } from "@/lib/server-account";
import { LogoutButton } from "@/app/dashboard/logout-button";

const tabs = [
  { href: "/admin", label: "مشتریان" },
  { href: "/admin/products", label: "محصولات" },
  { href: "/admin/orders", label: "اسناد و پیش‌فاکتور" },
  { href: "/admin/inquiries", label: "استعلام‌ها (RFQ)" },
  { href: "/admin/wallet", label: "کیف پول" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-rule bg-paper-raised/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto w-full max-w-5xl px-4 h-14 flex items-center gap-4">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="size-7 grid place-items-center bg-ink text-paper text-sm font-bold rounded-[2px]">
              ک
            </span>
            <span className="font-bold text-sm">پنل کاردو B2B</span>
          </Link>

          <nav className="hidden sm:flex items-center gap-1 text-sm ms-2">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="px-3 py-1.5 rounded-[2px] text-ink-soft hover:text-ink hover:bg-brass-soft/50 transition-colors"
              >
                {t.label}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-3">
            <span className="text-xs text-ink-soft">{admin.name ?? admin.username}</span>
            <LogoutButton />
          </div>
        </div>

        <nav className="sm:hidden flex border-t border-rule">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="flex-1 text-center text-xs py-2 text-ink-soft hover:text-ink"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
