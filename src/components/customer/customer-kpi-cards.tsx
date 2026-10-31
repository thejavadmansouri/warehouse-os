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
}

export function CustomerKpiCards({
  wallet,
  availableCredit,
  creditLimit = 0,
  tierName,
  tierDiscount = 0,
  customerDiscount = 0,
  inTransitCount = 0,
  activeChequesCount = 0,
}: CustomerKpiProps) {
  const totalDiscount = tierDiscount + customerDiscount;
  const usedCredit = Math.max(0, creditLimit - availableCredit);
  const creditUsagePercent = creditLimit > 0 ? Math.min(100, Math.round((usedCredit / creditLimit) * 100)) : 0;

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 my-5 animate-fadeIn">
      {/* کارت ۱: موجودی کیف پول و خرید اعتباری */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-slate-900 via-slate-800 to-slate-950 text-white p-5 shadow-md flex flex-col justify-between border border-slate-700/60 group hover:border-amber-500/50 transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="size-8 rounded-xl bg-amber-500/20 text-amber-400 grid place-items-center text-sm font-bold border border-amber-500/30">
              💳
            </span>
            <span className="text-xs font-bold text-slate-300">کیف پول و اعتبار</span>
          </div>
          <Link
            href="/wallet"
            className="text-[11px] font-bold text-amber-400 hover:text-amber-300 underline"
          >
            شارژ حساب
          </Link>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] text-slate-400 font-medium">موجودی نقدی آزاد:</div>
          <div className="text-xl sm:text-2xl font-black nums tracking-tight text-white">
            {formatToman(wallet)}
          </div>
        </div>

        {creditLimit > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-700/60 space-y-1.5">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>سقف اعتبار دفتری:</span>
              <span className="nums text-white font-bold">{formatToman(creditLimit)}</span>
            </div>
            {/* میله مصرف اعتبار */}
            <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  creditUsagePercent > 80 ? "bg-rose-500" : "bg-amber-400"
                }`}
                style={{ width: `${creditUsagePercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>مصرف‌شده: {toFaDigits(creditUsagePercent)}٪</span>
              <span className="text-emerald-400 font-medium">مانده آزاد: {formatToman(availableCredit)}</span>
            </div>
          </div>
        )}
      </div>

      {/* کارت ۲: سفارش‌های در مسیر باربری کرمان */}
      <div className="rounded-3xl bg-linear-to-br from-blue-950 via-indigo-950 to-blue-900 text-white p-5 shadow-md flex flex-col justify-between border border-blue-800/60 group hover:border-blue-400/50 transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="size-8 rounded-xl bg-blue-500/20 text-blue-300 grid place-items-center text-sm font-bold border border-blue-500/30">
              🚚
            </span>
            <span className="text-xs font-bold text-blue-200">سفارش‌ها و باربری</span>
          </div>
          <Link
            href="/orders"
            className="text-[11px] font-bold text-blue-300 hover:text-white underline"
          >
            پیگیری اسناد
          </Link>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] text-blue-300/80 font-medium">بارنامه‌های در جریان کرمان:</div>
          <div className="text-xl sm:text-2xl font-black nums tracking-tight text-white flex items-center gap-2">
            <span>{toFaDigits(inTransitCount > 0 ? inTransitCount : 1)} سفارش</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30">
              در حال ارسال
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-blue-800/60 text-[11px] text-blue-200/80 flex items-center justify-between">
          <span>ارسال امروز با: پیام شمس / پیشتاز</span>
          <span className="text-amber-300 font-bold">رهگیری زنده</span>
        </div>
      </div>

      {/* کارت ۳: رتبه همکاری و تخفیف نقدی همکار */}
      <div className="rounded-3xl bg-linear-to-br from-amber-950 via-orange-950 to-amber-900 text-white p-5 shadow-md flex flex-col justify-between border border-amber-800/60 group hover:border-amber-400/50 transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="size-8 rounded-xl bg-amber-500/20 text-amber-300 grid place-items-center text-sm font-bold border border-amber-500/30">
              👑
            </span>
            <span className="text-xs font-bold text-amber-200">رتبه و تخفیف همکار</span>
          </div>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-sans">
            {tierName || "همکار رسمی"}
          </span>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] text-amber-300/80 font-medium">مجموع تخفیف پای فاکتور:</div>
          <div className="text-xl sm:text-2xl font-black nums tracking-tight text-white">
            {toFaDigits(totalDiscount > 0 ? totalDiscount : 5)}٪ <span className="text-xs font-normal text-amber-300">کسر مستقیم</span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-amber-800/60 text-[11px] text-amber-200/80 flex items-center justify-between">
          <span>تخفیف گروهی + مشتری</span>
          <span className="text-emerald-300 font-bold">اعمال خودکار</span>
        </div>
      </div>

      {/* کارت ۴: چک‌های صیادی و وضعیت مالی */}
      <div className="rounded-3xl bg-linear-to-br from-emerald-950 via-teal-950 to-emerald-900 text-white p-5 shadow-md flex flex-col justify-between border border-emerald-800/60 group hover:border-emerald-400/50 transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="size-8 rounded-xl bg-emerald-500/20 text-emerald-300 grid place-items-center text-sm font-bold border border-emerald-500/30">
              🧾
            </span>
            <span className="text-xs font-bold text-emerald-200">چک‌های صیادی</span>
          </div>
          <Link
            href="/cheques"
            className="text-[11px] font-bold text-emerald-300 hover:text-white underline"
          >
            مشاهده چک‌ها
          </Link>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] text-emerald-300/80 font-medium">چک‌های در انتظار پاس:</div>
          <div className="text-xl sm:text-2xl font-black nums tracking-tight text-white flex items-center gap-2">
            <span>{toFaDigits(activeChequesCount > 0 ? activeChequesCount : 0)} فقره</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/30">
              وضعیت سفید
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-emerald-800/60 text-[11px] text-emerald-200/80 flex items-center justify-between">
          <span>ثبت در سامانه صیاد بنفش</span>
          <span className="text-emerald-300 font-bold">استعلام آنلاین</span>
        </div>
      </div>
    </div>
  );
}
