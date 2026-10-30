"use client";

import { useState } from "react";
import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";
import { LogoutButton } from "@/app/dashboard/logout-button";

export type CustomerShellProps = {
  companyName: string;
  contactName?: string | null;
  phone?: string | null;
  tierName?: string | null;
  tierDiscount?: number;
  customerDiscount?: number;
  wallet: number;
  creditLimit?: number;
  availableCredit?: number;
  active: "catalog" | "orders" | "wallet" | "inquiries" | "cheques" | "rma";
  children: React.ReactNode;
};

/*
 * پوسته‌ی جامع سازمانی کاردو B2B — چیدمان منوی سمت راست و مشخصات همکار در بالا سمت راست
 */
export function CustomerShell(props: CustomerShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  type NavItem = {
    key: string;
    href: string;
    label: string;
    shortLabel: string;
    badge?: string;
    icon: React.ReactNode;
  };

  const navItems: NavItem[] = [
    {
      key: "catalog",
      href: "/catalog",
      label: "کاتالوگ و خرید سریع قطعات",
      shortLabel: "کاتالوگ",
      badge: "۱۰ هزار قطعه",
      icon: (
        <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect width="7" height="7" x="3" y="3" rx="1.5" />
          <rect width="7" height="7" x="14" y="3" rx="1.5" />
          <rect width="7" height="7" x="14" y="14" rx="1.5" />
          <rect width="7" height="7" x="3" y="14" rx="1.5" />
        </svg>
      ),
    },
    {
      key: "orders",
      href: "/orders",
      label: "سفارش‌ها و پیش‌فاکتورها",
      shortLabel: "سفارش‌ها",
      icon: (
        <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m9 11 3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      key: "inquiries",
      href: "/inquiries",
      label: "استعلام قیمت (RFQ)",
      shortLabel: "استعلام",
      icon: (
        <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
          <line x1="10" x2="8" y1="9" y2="9" />
        </svg>
      ),
    },
    {
      key: "wallet",
      href: "/wallet",
      label: "کیف پول و خط اعتبار",
      shortLabel: "کیف پول",
      icon: (
        <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a8 8 0 0 1-8 8H5a2 2 0 0 1-2-2V6" />
          <circle cx="18" cy="14" r="1" />
        </svg>
      ),
    },
    {
      key: "cheques",
      href: "/cheques",
      label: "چک‌های صیادی بنفش",
      shortLabel: "چک‌ها",
      badge: "تأمین اعتبار",
      icon: (
        <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect width="20" height="12" x="2" y="6" rx="2" />
          <line x1="2" x2="22" y1="10" y2="10" />
          <path d="M6 14h2" />
          <path d="M10 14h6" />
        </svg>
      ),
    },
    {
      key: "rma",
      href: "/rma",
      label: "خدمات پس از فروش و مرجوعی (RMA)",
      shortLabel: "مرجوعی",
      icon: (
        <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
      ),
    },
  ];

  const tier = props.tierName || "برنزی";

  return (
    <div className="min-h-dvh flex flex-col bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white" dir="rtl">
      {/* هدر بالایی — نمایش مشخصات همکار در بالا سمت راست */}
      <header className="border-b border-slate-200/90 bg-white sticky top-0 z-30 shadow-2xs">
        <div className="w-full px-3 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* بخش ۱: بالا سمت راست — اطلاعات کامل همکار و دکمه باز کردن منو */}
          <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
            {/* دکمه بازکردن منوی کشویی در موبایل */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg shrink-0"
              aria-label="باز کردن منوی دسترسی"
            >
              <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" x2="21" y1="6" y2="6" />
                <line x1="3" x2="21" y1="12" y2="12" />
                <line x1="3" x2="21" y1="18" y2="18" />
              </svg>
            </button>

            {/* کارت مشخصات همکار در بالا سمت راست */}
            <div className="flex items-center gap-2 sm:gap-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl px-2.5 sm:px-3 py-1.5 transition-colors">
              <span className="size-9 grid place-items-center bg-blue-600 text-white rounded-lg font-bold text-sm shrink-0 shadow-2xs">
                {props.companyName.charAt(0) || "ک"}
              </span>
              <div className="min-w-0 flex flex-col leading-tight">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-xs sm:text-sm text-slate-900 truncate max-w-[140px] sm:max-w-[200px]">
                    {props.companyName}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                    سطح {tier}
                    {props.tierDiscount ? ` (${toFaDigits(props.tierDiscount)}٪)` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                  {props.contactName && <span className="truncate max-w-[100px]">{props.contactName}</span>}
                  {props.phone && (
                    <>
                      <span>·</span>
                      <span dir="ltr" className="font-mono nums">{toFaDigits(props.phone)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* بخش ۲: بالا سمت چپ — وضعیت مالی، لوگو و دکمه خروج */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* کیف پول و خط اعتبار */}
            <Link
              href="/wallet"
              prefetch={false}
              className="flex items-center gap-2 border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/40 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs transition-all shadow-2xs group"
              title="مشاهده جزئیات کیف پول و اعتبار"
            >
              <div className="flex flex-col items-end leading-tight">
                <span className="text-[10px] text-slate-500 group-hover:text-blue-600">کیف پول:</span>
                <span className="nums font-extrabold text-slate-900 group-hover:text-blue-700 text-xs sm:text-sm">
                  {formatToman(props.wallet)} <span className="text-[10px] font-normal text-slate-400">ت</span>
                </span>
              </div>
              {props.availableCredit !== undefined && props.availableCredit > 0 && (
                <div className="hidden sm:flex flex-col items-end leading-tight border-r border-slate-200 pr-2">
                  <span className="text-[10px] text-slate-500">اعتبار باز:</span>
                  <span className="nums font-bold text-amber-700 text-xs">
                    {formatToman(props.availableCredit)} <span className="text-[10px] font-normal text-slate-400">ت</span>
                  </span>
                </div>
              )}
            </Link>

            {/* لوگوی کوچک کاردو در سمت چپ */}
            <Link href="/catalog" prefetch={false} className="hidden md:flex items-center gap-1.5 shrink-0 pl-1">
              <span className="font-extrabold text-sm text-slate-900">کاردو</span>
              <span className="text-[10px] font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded">B2B</span>
            </Link>

            <LogoutButton />
          </div>
        </div>
      </header>

      {/* چیدمان بدنه: منوی سمت راست (Sidebar) + فضای میانی اصلی (Center Content) */}
      <div className="flex-1 flex w-full">
        {/* منوی ستونی سمت راست در دسکتاپ (Fixed / Sticky Desktop Sidebar) */}
        <aside className="hidden lg:flex flex-col w-68 shrink-0 bg-white border-l border-slate-200/90 min-h-[calc(100vh-4rem)] p-4 space-y-4">
          {/* کارت وضعیت حساب همکار در بالای سایدبار راست */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">حساب همکار تجاری</span>
              <span className="size-2 rounded-full bg-emerald-500" title="حساب فعال"></span>
            </div>
            <p className="text-xs font-black text-slate-900 truncate">{props.companyName}</p>
            <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
              <span>تخفیف همکاری:</span>
              <b className="nums text-blue-700 font-bold text-xs">{toFaDigits(props.tierDiscount || 0)}٪</b>
            </div>
          </div>

          {/* لیست پیوندهای منوی راست */}
          <nav className="flex-1 space-y-1 text-xs">
            <span className="text-[10px] font-bold text-slate-400 px-3 uppercase tracking-wider block mb-1">
              منوی اصلی کاردو B2B
            </span>
            {navItems.map((item) => {
              const isActive = props.active === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={false}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all ${
                    isActive
                      ? "bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={isActive ? "text-blue-600" : "text-slate-400"}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-normal bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* جعبه اطلاعات انبار مرکزی و پشتیبانی کرمان در پایین منو */}
          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200/70 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-blue-900">
              <span className="size-2 rounded-full bg-blue-600"></span>
              <span>انبار مرکزی استان کرمان</span>
            </div>
            <p className="text-[11px] text-blue-800 leading-4">
              ارسال روزانه باربری به کلیه شهرستان‌ها از هاب میدان ترمینال کرمان
            </p>
            <p className="text-[11px] text-slate-600 pt-1 border-t border-blue-200/50 flex justify-between">
              <span>پشتیبانی فروش:</span>
              <span dir="ltr" className="font-mono font-bold nums">۰۳۴-۳۳۲۰۰۰۰۰</span>
            </p>
          </div>
        </aside>

        {/* منوی کشویی سمت راست در موبایل (Mobile Slide-out Drawer) */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            {/* پس‌زمینه نیمه‌شفاف تیره */}
            <div
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* کشوی منو که از سمت راست باز می‌شود */}
            <div className="relative mr-0 w-72 max-w-[85vw] bg-white h-full shadow-2xl z-10 flex flex-col p-4 space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="size-8 grid place-items-center bg-slate-900 text-white rounded-lg font-bold text-sm">
                    ک
                  </span>
                  <span className="font-extrabold text-sm text-slate-900">منوی سامانه کاردو</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 text-lg rounded-lg"
                >
                  ✕
                </button>
              </div>

              {/* کارت مشخصات همکار در کشوی موبایل */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                <span className="font-extrabold text-slate-900 block">{props.companyName}</span>
                <p className="text-slate-500">{props.contactName} · <span dir="ltr" className="nums font-mono">{props.phone}</span></p>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 font-bold">
                  <span className="text-slate-600">کیف پول:</span>
                  <span className="nums text-blue-700">{formatToman(props.wallet)} ت</span>
                </div>
              </div>

              {/* گزینه‌های منو */}
              <nav className="space-y-1 text-xs flex-1">
                {navItems.map((item) => {
                  const isActive = props.active === item.key;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      prefetch={false}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl font-bold ${
                        isActive
                          ? "bg-blue-50 text-blue-700 border border-blue-200/80"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={isActive ? "text-blue-600" : "text-slate-400"}>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </nav>

              <div className="pt-2 border-t text-xs">
                <p className="text-slate-500 text-[11px] mb-2">تلفن انبار کرمان: ۰۳۴-۳۳۲۰۰۰۰۰</p>
                <LogoutButton />
              </div>
            </div>
          </div>
        )}

        {/* وسط صفحه — محتوای اصلی صفحات (مرکز صفحه برای سرچ محصول و فیلترها) */}
        <main className="flex-1 min-w-0 p-3 sm:p-6">{props.children}</main>
      </div>

      {/* نوار پایین صفحه در موبایل برای دسترسی فوق سریع */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200/90 bg-white/95 backdrop-blur-md pb-[max(env(safe-area-inset-bottom),0.35rem)] shadow-lg">
        <div className="grid grid-cols-4 h-14">
          {navItems.slice(0, 4).map((item) => {
            const isActive = props.active === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                prefetch={false}
                className={`flex flex-col items-center justify-center gap-0.5 transition-all relative ${
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
                <span className="text-[11px] leading-tight tracking-tight font-medium">
                  {item.shortLabel}
                </span>
                {isActive && (
                  <span className="absolute top-0.5 w-6 h-0.5 bg-blue-600 rounded-full" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* فاصله امن پایین در موبایل */}
      <div className="lg:hidden h-16" />
    </div>
  );
}
