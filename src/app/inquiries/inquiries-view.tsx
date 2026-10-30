"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatToman, toFaDigits } from "@/lib/digits";
import { faDate } from "@/lib/date";
import { INQUIRY_STATUS } from "@/lib/status";

export type InquiryItemRecord = {
  id: string;
  partName: string;
  sku: string | null;
  brand: string | null;
  model: string | null;
  qty: number;
  unit: string;
  targetPrice: number | null;
  quotedUnitPrice: number | null;
  lineTotal: number | null;
  adminNote: string | null;
};

export type InquiryRecord = {
  id: string;
  number: string;
  status: "PENDING" | "ANSWERED" | "CONVERTED" | "REJECTED";
  customerNote: string | null;
  adminNote: string | null;
  totalQuoted: number | null;
  convertedOrderId: string | null;
  createdAt: string;
  items: InquiryItemRecord[];
};

type RowInput = {
  partName: string;
  brand: string;
  model: string;
  sku: string;
  qty: number;
  unit: string;
  targetPrice: string;
};

const emptyRow = (): RowInput => ({
  partName: "",
  brand: "",
  model: "",
  sku: "",
  qty: 1,
  unit: "عدد",
  targetPrice: "",
});

const toneClass: Record<string, string> = {
  amber: "text-amber-700 bg-amber-50 border border-amber-200",
  green: "text-emerald-700 bg-emerald-50 border border-emerald-200",
  red: "text-rose-700 bg-rose-50 border border-rose-200",
  ink: "text-slate-700 bg-slate-100 border border-slate-200",
};

export function InquiriesView(props: { initialInquiries: InquiryRecord[] }) {
  const router = useRouter();
  const [inquiries, setInquiries] = useState<InquiryRecord[]>(props.initialInquiries);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rows, setRows] = useState<RowInput[]>([emptyRow()]);
  const [customerNote, setCustomerNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow()]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof RowInput, value: any) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  async function submitInquiry(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const validItems = rows
      .filter((r) => r.partName.trim().length > 0)
      .map((r) => ({
        partName: r.partName.trim(),
        brand: r.brand.trim() || undefined,
        model: r.model.trim() || undefined,
        sku: r.sku.trim() || undefined,
        qty: Math.max(1, Number(r.qty) || 1),
        unit: r.unit || "عدد",
        targetPrice: r.targetPrice ? Number(r.targetPrice.replace(/[^\d]/g, "")) : undefined,
      }));

    if (validItems.length === 0) {
      setError("لطفاً نام حداقل یک قطعه را وارد کنید");
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerNote: customerNote.trim() || undefined,
          items: validItems,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "ثبت استعلام با خطا مواجه شد");
        setBusy(false);
        return;
      }

      setInquiries((prev) => [data.inquiry, ...prev]);
      setShowCreateModal(false);
      setRows([emptyRow()]);
      setCustomerNote("");
      router.push(`/inquiries/${data.inquiry.id}`);
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-3 sm:px-6 py-6 pb-24">
      {/* هدر صفحه */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">استعلام چندردیفی قیمت (RFQ)</h1>
          <p className="text-xs text-slate-500 mt-1">
            اقلام ناموجود یا تیراژهای خاص را استعلام کنید؛ کارشناسان کاردو کمتر از ۲ ساعت قیمت‌گذاری می‌کنند.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-brass text-xs px-4 py-2.5 flex items-center gap-1.5 shadow-sm rounded-lg font-bold"
        >
          <span className="text-base leading-none font-bold">+</span>
          <span>ثبت استعلام جدید</span>
        </button>
      </div>

      {/* فرم استعلام جدید — کشوی تمام‌صفحه در موبایل و مدال در دسکتاپ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="card w-full sm:max-w-3xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6 bg-white shadow-2xl border border-slate-200 rounded-t-2xl sm:rounded-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 sticky top-0 bg-white/95 backdrop-blur-md z-10">
              <div>
                <h2 className="font-extrabold text-base text-slate-900">درخواست استعلام قیمت B2B</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  ردیف‌های مورد نیاز را وارد کنید. کارشناسان ما قیمت روز و موجودی را ثبت می‌کنند.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="size-8 grid place-items-center text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitInquiry} className="mt-4 space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
                  {error}
                </div>
              )}

              {/* ردیف‌های اقلام */}
              <div className="space-y-3">
                {rows.map((row, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-700 nums bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        ردیف {toFaDigits(idx + 1)}
                      </span>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-xs text-rose-600 hover:underline font-medium"
                        >
                          حذف این ردیف
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="label block mb-1">نام قطعه یا شرح کالا *</label>
                        <input
                          required
                          value={row.partName}
                          onChange={(e) => updateRow(idx, "partName", e.target.value)}
                          placeholder="مثلاً: لنت ترمز جلو، دیسک چرخ..."
                          className="input text-xs h-10 border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="label block mb-1">خودرو / برند قطعه</label>
                        <input
                          value={row.brand}
                          onChange={(e) => updateRow(idx, "brand", e.target.value)}
                          placeholder="مثلاً: پژو ۲۰۶ / ایساکو، والئو..."
                          className="input text-xs h-10 border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="label block mb-1">کد فنی یا OEM (اختیاری)</label>
                        <input
                          value={row.sku}
                          onChange={(e) => updateRow(idx, "sku", e.target.value)}
                          placeholder="کد فنی یا شماره قطعه"
                          className="input text-xs h-10 border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                      <div>
                        <label className="label block mb-1">تعداد درخواستی *</label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={row.qty}
                          onChange={(e) => updateRow(idx, "qty", Number(e.target.value))}
                          className="input text-xs nums h-10 border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="label block mb-1">واحد سنجش</label>
                        <select
                          value={row.unit}
                          onChange={(e) => updateRow(idx, "unit", e.target.value)}
                          className="input text-xs h-10 border-slate-300 rounded-lg bg-white"
                        >
                          <option value="عدد">عدد</option>
                          <option value="جین">جین (دست)</option>
                          <option value="کارتن">کارتن</option>
                          <option value="بسته">بسته</option>
                          <option value="ست">ست</option>
                        </select>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="label block mb-1">قیمت هدف (اختیاری - تومان)</label>
                        <input
                          type="text"
                          value={row.targetPrice}
                          onChange={(e) => updateRow(idx, "targetPrice", e.target.value)}
                          placeholder="مثلاً: ۳۵۰٬۰۰۰"
                          className="input text-xs nums h-10 border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addRow}
                className="w-full h-11 border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/50 text-slate-600 hover:text-blue-700 text-xs rounded-xl font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <span>+</span>
                <span>افزودن قلم کالای دیگر به این استعلام</span>
              </button>

              <div>
                <label className="label block mb-1">یادداشت خریدار و شروط تحویل (اختیاری)</label>
                <textarea
                  rows={2}
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder="مثلاً: تحویل فوری تا پس‌فردا در باربری کرمان نیاز است..."
                  className="input text-xs border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-ghost text-xs px-4 py-2.5 rounded-lg"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="btn btn-brass text-xs px-5 py-2.5 font-bold rounded-lg shadow-sm"
                >
                  {busy ? "در حال ثبت..." : "ارسال استعلام به کارشناسان فروش"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* لیست استعلام‌ها */}
      <div className="mt-5">
        {inquiries.length === 0 ? (
          <div className="card p-12 text-center text-slate-500 bg-white border border-slate-200 rounded-xl space-y-3">
            <div className="size-12 rounded-full bg-slate-100 text-slate-400 grid place-items-center mx-auto text-xl">
              📝
            </div>
            <p className="font-bold text-slate-800 text-base">هنوز استعلام قیمتی ثبت نکرده‌اید.</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              اگر قطعه‌ای در کاتالوگ نیست یا تخفیف تیراژ ویژه می‌خواهید، روی «ثبت استعلام جدید» کلیک کنید.
            </p>
          </div>
        ) : (
          <>
            {/* نمای موبایل استعلام‌ها (Mobile Cards) */}
            <div className="md:hidden space-y-3">
              {inquiries.map((inq) => {
                const st = INQUIRY_STATUS[inq.status] ?? INQUIRY_STATUS.PENDING;
                return (
                  <div
                    key={inq.id}
                    className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="nums font-mono font-bold text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                          {inq.number}
                        </span>
                        <span className="text-[11px] text-slate-500">{faDate(inq.createdAt)}</span>
                      </div>
                      <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${toneClass[st.tone]}`}>
                        {st.label}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-900 leading-snug">
                        {inq.items.map((i) => i.partName).join("، ")}
                      </p>
                      {inq.customerNote && (
                        <p className="text-[11px] text-slate-500 truncate mt-1">
                          یادداشت: {inq.customerNote}
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500 nums">
                        {toFaDigits(inq.items.length)} قلم کالا
                      </span>
                      <div className="nums font-bold">
                        {inq.totalQuoted && inq.totalQuoted > 0 ? (
                          <span className="text-blue-700 font-extrabold">{formatToman(inq.totalQuoted)} تومان</span>
                        ) : (
                          <span className="text-slate-400 font-normal">در انتظار قیمت‌گذاری</span>
                        )}
                      </div>
                    </div>

                    <Link
                      href={`/inquiries/${inq.id}`}
                      className="h-10 w-full rounded-lg text-xs font-bold border border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 flex items-center justify-center gap-1 transition-all"
                    >
                      <span>مشاهده جزئیات و پیگیری</span>
                      <span>←</span>
                    </Link>
                  </div>
                );
              })}
            </div>

            {/* نمای دسکتاپ استعلام‌ها (Desktop Table) */}
            <div className="hidden md:block card overflow-hidden border-slate-200 shadow-2xs rounded-xl bg-white">
              <div className="grid grid-cols-[8.5rem_1fr_6rem_9rem_8rem_7rem] gap-2 px-5 py-3 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <span>شماره استعلام</span>
                <span>شرح اقلام</span>
                <span className="text-center">تعداد اقلام</span>
                <span className="text-left">مجموع اعلامی</span>
                <span className="text-center">وضعیت</span>
                <span className="text-center">عملیات</span>
              </div>

              <ul className="divide-y divide-slate-100">
                {inquiries.map((inq) => {
                  const st = INQUIRY_STATUS[inq.status] ?? INQUIRY_STATUS.PENDING;
                  return (
                    <li
                      key={inq.id}
                      className="px-5 py-4 grid grid-cols-[8.5rem_1fr_6rem_9rem_8rem_7rem] items-center gap-2 hover:bg-slate-50/60 transition-colors"
                    >
                      <div>
                        <p className="font-bold text-xs nums text-blue-700">{inq.number}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{faDate(inq.createdAt)}</p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {inq.items.map((i) => i.partName).join("، ")}
                        </p>
                        {inq.customerNote && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            یادداشت: {inq.customerNote}
                          </p>
                        )}
                      </div>

                      <div className="text-center text-xs text-slate-600 nums">
                        {toFaDigits(inq.items.length)} قلم
                      </div>

                      <div className="text-left text-xs font-bold nums">
                        {inq.totalQuoted && inq.totalQuoted > 0 ? (
                          <span className="text-slate-900 font-extrabold">{formatToman(inq.totalQuoted)} ت</span>
                        ) : (
                          <span className="text-slate-400 font-normal">در حال بررسی</span>
                        )}
                      </div>

                      <div className="text-center">
                        <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${toneClass[st.tone]}`}>
                          {st.label}
                        </span>
                      </div>

                      <div className="text-center">
                        <Link
                          href={`/inquiries/${inq.id}`}
                          className="btn btn-ghost text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-400"
                        >
                          پیگیری
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
