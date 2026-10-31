"use client";

import React from "react";
import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";

export interface CustomerKpiProps {
  wallet: number;
  availableCredit: number;
  creditLimit?: number;
  tierName?: string | null;
  tierDiscount?: number;
  customerDiscount?: number;
  inTransitCount?: number;
  activeChequesCount?: number;
  isAdmin?: boolean;
}

/*
 * کارت‌های شاخص‌های کلیدی همکار (KPI Cards)
 * طراحی بهینه‌شده، فشرده و سبک مطابق با استانداردهای Apple HIG و Material 3:
 * - در موبایل: چیدمان شبکه‌ای ۲ در ۲ (بسیار کوچک‌تر و بدون اشغال فضای عمودی صفحه)
 * - در دسکتاپ: ۴ کارت افقی باریک و شیک
 * - داده‌های واقعی و اصلاح‌شده با پیوندهای مستقیم
 */
export function CustomerKpiCards({
  wallet,
  availableCredit,
  creditLimit = 0,
  tierName,
  tierDiscount = 0,
  customerDiscount = 0,
  inTransitCount = 0,
  activeChequesCount = 0,
  isAdmin = false,
}: CustomerKpiProps) {
  const totalDiscount = tierDiscount + customerDiscount;

  if (isAdmin) {
    return (
      <div className="w-full grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 my-2.5 sm:my-4 animate-fadeIn">
        {/* ادمین کارت ۱: مدیریت قطعات */}
        <Link
          href="/admin/products"
          prefetch={false}
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-linear-to-br from-slate-900 via-slate-850 to-slate-900 text-white p-2.5 sm:p-3.5 border border-slate-700/70 hover:border-amber-400/60 shadow-xs hover:shadow-md transition-all active:scale-[0.98] flex flex-col justify-between select-none"
        >
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="size-5 sm:size-6 rounded-md bg-amber-400/15 text-amber-400 grid place-items-center text-xs font-bold shrink-0 border border-amber-400/25">
                📦
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-slate-300 truncate">
                محصولات انبار
              </span>
            </div>
            <span className="text-[9px] sm:text-[10px] text-amber-400 font-bold group-hover:translate-x-[-2px] transition-transform shrink-0">
              ←
            </span>
          </div>
          <div className="my-0.5">
            <div className="text-xs sm:text-base font-black nums tracking-tight text-white truncate">
              کاتالوگ مرکزی کرمان
            </div>
          </div>
          <div className="pt-1 border-t border-slate-800 text-[9px] sm:text-[10px] text-slate-400 flex items-center justify-between truncate">
            <span>مدیریت قیمت و موجودی</span>
            <span className="text-amber-400 font-bold">ورود به پنل</span>
          </div>
        </Link>

        {/* ادمین کارت ۲: سفارش‌ها */}
        <Link
          href="/admin/orders"
          prefetch={false}
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-linear-to-br from-blue-950 via-slate-900 to-indigo-950 text-white p-2.5 sm:p-3.5 border border-blue-900/60 hover:border-blue-400/60 shadow-xs hover:shadow-md transition-all active:scale-[0.98] flex flex-col justify-between select-none"
        >
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="size-5 sm:size-6 rounded-md bg-blue-500/15 text-blue-300 grid place-items-center text-xs font-bold shrink-0 border border-blue-500/25">
                ⚡
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-blue-200 truncate">
                سفارش‌های جدید
              </span>
            </div>
            <span className="text-[9px] sm:text-[10px] text-blue-300 font-bold group-hover:translate-x-[-2px] transition-transform shrink-0">
              ←
            </span>
          </div>
          <div className="my-0.5">
            <div className="text-xs sm:text-base font-black nums tracking-tight text-white flex items-center gap-1.5 truncate">
              {inTransitCount > 0 ? (
                <>
                  <span>{toFaDigits(inTransitCount)} سفارش</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-500/30 text-blue-200">
                    نیازمند اقدام
                  </span>
                </>
              ) : (
                <span className="text-slate-300 font-bold">سفارش جدیدی نیست</span>
              )}
            </div>
          </div>
          <div className="pt-1 border-t border-blue-900/60 text-[9px] sm:text-[10px] text-blue-300/80 flex items-center justify-between truncate">
            <span>بررسی پیش‌فاکتورها</span>
            <span className="text-blue-300 font-bold">مشاهده لیست</span>
          </div>
        </Link>

        {/* ادمین کارت ۳: سطح دسترسی */}
        <Link
          href="/admin"
          prefetch={false}
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-linear-to-br from-amber-950 via-slate-900 to-amber-950 text-white p-2.5 sm:p-3.5 border border-amber-900/60 hover:border-amber-400/60 shadow-xs hover:shadow-md transition-all flex flex-col justify-between select-none"
        >
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="size-5 sm:size-6 rounded-md bg-amber-500/15 text-amber-300 grid place-items-center text-xs font-bold shrink-0 border border-amber-500/25">
                🛡️
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-amber-200 truncate">
                سطح دسترسی
              </span>
            </div>
            <span className="text-[9px] sm:text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 shrink-0 font-sans">
              ادمین ارشد
            </span>
          </div>
          <div className="my-0.5">
            <div className="text-xs sm:text-base font-black nums tracking-tight text-white truncate">
              مدیریت کل سیستم
            </div>
          </div>
          <div className="pt-1 border-t border-amber-900/60 text-[9px] sm:text-[10px] text-amber-300/80 flex items-center justify-between truncate">
            <span>دسترسی به تمام بخش‌ها</span>
            <span className="text-emerald-300 font-bold">فعال</span>
          </div>
        </Link>

        {/* ادمین کارت ۴: چک‌های دریافتی */}
        <Link
          href="/admin/cheques"
          prefetch={false}
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-linear-to-br from-teal-950 via-slate-900 to-emerald-950 text-white p-2.5 sm:p-3.5 border border-teal-900/60 hover:border-emerald-400/60 shadow-xs hover:shadow-md transition-all active:scale-[0.98] flex flex-col justify-between select-none"
        >
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="size-5 sm:size-6 rounded-md bg-emerald-500/15 text-emerald-300 grid place-items-center text-xs font-bold shrink-0 border border-emerald-500/25">
                🧾
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-emerald-200 truncate">
                چک‌های صیادی
              </span>
            </div>
            <span className="text-[9px] sm:text-[10px] text-emerald-300 font-bold group-hover:translate-x-[-2px] transition-transform shrink-0">
              ←
            </span>
          </div>
          <div className="my-0.5">
            <div className="text-xs sm:text-base font-black nums tracking-tight text-white flex items-center gap-1.5 truncate">
              {activeChequesCount > 0 ? (
                <>
                  <span>{toFaDigits(activeChequesCount)} فقره</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-200">
                    در صف بررسی
                  </span>
                </>
              ) : (
                <span className="text-slate-300 font-bold">چک جدیدی نیست</span>
              )}
            </div>
          </div>
          <div className="pt-1 border-t border-teal-900/60 text-[9px] sm:text-[10px] text-emerald-300/80 flex items-center justify-between truncate">
            <span>استعلام صیاد و تأیید</span>
            <span className="text-emerald-300 font-bold">بررسی</span>
          </div>
        </Link>
      </div>
    );
  }

  // نمای مشتری همکار (B2B Customer)
  return (
    <div className="w-full grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 my-2.5 sm:my-4 animate-fadeIn">
      {/* کارت ۱: موجودی کیف پول و خرید اعتباری */}
      <Link
        href="/wallet"
        prefetch={false}
        className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-linear-to-br from-slate-900 via-slate-850 to-slate-900 text-white p-2.5 sm:p-3.5 border border-slate-700/70 hover:border-amber-400/60 shadow-xs hover:shadow-md transition-all active:scale-[0.98] flex flex-col justify-between select-none"
      >
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="size-5 sm:size-6 rounded-md bg-amber-400/15 text-amber-400 grid place-items-center text-xs font-bold shrink-0 border border-amber-400/25">
              💳
            </span>
            <span className="text-[10px] sm:text-xs font-bold text-slate-300 truncate">
              کیف پول و اعتبار
            </span>
          </div>
          <span className="text-[9px] sm:text-[10px] text-amber-400 font-bold group-hover:translate-x-[-2px] transition-transform shrink-0">
            ←
          </span>
        </div>

        <div className="my-0.5">
          <div className="text-xs sm:text-base font-black nums tracking-tight text-white truncate">
            {formatToman(wallet)}{" "}
            <span className="text-[9px] sm:text-[11px] font-normal text-slate-400 font-sans">
              تومان
            </span>
          </div>
        </div>

        <div className="pt-1 border-t border-slate-800 text-[9px] sm:text-[10px] text-slate-400 flex items-center justify-between truncate">
          {creditLimit > 0 ? (
            <span>
              اعتبار آزاد:{" "}
              <strong className="text-emerald-400 nums">
                {formatToman(availableCredit)} ت
              </strong>
            </span>
          ) : (
            <span className="text-amber-300/90 font-medium">شارژ آنلاین حساب</span>
          )}
          <span className="text-amber-400/80 font-bold">کیف پول</span>
        </div>
      </Link>

      {/* کارت ۲: سفارش‌های در مسیر باربری کرمان */}
      <Link
        href="/orders"
        prefetch={false}
        className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-linear-to-br from-blue-950 via-slate-900 to-indigo-950 text-white p-2.5 sm:p-3.5 border border-blue-900/60 hover:border-blue-400/60 shadow-xs hover:shadow-md transition-all active:scale-[0.98] flex flex-col justify-between select-none"
      >
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="size-5 sm:size-6 rounded-md bg-blue-500/15 text-blue-300 grid place-items-center text-xs font-bold shrink-0 border border-blue-500/25">
              🚚
            </span>
            <span className="text-[10px] sm:text-xs font-bold text-blue-200 truncate">
              سفارش‌های در جریان
            </span>
          </div>
          <span className="text-[9px] sm:text-[10px] text-blue-300 font-bold group-hover:translate-x-[-2px] transition-transform shrink-0">
            ←
          </span>
        </div>

        <div className="my-0.5">
          <div className="text-xs sm:text-base font-black nums tracking-tight text-white flex items-center gap-1.5 truncate">
            {inTransitCount > 0 ? (
              <>
                <span>{toFaDigits(inTransitCount)} سفارش</span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-500/30 text-blue-200">
                  در مسیر
                </span>
              </>
            ) : (
              <span className="text-slate-300 font-bold">بدون سفارش جاری</span>
            )}
          </div>
        </div>

        <div className="pt-1 border-t border-blue-900/60 text-[9px] sm:text-[10px] text-blue-300/80 flex items-center justify-between truncate">
          <span>
            {inTransitCount > 0
              ? "ارسال از انبار مرکزی کرمان"
              : "آماده ثبت فاکتور جدید"}
          </span>
          <span className="text-blue-300 font-bold">پیگیری بار</span>
        </div>
      </Link>

      {/* کارت ۳: رتبه همکاری و تخفیف نقدی همکار */}
      <div className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-linear-to-br from-amber-950 via-slate-900 to-amber-950 text-white p-2.5 sm:p-3.5 border border-amber-900/60 hover:border-amber-400/60 shadow-xs hover:shadow-md transition-all flex flex-col justify-between select-none">
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="size-5 sm:size-6 rounded-md bg-amber-500/15 text-amber-300 grid place-items-center text-xs font-bold shrink-0 border border-amber-500/25">
              👑
            </span>
            <span className="text-[10px] sm:text-xs font-bold text-amber-200 truncate">
              تخفیف همکاری
            </span>
          </div>
          <span className="text-[9px] sm:text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 shrink-0 font-sans">
            {tierName || "همکار رسمی"}
          </span>
        </div>

        <div className="my-0.5">
          <div className="text-xs sm:text-base font-black nums tracking-tight text-white truncate">
            {totalDiscount > 0 ? (
              <>
                {toFaDigits(totalDiscount)}٪{" "}
                <span className="text-[9px] sm:text-[11px] font-normal text-amber-300 font-sans">
                  کسر مستقیم پای فاکتور
                </span>
              </>
            ) : (
              <span>تخفیف همکاری فعال</span>
            )}
          </div>
        </div>

        <div className="pt-1 border-t border-amber-900/60 text-[9px] sm:text-[10px] text-amber-300/80 flex items-center justify-between truncate">
          <span>انبار مرکزی کرمان</span>
          <span className="text-emerald-300 font-bold">اعمال خودکار</span>
        </div>
      </div>

      {/* کارت ۴: چک‌های صیادی و وضعیت مالی */}
      <Link
        href="/cheques"
        prefetch={false}
        className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-linear-to-br from-teal-950 via-slate-900 to-emerald-950 text-white p-2.5 sm:p-3.5 border border-teal-900/60 hover:border-emerald-400/60 shadow-xs hover:shadow-md transition-all active:scale-[0.98] flex flex-col justify-between select-none"
      >
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="size-5 sm:size-6 rounded-md bg-emerald-500/15 text-emerald-300 grid place-items-center text-xs font-bold shrink-0 border border-emerald-500/25">
              🧾
            </span>
            <span className="text-[10px] sm:text-xs font-bold text-emerald-200 truncate">
              چک‌های صیادی
            </span>
          </div>
          <span className="text-[9px] sm:text-[10px] text-emerald-300 font-bold group-hover:translate-x-[-2px] transition-transform shrink-0">
            ←
          </span>
        </div>

        <div className="my-0.5">
          <div className="text-xs sm:text-base font-black nums tracking-tight text-white flex items-center gap-1.5 truncate">
            {activeChequesCount > 0 ? (
              <>
                <span>{toFaDigits(activeChequesCount)} فقره</span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-200">
                  در انتظار پاس
                </span>
              </>
            ) : (
              <>
                <span>وضعیت سفید</span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-300">
                  بدون بدهی
                </span>
              </>
            )}
          </div>
        </div>

        <div className="pt-1 border-t border-teal-900/60 text-[9px] sm:text-[10px] text-emerald-300/80 flex items-center justify-between truncate">
          <span>
            {activeChequesCount > 0
              ? "استعلام سامانه صیاد"
              : "تسویه کامل و اعتبار آزاد"}
          </span>
          <span className="text-emerald-300 font-bold">سامانه صیاد</span>
        </div>
      </Link>
    </div>
  );
}
