"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { AnnouncementBanner } from "@/components/ui/announcement-banner";
import { NotificationBell } from "@/components/notification-bell";

interface AdminShellProps {
  admin: {
    id: string;
    username: string;
    name?: string | null;
    role?: string;
  };
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export function AdminShell({ admin, children }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const navGroups: NavGroup[] = [
    {
      title: "داشبورد و تحلیل‌ها",
      items: [
        {
          href: "/admin/analytics",
          label: "هوش تجاری و گزارشات",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          ),
        },
        {
          href: "/admin",
          label: "مشتریان و همکاران",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          ),
        },
      ],
    },
    {
      title: "انبار و کالاها",
      items: [
        {
          href: "/admin/products",
          label: "قطعات و موجودی انبار",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          ),
        },
        {
          href: "/admin/import",
          label: "ورود دسته‌ای اکسل",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          ),
        },
        {
          href: "/admin/warehouses",
          label: "مدیریت شعب و انبارها",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009 9c.69 0 1.332-.234 1.849-.628a3 3 0 005.302 0A2.992 2.992 0 0018 9c.73 0 1.406-.26 1.932-.693a3.003 3.003 0 002.818 1.042m-16.5 0l2.7-5.4a1.5 1.5 0 011.342-.83h9.316a1.5 1.5 0 011.342.83l2.7 5.4" />
            </svg>
          ),
        },
        {
          href: "/admin/warehouse",
          label: "برگه جمع‌آوری انبار",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
          ),
        },
        {
          href: "/admin/picker",
          label: "تبلت انباردار (اسکن بارکد)",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5zM15.75 14.625v.75m0 3v.75m3-3.75h.75m-3.75 0h.75m1.5 1.5h.75m0 1.5h.75m-2.25 0h.75m-3-1.5h.75" />
            </svg>
          ),
        },
      ],
    },
    {
      title: "فروش، مالی و لجستیک",
      items: [
        {
          href: "/admin/orders",
          label: "سفارش‌ها و اسناد مالی",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
          ),
        },
        {
          href: "/admin/inquiries",
          label: "استعلام قیمت‌ها (RFQ)",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          ),
        },
        {
          href: "/admin/cheques",
          label: "چک‌های صیادی همکاران",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          ),
        },
        {
          href: "/admin/wallet",
          label: "کیف پول و سقف اعتباری",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
          ),
        },
        {
          href: "/admin/logistics",
          label: "لجستیک و باربری کرمان",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.75a2.25 2.25 0 00-2.25-2.25h-2.25V6.75a2.25 2.25 0 00-2.25-2.25H3.375A2.25 2.25 0 001.125 6.75v7.5m17.25 0h-4.5m4.5 0v3.75" />
            </svg>
          ),
        },
        {
          href: "/admin/rma",
          label: "مرجوعی و گارانتی (RMA)",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          ),
        },
      ],
    },
    {
      title: "تنظیمات، یکپارچه‌سازی و پرسنل",
      items: [
        {
          href: "/admin/tiers",
          label: "سطوح همکاری و تخفیف‌ها",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
          ),
        },
        {
          href: "/admin/staff",
          label: "پرسنل و حسابداران",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          ),
        },
        {
          href: "/admin/api-keys",
          label: "اتصال حسابداری (API)",
          badge: "ERP",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
          ),
        },
        {
          href: "/admin/notifications/send",
          label: "ارسال نوتیفیکیشن",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          ),
        },
        {
          href: "/admin/design-system",
          label: "دیزاین سیستم کاردو",
          icon: (
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l9.402 9.402" />
            </svg>
          ),
        },
      ],
    },
  ];

  // یافتن عنوان صفحه فعلی برای نشانگر نان‌ریزه (Breadcrumb)
  let activeLabel = "پیشخوان";
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href === pathname) {
        activeLabel = item.label;
        break;
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* اعلان‌های فوری مدیران */}
      <AnnouncementBanner target="ADMIN" />

      {/* شاکله اصلی راست‌به‌چپ: سایدبار در سمت راست، محتوا در سمت چپ */}
      <div className="flex-1 flex w-full">
        {/* سایدبار دسکتاپ (ثابت در سمت راست با چیدمان استاندارد گوگل و اپل) */}
        <aside
          className={`hidden lg:flex flex-col border-l border-slate-200/90 bg-white/95 backdrop-blur-xl sticky top-0 h-screen z-30 transition-all duration-300 ${
            collapsed ? "w-20" : "w-72"
          }`}
        >
          {/* هدر سایدبار با لوگو کاردو B2B */}
          <div className="h-17 px-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <Link
              href="/admin"
              className={`flex items-center gap-3 transition-opacity ${collapsed ? "justify-center w-full" : ""}`}
            >
              <span className="size-10 grid place-items-center bg-linear-to-tr from-amber-500 via-amber-600 to-orange-600 text-slate-950 text-base font-black rounded-xl shadow-md shadow-amber-500/20 shrink-0">
                ک
              </span>
              {!collapsed && (
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5 font-black text-slate-900 text-base">
                    <span>کاردو</span>
                    <span className="text-[10px] font-black tracking-wider bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded-md">
                      B2B OS
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium truncate max-w-44">
                    سامانه هوشمند توزیع لوازم یدکی
                  </span>
                </div>
              )}
            </Link>

            {!collapsed && (
              <button
                onClick={() => setCollapsed(true)}
                title="جمع کردن منو"
                aria-label="جمع کردن منو"
                className="size-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 grid place-items-center transition-colors"
              >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            )}
          </div>

          {/* محتوای منو دسته‌بندی‌شده عمودی با اسکرولبار نرم */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin">
            {collapsed && (
              <div className="flex justify-center pb-2">
                <button
                  onClick={() => setCollapsed(false)}
                  title="باز کردن منو"
                  aria-label="باز کردن منو"
                  className="size-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 grid place-items-center transition-colors"
                >
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
              </div>
            )}

            {navGroups.map((group, gIdx) => (
              <div key={gIdx} className="space-y-1">
                {!collapsed && (
                  <div className="px-3 pb-1 text-[11px] font-bold text-slate-400 tracking-wider">
                    {group.title}
                  </div>
                )}
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                        isActive
                          ? "bg-amber-500/10 text-amber-900 font-bold shadow-xs border border-amber-500/20"
                          : "text-slate-600 hover:text-slate-950 hover:bg-slate-100/80"
                      } ${collapsed ? "justify-center px-0 py-2.5" : ""}`}
                    >
                      {/* نوار نشانگر انتخاب مدرن سبک اپل در لبه بیرونی */}
                      {isActive && (
                        <span className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-amber-500 rounded-l-full" />
                      )}

                      <span
                        className={`transition-colors shrink-0 ${
                          isActive ? "text-amber-600" : "text-slate-400 group-hover:text-slate-700"
                        }`}
                      >
                        {item.icon}
                      </span>

                      {!collapsed && (
                        <span className="truncate flex-1 text-right">{item.label}</span>
                      )}

                      {!collapsed && item.badge && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300/60">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          {/* پاورقی سایدبار — وضعیت پرسنل */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
            <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
              <div className="size-9 rounded-xl bg-slate-800 text-white font-bold text-xs grid place-items-center shadow-xs shrink-0">
                {admin.name ? admin.name.charAt(0) : "م"}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {admin.name ?? admin.username}
                  </div>
                  <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                    {admin.role === "ACCOUNTANT" ? "حسابدار مالی" : "مدیر ارشد سامانه"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* بخش محتوا و هدر بالایی مدرن */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* هدر بالایی افقی (نوار ابزار مینیمال، نان‌ریزه، دکمه‌های اقدام سریع و خروج) */}
          <header className="h-17 px-4 sm:px-6 bg-white/90 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-20 flex items-center justify-between gap-4 shadow-2xs">
            {/* سمت راست هدر: دکمه همبرگری موبایل + نشانگر مسیر (Breadcrumbs) */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden size-10 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 grid place-items-center transition-colors"
                aria-label="باز کردن منو"
              >
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>

              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-500">
                <Link href="/admin" className="hover:text-slate-800 transition-colors">
                  پنل مدیریت
                </Link>
                <svg className="size-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                <span className="text-slate-900 font-bold">{activeLabel}</span>
              </nav>
            </div>

            {/* سمت چپ هدر: میانبرها، نوتیفیکیشن، مشاهده فروشگاه و دکمه خروج */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              <Link
                href="/catalog"
                target="_blank"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
                title="مشاهده نمای مشتریان"
              >
                <span>مشاهده کاتالوگ فروشگاه</span>
                <svg className="size-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </Link>

              <NotificationBell />

              <div className="h-5 w-px bg-slate-200 hidden sm:block" />

              <div className="flex items-center gap-2">
                <LogoutButton />
              </div>
            </div>
          </header>

          {/* بستر رندر محتوا — دارای عرض بهینه، فضای تنفس کافی و تایپوگرافی تمیز */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fadeIn">
            {children}
          </main>
        </div>
      </div>

      {/* منوی کشویی واکنش‌گرا برای موبایل و تبلت با پس‌زمینه محو */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 w-72 max-w-full bg-white shadow-2xl flex flex-col z-10">
            {/* هدر منوی موبایل */}
            <div className="h-16 px-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="size-8 grid place-items-center bg-amber-500 text-slate-950 text-sm font-black rounded-lg">
                  ک
                </span>
                <span className="font-extrabold text-sm text-slate-900">پنل مدیریت کاردو B2B</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="size-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 grid place-items-center"
              >
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* لیست آیتم‌های منو موبایل */}
            <div className="flex-1 overflow-y-auto p-3 space-y-6">
              {navGroups.map((group, gIdx) => (
                <div key={gIdx} className="space-y-1">
                  <div className="px-3 pb-1 text-[11px] font-bold text-slate-400">
                    {group.title}
                  </div>
                  {group.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-amber-500/15 text-amber-900 font-bold border border-amber-500/30"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <span className={isActive ? "text-amber-600" : "text-slate-400"}>
                          {item.icon}
                        </span>
                        <span className="flex-1 text-right">{item.label}</span>
                        {item.badge && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* پروفایل کاربر در انتهای منو موبایل */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="text-xs font-bold text-slate-800">
                {admin.name ?? admin.username}
              </div>
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
