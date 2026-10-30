"use client";

import { useState } from "react";
import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";
import type { ImportSummary } from "@/lib/import-center";

export function ImportView() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"full" | "price_stock_only">("full");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("لطفاً ابتدا فایل اکسل یا CSV را انتخاب کنید.");
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);

    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "پردازش فایل اکسل با خطا مواجه شد.");
        return;
      }

      setResult(data.summary);
    } catch {
      setError("خطا در برقراری ارتباط با سرور هنگام آپلود فایل.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* راهنما و دکمه دانلود نمونه */}
      <div className="card p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-extrabold text-sm sm:text-base text-slate-900">
            بارگذاری و به‌روزرسانی دسته‌جمعی کاتالوگ (تا ۵۰,۰۰۰ قلم کالا)
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
            فایل اکسل با پسوند <b className="text-slate-800">.xlsx</b> یا <b className="text-slate-800">.csv</b> حاوی ستون‌های کد فنی، شرح قطعه، خودرو، برند سازنده، قیمت و موجودی را آپلود کنید. سیستم به صورت خودکار سرستون‌های فارسی و انگلیسی را تطبیق می‌دهد.
          </p>
        </div>

        <a
          href="/api/admin/import/template"
          download
          className="btn btn-ghost border border-slate-300 hover:border-blue-500 hover:text-blue-700 text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 shrink-0 shadow-2xs font-bold"
        >
          <svg className="size-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          <span>دانلود فایل اکسل نمونه استاندارد</span>
        </a>
      </div>

      {/* فرم آپلود و تنظیمات */}
      <form onSubmit={handleUpload} className="card p-5 sm:p-6 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-5">
        <div>
          <label className="text-xs font-bold text-slate-800 block mb-2">انتخاب حالت بارگذاری:</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label
              className={`p-3.5 border rounded-xl cursor-pointer transition-all flex items-start gap-3 ${
                mode === "full"
                  ? "border-blue-500 bg-blue-50/60 shadow-2xs text-blue-950"
                  : "border-slate-200 hover:border-slate-300 text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value="full"
                checked={mode === "full"}
                onChange={() => setMode("full")}
                className="mt-0.5 text-blue-600"
              />
              <div>
                <p className="font-bold text-sm">افزودن و به‌روزرسانی کامل کاتالوگ</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                  کالاهای جدید اضافه می‌شوند و مشخصات (نام، برند، پارت‌برند، ضریب بسته، قیمت و موجودی) قطعات موجود به‌روزرسانی می‌گردد.
                </p>
              </div>
            </label>

            <label
              className={`p-3.5 border rounded-xl cursor-pointer transition-all flex items-start gap-3 ${
                mode === "price_stock_only"
                  ? "border-blue-500 bg-blue-50/60 shadow-2xs text-blue-950"
                  : "border-slate-200 hover:border-slate-300 text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value="price_stock_only"
                checked={mode === "price_stock_only"}
                onChange={() => setMode("price_stock_only")}
                className="mt-0.5 text-blue-600"
              />
              <div>
                <p className="font-bold text-sm">فقط به‌روزرسانی سریع قیمت و موجودی</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                  مناسب برای اعلام موجودی یا تغییر نرخ‌های روزانه انبار؛ تنها فیلدهای قیمت و موجودی بر اساس کد فنی (SKU) تغییر می‌یابند.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* جعبه انتخاب فایل Drag & Drop */}
        <div>
          <label className="text-xs font-bold text-slate-800 block mb-2">فایل اکسل کاتالوگ:</label>
          <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 sm:p-8 text-center bg-slate-50/50 hover:bg-blue-50/30 transition-all flex flex-col items-center justify-center gap-3">
            <svg className="size-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" x2="12" y1="18" y2="12" />
              <polyline points="9 15 12 12 15 15" />
            </svg>

            <div>
              <input
                type="file"
                id="file-upload"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                }}
                className="hidden"
              />
              <label
                htmlFor="file-upload"
                className="btn btn-brass text-xs px-4 py-2 font-bold cursor-pointer inline-flex items-center gap-2 shadow-xs"
              >
                <span>انتخاب فایل از رایانه</span>
              </label>
              <p className="text-[11px] text-slate-400 mt-1.5">پشتیبانی از فرمت‌های XLSX, XLS, CSV</p>
            </div>

            {file && (
              <div className="mt-2 inline-flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-800 shadow-2xs">
                <span>📄 {file.name}</span>
                <span className="nums text-slate-400 font-normal">({Math.round(file.size / 1024)} KB)</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-rose-600 hover:underline ms-2 text-[11px]"
                >
                  حذف
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Link href="/admin/products" className="text-xs text-slate-500 hover:text-slate-800">
            ← بازگشت به لیست محصولات
          </Link>

          <button
            type="submit"
            disabled={busy || !file}
            className="btn btn-brass px-6 py-2.5 text-xs font-bold shadow-md disabled:opacity-50"
          >
            {busy ? "در حال پردازش و اعتبارسنجی کالاها..." : "شروع پردازش و بارگذاری کاتالوگ"}
          </button>
        </div>
      </form>

      {/* گزارش نتایج بارگذاری */}
      {result && (
        <div className="card p-5 sm:p-6 bg-white border border-slate-200 rounded-xl shadow-xs space-y-5 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <h3 className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span>گزارش اتمام پردازش فایل اکسل</span>
            </h3>
            <span className="text-xs text-slate-500">
              حالت پردازش: <b>{result.mode === "full" ? "کاتالوگ کامل" : "فقط قیمت و موجودی"}</b>
            </span>
          </div>

          {/* آمار ردیف‌ها */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-500 block mb-0.5">کل ردیف‌های فایل</span>
              <span className="nums text-lg font-extrabold text-slate-900">{toFaDigits(result.totalRows)}</span>
            </div>

            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-emerald-800">
              <span className="text-[11px] block mb-0.5">کالاهای جدید اضافه شده</span>
              <span className="nums text-lg font-extrabold">{toFaDigits(result.createdCount)}</span>
            </div>

            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-blue-800">
              <span className="text-[11px] block mb-0.5">کالاهای به‌روزرسانی شده</span>
              <span className="nums text-lg font-extrabold">{toFaDigits(result.updatedCount)}</span>
            </div>

            <div className={`p-3.5 rounded-xl border ${result.failedCount > 0 ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
              <span className="text-[11px] block mb-0.5">ردیف‌های ناموفق / خطادار</span>
              <span className="nums text-lg font-extrabold">{toFaDigits(result.failedCount)}</span>
            </div>
          </div>

          {/* پیش‌نمایش اقلام نمونه ثبت‌شده */}
          {result.sampleItems.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-800 mb-2">نمونه اقلام پردازش‌شده موفق:</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-start">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3 text-start">کد فنی (SKU)</th>
                      <th className="py-2.5 px-3 text-start">شرح قطعه</th>
                      <th className="py-2.5 px-3 text-center">عملیات</th>
                      <th className="py-2.5 px-3 text-left">قیمت همکار</th>
                      <th className="py-2.5 px-3 text-center">موجودی</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.sampleItems.map((item) => (
                      <tr key={item.sku} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-3 nums font-mono font-bold text-slate-700">{item.sku}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{item.name}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${item.action === "created" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                            {item.action === "created" ? "ایجاد شد" : "به‌روز شد"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-left nums font-bold">{formatToman(item.price)} ت</td>
                        <td className="py-2.5 px-3 text-center nums">{toFaDigits(item.stockQty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* جدول خطاهای ردیف‌ها */}
          {result.errors.length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs font-bold text-rose-700 mb-2">
                گزارش خطاهای ردیف‌ها ({toFaDigits(result.errors.length)} مورد):
              </h4>
              <div className="max-h-60 overflow-y-auto border border-rose-200 rounded-xl bg-rose-50/40 text-xs">
                <table className="w-full text-start">
                  <thead className="bg-rose-100/60 border-b border-rose-200 text-rose-900 font-semibold text-[11px]">
                    <tr>
                      <th className="py-2 px-3 text-center w-16">شماره ردیف</th>
                      <th className="py-2 px-3 text-start w-32">کد فنی</th>
                      <th className="py-2 px-3 text-start">علت رد شدن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-200/60">
                    {result.errors.map((err, idx) => (
                      <tr key={idx} className="hover:bg-rose-100/30">
                        <td className="py-2 px-3 text-center nums font-bold text-rose-800">
                          ردیف {toFaDigits(err.row)}
                        </td>
                        <td className="py-2 px-3 nums font-mono text-slate-700">
                          {err.sku || "—"}
                        </td>
                        <td className="py-2 px-3 text-rose-700 font-medium">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end">
            <Link
              href="/catalog"
              prefetch={false}
              className="btn btn-brass text-xs px-4 py-2 font-bold"
            >
              مشاهده اقلام در کاتالوگ قطعات ←
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
