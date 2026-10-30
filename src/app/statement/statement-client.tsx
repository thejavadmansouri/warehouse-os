"use client";

import { useEffect, useState } from "react";
import { formatToman, toFaDigits } from "@/lib/digits";

interface StatementData {
  companyInfo: {
    name: string;
    regNumber: string;
    nationalId: string;
    economicCode: string;
    address: string;
    warehouseAddress: string;
    phone: string;
    postalCode: string;
  };
  customerInfo: {
    companyName: string;
    contactName: string;
    phone: string;
    nationalId: string;
    address: string;
    tier: string;
  };
  summary: {
    totalDebit: number;
    totalCredit: number;
    netBalance: number;
    inClearingChequesCount: number;
    inClearingChequesTotal: number;
    activeWallet: number;
  };
  rows: {
    date: string;
    docNumber: string;
    description: string;
    debit: number;
    credit: number;
    balanceAfter: number;
  }[];
}

export function StatementClient() {
  const [period, setPeriod] = useState("90");
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatement = async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounting/statement?period=${p}`);
      if (!res.ok) {
        setError("خطا در دریافت صورت‌حساب مالی");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError("خطا در برقراری ارتباط با سرور مالی");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatement(period);
  }, [period]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 space-y-6">
      {/* نوار کنترل بالا (در حالت پرینت مخفی می‌شود) */}
      <div className="print:hidden flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
              حسابداری و مالی B2B
            </span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              معین رسمی مشتری
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">
            صورت‌حساب معین و گردش مالی
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            ریز اسناد بدهکار و بستانکار، چک‌های صیادی در جریان وصول و مانده نهایی حساب همکاری در استان کرمان.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* فیلتر دوره زمانی */}
          <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-slate-100 p-0.5 text-xs font-bold">
            <button
              onClick={() => setPeriod("30")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === "30" ? "bg-white text-blue-700 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              ۳۰ روز اخیر
            </button>
            <button
              onClick={() => setPeriod("90")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === "90" ? "bg-white text-blue-700 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              فصل جاری (۹۰ روز)
            </button>
            <button
              onClick={() => setPeriod("365")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === "365" ? "bg-white text-blue-700 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              یک سال اخیر
            </button>
            <button
              onClick={() => setPeriod("all")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === "all" ? "bg-white text-blue-700 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              همه اسناد
            </button>
          </div>

          <button
            onClick={() => window.print()}
            className="btn btn-blue text-xs px-4 py-2 rounded-xl font-black shadow-md flex items-center gap-1.5"
          >
            <span>🖨️ چاپ رسمی صورت‌حساب</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs sm:text-sm font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card p-12 text-center text-xs text-slate-400">
          در حال استعلام و محاسبه معین مالی…
        </div>
      ) : data ? (
        <div className="card p-6 sm:p-8 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-6 print:border-none print:shadow-none print:p-0">
          {/* سربرگ رسمی حقوقی کاردو */}
          <div className="border-b-2 border-slate-900 pb-5 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="font-black text-base sm:text-lg text-slate-900 block">
                  {data.companyInfo.name}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  سامانه تخصصی فروش عمده قطعات یدکی خودرو در استان کرمان
                </span>
              </div>
              <div className="text-left text-xs nums space-y-0.5">
                <p className="font-bold text-slate-800">شماره ثبت: {data.companyInfo.regNumber}</p>
                <p className="text-slate-500">شناسه ملی: {data.companyInfo.nationalId}</p>
                <p className="text-slate-500">کد اقتصادی: {data.companyInfo.economicCode}</p>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-slate-500 flex items-center justify-between flex-wrap gap-2 border-t border-slate-200">
              <span>نشانی دفتر مرکزی: {data.companyInfo.address}</span>
              <span>تلفن تماس: {data.companyInfo.phone}</span>
            </div>
          </div>

          {/* مشخصات مشتری و همکار تجاری */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
            <div className="font-black text-slate-900 text-xs sm:text-sm border-b border-slate-200 pb-2 flex items-center justify-between">
              <span>طرف حساب: {data.customerInfo.companyName}</span>
              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                طبقه مشتری: {data.customerInfo.tier}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-slate-600 nums">
              <p>مسئول خرید: <b className="text-slate-900">{data.customerInfo.contactName}</b></p>
              <p>شماره تماس: <b className="text-slate-900 font-mono" dir="ltr">{toFaDigits(data.customerInfo.phone)}</b></p>
              <p>شناسه/کد ملی: <b className="text-slate-900">{data.customerInfo.nationalId}</b></p>
            </div>
            <p className="text-slate-600">نشانی همکار: {data.customerInfo.address}</p>
          </div>

          {/* کارت‌های خلاصه وضعیت حساب */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-500 block">جمع کل فاکتورها (بدهکار)</span>
              <span className="text-base font-black text-slate-900 nums mt-0.5 block">
                {formatToman(data.summary.totalDebit)} ت
              </span>
            </div>
            <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl">
              <span className="text-[11px] text-emerald-700 block font-medium">جمع کل پرداختی‌ها (بستانکار)</span>
              <span className="text-base font-black text-emerald-800 nums mt-0.5 block">
                {formatToman(data.summary.totalCredit)} ت
              </span>
            </div>
            <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl">
              <span className="text-[11px] text-blue-700 block font-medium">مانده نهایی حساب</span>
              <span className="text-base font-black text-blue-900 nums mt-0.5 block">
                {formatToman(Math.abs(data.summary.netBalance))} ت{" "}
                <span className="text-[10px] font-normal">
                  ({data.summary.netBalance > 0 ? "بدهکار" : data.summary.netBalance < 0 ? "بستانکار" : "تسویه"})
                </span>
              </span>
            </div>
            <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl">
              <span className="text-[11px] text-purple-700 block font-medium">چک‌های صیاد در جریان</span>
              <span className="text-base font-black text-purple-900 nums mt-0.5 block">
                {formatToman(data.summary.inClearingChequesTotal)} ت{" "}
                <span className="text-[10px] font-normal">({toFaDigits(data.summary.inClearingChequesCount)} فقره)</span>
              </span>
            </div>
          </div>

          {/* جدول ۴ ستونی رسمی معین حساب */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">ردیف</th>
                  <th className="p-3">تاریخ سند</th>
                  <th className="p-3">شماره سند / پیگیری</th>
                  <th className="p-3">شرح رویداد مالی</th>
                  <th className="p-3 text-left">بدهکار (تومان)</th>
                  <th className="p-3 text-left">بستانکار (تومان)</th>
                  <th className="p-3 text-left">مانده (تومان)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 nums">
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      هیچ سند مالی در این بازه ثبت نشده است.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3 text-slate-400">{toFaDigits(i + 1)}</td>
                      <td className="p-3 font-medium">{new Date(r.date).toLocaleDateString("fa-IR")}</td>
                      <td className="p-3 font-mono font-bold text-slate-800">{r.docNumber}</td>
                      <td className="p-3 text-slate-700">{r.description}</td>
                      <td className="p-3 text-left font-bold text-rose-700">
                        {r.debit > 0 ? formatToman(r.debit) : "—"}
                      </td>
                      <td className="p-3 text-left font-bold text-emerald-700">
                        {r.credit > 0 ? formatToman(r.credit) : "—"}
                      </td>
                      <td className="p-3 text-left font-black text-slate-900">
                        {formatToman(Math.abs(r.balanceAfter))}
                        <span className="text-[10px] text-slate-500 ms-1 font-normal">
                          {r.balanceAfter > 0 ? "بد" : r.balanceAfter < 0 ? "بس" : ""}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* امضا و تأییدیه رسمی */}
          <div className="pt-6 border-t border-slate-200 grid grid-cols-2 text-center text-xs text-slate-600 gap-8">
            <div className="space-y-12">
              <span className="font-bold text-slate-800 block">امضا و تأیید طرف حساب (مشتری):</span>
              <p className="text-[11px] text-slate-400">مهر و امضای مجاز شرکت / فروشگاه</p>
            </div>
            <div className="space-y-12">
              <span className="font-bold text-slate-800 block">امضا و تأیید امور مالی کاردو B2B:</span>
              <p className="text-[11px] text-slate-400">مهر و امضای امور مالی دیار کریمان</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
