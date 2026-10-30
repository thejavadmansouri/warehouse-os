"use client";

import { useState } from "react";
import { formatToman, toFaDigits } from "@/lib/digits";
import { faDate } from "@/lib/date";
import { CHEQUE_STATUS, type ChequeStatusKey } from "@/lib/cheques";

export type AdminChequeItem = {
  id: string;
  sayadId: string;
  chequeNumber: string;
  bankName: string;
  branchName: string | null;
  accountNumber: string | null;
  drawerName: string;
  drawerNationalId: string | null;
  amount: number;
  issueDate: string;
  dueDate: string;
  status: ChequeStatusKey;
  adminNote: string | null;
  sayadVerified: boolean;
  createdAt: string;
  customer: {
    id: string;
    companyName: string;
    contactName: string;
    phone: string;
    creditLimit: number;
  };
};

export function ChequesAdminView(props: { initialCheques: AdminChequeItem[] }) {
  const [cheques, setCheques] = useState<AdminChequeItem[]>(props.initialCheques);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [selectedCheque, setSelectedCheque] = useState<AdminChequeItem | null>(null);
  const [newStatus, setNewStatus] = useState<ChequeStatusKey>("REGISTERED_SAYAD");
  const [adminNote, setAdminNote] = useState("");
  const [expandCredit, setExpandCredit] = useState(true);
  const [sayadVerified, setSayadVerified] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = cheques.filter((c) => filterStatus === "ALL" || c.status === filterStatus);

  function openActionModal(cheque: AdminChequeItem, targetStatus: ChequeStatusKey) {
    setSelectedCheque(cheque);
    setNewStatus(targetStatus);
    setAdminNote(cheque.adminNote || "");
    setExpandCredit(targetStatus === "REGISTERED_SAYAD");
    setSayadVerified(targetStatus === "REGISTERED_SAYAD");
    setError(null);
  }

  async function updateStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCheque) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/cheques/${selectedCheque.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          adminNote: adminNote.trim() || undefined,
          sayadVerified,
          expandCredit: newStatus === "REGISTERED_SAYAD" ? expandCredit : false,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "به‌روزرسانی وضعیت چک با خطا مواجه شد.");
        return;
      }

      setCheques((prev) =>
        prev.map((c) =>
          c.id === selectedCheque.id
            ? {
                ...c,
                status: data.cheque.status,
                adminNote: data.cheque.adminNote,
                sayadVerified: data.cheque.sayadVerified,
                customer: {
                  ...c.customer,
                  creditLimit:
                    newStatus === "REGISTERED_SAYAD" && expandCredit
                      ? c.customer.creditLimit + c.amount
                      : c.customer.creditLimit,
                },
              }
            : c
        )
      );

      setSelectedCheque(null);
    } catch {
      setError("خطا در برقراری ارتباط با سرور");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* فیلترهای تب وضعیت */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 text-xs">
        <button
          onClick={() => setFilterStatus("ALL")}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            filterStatus === "ALL"
              ? "bg-slate-900 text-white font-bold"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          همه چک‌ها ({toFaDigits(cheques.length)})
        </button>
        <button
          onClick={() => setFilterStatus("RECEIVED")}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            filterStatus === "RECEIVED"
              ? "bg-amber-600 text-white font-bold"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          در نوبت بررسی ({toFaDigits(cheques.filter((c) => c.status === "RECEIVED").length)})
        </button>
        <button
          onClick={() => setFilterStatus("REGISTERED_SAYAD")}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            filterStatus === "REGISTERED_SAYAD"
              ? "bg-emerald-600 text-white font-bold"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          تأیید صیاد (اعتبار فعال)
        </button>
        <button
          onClick={() => setFilterStatus("CLEARED")}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            filterStatus === "CLEARED"
              ? "bg-blue-600 text-white font-bold"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          وصول‌شده
        </button>
        <button
          onClick={() => setFilterStatus("BOUNCED")}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            filterStatus === "BOUNCED"
              ? "bg-rose-600 text-white font-bold"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          برگشتی (نکول)
        </button>
      </div>

      {/* لیست چک‌ها */}
      <div className="card overflow-hidden border-slate-200 shadow-2xs rounded-xl bg-white text-xs">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            هیچ چکی در این وضعیت یافت نشد.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((c) => {
              const st = CHEQUE_STATUS[c.status] || CHEQUE_STATUS.RECEIVED;
              return (
                <li key={c.id} className="p-4 sm:p-5 hover:bg-slate-50/60 transition-colors space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">
                        {c.customer.companyName}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        ({c.customer.contactName} · {c.customer.phone})
                      </span>
                    </div>

                    <span
                      className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${
                        st.tone === "green"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : st.tone === "red"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {st.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px]">شناسه صیاد ۱۶ رقمی:</span>
                      <span className="nums font-mono font-bold text-blue-700 text-xs sm:text-sm">
                        {c.sayadId}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px]">بانک و شماره سریال:</span>
                      <span className="font-bold text-slate-800 text-xs">
                        {c.bankName} — <span className="font-mono">{c.chequeNumber}</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px]">مبلغ چک:</span>
                      <span className="nums font-extrabold text-slate-900 text-xs sm:text-sm">
                        {formatToman(c.amount)} تومان
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px]">تاریخ سررسید:</span>
                      <span className="nums font-bold text-slate-800 text-xs">
                        {faDate(c.dueDate)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
                    <div className="text-[11px] text-slate-500">
                      صاحب حساب: <b>{c.drawerName}</b> · سقف اعتبار فعلی مشتری:{" "}
                      <b className="nums text-slate-800">{formatToman(c.customer.creditLimit)} تومان</b>
                      {c.adminNote && (
                        <p className="text-blue-700 mt-0.5">یادداشت مالی: {c.adminNote}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {c.status === "RECEIVED" && (
                        <>
                          <button
                            onClick={() => openActionModal(c, "REGISTERED_SAYAD")}
                            className="btn btn-brass text-[11px] px-3 py-1.5 font-bold rounded-lg"
                          >
                            ✓ تأیید صیاد و شارژ اعتبار
                          </button>
                          <button
                            onClick={() => openActionModal(c, "REJECTED")}
                            className="btn btn-ghost text-[11px] px-3 py-1.5 text-rose-600 rounded-lg hover:bg-rose-50"
                          >
                            رد چک
                          </button>
                        </>
                      )}

                      {c.status === "REGISTERED_SAYAD" && (
                        <>
                          <button
                            onClick={() => openActionModal(c, "CLEARED")}
                            className="btn btn-ghost text-[11px] px-3 py-1.5 text-emerald-700 font-bold border border-emerald-200 rounded-lg hover:bg-emerald-50"
                          >
                            ✓ ثبت وصول (پاس شد)
                          </button>
                          <button
                            onClick={() => openActionModal(c, "BOUNCED")}
                            className="btn btn-ghost text-[11px] px-3 py-1.5 text-rose-600 font-bold border border-rose-200 rounded-lg hover:bg-rose-50"
                          >
                            ⚠ ثبت برگشت چک (نکول)
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => openActionModal(c, c.status)}
                        className="text-slate-500 hover:text-slate-800 text-[11px] px-2 py-1 underline"
                      >
                        ویرایش یادداشت
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* مدال عملیات مالی روی چک */}
      {selectedCheque && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="card w-full max-w-lg p-5 sm:p-6 bg-white shadow-2xl border border-slate-200 rounded-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                  اقدام مالی روی چک صیادی
                </h3>
                <p className="text-xs text-slate-500">
                  مشتری: {selectedCheque.customer.companyName} · مبلغ: {formatToman(selectedCheque.amount)} ت
                </p>
              </div>
              <button
                onClick={() => setSelectedCheque(null)}
                className="size-8 grid place-items-center text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={updateStatus} className="space-y-3.5 text-xs">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label className="label block mb-1">تعیین وضعیت جدید چک:</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="input h-10 border-slate-300 rounded-lg bg-white font-bold"
                >
                  <option value="RECEIVED">دریافت‌شده (در نوبت بررسی)</option>
                  <option value="REGISTERED_SAYAD">تأیید صیاد (اعتبار فعال)</option>
                  <option value="CLEARED">وصول‌شده (پاس‌شده)</option>
                  <option value="BOUNCED">برگشتی (نکول و تعلیق مشتری)</option>
                  <option value="REJECTED">رد شده</option>
                </select>
              </div>

              {newStatus === "REGISTERED_SAYAD" && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-emerald-900">
                    <input
                      type="checkbox"
                      checked={expandCredit}
                      onChange={(e) => setExpandCredit(e.target.checked)}
                      className="size-4 text-emerald-600 rounded"
                    />
                    <span>
                      افزایش سقف اعتبار مشتری معادل {formatToman(selectedCheque.amount)} تومان
                    </span>
                  </label>
                  <p className="text-[11px] text-emerald-700 leading-normal">
                    با انتخاب این گزینه، سقف اعتبار آزاد مشتری بلافاصله به میزان مبلغ این چک صیادی معتبر افزایش خواهد یافت.
                  </p>
                </div>
              )}

              {newStatus === "BOUNCED" && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 space-y-1">
                  <p className="font-bold">هشدار برگشت چک:</p>
                  <p className="text-[11px] leading-normal text-rose-700">
                    ثبت برگشت چک به صورت خودکار وضعیت حساب همکار را به «مسدود (SUSPENDED)» تغییر می‌دهد و ثبت هرگونه سفارش اعتباری جدید برای او متوقف می‌گردد.
                  </p>
                </div>
              )}

              <div>
                <label className="label block mb-1">یادداشت کارشناس مالی:</label>
                <textarea
                  rows={2}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="مثلاً: استعلام سامانه صیاد بانک مرکزی انجام شد و اهلیت سفید بود..."
                  className="input border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedCheque(null)}
                  className="btn btn-ghost text-xs px-4 py-2 rounded-lg"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="btn btn-brass text-xs px-5 py-2 font-bold rounded-lg shadow-sm"
                >
                  {busy ? "در حال ثبت تغییرات..." : "ثبت وضعیت و اعمال تغییرات"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
