"use client";

import React, { useState } from "react";
import Link from "next/link";

interface TickerItem {
  id: string;
  badge: string;
  text: string;
  link?: string;
  trend?: "up" | "down" | "hot" | "info";
}

const DEFAULT_ITEMS: TickerItem[] = [
  {
    id: "1",
    badge: "انبار مرکزی کرمان",
    text: "سفارش‌های ثبت‌شده تا ساعت ۱۴:۰۰ امروز با باربری‌های پیام شمس، پیشتاز و ناوگان کاردو ارسال می‌شوند.",
    trend: "info",
  },
  {
    id: "2",
    badge: "آفر ویژه پاییزه",
    text: "توزیع فیلترجات سرکان و لنت‌های ترمز پراید و پژو با قیمت پایه قدیم و تخفیف نقدی آغاز شد.",
    trend: "hot",
    link: "/catalog?category=ترمز",
  },
  {
    id: "3",
    badge: "نوسان بازار",
    text: "نرخ دیسک و صفحه کلاچ والئو و دایکو در انبار تثبیت شد؛ ثبت پیش‌فاکتور با تضمین قیمت ۲۴ ساعته.",
    trend: "down",
    link: "/catalog?partBrand=والئو",
  },
  {
    id: "4",
    badge: "توزیع شهرستان‌ها",
    text: "ارسال رایگان هفتگی به فروشگاه‌های لوازم یدکی رفسنجان، سیرجان، جیرفت، بم و کهنوج فعال است.",
    trend: "info",
  },
];

export function MarketTicker() {
  const [closed, setClosed] = useState(false);
  const [paused, setPaused] = useState(false);

  if (closed) return null;

  return (
    <div className="w-full bg-slate-950 text-slate-100 border-b border-slate-800/90 text-xs py-2 px-3 sm:px-6 relative overflow-hidden select-none">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* نشانگر نبض زنده تابلوی اعلامات بورس قطعات */}
        <div className="flex items-center gap-2 shrink-0 z-10 bg-slate-950/90 pl-3">
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-2 bg-amber-500" />
          </span>
          <span className="font-black text-[11px] tracking-tight text-amber-400 whitespace-nowrap flex items-center gap-1">
            <span>نبض بازار کاردو</span>
            <span className="text-[10px] text-slate-500 font-normal">|</span>
          </span>
        </div>

        {/* نوار متحرک پیوسته اخبار بازار */}
        <div
          className="flex-1 overflow-hidden relative cursor-pointer"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div
            className={`flex items-center gap-8 whitespace-nowrap ${
              paused ? "animate-none" : "animate-marquee"
            }`}
            style={{
              animation: paused ? "none" : "marquee 35s linear infinite",
            }}
          >
            {/* ردیف اول */}
            {DEFAULT_ITEMS.map((it) => (
              <TickerBadge key={it.id} item={it} />
            ))}
            {/* تکرار برای پیوستگی اسکرول */}
            {DEFAULT_ITEMS.map((it) => (
              <TickerBadge key={`dup-${it.id}`} item={it} />
            ))}
          </div>
        </div>

        {/* دکمه بستن */}
        <button
          onClick={() => setClosed(true)}
          className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 z-10 pr-1 text-xs"
          title="بستن نوار اعلان"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function TickerBadge({ item }: { item: TickerItem }) {
  const content = (
    <div className="inline-flex items-center gap-2 group hover:text-amber-300 transition-colors">
      <span
        className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
          item.trend === "hot"
            ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
            : item.trend === "down"
            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
            : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
        }`}
      >
        {item.badge}
      </span>
      <span className="text-slate-300 text-[11px] group-hover:underline">
        {item.text}
      </span>
    </div>
  );

  if (item.link) {
    return <Link href={item.link}>{content}</Link>;
  }

  return content;
}
