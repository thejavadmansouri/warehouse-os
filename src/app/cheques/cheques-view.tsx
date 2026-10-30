"use client";

import { useState } from "react";
import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";
import { faDate } from "@/lib/date";
import { CHEQUE_STATUS, IRANIAN_BANKS, isValidSayadId, type ChequeStatusKey } from "@/lib/cheques";

export type ChequeItem = {
  id: string;
  sayadId: string;
  chequeNumber: string;
  bankName: string;
  branchName: string | null;
  drawerName: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  status: ChequeStatusKey;
  adminNote: string | null;
  sayadVerified: boolean;
  createdAt: string;
};

export type ChequeSummaryData = {
  activeRegisteredAmount: number;
  pendingAmount: number;
  clearedAmount: number;
  hasBounced: boolean;
};

export function ChequesView(props: {
  initialCheques: ChequeItem[];
  initialSummary: ChequeSummaryData;
}) {
  const [cheques, setCheques] = useState<ChequeItem[]>(props.initialCheques);
  const [summary, setSummary] = useState<ChequeSummaryData>(props.initialSummary);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // فرم ثبت چک
  const [sayadId, setSayadId] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState(IRANIAN_BANKS[0]);
  const [drawerName, setDrawerName] = useState("");
  const [drawerNationalId, setDrawerNationalId] = useState("");
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const numericAmount = Number(amount.replace(/\D/g, "")) || 0;

  async function submitCheque(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidSayadId(sayadId)) {
      setError("شناسه صیاد باید دقیقاً ۱۶ رقم عددی باشد.");
      return;
    }
    if (numericAmount <= 0) {
      setError("مبلغ چک باید مشخص و معتبر باشد.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/cheques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sayadId: sayadId.replace(/\D/g, ""),
          chequeNumber: chequeNumber.trim(),
          bankName,
          drawerName: drawerName.trim(),
          drawerNationalId: drawerNationalId.trim() || undefined,
          amount: numericAmount,
          issueDate: issueDate || new Date().toISOString().slice(0, 10),
          dueDate: dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "ثبت چک با خطا مواجه شد.");
        return;
      }

      setCheques((prev) => [data.cheque, ...prev]);
      setShowModal(false);
      setSayadId("");
      setChequeNumber("");
      setDrawerName("");
      setAmount("");
    } catch {
      setError("خطا در برقراری ارتباط با سرور");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* هدر و دکمه ثبت چک */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/wallet" className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium">
              <span>←</span>
              <span>کیف پول و مالی</span>
            </Link>
          </div>
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
            مدیریت چک‌های صیادی و ضمانت خرید اعتباری
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ثبت چک‌های بنفش صیادی جهت افزایش خط اعتبار ۳۰ تا ۶۰ روزه خرید عمده قطعات در استان کرمان
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="btn btn-brass text-xs px-4 py-2.5 font-bold rounded-lg shadow-sm flex items-center gap-1.5"
        >
          <span className="text-base leading-none font-bold">+</span>
          <span>ثبت چک صیادی جدید</span>
        </button>
      </div>

      {/* کارت‌های خلاصه وضعیت اعتباری بر پایه چک */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
        <div className="card p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1">
          <span className="text-slate-500 font-medium block">اعتبار فعال ناشی از چک‌های صیاد</span>
          <div className="nums text-lg sm:text-xl font-extrabold text-emerald-600 flex items-baseline gap-1">
            <span>{formatToman(summary.activeRegisteredAmount)}</span>
            <span className="text-xs font-normal text-slate-400">تومان</span>
          </div>
          <p className="text-[10px] text-slate-400">تأییدشده در سامانه صیاد بانک مرکزی</p>
        </div>

        <div className="card p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1">
          <span className="text-slate-500 font-medium block">چک‌های در نوبت بررسی مالی</span>
          <div className="nums text-lg sm:text-xl font-extrabold text-amber-600 flex items-baseline gap-1">
            <span>{formatToman(summary.pendingAmount)}</span>
            <span className="text-xs font-normal text-slate-400">تومان</span>
          </div>
          <p className="text-[10px] text-slate-400">در صف استعلام کارشناسان کاردو</p>
        </div>

        <div className="card p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1">
          <span className="text-slate-500 font-medium block">مجموع چک‌های وصول و تسویه‌شده</span>
          <div className="nums text-lg sm:text-xl font-extrabold text-slate-800 flex items-baseline gap-1">
            <span>{formatToman(summary.clearedAmount)}</span>
            <span className="text-xs font-normal text-slate-400">تومان</span>
          </div>
          <p className="text-[10px] text-slate-400">اسناد مالی تسویه‌شده کامل</p>
        </div>
      </div>

      {/* مدال ثبت چک جدید */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="card w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto p-4 sm:p-6 bg-white shadow-2xl border border-slate-200 rounded-t-2xl sm:rounded-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 sticky top-0 bg-white/95 backdrop-blur-md z-10">
              <div>
                <h2 className="font-extrabold text-base text-slate-900">ثبت مشخصات چک صیادی بنفش</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  اطلاعات مندرج روی چک را دقیق وارد نمایید. پس از استعلام، خط اعتباری شما شارژ می‌شود.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="size-8 grid place-items-center text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitCheque} className="mt-4 space-y-3.5 text-xs">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700">
                  {error}
                </div>
              )}

              {/* شناسه ۱۶ رقمی صیاد */}
              <div>
                <label className="label block mb-1">شناسه یکتای ۱۶ رقمی صیاد *</label>
                <input
                  required
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={16}
                  placeholder="مثلاً: 1234567890123456"
                  value={sayadId}
                  onChange={(e) => setSayadId(e.target.value.replace(/\D/g, ""))}
                  className="input h-11 text-center font-mono font-bold text-base tracking-widest border-slate-300 rounded-lg"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  کد ۱۶ رقمی بالای برگه چک صیادی بنفش
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="label block mb-1">شماره سریال چک *</label>
                  <input
                    required
                    dir="ltr"
                    placeholder="مثلاً: 456789/01"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    className="input h-10 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="label block mb-1">نام بانک صادرکننده *</label>
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value as any)}
                    className="input h-10 border-slate-300 rounded-lg bg-white"
                  >
                    {IRANIAN_BANKS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label block mb-1">مبلغ چک (تومان) *</label>
                <input
                  required
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="مبلغ به تومان"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="input h-11 text-center font-bold text-base nums border-slate-300 rounded-lg"
                />
                {numericAmount > 0 && (
                  <span className="text-[11px] text-blue-600 font-bold mt-1 block nums">
                    معادل: {formatToman(numericAmount)} تومان
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="label block mb-1">نام صاحب حساب *</label>
                  <input
                    required
                    placeholder="نام کامل صادرکننده"
                    value={drawerName}
                    onChange={(e) => setDrawerName(e.target.value)}
                    className="input h-10 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="label block mb-1">کد ملی صادرکننده (اختیاری)</label>
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="۱۰ رقم کد ملی"
                    value={drawerNationalId}
                    onChange={(e) => setDrawerNationalId(e.target.value)}
                    className="input h-10 border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="label block mb-1">تاریخ صدور چک</label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="input h-10 border-slate-300 rounded-lg text-center"
                  />
                </div>

                <div>
                  <label className="label block mb-1">تاریخ سررسید چک *</label>
                  <input
                    required
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="input h-10 border-slate-300 rounded-lg text-center font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-ghost text-xs px-4 py-2.5 rounded-lg"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="btn btn-brass text-xs px-5 py-2.5 font-bold rounded-lg shadow-sm"
                >
                  {busy ? "در حال ثبت..." : "ثبت و ارسال به واحد مالی"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* لیست چک‌های ثبت‌شده */}
      <div>
        <h2 className="font-extrabold text-sm text-slate-900 mb-3">فهرست چک‌های صیادی تسلیم‌شده</h2>

        {cheques.length === 0 ? (
          <div className="card p-12 text-center text-slate-500 bg-white border border-slate-200 rounded-xl space-y-3">
            <div className="size-12 rounded-full bg-slate-100 text-slate-400 grid place-items-center mx-auto text-xl">
              💳
            </div>
            <p className="font-bold text-slate-800 text-base">هنوز چکی ثبت نکرده‌اید.</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              با ثبت چک صیادی بنفش، می‌توانید اعتبار خرید ۳۰ تا ۶۰ روزه قطعات را از انبار مرکزی کاردو دریافت کنید.
            </p>
          </div>
        ) : (
          <>
            {/* ۱. نمای موبایل (Mobile Cards) */}
            <div className="md:hidden space-y-3">
              {cheques.map((c) => {
                const st = CHEQUE_STATUS[c.status] || CHEQUE_STATUS.RECEIVED;
                return (
                  <div key={c.id} className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        {c.bankName}
                      </span>
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

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">شناسه صیاد:</span>
                        <span className="nums font-mono font-bold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {c.sayadId}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 mt-1">صاحب حساب: <b>{c.drawerName}</b></p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">سررسید: <b>{faDate(c.dueDate)}</b></span>
                      <div className="nums font-extrabold text-sm text-slate-900">
                        {formatToman(c.amount)} <span className="text-xs font-normal text-slate-500">تومان</span>
                      </div>
                    </div>

                    {c.adminNote && (
                      <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 p-2 rounded-lg">
                        توضیحات مالی: {c.adminNote}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ۲. نمای دسکتاپ (Desktop Table) */}
            <div className="hidden md:block card overflow-hidden border-slate-200 shadow-2xs rounded-xl bg-white text-xs">
              <table className="w-full text-start">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-3 text-start">شناسه صیاد</th>
                    <th className="py-3 px-3 text-start">بانک و سریال</th>
                    <th className="py-3 px-3 text-start">صاحب حساب</th>
                    <th className="py-3 px-3 text-center">سررسید</th>
                    <th className="py-3 px-3 text-left">مبلغ (تومان)</th>
                    <th className="py-3 px-3 text-center">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cheques.map((c) => {
                    const st = CHEQUE_STATUS[c.status] || CHEQUE_STATUS.RECEIVED;
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 nums font-mono font-bold text-blue-700">{c.sayadId}</td>
                        <td className="py-3 px-3">
                          <p className="font-bold text-slate-800">{c.bankName}</p>
                          <p className="text-[10px] text-slate-400 font-mono nums">{c.chequeNumber}</p>
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-700">{c.drawerName}</td>
                        <td className="py-3 px-3 text-center nums text-slate-600 font-bold">{faDate(c.dueDate)}</td>
                        <td className="py-3 px-3 text-left nums font-extrabold text-slate-900">{formatToman(c.amount)} ت</td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              st.tone === "green"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : st.tone === "red"
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
