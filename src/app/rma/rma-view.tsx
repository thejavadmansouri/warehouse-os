"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";
import { RMA_REASONS, RMA_STATUS_MAP, type RmaReasonKey } from "@/lib/rma";

type RmaItem = {
  id: string;
  number: string;
  orderNumber: string;
  orderId: string;
  productName: string;
  sku: string;
  brand: string;
  partBrand: string | null;
  qty: number;
  unit: string;
  reason: RmaReasonKey;
  customerNote: string;
  adminNote: string | null;
  status: string;
  refundAmount: number | null;
  createdAt: string;
  resolvedAt: string | null;
};

type EligibleItem = {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  qty: number;
  unitPrice: number;
};

export function RmaView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rmas, setRmas] = useState<RmaItem[]>([]);

  // Modal for new RMA
  const [isOpen, setIsOpen] = useState(false);
  const [eligibleItems, setEligibleItems] = useState<EligibleItem[]>([]);
  const [selectedEligible, setSelectedEligible] = useState<EligibleItem | null>(null);
  const [reason, setReason] = useState<RmaReasonKey>("DEFECTIVE");
  const [qty, setQty] = useState(1);
  const [customerNote, setCustomerNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rma");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در دریافت لیست مرجوعی");
      setRmas(data.rmas || []);
    } catch (err: any) {
      setError(err.message || "ارتباط با سرور برقرار نشد");
    } finally {
      setLoading(false);
    }
  }

  async function openCreateModal() {
    setIsOpen(true);
    try {
      const res = await fetch("/api/rma/eligible-items");
      const data = await res.json();
      if (res.ok && data.items?.length > 0) {
        setEligibleItems(data.items);
        setSelectedEligible(data.items[0]);
        setQty(1);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEligible) {
      alert("لطفاً قطعه مورد نظر را انتخاب فرمایید");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/rma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedEligible.orderId,
          productId: selectedEligible.productId,
          qty,
          reason,
          customerNote,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در ثبت درخواست مرجوعی");

      setIsOpen(false);
      setCustomerNote("");
      loadData();
    } catch (err: any) {
      alert(err.message || "خطا در ثبت");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 mt-6">
      {/* دکمه اقدام و راهنما */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-sm font-bold text-slate-800">ضمانت اصالت و سلامت قطعات کاردو</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            کلیه قطعات دارای مهلت تست ۴۸ ساعته پس از تحویل باربری و گارانتی تعویض شرکتی هستند.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="btn btn-blue px-4 py-2 text-xs font-bold min-h-[44px] flex items-center gap-1.5 shadow-xs"
        >
          <span>+</span>
          <span>ثبت درخواست مرجوعی / گارانتی جدید</span>
        </button>
      </div>

      {/* لیست درخواست‌ها */}
      {loading ? (
        <div className="p-8 text-center text-slate-500 text-sm">در حال بارگذاری سوابق مرجوعی...</div>
      ) : error ? (
        <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">{error}</div>
      ) : rmas.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-sm card bg-white border border-slate-200 rounded-xl">
          تاکنون هیچ درخواست مرجوعی یا خدمات گارانتی برای حساب شما ثبت نشده است.
        </div>
      ) : (
        <div className="space-y-3">
          {rmas.map((r) => {
            const st = RMA_STATUS_MAP[r.status] || {
              label: r.status,
              badgeClass: "bg-slate-100 text-slate-700",
            };
            const reasonObj = RMA_REASONS[r.reason];

            return (
              <div
                key={r.id}
                className="card p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="nums font-extrabold text-sm text-slate-900">{r.number}</span>
                      <span className="text-xs text-slate-400">|</span>
                      <Link
                        href={`/orders/${r.orderId}`}
                        prefetch={false}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        مربوط به فاکتور {r.orderNumber}
                      </Link>
                    </div>
                    <p className="text-sm font-bold text-slate-900 mt-1">
                      {r.productName} <span className="font-mono text-xs font-normal text-slate-500 nums">({r.sku})</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      تعداد مرجوعی: <b className="text-slate-800 nums font-bold">{toFaDigits(r.qty)} {r.unit}</b> · برند: {r.brand} {r.partBrand ? `(${r.partBrand})` : ""}
                    </p>
                  </div>
                  <div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${st.badgeClass}`}>
                      {st.label}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50/70 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-500">علت اعلام‌شده:</span>
                    <p className="font-bold text-slate-800 mt-0.5">{reasonObj ? reasonObj.label : r.reason}</p>
                    <p className="text-slate-600 mt-1 leading-5">{r.customerNote}</p>
                  </div>

                  <div>
                    <span className="text-slate-500">مبلغ بازگشتی برآوردشده:</span>
                    <p className="font-black text-sm text-blue-700 mt-0.5 nums">
                      {r.refundAmount ? `${formatToman(r.refundAmount)} تومان` : "—"}
                    </p>
                    {r.adminNote && (
                      <p className="text-slate-700 mt-1 leading-5 bg-white p-2 rounded border border-slate-200">
                        <b className="text-slate-900">پاسخ کارشناس فنی کاردو:</b> {r.adminNote}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 pt-1 nums">
                  <span>تاریخ ثبت فرم: {new Date(r.createdAt).toLocaleDateString("fa-IR")}</span>
                  {r.status === "REFUNDED" && (
                    <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      ✓ تسویه به کیف پول واریز گردید
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* مدال ثبت درخواست مرجوعی */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">
                فرم درخواست مرجوعی / خدمات پس از فروش
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                ✕
              </button>
            </div>

            {eligibleItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 space-y-2">
                <p>شما در حال حاضر فاکتور تسویه‌شده‌ای برای مرجوعی قطعه ندارید.</p>
                <p className="text-slate-400">
                  تنها اقلام سفارش‌های تسویه‌شده یا اعتباری تأییدشده امکان ثبت مرجوعی دارند.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">انتخاب قطعه از فاکتورهای شما</label>
                  <select
                    value={selectedEligible ? `${selectedEligible.orderId}::${selectedEligible.productId}` : ""}
                    onChange={(e) => {
                      const [oId, pId] = e.target.value.split("::");
                      const found = eligibleItems.find((it) => it.orderId === oId && it.productId === pId);
                      if (found) {
                        setSelectedEligible(found);
                        setQty(1);
                      }
                    }}
                    className="w-full input px-3 py-2 border rounded-lg"
                  >
                    {eligibleItems.map((it) => (
                      <option key={`${it.orderId}::${it.productId}`} value={`${it.orderId}::${it.productId}`}>
                        فاکتور {it.orderNumber} — {it.name} ({it.sku}) [خریداری: {toFaDigits(it.qty)} {it.unit}]
                      </option>
                    ))}
                  </select>
                </div>

                {selectedEligible && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 text-slate-600">
                    <p className="font-bold text-slate-800">{selectedEligible.name}</p>
                    <p className="nums">
                      کد فنی: <span className="font-mono">{selectedEligible.sku}</span> · قیمت خرید: {formatToman(selectedEligible.unitPrice)} ت
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">تعداد قطعه مرجوعی</label>
                    <input
                      type="number"
                      min={1}
                      max={selectedEligible?.qty || 1}
                      value={qty}
                      onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                      className="w-full input px-3 py-2 border rounded-lg nums font-bold text-center"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      حداکثر مجاز: {selectedEligible ? toFaDigits(selectedEligible.qty) : 1} {selectedEligible?.unit}
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">علت مرجوعی</label>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value as RmaReasonKey)}
                      className="w-full input px-3 py-2 border rounded-lg"
                    >
                      {Object.entries(RMA_REASONS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    شرح کامل نقص قطعه یا علت عودت
                  </label>
                  <textarea
                    rows={3}
                    placeholder="لطفاً شرح دهید که ایراد فنی، عدم تطابق کد قطعه، یا آسیب‌دیدگی در چه وضعیتی مشاهده شده است..."
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    required
                    className="w-full input p-3 border rounded-lg"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="btn btn-ghost px-4 py-2"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-blue px-5 py-2 font-bold min-h-[40px]"
                  >
                    {submitting ? "در حال ثبت..." : "ثبت و ارسال به واحد کارشناسی"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
