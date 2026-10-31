"use client";

import { useState } from "react";
import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";
import { faDate } from "@/lib/date";
import * as XLSX from "xlsx";

export type PrintCatalogItem = {
  id: string;
  sku: string;
  oemCode?: string | null;
  name: string;
  brand: string;
  model?: string | null;
  category: string;
  partBrand?: string | null;
  unit: string;
  basePrice: number;
  finalPrice: number;
  stockQty: number;
};

export function PrintCatalogClient({
  items,
  customer,
}: {
  items: PrintCatalogItem[];
  customer: {
    companyName: string;
    contactName?: string | null;
    phone?: string | null;
    tierName?: string | null;
    discountPercent: number;
  };
}) {
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [inStockOnly, setInStockOnly] = useState(false);

  const brands = Array.from(new Set(items.map((i) => i.brand))).filter(Boolean);

  const filtered = items.filter((item) => {
    if (selectedBrand !== "all" && item.brand !== selectedBrand) return false;
    if (inStockOnly && item.stockQty <= 0) return false;
    return true;
  });

  const todayFa = faDate(new Date());

  function handleExportExcel() {
    const data = filtered.map((p, idx) => ({
      "ردیف": idx + 1,
      "کد قطعه (SKU)": p.sku,
      "کد فنی / OEM": p.oemCode || "-",
      "نام قطعه": p.name,
      "خودرو": p.brand,
      "مدل": p.model || "-",
      "سازنده قطعه": p.partBrand || "-",
      "واحد": p.unit,
      "قیمت پایه (تومان)": p.basePrice,
      "قیمت همکار با تخفیف (تومان)": p.finalPrice,
      "وضعیت موجودی": p.stockQty > 0 ? `موجود (${p.stockQty})` : "ناموجود",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "لیست قیمت همکار");
    XLSX.writeFile(wb, `Kardo-B2B-Catalog-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white text-slate-900 p-4 sm:p-8 font-sans" dir="rtl">
      {/* نوار ابزار بالای صفحه — فقط در نمایش مرورگر نمایش داده می‌شود نه در پرینت */}
      <div className="max-w-6xl mx-auto mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/catalog"
            className="text-xs font-bold px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors flex items-center gap-1.5"
          >
            <span>←</span>
            <span>بازگشت به کاتالوگ آنلاین</span>
          </Link>
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            کاتالوگ قابل پرینت و ذخیره PDF اختصاصی همکار
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="text-xs font-bold px-3 py-2 border border-slate-300 rounded-xl bg-white"
          >
            <option value="all">همه خودروها ({toFaDigits(items.length)} قطعه)</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                خودروهای {b}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="size-3.5 text-amber-600 rounded"
            />
            فقط کالاهای موجود
          </label>

          <button
            onClick={handleExportExcel}
            className="text-xs font-bold px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
          >
            <span>📊</span>
            <span>خروجی اکسل</span>
          </button>

          <button
            onClick={() => window.print()}
            className="text-xs font-bold px-4 py-2 rounded-xl bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 transition-all shadow-md shadow-orange-500/20 flex items-center gap-1.5 font-black active:scale-95"
          >
            <span>🖨️</span>
            <span>چاپ و ذخیره PDF</span>
          </button>
        </div>
      </div>

      {/* برگ کاغذ رسمی کاتالوگ / پرینت */}
      <div className="max-w-6xl mx-auto bg-white border border-slate-200 print:border-none rounded-2xl shadow-lg print:shadow-none p-6 sm:p-10 print:p-0">
        {/* سربرگ رسمی کاردو */}
        <div className="border-b-2 border-slate-900 pb-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="size-12 grid place-items-center bg-slate-900 text-white font-black text-2xl rounded-xl">
              ک
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                شرکت کاردو دیار کریمان (سهامی خاص)
              </h1>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                کاتالوگ رسمی و لیست قیمت مصوب فروش عمده قطعات خودرو (B2B)
              </p>
            </div>
          </div>

          <div className="text-left font-mono text-xs text-slate-700 space-y-1 bg-slate-50 print:bg-transparent p-3 print:p-0 rounded-xl border border-slate-200 print:border-none">
            <div>
              <span className="font-sans font-bold text-slate-900">تاریخ صدور: </span>
              <span className="nums font-black">{todayFa}</span>
            </div>
            <div>
              <span className="font-sans font-bold text-slate-900">طرف حساب: </span>
              <span className="font-bold text-slate-900">{customer.companyName}</span>
            </div>
            {customer.tierName && (
              <div>
                <span className="font-sans font-bold text-slate-900">سطح همکاری: </span>
                <span className="font-bold text-amber-700">
                  {customer.tierName} ({toFaDigits(customer.discountPercent)}٪ تخفیف)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* جدول قیمت‌ها و اقلام */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-bold text-[11px]">
                <th className="py-2.5 px-3 border border-slate-800 text-center w-10">ردیف</th>
                <th className="py-2.5 px-3 border border-slate-800">کد فنی (SKU)</th>
                <th className="py-2.5 px-3 border border-slate-800">نام قطعه</th>
                <th className="py-2.5 px-3 border border-slate-800">خودرو و مدل</th>
                <th className="py-2.5 px-3 border border-slate-800">سازنده</th>
                <th className="py-2.5 px-3 border border-slate-800 text-center">واحد</th>
                <th className="py-2.5 px-3 border border-slate-800 text-left">قیمت پایه (تومان)</th>
                <th className="py-2.5 px-3 border border-slate-800 text-left bg-amber-500 text-slate-950 font-black">قیمت همکار (تومان)</th>
                <th className="py-2.5 px-3 border border-slate-800 text-center">موجودی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((item, idx) => {
                const inStock = item.stockQty > 0;
                return (
                  <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                    <td className="py-2 px-3 border border-slate-200 text-center nums font-medium text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 border border-slate-200 font-mono text-[11px] text-slate-800" dir="ltr">
                      {item.sku}
                    </td>
                    <td className="py-2 px-3 border border-slate-200 font-black text-slate-900">
                      {item.name}
                    </td>
                    <td className="py-2 px-3 border border-slate-200 text-slate-700">
                      {item.brand} {item.model ? `(${item.model})` : ""}
                    </td>
                    <td className="py-2 px-3 border border-slate-200 text-slate-600 font-medium">
                      {item.partBrand || "-"}
                    </td>
                    <td className="py-2 px-3 border border-slate-200 text-center text-slate-600">
                      {item.unit}
                    </td>
                    <td className="py-2 px-3 border border-slate-200 text-left nums text-slate-500 line-through">
                      {formatToman(item.basePrice)}
                    </td>
                    <td className="py-2 px-3 border border-slate-200 text-left nums font-black text-slate-900 bg-amber-50/80">
                      {formatToman(item.finalPrice)}
                    </td>
                    <td className="py-2 px-3 border border-slate-200 text-center font-bold">
                      {inStock ? (
                        <span className="text-emerald-700">موجود ({toFaDigits(item.stockQty)})</span>
                      ) : (
                        <span className="text-slate-400">تماس</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* پی‌نوشت رسمی */}
        <div className="mt-8 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            <span>تلفن تماس و سفارش‌گذاری: </span>
            <span className="font-bold text-slate-800 nums">۰۳۴-۳۳۲۲۴۴۵۵</span>
            <span className="mx-2">|</span>
            <span>انبار مرکزی: کرمان، شهرک صنعتی شماره ۲، مجتمع کاردو B2B</span>
          </div>
          <div className="font-semibold">
            قیمت‌ها بر اساس شرایط پرداخت و تسویه اعتباری همکار لحاظ گردیده است.
          </div>
        </div>
      </div>
    </div>
  );
}
