"use client";

import { useEffect, useState } from "react";
import { toFaDigits } from "@/lib/digits";

type PickListItem = {
  sku: string;
  name: string;
  oemCode: string | null;
  brand: string;
  category: string;
  partBrand: string | null;
  unit: string;
  stockQty: number;
  totalNeeded: number;
  orderAllocations: {
    orderNumber: string;
    customerName: string;
    city: string;
    qty: number;
  }[];
};

type OrderSummary = {
  id: string;
  number: string;
  customerName: string;
  customerPhone: string;
  city: string;
  carrierName: string;
  totalItems: number;
};

export function WarehouseView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [pickList, setPickList] = useState<PickListItem[]>([]);
  const [pickedItems, setPickedItems] = useState<Record<string, boolean>>({});

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/warehouse/picklist");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در دریافت لیست انبار");
      setOrders(data.orders || []);
      setPickList(data.pickList || []);
    } catch (err: any) {
      setError(err.message || "ارتباط با سرور برقرار نشد");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function togglePick(sku: string) {
    setPickedItems((prev) => ({
      ...prev,
      [sku]: !prev[sku],
    }));
  }

  const pickedCount = Object.values(pickedItems).filter(Boolean).length;
  const totalPickListCount = pickList.length;

  return (
    <div className="space-y-6">
      {/* نوار ابزار بالا — چاپ و رفرش */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs print:hidden">
        <div className="flex items-center gap-3">
          <div className="card px-3 py-1.5 bg-blue-50 border-blue-200 text-xs">
            <span className="text-slate-600">سفارش‌های در نوبت بسته‌بندی:</span>{" "}
            <b className="nums text-blue-700 font-black">{toFaDigits(orders.length)} سند</b>
          </div>
          <div className="card px-3 py-1.5 bg-emerald-50 border-emerald-200 text-xs">
            <span className="text-slate-600">پیشرفت جمع‌آوری قفسه‌ها:</span>{" "}
            <b className="nums text-emerald-700 font-black">
              {toFaDigits(pickedCount)} از {toFaDigits(totalPickListCount)} قلم
            </b>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="btn btn-ghost px-3 py-1.5 text-xs font-bold min-h-[38px]"
          >
            به‌روزرسانی
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-blue px-4 py-1.5 text-xs font-bold min-h-[38px] flex items-center gap-1.5 shadow-xs"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect width="12" height="8" x="6" y="14" />
            </svg>
            <span>چاپ برگه جمع‌آوری انبار (A4)</span>
          </button>
        </div>
      </div>

      {/* سربرگ مخصوص نسخه چاپی */}
      <div className="hidden print:block text-center border-b pb-4 mb-4">
        <h2 className="text-xl font-black">شرکت کاردو — برگه جمع‌آوری تجمیعی انبار مرکزی کرمان</h2>
        <p className="text-xs text-slate-600 mt-1" suppressHydrationWarning>
          تاریخ صدور: {new Date().toLocaleDateString("fa-IR")} · شامل {toFaDigits(orders.length)} فاکتور تسویه‌شده
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500 text-sm">در حال بارگذاری لیست اقلام قفسه‌های انبار...</div>
      ) : error ? (
        <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">{error}</div>
      ) : pickList.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-sm card bg-white">
          در حال حاضر سفارشی در نوبت جمع‌آوری انبار وجود ندارد. تمامی سفارش‌ها تحویل باربری شده‌اند.
        </div>
      ) : (
        <div className="space-y-6">
          {/* جدول تجمیعی اقلام جهت خروج از قفسه انبار */}
          <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between print:bg-slate-100 print:text-black">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <span>فهرست قطعات جهت خروج از قفسه‌های انبار (Pick List)</span>
              </h3>
              <span className="text-xs text-slate-300 print:text-slate-700">
                مجموع: {toFaDigits(pickList.reduce((s, it) => s + it.totalNeeded, 0))} قطعه
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-700 font-bold">
                  <tr>
                    <th className="p-3 w-10 text-center print:hidden">برداشت</th>
                    <th className="p-3">کد فنی (SKU)</th>
                    <th className="p-3">نام قطعه و مشخصات</th>
                    <th className="p-3">خودرو / دسته</th>
                    <th className="p-3">برند سازنده</th>
                    <th className="p-3 text-center">موجودی انبار</th>
                    <th className="p-3 text-center text-blue-700 font-black">تعداد موردنیاز</th>
                    <th className="p-3 print:hidden">تفکیک فاکتورها و شهرهای مقصد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pickList.map((it) => {
                    const isPicked = !!pickedItems[it.sku];
                    return (
                      <tr
                        key={it.sku}
                        className={`transition-colors ${
                          isPicked ? "bg-emerald-50/60 text-slate-500 line-through" : "hover:bg-slate-50/70"
                        }`}
                      >
                        <td className="p-3 text-center print:hidden">
                          <input
                            type="checkbox"
                            checked={isPicked}
                            onChange={() => togglePick(it.sku)}
                            className="size-4 accent-blue-600 rounded cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-800 nums">{it.sku}</td>
                        <td className="p-3 font-bold text-slate-900">{it.name}</td>
                        <td className="p-3 text-slate-600">
                          {it.brand} · {it.category}
                        </td>
                        <td className="p-3 text-slate-600">{it.partBrand || "—"}</td>
                        <td className="p-3 text-center nums text-slate-500">{toFaDigits(it.stockQty)}</td>
                        <td className="p-3 text-center">
                          <span className="nums font-black text-sm bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-md print:bg-transparent print:border">
                            {toFaDigits(it.totalNeeded)} {it.unit}
                          </span>
                        </td>
                        <td className="p-3 print:hidden">
                          <div className="flex flex-wrap gap-1 text-[11px]">
                            {it.orderAllocations.map((alloc, idx) => (
                              <span
                                key={idx}
                                className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-700"
                              >
                                {alloc.orderNumber} ({alloc.city}): <b>{toFaDigits(alloc.qty)}</b>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* جدول تفکیک فاکتورها جهت بسته‌بندی کارتن‌ها */}
          <div className="card p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
            <h3 className="font-extrabold text-sm text-slate-900">
              تفکیک بسته‌بندی کارتن‌ها به تفکیک همکار و شهر مقصد (استان کرمان)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {orders.map((o) => (
                <div key={o.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="nums font-extrabold text-blue-700">{o.number}</span>
                    <span className="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full text-[10px]">
                      {o.city}
                    </span>
                  </div>
                  <p className="font-bold text-slate-800">{o.customerName}</p>
                  <p className="text-slate-500 nums font-mono" dir="ltr">{o.customerPhone}</p>
                  <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-200/60 mt-2">
                    <span>حامل: {o.carrierName}</span>
                    <span className="font-bold nums text-slate-900">{toFaDigits(o.totalItems)} قطعه</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
