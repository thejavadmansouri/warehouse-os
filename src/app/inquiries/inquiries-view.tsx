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
    <div className="mx-auto w-full max-w-5xl px-4 py-6 pb-24">
      {/* هدر صفحه */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-rule">
        <div>
          <h1 className="text-xl font-bold tracking-tight">استعلام چندردیفی قیمت (RFQ)</h1>
          <p className="text-xs text-ink-soft mt-1">
            اقلام ناموجود یا تیراژهای خاص را استعلام کنید؛ کارشناسان کاردو کمتر از ۲ ساعت قیمت‌گذاری می‌کنند.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-brass text-xs px-4 py-2 flex items-center gap-1.5 shadow-sm"
        >
          <span className="text-base leading-none font-bold">+</span>
          <span>ثبت استعلام جدید</span>
        </button>
      </div>

      {/* فرم استعلام جدید */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink/50 backdrop-blur-xs">
          <div className="card w-full max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 bg-paper-raised shadow-xl border-2 border-brass/50 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-rule">
              <div>
                <h2 className="font-bold text-base">درخواست استعلام قیمت B2B</h2>
                <p className="text-[11px] text-ink-soft mt-0.5">
                  ردیف‌های مورد نیاز را وارد کنید. کارشناسان ما قیمت روز و موجودی را ثبت می‌کنند.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-ink-soft hover:text-ink text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitInquiry} className="mt-4 space-y-4">
              {error && (
                <div className="p-3 bg-alarm-soft border border-alarm/30 rounded text-alarm text-xs">
                  {error}
                </div>
              )}

              {/* ردیف‌های اقلام */}
              <div className="space-y-3">
                {rows.map((row, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-paper border border-rule rounded-[3px] space-y-2 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-brass nums">
                        ردیف {toFaDigits(idx + 1)}
                      </span>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-[11px] text-alarm hover:underline"
                        >
                          حذف ردیف
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="label block mb-1">نام قطعه یا شرح کالا *</label>
                        <input
                          required
                          value={row.partName}
                          onChange={(e) => updateRow(idx, "partName", e.target.value)}
                          placeholder="مثلاً: لنت ترمز جلو، دیسک چرخ..."
                          className="input text-xs"
                        />
                      </div>
                      <div>
                        <label className="label block mb-1">خودرو / برند قطعه</label>
                        <input
                          value={row.brand}
                          onChange={(e) => updateRow(idx, "brand", e.target.value)}
                          placeholder="مثلاً: پژو ۲۰۶ / گلد، امکو..."
                          className="input text-xs"
                        />
                      </div>
                      <div>
                        <label className="label block mb-1">کد فنی یا OEM (اختیاری)</label>
                        <input
                          value={row.sku}
                          onChange={(e) => updateRow(idx, "sku", e.target.value)}
                          placeholder="کد فنی یا شماره برچسب"
                          className="input text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      <div>
                        <label className="label block mb-1">تعداد درخواستی *</label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={row.qty}
                          onChange={(e) => updateRow(idx, "qty", Number(e.target.value))}
                          className="input text-xs nums"
                        />
                      </div>
                      <div>
                        <label className="label block mb-1">واحد سنجش</label>
                        <select
                          value={row.unit}
                          onChange={(e) => updateRow(idx, "unit", e.target.value)}
                          className="input text-xs"
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
                          className="input text-xs nums"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addRow}
                className="w-full py-2 border border-dashed border-rule-strong hover:border-brass text-ink-soft hover:text-ink text-xs rounded transition-colors flex items-center justify-center gap-1"
              >
                <span>+</span>
                <span>افزودن قلم کالای دیگر به استعلام</span>
              </button>

              <div>
                <label className="label block mb-1">یادداشت خریدار و شروط تحویل (اختیاری)</label>
                <textarea
                  rows={2}
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder="مثلاً: تحویل فوری تا پس‌فردا در باربری کرمان نیاز است..."
                  className="input text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-rule">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-ghost text-xs px-4 py-2"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="btn btn-brass text-xs px-5 py-2"
                >
                  {busy ? "در حال ثبت..." : "ارسال استعلام به کارشناسان"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* لیست استعلام‌ها */}
      <div className="mt-6">
        {inquiries.length === 0 ? (
          <div className="card p-10 text-center text-ink-soft text-sm">
            <p className="font-semibold text-ink">هنوز استعلام قیمتی ثبت نکرده‌اید.</p>
            <p className="text-xs mt-1">
              اگر قطعه‌ای در کاتالوگ نیست یا تخفیف تیراژ ویژه می‌خواهید، روی «ثبت استعلام جدید» کلیک کنید.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="hidden md:grid grid-cols-[8.5rem_1fr_6rem_8rem_7rem_6.5rem] gap-2 px-4 py-2.5 border-b border-rule bg-brass-soft/40 text-[11px] text-ink-soft">
              <span>شماره استعلام</span>
              <span>شرح اقلام</span>
              <span className="text-center">تعداد اقلام</span>
              <span className="text-left">مجموع قیمت اعلامی</span>
              <span className="text-center">وضعیت</span>
              <span className="text-center">عملیات</span>
            </div>

            <ul className="divide-y divide-rule/60">
              {inquiries.map((inq) => {
                const st = INQUIRY_STATUS[inq.status] ?? INQUIRY_STATUS.PENDING;
                return (
                  <li
                    key={inq.id}
                    className="p-4 md:grid md:grid-cols-[8.5rem_1fr_6rem_8rem_7rem_6.5rem] md:items-center gap-2 hover:bg-brass-soft/10 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-xs nums text-brass">{inq.number}</p>
                      <p className="text-[10px] text-ink-soft mt-0.5">{faDate(inq.createdAt)}</p>
                    </div>

                    <div className="mt-2 md:mt-0 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {inq.items.map((i) => i.partName).join("، ")}
                      </p>
                      {inq.customerNote && (
                        <p className="text-[11px] text-ink-soft truncate mt-0.5">
                          یادداشت: {inq.customerNote}
                        </p>
                      )}
                    </div>

                    <div className="mt-1 md:mt-0 md:text-center text-xs text-ink-soft">
                      <span className="nums">{toFaDigits(inq.items.length)}</span> قلم
                    </div>

                    <div className="mt-1 md:mt-0 md:text-left text-xs font-bold nums">
                      {inq.totalQuoted && inq.totalQuoted > 0 ? (
                        <span>{formatToman(inq.totalQuoted)} تومان</span>
                      ) : (
                        <span className="text-[11px] text-ink-soft font-normal">در حال بررسی</span>
                      )}
                    </div>

                    <div className="mt-2 md:mt-0 md:text-center">
                      <span
                        className={`stamp text-[10px] ${
                          st.tone === "green"
                            ? "text-ledger-green"
                            : st.tone === "red"
                            ? "text-alarm"
                            : st.tone === "ink"
                            ? "text-ink"
                            : "text-brass"
                        }`}
                      >
                        {st.label}
                      </span>
                    </div>

                    <div className="mt-3 md:mt-0 md:text-center">
                      <Link
                        href={`/inquiries/${inq.id}`}
                        className="btn btn-ghost text-xs px-3 py-1.5 w-full md:w-auto"
                      >
                        مشاهده و پیگیری
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
