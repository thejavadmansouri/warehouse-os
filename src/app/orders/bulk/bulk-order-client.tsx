"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatToman, toFaDigits } from "@/lib/digits";
import type { ValidatedBulkItem, UnrecognizedBulkItem } from "@/app/api/orders/bulk-validate/route";

interface ShippingOption {
  id: string;
  name: string;
  cost: number;
  freeAbove: number | null;
  note: string | null;
}

export function BulkOrderClient(props: {
  canOrder: boolean;
  shipping: ShippingOption[];
}) {
  const router = useRouter();

  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [rawText, setRawText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<{
    totalRows: number;
    matchedCount: number;
    unrecognizedCount: number;
    totalRequestedQty: number;
    totalAllocatedQty: number;
    totalEstimatedAmount: number;
  } | null>(null);

  const [matchedItems, setMatchedItems] = useState<ValidatedBulkItem[]>([]);
  const [unrecognizedItems, setUnrecognizedItems] = useState<UnrecognizedBulkItem[]>([]);

  const [shippingId, setShippingId] = useState(props.shipping[0]?.id ?? "");
  const [note, setNote] = useState("");

  const sampleText = `PR-BRK-01 20
PE-ENG-02 10
SM-SUS-03 15
PR-IGN-04 50
DF-FLT-05 30`;

  async function handleValidate() {
    setValidating(true);
    setError(null);

    try {
      let res: Response;

      if (inputMode === "file") {
        if (!file) {
          setError("لطفاً ابتدا فایل اکسل یا CSV را انتخاب کنید");
          setValidating(false);
          return;
        }
        const fd = new FormData();
        fd.append("file", file);
        res = await fetch("/api/orders/bulk-validate", {
          method: "POST",
          body: fd,
        });
      } else {
        if (!rawText.trim()) {
          setError("لطفاً متن لیست کدهای فنی و تعداد را وارد کنید");
          setValidating(false);
          return;
        }
        res = await fetch("/api/orders/bulk-validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: rawText }),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "خطا در پردازش لیست");
        setValidating(false);
        return;
      }

      setStats(data.stats);
      setMatchedItems(data.matched || []);
      setUnrecognizedItems(data.unrecognized || []);
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setValidating(false);
    }
  }

  async function handleSubmitOrder() {
    const validItems = matchedItems.filter((m) => m.allocatedQty > 0);
    if (validItems.length === 0) {
      setError("هیچ قلم کالایی با موجودی معتبر برای ثبت سفارش وجود ندارد");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/orders/bulk-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: validItems.map((m) => ({ productId: m.id, qty: m.allocatedQty })),
          shippingId,
          note,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "خطا در صدور پیش‌فاکتور");
        setSubmitting(false);
        return;
      }

      router.push(`/orders/${data.order.id}`);
    } catch {
      setError("ارتباط با سرور برقرار نشد");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 space-y-6">
      {/* سرصفحه ماژول */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
              سفارش سریع همکاران عمده
            </span>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
              پردازش اکسل و متن
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">
            ثبت سفارش دسته‌جمعی قطعات (Bulk Order)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            لیست کدهای فنی مغازه یا فایل اکسل سفارش دوره‌ای خود را وارد نمایید تا موجودی و قیمت همکاری آنی محاسبه گردد.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* تب‌های ورودی: متن یا فایل */}
      <div className="card p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b pb-3">
          <button
            type="button"
            onClick={() => setInputMode("text")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all ${
              inputMode === "text"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            📋 درج متنی سریع (Paste)
          </button>
          <button
            type="button"
            onClick={() => setInputMode("file")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all ${
              inputMode === "file"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            📊 بارگذاری فایل اکسل (.xlsx / .csv)
          </button>
        </div>

        {inputMode === "text" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>در هر سطر: <b>کد فنی</b> [فاصله یا کاما] <b>تعداد</b></span>
              <button
                type="button"
                onClick={() => setRawText(sampleText)}
                className="text-blue-600 font-bold hover:underline"
              >
                + درج لیست نمونه قطعات پراید و پژو
              </button>
            </div>
            <textarea
              dir="ltr"
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="PR-BRK-01 20&#10;PE-ENG-02 10&#10;SM-SUS-03 15"
              className="w-full p-3 font-mono text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-blue-600 outline-none transition-all nums"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-6 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 text-center hover:bg-blue-50/50 hover:border-blue-300 transition-colors">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                id="excel-file-upload"
              />
              <label htmlFor="excel-file-upload" className="cursor-pointer block space-y-2">
                <span className="text-3xl block">📄</span>
                <span className="text-xs sm:text-sm font-black text-slate-800 block">
                  {file ? file.name : "برای انتخاب یا کشیدن فایل اکسل اینجا کلیک کنید"}
                </span>
                <span className="text-[11px] text-slate-500 block">
                  فرمت ستون‌ها: ستون اول = کد فنی (SKU) · ستون دوم = تعداد
                </span>
              </label>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleValidate}
          disabled={validating}
          className="w-full sm:w-auto btn btn-blue px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm shadow-md"
        >
          {validating ? "در حال پردازش و استعلام موجودی…" : "🔍 استعلام و اعتبارسنجی اقلام"}
        </button>
      </div>

      {/* نتایج و پیش‌نمایش اقلام */}
      {stats && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* کارت‌های خلاصه آماری */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-[11px] text-slate-500 block">تعداد ردیف‌های لیست</span>
              <span className="text-lg font-black text-slate-900 nums mt-0.5 block">
                {toFaDigits(stats.totalRows)} ردیف
              </span>
            </div>
            <div className="card p-3.5 bg-white border border-emerald-200 bg-emerald-50/30 rounded-xl shadow-2xs">
              <span className="text-[11px] text-emerald-700 block font-medium">اقلام تخصیص‌یافته</span>
              <span className="text-lg font-black text-emerald-700 nums mt-0.5 block">
                {toFaDigits(stats.totalAllocatedQty)} از {toFaDigits(stats.totalRequestedQty)} عدد
              </span>
            </div>
            <div className="card p-3.5 bg-white border border-amber-200 bg-amber-50/30 rounded-xl shadow-2xs">
              <span className="text-[11px] text-amber-700 block font-medium">کدهای نامعتبر / ناموجود</span>
              <span className="text-lg font-black text-amber-800 nums mt-0.5 block">
                {toFaDigits(stats.unrecognizedCount)} مورد
              </span>
            </div>
            <div className="card p-3.5 bg-white border border-blue-200 bg-blue-50/30 rounded-xl shadow-2xs">
              <span className="text-[11px] text-blue-700 block font-medium">جمع کل پیش‌فاکتور</span>
              <span className="text-lg font-black text-blue-800 nums mt-0.5 block">
                {formatToman(stats.totalEstimatedAmount)} ت
              </span>
            </div>
          </div>

          {/* هشدارهای اقلام نامعتبر در صورت وجود */}
          {unrecognizedItems.length > 0 && (
            <div className="card p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-2">
              <span className="font-black text-amber-900 block">
                ⚠️ موارد زیر در سیستم شناسایی نشدند و در سفارش لحاظ نمی‌گردند:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-amber-800 nums">
                {unrecognizedItems.map((u, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-amber-200/60 pb-1">
                    <span className="font-mono font-bold">{u.rawSku}</span>
                    <span>(درخواستی: {toFaDigits(u.requestedQty)}) — {u.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* جدول اقلام تاییدشده */}
          {matchedItems.length > 0 && (
            <div className="card overflow-hidden border border-slate-200 rounded-2xl bg-white shadow-xs">
              <div className="p-4 border-b bg-slate-50 font-black text-sm text-slate-800 flex items-center justify-between">
                <span>لیست اقلام آماده سفارش ({toFaDigits(matchedItems.length)} قلم)</span>
                <span className="text-xs font-normal text-slate-500">
                  قیمت‌ها با اعمال تخفیف‌های طبقه و تیراژ محاسبه شده‌اند
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">کد فنی</th>
                      <th className="p-3">شرح قطعه</th>
                      <th className="p-3 text-center">درخواستی</th>
                      <th className="p-3 text-center">تخصیص‌یافته</th>
                      <th className="p-3 text-left">فی همکاری</th>
                      <th className="p-3 text-left">مجموع ردیف</th>
                      <th className="p-3 text-center">وضعیت انبار</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 nums">
                    {matchedItems.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-700">{m.sku}</td>
                        <td className="p-3">
                          <span className="font-bold text-slate-900 block">{m.name}</span>
                          <span className="text-[11px] text-slate-500">
                            {m.brand} {m.model ? `· ${m.model}` : ""} {m.partBrand ? `(${m.partBrand})` : ""}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold">{toFaDigits(m.requestedQty)}</td>
                        <td className="p-3 text-center font-black text-blue-700">{toFaDigits(m.allocatedQty)}</td>
                        <td className="p-3 text-left font-semibold">{formatToman(m.unitPrice)} ت</td>
                        <td className="p-3 text-left font-black text-slate-900">{formatToman(m.lineTotal)} ت</td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-block ${
                              m.status === "AVAILABLE"
                                ? "bg-emerald-100 text-emerald-800"
                                : m.status === "PARTIAL"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {m.statusText}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* بخش نهایی و صدور سفارش */}
          {matchedItems.some((m) => m.allocatedQty > 0) && (
            <div className="card p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <h3 className="font-black text-sm text-slate-900">مشخصات ارسال باربری و ثبت فاکتور</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label block mb-1 font-bold text-slate-700">انتخاب شرکت باربری مقصد:</label>
                  <select
                    value={shippingId}
                    onChange={(e) => setShippingId(e.target.value)}
                    className="input h-11 border-slate-300 rounded-xl text-xs sm:text-sm font-medium"
                  >
                    {props.shipping.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.cost > 0 ? `${formatToman(s.cost)} ت` : "پس‌کرایه"})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label block mb-1 font-bold text-slate-700">توضیحات و یادداشت بار (اختیاری):</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="مثال: ارسال با اتوبوس تعاونی سیرجان یا باربری شمس"
                    className="input h-11 border-slate-300 rounded-xl text-xs sm:text-sm"
                  />
                </div>
              </div>

              <div className="pt-3 border-t flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <span className="text-xs text-slate-500 block">جمع کل قابل پرداخت:</span>
                  <span className="text-xl font-black text-blue-700 nums">
                    {formatToman(stats.totalEstimatedAmount)} تومان
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSubmitOrder}
                  disabled={submitting || !props.canOrder}
                  className="btn btn-emerald text-sm px-6 py-3 rounded-xl font-black shadow-md shadow-emerald-500/25 active:scale-98 transition-all flex items-center gap-2"
                >
                  {submitting ? "در حال صدور پیش‌فاکتور…" : "✓ تأیید نهایی و صدور پیش‌فاکتور رسمی B2B"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
