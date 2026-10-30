"use client";

import { useEffect, useState } from "react";
import { formatToman, toFaDigits } from "@/lib/digits";
import { RMA_REASONS, RMA_STATUS_MAP, type RmaReasonKey } from "@/lib/rma";

type RmaItem = {
  id: string;
  number: string;
  customerName: string;
  customerPhone: string;
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
  refundAmount: number;
  createdAt: string;
  resolvedAt: string | null;
};

export function RmaAdminView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalPending: 0,
    totalApproved: 0,
    totalRefunded: 0,
  });
  const [rmas, setRmas] = useState<RmaItem[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [reasonFilter, setReasonFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Refund / Action Modal
  const [actionRma, setActionRma] = useState<RmaItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<string>("APPROVED");
  const [adminNote, setAdminNote] = useState("");
  const [refundAmountOverride, setRefundAmountOverride] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (reasonFilter !== "ALL") params.set("reason", reasonFilter);
      if (searchQuery) params.set("q", searchQuery);

      const res = await fetch(`/api/admin/rma?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در بارگذاری درخواست‌های مرجوعی");

      setStats(data.stats);
      setRmas(data.rmas || []);
    } catch (err: any) {
      setError(err.message || "ارتباط با سرور برقرار نشد");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [statusFilter, reasonFilter]);

  async function handleDecision(e: React.FormEvent) {
    e.preventDefault();
    if (!actionRma) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/rma/${actionRma.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetStatus,
          adminNote: adminNote || undefined,
          refundAmountOverride: targetStatus === "REFUNDED" ? refundAmountOverride : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در ثبت تصمیم");

      setActionRma(null);
      loadData();
    } catch (err: any) {
      alert(err.message || "خطا در انجام عملیات");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* آمار بالاسری */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4 border-amber-200 bg-amber-50/50">
          <p className="text-xs text-amber-800 font-medium">در انتظار بررسی کارشناس فنی</p>
          <p className="text-2xl font-black text-amber-900 mt-1 nums">{toFaDigits(stats.totalPending)}</p>
        </div>
        <div className="card p-4 border-blue-200 bg-blue-50/50">
          <p className="text-xs text-blue-800 font-medium">تأییدشده جهت ارسال به انبار</p>
          <p className="text-2xl font-black text-blue-900 mt-1 nums">{toFaDigits(stats.totalApproved)}</p>
        </div>
        <div className="card p-4 border-emerald-200 bg-emerald-50/50">
          <p className="text-xs text-emerald-800 font-medium">تسویه‌شده و عودت به کیف پول</p>
          <p className="text-2xl font-black text-emerald-900 mt-1 nums">{toFaDigits(stats.totalRefunded)}</p>
        </div>
      </div>

      {/* فیلترها و جستجو */}
      <div className="card p-4 bg-white shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="جستجو با شماره RMA، کد فنی، نام قطعه، نام همکار..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadData()}
              className="w-full text-xs input px-3 py-2 border border-slate-300 rounded-lg min-h-[42px]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white min-h-[42px]"
          >
            <option value="ALL">همه وضعیت‌ها</option>
            <option value="PENDING">در انتظار بررسی</option>
            <option value="APPROVED">تأیید ارسال به انبار</option>
            <option value="RECEIVED">دریافت و تست در انبار</option>
            <option value="REFUNDED">تسویه و عودت وجه</option>
            <option value="REJECTED">رد شده</option>
          </select>

          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white min-h-[42px]"
          >
            <option value="ALL">همه علت‌های مرجوعی</option>
            {Object.entries(RMA_REASONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadData}
            className="btn btn-ghost px-4 py-2 text-xs font-bold min-h-[42px]"
          >
            اعمال فیلتر
          </button>
        </div>
      </div>

      {/* لیست درخواست‌های مرجوعی */}
      {loading ? (
        <div className="p-8 text-center text-slate-500 text-sm">در حال بارگذاری درخواست‌های RMA...</div>
      ) : error ? (
        <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">{error}</div>
      ) : rmas.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-sm card bg-white">
          هیچ درخواست مرجوعی یا گارانتی با این مشخصات یافت نشد.
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
              <div key={r.id} className="card p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="nums font-extrabold text-sm text-slate-900">{r.number}</span>
                      <span className="text-xs text-slate-500">فاکتور: {r.orderNumber}</span>
                      <span className="text-xs font-bold text-slate-700">({r.customerName})</span>
                      <span className="text-xs text-slate-400 nums font-mono" dir="ltr">{r.customerPhone}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 mt-1">
                      {r.productName} <span className="font-mono text-xs font-normal text-slate-500 nums">({r.sku})</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      تعداد مرجوعی: <b className="text-slate-800 nums font-bold">{toFaDigits(r.qty)} {r.unit}</b> · خودرو: {r.brand} {r.partBrand ? `(${r.partBrand})` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${st.badgeClass}`}>
                      {st.label}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50/70 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-500">علت اعلامی همکار:</span>
                    <p className="font-bold text-slate-800 mt-0.5">{reasonObj ? reasonObj.label : r.reason}</p>
                    <p className="text-slate-600 mt-1 leading-5">{r.customerNote}</p>
                  </div>

                  <div>
                    <span className="text-slate-500">مبلغ بازگشتی برآوردشده:</span>
                    <p className="font-black text-sm text-blue-700 mt-0.5 nums">{formatToman(r.refundAmount)} تومان</p>
                    {r.adminNote && (
                      <p className="text-slate-600 mt-1 leading-5">
                        <b>پاسخ کارشناس:</b> {r.adminNote}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                  <span className="text-slate-400 nums">
                    ثبت درخواست: {new Date(r.createdAt).toLocaleDateString("fa-IR")}
                    {r.resolvedAt && ` · تاریخ تسویه: ${new Date(r.resolvedAt).toLocaleDateString("fa-IR")}`}
                  </span>

                  <div className="flex items-center gap-2">
                    {r.status === "PENDING" && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setActionRma(r);
                            setTargetStatus("APPROVED");
                            setAdminNote("قطعه مورد تأیید اولیه است. لطفاً جهت کارشناسی نهایی به انبار مرکزی کرمان ارسال شود.");
                            setRefundAmountOverride(r.refundAmount);
                          }}
                          className="btn btn-blue px-3 py-1.5 text-xs font-bold min-h-[36px]"
                        >
                          تأیید اولیه ارسال به انبار
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionRma(r);
                            setTargetStatus("REJECTED");
                            setAdminNote("با توجه به شرایط گارانتی و عدم رعایت دستورالعمل نصب، درخواست پذیرفته نشد.");
                            setRefundAmountOverride(r.refundAmount);
                          }}
                          className="btn btn-ghost px-3 py-1.5 text-xs text-rose-600 min-h-[36px]"
                        >
                          رد درخواست
                        </button>
                      </>
                    )}

                    {r.status === "APPROVED" && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionRma(r);
                          setTargetStatus("RECEIVED");
                          setAdminNote("قطعه در انبار مرکزی دریافت و از نظر سلامت فیزیکی/تست دستگاهی تایید شد.");
                          setRefundAmountOverride(r.refundAmount);
                        }}
                        className="btn btn-blue px-3 py-1.5 text-xs font-bold min-h-[36px]"
                      >
                        دریافت و تأیید در انبار
                      </button>
                    )}

                    {r.status === "RECEIVED" && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionRma(r);
                          setTargetStatus("REFUNDED");
                          setAdminNote("مبلغ قطعه مرجوعی به کیف پول همکار عودت داده شد.");
                          setRefundAmountOverride(r.refundAmount);
                        }}
                        className="btn btn-emerald px-3.5 py-1.5 text-xs font-bold min-h-[36px]"
                      >
                        تسویه نهایی و شارژ کیف پول
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* مدال تصمیم‌گیری و عودت وجه */}
      {actionRma && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">
                اقدام روی درخواست {actionRma.number}
              </h3>
              <button
                type="button"
                onClick={() => setActionRma(null)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDecision} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">وضعیت جدید</label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value)}
                  className="w-full input px-3 py-2 border rounded-lg font-bold"
                >
                  <option value="APPROVED">تأیید اولیه (ارسال قطعه توسط همکار به انبار کرمان)</option>
                  <option value="RECEIVED">دریافت در انبار مرکزی و تایید تست</option>
                  <option value="REFUNDED">تسویه نهایی (شارژ فوری کیف پول همکار)</option>
                  <option value="REJECTED">رد درخواست مرجوعی</option>
                </select>
              </div>

              {targetStatus === "REFUNDED" && (
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    مبلغ عودت به کیف پول (تومان)
                  </label>
                  <input
                    type="number"
                    value={refundAmountOverride}
                    onChange={(e) => setRefundAmountOverride(Number(e.target.value))}
                    className="w-full input px-3 py-2 border rounded-lg font-bold nums text-blue-700"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    با تأیید این گزینه، مبلغ مستقیماً به موجودی کیف پول مشتری اضافه و رسید صادر می‌شود.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">توضیحات و پاسخ کارشناس گارانتی</label>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full input p-3 border rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setActionRma(null)}
                  className="btn btn-ghost px-4 py-2"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`btn px-5 py-2 font-bold ${
                    targetStatus === "REFUNDED" ? "btn-emerald" : targetStatus === "REJECTED" ? "bg-rose-600 text-white" : "btn-blue"
                  }`}
                >
                  {submitting ? "در حال ثبت..." : "تأیید و اجرای عملیات"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
