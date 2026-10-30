import Link from "next/link";
import { formatToman } from "@/lib/digits";
import { LogoutButton } from "@/app/dashboard/logout-button";

/*
 * پوسته‌ی سایت مشتری — استاندارد B2B سازمانی مدرن
 * پالت مهندسی: Slate 900، آبی کبالت، سفید خالص و مرزهای Slate 200
 */
export function CustomerShell(props: {
  companyName: string;
  wallet: number;
  active: "catalog" | "orders" | "wallet" | "inquiries";
  children: React.ReactNode;
}) {
  const nav = [
    {
      key: "catalog",
      href: "/catalog",
      label: "کاتالوگ قطعات",
      icon: (
        <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="7" height="7" x="3" y="3" rx="1.5" />
          <rect width="7" height="7" x="14" y="3" rx="1.5" />
          <rect width="7" height="7" x="14" y="14" rx="1.5" />
          <rect width="7" height="7" x="3" y="14" rx="1.5" />
        </svg>
      ),
    },
    {
      key: "inquiries",
      href: "/inquiries",
      label: "استعلام قیمت (RFQ)",
      icon: (
        <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
          <line x1="10" x2="8" y1="9" y2="9" />
        </svg>
      ),
    },
    {
      key: "orders",
      href: "/orders",
      label: "سفارش‌ها و اسناد",
      icon: (
        <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 11 3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      key: "wallet",
      href: "/wallet",
      label: "کیف پول و اعتبار",
      icon: (
        <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a8 8 0 0 1-8 8H5a2 2 0 0 1-2-2V6" />
          <circle cx="18" cy="14" r="1" />
        </svg>
      ),
    },
  ] as const;

  return (
    <div className="min-h-dvh flex flex-col bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* هدر دسکتاپ و تبلت */}
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-30 shadow-2xs">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 h-15 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/catalog" prefetch={false} className="flex items-center gap-2.5 shrink-0 group">
              <span className="size-9 grid place-items-center bg-slate-900 text-white text-base font-bold rounded-lg shadow-sm group-hover:bg-blue-600 transition-colors">
                ک
              </span>
              <div className="flex flex-col">
                <span className="font-extrabold tracking-tight text-base sm:text-lg leading-tight text-slate-900">
                  کاردو <span className="text-blue-600 text-xs align-top font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60">B2B</span>
                </span>
                <span className="hidden sm:inline text-[10px] text-slate-500 font-medium leading-none mt-0.5">
                  پخش سراسری قطعات خودرو
                </span>
              </div>
            </Link>

            {/* منوی تب‌های افقی دسکتاپ */}
            <nav className="hidden md:flex items-center gap-1.5 text-xs lg:text-sm">
              {nav.map((item) => {
                const isActive = props.active === item.key;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    prefetch={false}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all ${
                      isActive
                        ? "bg-blue-50 text-blue-700 font-bold border border-blue-200/80 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                    }`}
                  >
                    <span className={isActive ? "text-blue-600" : "text-slate-400"}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* کیف پول در هدر */}
            <Link
              href="/wallet"
              prefetch={false}
              className="flex items-center gap-2 border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/50 rounded-lg px-3 py-1.5 text-xs transition-all shadow-2xs group"
            >
              <span className="text-[11px] text-slate-500 group-hover:text-blue-600 hidden xs:inline">کیف پول:</span>
              <span className="nums font-bold text-slate-900 group-hover:text-blue-700 text-sm">
                {formatToman(props.wallet)}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">تومان</span>
            </Link>

            {/* پروفایل شرکت خریدار */}
            <div className="hidden lg:flex flex-col items-end leading-tight border-s border-slate-200 ps-3">
              <span className="text-[10px] text-slate-500 font-medium">حساب همکار رسمی</span>
              <span className="text-xs font-bold text-slate-800 max-w-[11rem] truncate">
                {props.companyName}
              </span>
            </div>

            <LogoutButton />
          </div>
        </div>
      </header>

      {/* محتوای اصلی صفحات */}
      <main className="flex-1 w-full">{props.children}</main>

      {/* نوار پایین صفحه مخصوص موبایل (Bottom Tab Bar مدرن) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200/90 bg-white/98 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-4 h-15">
          {nav.map((item) => {
            const isActive = props.active === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                prefetch={false}
                className={`flex flex-col items-center justify-center gap-1 transition-all ${
                  isActive ? "text-blue-600 font-bold" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <div
                  className={`p-1 rounded-lg transition-transform ${
                    isActive ? "bg-blue-50 text-blue-600 scale-105" : ""
                  }`}
                >
                  {item.icon}
                </div>
                <span className="text-[10px] leading-none tracking-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* فاصله برای جلوگیری از هم‌پوشانی محتوا در موبایل */}
      <div className="md:hidden h-16" />
    </div>
  );
}
