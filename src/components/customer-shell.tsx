import Link from "next/link";
import { formatToman } from "@/lib/digits";
import { LogoutButton } from "@/app/dashboard/logout-button";

/*
 * پوسته‌ی سایت مشتری — استاندارد B2B حرفه‌ای
 * هدر چسبان، ناوبری روان، تب‌بار موبایل ارگونومیک با آیکون‌های وکتور
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
      label: "کاتالوگ",
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        </svg>
      ),
    },
    {
      key: "inquiries",
      href: "/inquiries",
      label: "استعلام قیمت",
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      label: "سفارش‌ها",
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 11 3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      key: "wallet",
      href: "/wallet",
      label: "کیف پول",
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a8 8 0 0 1-8 8H5a2 2 0 0 1-2-2V6" />
          <circle cx="18" cy="14" r="1" />
        </svg>
      ),
    },
  ] as const;

  return (
    <div className="min-h-dvh flex flex-col selection:bg-brass selection:text-white">
      {/* هدر دسکتاپ و موبایل */}
      <header className="border-b border-rule bg-paper-raised/85 backdrop-blur-md sticky top-0 z-30 transition-all">
        <div className="mx-auto w-full max-w-5xl px-3 sm:px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link href="/catalog" className="flex items-center gap-2 shrink-0 group">
              <span className="size-8 grid place-items-center bg-ink text-paper text-sm font-bold rounded-[3px] shadow-xs group-hover:bg-brass transition-colors">
                ک
              </span>
              <div className="flex flex-col">
                <span className="font-bold tracking-tight text-sm sm:text-base leading-tight">
                  کاردو <span className="text-brass text-xs align-top font-bold">B2B</span>
                </span>
                <span className="hidden sm:inline text-[10px] text-ink-soft leading-none">
                  عمده‌فروشی قطعات خودرو
                </span>
              </div>
            </Link>

            {/* منوی افقی دسکتاپ */}
            <nav className="hidden sm:flex items-center gap-1 text-xs md:text-sm ms-2">
              {nav.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] transition-all ${
                    props.active === item.key
                      ? "bg-ink text-paper font-semibold shadow-xs"
                      : "text-ink-soft hover:text-ink hover:bg-brass-soft/40"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* کیف پول در هدر (هم دسکتاپ و هم موبایل) */}
            <Link
              href="/wallet"
              className="flex items-center gap-1.5 border border-rule hover:border-brass rounded-[3px] px-2.5 py-1 text-xs bg-paper/60 transition-colors shadow-2xs"
            >
              <span className="text-[11px] text-ink-soft hidden xs:inline">کیف:</span>
              <span className="nums font-bold text-ink">{formatToman(props.wallet)}</span>
              <span className="text-[10px] text-ink-soft">ت</span>
            </Link>

            {/* نام شرکت خریدار */}
            <div className="hidden md:flex flex-col items-end leading-tight border-s border-rule ps-3">
              <span className="text-[10px] text-ink-soft">حساب همکار</span>
              <span className="text-xs font-semibold max-w-[10rem] truncate text-ink">
                {props.companyName}
              </span>
            </div>

            <LogoutButton />
          </div>
        </div>
      </header>

      {/* محتوای اصلی */}
      <main className="flex-1 w-full animate-in fade-in-50 duration-200">{props.children}</main>

      {/* نوار ناوبری پایین صفحه مخصوص موبایل (Bottom Tab Bar) */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-rule bg-paper-raised/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
        <div className="grid grid-cols-4 h-14">
          {nav.map((item) => {
            const isActive = props.active === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 transition-all ${
                  isActive ? "text-brass font-bold" : "text-ink-soft hover:text-ink"
                }`}
              >
                <div
                  className={`size-7 grid place-items-center rounded-full transition-transform ${
                    isActive ? "bg-brass/10 scale-110" : ""
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

      {/* فاصله برای جلوگیری از هم‌پوشانی محتوا با نوار پایین موبایل */}
      <div className="sm:hidden h-16" />
    </div>
  );
}
