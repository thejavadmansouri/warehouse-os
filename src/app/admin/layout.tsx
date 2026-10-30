// داده‌ی شخصی/پویا — بدون پیش‌ساخت
export const instant = false;

import Link from "next/link";
import { requireAdminPage } from "@/lib/server-account";
import { LogoutButton } from "@/app/dashboard/logout-button";

const tabs = [
  { href: "/admin", label: "مشتریان و همکاران" },
  { href: "/admin/products", label: "محصولات و موجودی" },
  { href: "/admin/import", label: "ورود گروهی (اکسل)" },
  { href: "/admin/orders", label: "اسناد و پیش‌فاکتورها" },
  { href: "/admin/inquiries", label: "استعلام‌ها (RFQ)" },
  { href: "/admin/wallet", label: "کیف پول و اعتبار" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();

  return (
    <div className="min-h-dvh flex flex-col bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-2xs">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 h-15 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" prefetch={false} className="flex items-center gap-2.5">
              <span className="size-8 grid place-items-center bg-slate-900 text-white text-sm font-bold rounded-lg shadow-sm">
                ک
              </span>
              <span className="font-extrabold text-sm sm:text-base text-slate-900">
                پنل مدیریت کاردو <span className="text-blue-600 text-xs font-bold">B2B</span>
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1.5 text-xs lg:text-sm">
              {tabs.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  prefetch={false}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium transition-colors"
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
              ادمین: {admin.name ?? admin.username}
            </span>
            <LogoutButton />
          </div>
        </div>

        <nav className="md:hidden flex border-t border-slate-100 overflow-x-auto scrollbar-none px-2 py-1">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              prefetch={false}
              className="whitespace-nowrap px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 shrink-0"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
