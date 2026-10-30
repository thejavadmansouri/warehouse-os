"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatToman, toFaDigits } from "@/lib/digits";
import { faDate } from "@/lib/date";
import { INQUIRY_STATUS } from "@/lib/status";
import type { InquiryRecord } from "../inquiries-view";

const toneClass: Record<string, string> = {
  amber: "text-amber-700 bg-amber-50 border border-amber-200",
  green: "text-emerald-700 bg-emerald-50 border border-emerald-200",
  red: "text-rose-700 bg-rose-50 border border-rose-200",
  ink: "text-slate-700 bg-slate-100 border border-slate-200",
};

export function InquiryDetail(props: {
  inquiry: InquiryRecord;
  shippingMethods: { id: string; name: string; cost: number; freeAbove: number | null; note: string | null }[];
}) {
  const router = useRouter();
  const { inquiry } = props;
  const [shippingId, setShippingId] = useState(props.shippingMethods[0]?.id ?? "");
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const st = INQUIRY_STATUS[inquiry.status] ?? INQUIRY_STATUS.PENDING;
  const canConvert = inquiry.status === "ANSWERED" && (inquiry.totalQuoted ?? 0) > 0;

  async function convertToOrder() {
    setConverting(true);
    setError(null);

    try {
      const res = await fetch(`/api/inquiries/${inquiry.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shippingId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "تبدیل استعلام با خطا مواجه شد");
        setConverting(false);
        return;
      }

      router.push(`/orders/${data.order.id}`);
    } catch {
      setError("خطا در برقراری ارتباط با سرور");
      setConverting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-3 sm:px-6 py-6 pb-24">
      {/* هدر استعلام */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <Link href="/inquiries" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mb-1 font-medium">
            <span>←</span>
            <span>بازگشت به فهرست استعلام‌ها</span>
          </Link>
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <span>استعلام شماره:</span>
            <span className="nums font-mono text-blue-700">{inquiry.number}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">ثبت‌شده در تاریخ {faDate(inquiry.createdAt)}</p>
        </div>

        <span className={`text-xs font-bold px-3 py-1 rounded-full ${toneClass[st.tone]}`}>
          {st.label}
        </span>
      </div>

      {error && (
        <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
          {error}
        </div>
      )}

      {inquiry.status === "CONVERTED" && inquiry.convertedOrderId && (
        <div className="mt-4 p-4 card bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
          <p className="font-bold text-emerald-800">
            ✓ این استعلام با موفقیت به پیش‌فاکتور تبدیل شده است.
          </p>
          <Link
            href={`/orders/${inquiry.convertedOrderId}`}
            className="btn btn-primary text-xs px-3.5 py-2 font-bold"
          >
            مشاهده و پرداخت پیش‌فاکتور
          </Link>
        </div>
      )}

      {/* اطلاعات و یادداشت‌ها */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="card p-3.5 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] text-slate-500 font-medium block mb-1">یادداشت و شرایط درخواستی شما:</span>
          <p className="text-slate-900 font-medium leading-relaxed">
            {inquiry.customerNote || "توضیحاتی ثبت نشده است"}
          </p>
        </div>

        <div className="card p-3.5 bg-blue-50/60 border border-blue-200/80 rounded-xl">
          <span className="text-[11px] text-blue-700 font-bold block mb-1">پاسخ و توضیحات کارشناس کاردو:</span>
          <p className="text-slate-900 font-medium leading-relaxed">
            {inquiry.adminNote || (inquiry.status === "PENDING" ? "در صف بررسی و استعلام تأمین‌کنندگان انبار کرمان..." : "—")}
          </p>
        </div>
      </div>

      {/* اقلام استعلام: طراحی دوگانه (کارت در موبایل، جدول در تبلت و دسکتاپ) */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-extrabold text-slate-900">اقلام استعلام‌شده و قیمت‌های اعلامی کاردو</h2>
          <span className="nums text-xs text-slate-500">
            {toFaDigits(inquiry.items.length)} قلم کالا
          </span>
        </div>

        {/* ۱. نمای موبایل (Cards) */}
        <div className="sm:hidden space-y-3">
          {inquiry.items.map((item, idx) => (
            <div key={item.id} className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="nums text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  ردیف {toFaDigits(idx + 1)}
                </span>
                <span className="nums text-xs font-bold text-slate-800 bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                  {toFaDigits(item.qty)} {item.unit}
                </span>
              </div>

              <div>
                <p className="font-bold text-sm text-slate-900">{item.partName}</p>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1 flex-wrap">
                  {item.brand && <span>{item.brand}</span>}
                  {item.model && <span>({item.model})</span>}
                  {item.sku && <span className="font-mono nums bg-slate-100 px-1.5 py-0.2 rounded">{item.sku}</span>}
                </div>
                {item.adminNote && (
                  <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 p-2 rounded-lg mt-2">
                    توضیح انبار: {item.adminNote}
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs nums">
                <div>
                  <span className="text-slate-400 block text-[10px]">قیمت واحد:</span>
                  <span className="font-semibold text-slate-700">
                    {item.quotedUnitPrice ? `${formatToman(item.quotedUnitPrice)} ت` : "در انتظار قیمت"}
                  </span>
                </div>
                <div className="text-left">
                  <span className="text-slate-400 block text-[10px]">جمع ردیف:</span>
                  <span className="font-extrabold text-sm text-slate-900">
                    {item.lineTotal ? `${formatToman(item.lineTotal)} تومان` : "—"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ۲. نمای دسکتاپ (Table) */}
        <div className="hidden sm:block card overflow-hidden border-slate-200 rounded-xl bg-white shadow-2xs">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
              <tr>
                <th className="py-3 px-3 text-center w-10">#</th>
                <th className="py-3 px-3 text-start">شرح قطعه</th>
                <th className="py-3 px-3 text-center">خودرو / مدل</th>
                <th className="py-3 px-3 text-center">کد فنی</th>
                <th className="py-3 px-3 text-center">تعداد</th>
                <th className="py-3 px-3 text-end">قیمت اعلامی واحد</th>
                <th className="py-3 px-3 text-end">جمع ردیف (تومان)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inquiry.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-3 text-center nums text-slate-500">{toFaDigits(idx + 1)}</td>
                  <td className="py-3 px-3">
                    <p className="font-bold text-xs text-slate-900">{item.partName}</p>
                    {item.adminNote && (
                      <p className="text-[10px] text-blue-600 mt-0.5">توضیح انبار: {item.adminNote}</p>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center text-slate-600">
                    {item.brand || "—"} {item.model ? `(${item.model})` : ""}
                  </td>
                  <td className="py-3 px-3 text-center nums font-mono text-[11px] text-slate-500">
                    {item.sku || "—"}
                  </td>
                  <td className="py-3 px-3 text-center nums font-semibold">
                    {toFaDigits(item.qty)} {item.unit}
                  </td>
                  <td className="py-3 px-3 text-end nums">
                    {item.quotedUnitPrice ? (
                      formatToman(item.quotedUnitPrice)
                    ) : (
                      <span className="text-slate-400 text-[11px]">در انتظار قیمت</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-end nums font-extrabold text-slate-900">
                    {item.lineTotal ? (
                      formatToman(item.lineTotal)
                    ) : (
                      <span className="text-slate-400 font-normal">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* جمع استعلام */}
        {inquiry.totalQuoted && inquiry.totalQuoted > 0 && (
          <div className="mt-3 p-4 card bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs sm:text-sm">
            <span className="font-extrabold text-slate-900">مجموع مبلغ کل اقلام استعلام:</span>
            <div className="nums font-extrabold text-base sm:text-lg text-blue-600 flex items-baseline gap-1">
              <span>{formatToman(inquiry.totalQuoted)}</span>
              <span className="text-xs font-normal text-slate-500">تومان</span>
            </div>
          </div>
        )}
      </div>

      {/* بخش تبدیل به پیش‌فاکتور (در صورتی که قیمت‌گذاری شده باشد) */}
      {canConvert && (
        <div className="mt-6 card p-4 sm:p-5 bg-white border-2 border-blue-500/40 rounded-xl shadow-xs space-y-4">
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-slate-900">تأیید قیمت و صدور فوری پیش‌فاکتور</h3>
            <p className="text-xs text-slate-500 mt-1">
              قیمت‌ها مورد تأیید است؟ شیوه ارسال باربری را انتخاب کرده و روی «صدور پیش‌فاکتور» کلیک نمایید تا سند رسمی با رزرو کالا برایتان صادر شود.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
            <div>
              <label className="label block mb-1">روش ارسال پیش‌فرض کالا:</label>
              <select
                value={shippingId}
                onChange={(e) => setShippingId(e.target.value)}
                className="input text-xs h-11 border-slate-300 rounded-lg bg-white"
              >
                {props.shippingMethods.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.cost > 0 ? `${formatToman(s.cost)} ت` : "پس‌کرایه"})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={convertToOrder}
              disabled={converting}
              className="h-11 rounded-lg text-xs sm:text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 active:scale-98 transition-all flex items-center justify-center shadow-sm w-full"
            >
              {converting ? "در حال صدور پیش‌فاکتور..." : "صدور پیش‌فاکتور رسمی و ادامه به پرداخت"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
