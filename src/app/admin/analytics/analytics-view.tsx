"use client";

import { useEffect, useState } from "react";
import { formatToman, toFaDigits } from "@/lib/digits";

type AnalyticsData = {
  kpis: {
    totalRevenue: number;
    totalPaidOnline: number;
    totalPaidWallet: number;
    totalCreditOrders: number;
    totalOrdersCount: number;
    avgOrderValue: number;
    rmaRate: number;
    totalRmas: number;
    totalRefundedRmas: number;
  };
  citySales: {
    city: string;
    revenue: number;
    orderCount: number;
    percentage: number;
  }[];
  topProducts: {
    sku: string;
    name: string;
    qty: number;
    revenue: number;
  }[];
  creditAndCheques: {
    totalSayadCheques: number;
    registeredSayadAmount: number;
    clearedSayadAmount: number;
    bouncedSayadAmount: number;
    upcomingChequesCount: number;
    upcomingCheques: {
      id: string;
      sayadId: string;
      bankName: string;
      customerName: string;
      phone: string;
      amount: number;
      dueDate: string;
    }[];
    overdueOrdersCount: number;
    overdueOrders: {
      id: string;
      number: string;
      customerName: string;
      phone: string;
      creditAmount: number;
      creditDueAt: string | null;
    }[];
  };
};

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analytics");
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "خطا در دریافت آمار");
      setData(json);
    } catch (err: any) {
      setError(err.message || "ارتباط با سرور برقرار نشد");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function exportCitySalesCSV() {
    if (!data) return;
    const headers = "شهرستان,مبلغ فروش (تومان),تعداد سفارشات,سهم بازار (درصد)\n";
    const rows = data.citySales
      .map((c) => `${c.city},${c.revenue},${c.orderCount},${c.percentage}%`)
      .join("\n");
    const blob = new Blob(["\uFEFF" + headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `kerman-b2b-sales-by-city-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (loading) {
    return <div className="p-12 text-center text-slate-500 text-sm">در حال پردازش داده‌های مالی و تحلیلی...</div>;
  }

  if (error || !data) {
    return <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">{error}</div>;
  }

  const { kpis, citySales, topProducts, creditAndCheques } = data;

  return (
    <div className="space-y-6">
      {/* ردیف ۱: شاخص‌های کلیدی عملکرد (KPIs) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="card p-4 sm:p-5 bg-white border border-slate-200 shadow-2xs rounded-xl">
          <p className="text-xs font-bold text-slate-500">فروش کل تسویه‌شده</p>
          <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1 nums">
            {formatToman(kpis.totalRevenue)} <span className="text-xs font-normal text-slate-400">ت</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">تعداد کل فاکتورها: {toFaDigits(kpis.totalOrdersCount)} سند</p>
        </div>

        <div className="card p-4 sm:p-5 bg-white border border-slate-200 shadow-2xs rounded-xl">
          <p className="text-xs font-bold text-slate-500">میانگین ارزش هر سفارش</p>
          <p className="text-xl sm:text-2xl font-black text-blue-600 mt-1 nums">
            {formatToman(kpis.avgOrderValue)} <span className="text-xs font-normal text-slate-400">ت</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">سبد خرید عمده همکاران</p>
        </div>

        <div className="card p-4 sm:p-5 bg-white border border-slate-200 shadow-2xs rounded-xl">
          <p className="text-xs font-bold text-slate-500">فروش اعتباری ۳۰ روزه</p>
          <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1 nums">
            {formatToman(kpis.totalCreditOrders)} <span className="text-xs font-normal text-slate-400">ت</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">بر مبنای حد اعتبار و چک صیاد</p>
        </div>

        <div className="card p-4 sm:p-5 bg-white border border-slate-200 shadow-2xs rounded-xl">
          <p className="text-xs font-bold text-slate-500">نرخ مرجوعی و گارانتی (RMA)</p>
          <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 nums">
            {toFaDigits(kpis.rmaRate)}٪
          </p>
          <p className="text-[11px] text-slate-400 mt-1">{toFaDigits(kpis.totalRefundedRmas)} مورد تسویه‌شده</p>
        </div>
      </div>

      {/* ردیف ۲: تحلیل جغرافیایی فروش استان کرمان */}
      <div className="card p-5 bg-white border border-slate-200 shadow-2xs rounded-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <h2 className="font-extrabold text-base text-slate-900">
              توزیع جغرافیایی فروش در شهرهای استان کرمان
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              تفکیک حجم خرید قطعات به تفکیک رفسنجان، سیرجان، بم، جیرفت، زرند، کرمان و...
            </p>
          </div>
          <button
            type="button"
            onClick={exportCitySalesCSV}
            className="btn btn-ghost px-3 py-1.5 text-xs text-blue-700 font-bold border border-slate-200"
          >
            خروجی اکسل (CSV)
          </button>
        </div>

        {citySales.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">هنوز داده‌ی ارسال ثبت نشده است.</p>
        ) : (
          <div className="space-y-3">
            {citySales.map((c) => (
              <div key={c.city} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{c.city}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 nums">{toFaDigits(c.orderCount)} سفارش</span>
                    <span className="nums font-extrabold text-slate-900">{formatToman(c.revenue)} تومان</span>
                    <span className="nums font-bold text-blue-700 w-10 text-left">({toFaDigits(c.percentage)}٪)</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(c.percentage, 4)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ردیف ۳: پرفروش‌ترین قطعات و مدیریت ریسک چک‌های صیاد */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* جدول قطعات پرفروش */}
        <div className="card p-5 bg-white border border-slate-200 shadow-2xs rounded-xl space-y-3">
          <h2 className="font-extrabold text-base text-slate-900">۱۰ قطعه پرفروش و پرتقاضا</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs divide-y divide-slate-100">
              <thead className="bg-slate-50 text-slate-600 font-bold">
                <tr>
                  <th className="p-2">کد فنی</th>
                  <th className="p-2">نام قطعه</th>
                  <th className="p-2 text-center">تعداد فروش</th>
                  <th className="p-2 text-left">جمع فروش</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400">سفارشی ثبت نشده است</td>
                  </tr>
                ) : (
                  topProducts.map((p) => (
                    <tr key={p.sku} className="hover:bg-slate-50">
                      <td className="p-2 font-mono font-bold text-slate-800 nums">{p.sku}</td>
                      <td className="p-2 font-bold text-slate-900 truncate max-w-[180px]">{p.name}</td>
                      <td className="p-2 text-center nums font-extrabold text-blue-700">{toFaDigits(p.qty)}</td>
                      <td className="p-2 text-left nums font-bold text-slate-800">{formatToman(p.revenue)} ت</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* وضعیت چک‌های صیادی و وصول مطالبات مالی */}
        <div className="card p-5 bg-white border border-slate-200 shadow-2xs rounded-xl space-y-4">
          <h2 className="font-extrabold text-base text-slate-900">مدیریت چک‌های صیادی و ریسک اعتباری</h2>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
              <span className="text-emerald-800 font-medium">چک‌های وصول‌شده (پاس‌شده)</span>
              <p className="font-black text-sm text-emerald-900 mt-1 nums">
                {formatToman(creditAndCheques.clearedSayadAmount)} ت
              </p>
            </div>

            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
              <span className="text-blue-800 font-medium">چک‌های معتبر در جریان</span>
              <p className="font-black text-sm text-blue-900 mt-1 nums">
                {formatToman(creditAndCheques.registeredSayadAmount)} ت
              </p>
            </div>
          </div>

          {/* چک‌های نزدیک به سررسید */}
          <div className="space-y-2 pt-2 border-t">
            <span className="text-xs font-bold text-slate-700 block">
              چک‌های صیادی در آستانه سررسید (۳۰ روز آینده):
            </span>
            {creditAndCheques.upcomingCheques.length === 0 ? (
              <p className="text-xs text-slate-400">چکی در آستانه سررسید وجود ندارد.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {creditAndCheques.upcomingCheques.map((c) => (
                  <div
                    key={c.id}
                    className="p-2 bg-slate-50 rounded border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-800">{c.customerName}</span>
                      <span className="text-slate-400 text-[11px] mr-2 nums">({c.bankName})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="nums font-bold text-blue-700">{formatToman(c.amount)} ت</span>
                      <span className="nums text-slate-500 text-[11px]">
                        سررسید: {new Date(c.dueDate).toLocaleDateString("fa-IR")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
