"use client";

import React from "react";
import { toFaDigits } from "@/lib/digits";
import { faDateTime } from "@/lib/date";

export interface OrderProgressProps {
  orderStatus: "PROFORMA" | "AWAITING_CREDIT_APPROVAL" | "APPROVED_CREDIT" | "PAID" | "CANCELLED" | "EXPIRED" | string;
  shipmentStatus?: "PREPARING" | "HANDED_TO_CARRIER" | "DELIVERED" | "CANCELLED" | string | null;
  paidAt?: Date | string | null;
  shippedAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  waybillNumber?: string | null;
  carrierName?: string | null;
}

export function OrderProgressBar({
  orderStatus,
  shipmentStatus,
  paidAt,
  shippedAt,
  deliveredAt,
  waybillNumber,
  carrierName,
}: OrderProgressProps) {
  // محاسبه درصد پیشرفت و گام فعال بر اساس فرمول درخواستی کاربر
  let percent = 10;
  let activeStep = 1; // 1: ثبت، 2: پرداخت، 3: جمع‌آوری انبار، 4: ارسال باربری، 5: تحویل
  let statusText = "پیش‌فاکتور ثبت شد (در انتظار پرداخت یا تأیید)";
  let statusColor = "from-amber-500 to-amber-600";

  const isPaidOrApproved = orderStatus === "PAID" || orderStatus === "APPROVED_CREDIT";
  const isCancelled = orderStatus === "CANCELLED" || orderStatus === "EXPIRED" || shipmentStatus === "CANCELLED";

  if (isCancelled) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 sm:p-5 text-rose-900 shadow-xs mb-6">
        <div className="flex items-center gap-3">
          <span className="size-10 rounded-xl bg-rose-600 text-white grid place-items-center font-bold text-lg shadow-sm">
            ✕
          </span>
          <div>
            <div className="font-extrabold text-sm sm:text-base">این سفارش لغو یا منقضی گردیده است</div>
            <div className="text-xs text-rose-700 mt-0.5">در صورت نیاز می‌توانید مجدداً اقلام را از کاتالوگ ثبت نمایید.</div>
          </div>
        </div>
      </div>
    );
  }

  if (shipmentStatus === "DELIVERED") {
    percent = 100;
    activeStep = 4;
    statusText = "سفارش با موفقیت تحویل همکار شد (تکمیل ۱۰۰٪)";
    statusColor = "from-emerald-500 to-teal-600";
  } else if (shipmentStatus === "HANDED_TO_CARRIER") {
    percent = 80;
    activeStep = 3;
    statusText = `بار تحویل ${carrierName || "باربری کرمان"} گردید (بیجک: ${waybillNumber || "ثبت‌شده"})`;
    statusColor = "from-blue-600 to-indigo-600";
  } else if (shipmentStatus === "PREPARING" || isPaidOrApproved) {
    if (shipmentStatus === "PREPARING") {
      percent = 50;
      activeStep = 2;
      statusText = "انبار مرکزی کرمان در حال جمع‌آوری و بسته‌بندی اقلام است";
      statusColor = "from-amber-500 via-orange-500 to-amber-600";
    } else {
      percent = 20;
      activeStep = 1;
      statusText = "فاکتور تسویه شد و به صف جمع‌آوری انبار پیوست (۲۰٪)";
      statusColor = "from-amber-500 to-orange-500";
    }
  }

  const steps = [
    {
      step: 1,
      title: "ثبت و تسویه فاکتور",
      desc: isPaidOrApproved ? "تسویه انجام شد" : "در انتظار پرداخت",
      percentTarget: 20,
      icon: (
        <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </svg>
      ),
    },
    {
      step: 2,
      title: "جمع‌آوری در انبار کرمان",
      desc: percent >= 50 ? "انباردار در حال بسته‌بندی" : "در نوبت خروج قفسه",
      percentTarget: 50,
      icon: (
        <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      ),
    },
    {
      step: 3,
      title: "ارسال و بارنامه باربری",
      desc: percent >= 80 ? (carrierName ? `حواله ${carrierName}` : "تحویل باربری گردید") : "صدور بیجک باربری",
      percentTarget: 80,
      icon: (
        <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.75a2.25 2.25 0 00-2.25-2.25h-2.25V6.75a2.25 2.25 0 00-2.25-2.25H3.375A2.25 2.25 0 001.125 6.75v7.5m17.25 0h-4.5m4.5 0v3.75" />
        </svg>
      ),
    },
    {
      step: 4,
      title: "تحویل درب فروشگاه",
      desc: percent === 100 ? "تحویل قطعی شد" : "دریافت کالا توسط همکار",
      percentTarget: 100,
      icon: (
        <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="w-full bg-linear-to-b from-white to-slate-50/80 rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-xs mb-6 overflow-hidden">
      {/* سرتیتر وضعیت لحظه‌ای و درصد زنده */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${percent === 100 ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span className={`relative inline-flex rounded-full size-3 ${percent === 100 ? "bg-emerald-500" : "bg-amber-500"}`} />
          </span>
          <div>
            <div className="text-xs text-slate-500 font-medium">مرحله جاری رسیدن کالا:</div>
            <div className="text-xs sm:text-sm font-extrabold text-slate-900">{statusText}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">پیشرفت کل:</span>
          <span className="text-sm sm:text-base font-black text-slate-900 bg-slate-100 border border-slate-200 px-3 py-0.5 rounded-full nums">
            {toFaDigits(percent)}٪
          </span>
        </div>
      </div>

      {/* نوار گرافیکی پیوسته پیشرفت (Progress Bar با شیب ملایم اپل) */}
      <div className="relative mt-5 mb-8">
        {/* خط پس‌زمینه خاکستری */}
        <div className="h-2.5 w-full bg-slate-200/80 rounded-full overflow-hidden">
          <div
            className={`h-full bg-linear-to-r ${statusColor} transition-all duration-700 ease-out rounded-full shadow-inner`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* چهار ایستگاه اصلی نوار روند (Steps) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {steps.map((st) => {
          const isDone = percent >= st.percentTarget;
          const isCurrent = !isDone && percent >= (st.step === 1 ? 0 : steps[st.step - 2].percentTarget);

          return (
            <div
              key={st.step}
              className={`flex flex-col p-3 rounded-xl transition-all border ${
                isDone
                  ? "bg-emerald-50/60 border-emerald-200 text-emerald-950"
                  : isCurrent
                  ? "bg-amber-50/70 border-amber-300 text-amber-950 shadow-xs ring-2 ring-amber-400/20"
                  : "bg-slate-50/40 border-slate-200/70 text-slate-400"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`size-8 rounded-lg grid place-items-center font-bold text-xs shadow-xs ${
                    isDone
                      ? "bg-emerald-600 text-white"
                      : isCurrent
                      ? "bg-amber-500 text-slate-950 animate-bounce"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {isDone ? "✓" : st.icon}
                </span>
                <span className="text-[11px] font-black nums px-1.5 py-0.5 rounded-md bg-white/70 border border-black/5">
                  {toFaDigits(st.percentTarget)}٪
                </span>
              </div>

              <div className="font-extrabold text-xs text-slate-900 truncate">{st.title}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{st.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
