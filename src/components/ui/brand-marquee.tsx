"use client";

import React from "react";
import Link from "next/link";

interface BrandItem {
  id: string;
  name: string;
  latin: string;
  category: string;
  badge: string;
  color: string;
}

const BRANDS: BrandItem[] = [
  { id: "isaco", name: "ایساکو", latin: "ISACO", category: "قطعات ایران‌خودرو", badge: "اصلی", color: "from-blue-600 to-indigo-700" },
  { id: "saipa", name: "سایپا یدک", latin: "SAIPA YADAK", category: "قطعات سایپا و زامیاد", badge: "اصلی", color: "from-orange-500 to-amber-600" },
  { id: "ezam", name: "گروه عظام", latin: "EZAM GROUP", category: "موتوری، تعلیق و گیربکس", badge: "استاندارد", color: "from-red-600 to-rose-700" },
  { id: "serkan", name: "فیلتر سرکان", latin: "SERKAN", category: "انواع فیلتراسیون خودرو", badge: "تضمین اصالت", color: "from-emerald-600 to-teal-700" },
  { id: "valeo", name: "والئو", latin: "VALEO", category: "دیسک، صفحه و کلاچ", badge: "فرانسه", color: "from-cyan-600 to-blue-700" },
  { id: "crouse", name: "صنایع کروز", latin: "CROUSE", category: "سیستم برقی و کنترل موتور", badge: "گرید A", color: "from-indigo-600 to-purple-700" },
  { id: "dayco", name: "دایکو", latin: "DAYCO", category: "تسمه تایم و تسمه دینام", badge: "ایتالیا", color: "from-amber-600 to-orange-700" },
  { id: "amata", name: "آماتا صمد", latin: "AMATA SAMAD", category: "جلوبندی و سیبک‌جات", badge: "صادراتی", color: "from-slate-700 to-slate-900" },
  { id: "dinapart", name: "دینا پارت", latin: "DINA PART", category: "قطعات یدکی شرکتی", badge: "گارانتی‌دار", color: "from-rose-600 to-red-700" },
  { id: "parslent", name: "لنت پارس", latin: "PARS LENT", category: "لنت ترمز سرامیکی و متالیک", badge: "پرفروش", color: "from-teal-600 to-emerald-700" },
];

export function BrandMarquee({ onSelectBrand }: { onSelectBrand?: (brandName: string) => void }) {
  return (
    <div className="w-full py-4 overflow-hidden border-y border-slate-200/80 bg-linear-to-r from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-amber-500" />
            <h3 className="font-extrabold text-xs sm:text-sm text-slate-800 tracking-tight">
              برندهای معتبر قطعه‌سازی همکار با کاردو B2B
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">بیش از ۲۰۰ تولیدکننده و واردکننده مستقیم</span>
        </div>

        {/* لیست اسکرولی نرم افقی برندها */}
        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {BRANDS.map((b) => (
            <button
              key={b.id}
              onClick={() => onSelectBrand?.(b.name)}
              className="group shrink-0 p-3 rounded-2xl bg-white border border-slate-200/90 hover:border-amber-400 hover:shadow-md transition-all duration-200 text-right flex items-center gap-3 min-w-44 select-none cursor-pointer"
            >
              {/* نشان لوگوی مینیمال رنگی */}
              <div
                className={`size-10 rounded-xl bg-linear-to-br ${b.color} text-white font-black text-xs grid place-items-center shadow-xs group-hover:scale-105 transition-transform`}
              >
                {b.name.charAt(0)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-extrabold text-xs text-slate-900 group-hover:text-amber-600 transition-colors truncate">
                    {b.name}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-600 border border-slate-200/60 shrink-0">
                    {b.badge}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">{b.latin}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
