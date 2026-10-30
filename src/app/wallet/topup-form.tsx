"use client";

import { useState } from "react";
import { formatToman, toFaDigits } from "@/lib/digits";

/*
 * شارژ کیف پول — مبالغ آماده با دکمه‌های لمسی استاندارد + فیلد مبلغ دلخواه.
 */
const PRESETS = [500_000, 1_000_000, 2_000_000, 5_000_000];

export function TopupForm() {
  const [amount, setAmount] = useState<string>("1000000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numeric = Number(amount.replace(/\D/g, "")) || 0;

  async function topup() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "WALLET_TOPUP", amount: numeric }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "شروع پرداخت ناموفق بود");
        return;
      }

      window.location.href = data.redirect as string;
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-2xs">
      <span className="text-xs font-bold text-slate-800 block mb-2">شارژ آنلاین کیف پول</span>

      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setAmount(String(p))}
            className={`h-10 text-xs nums px-2 rounded-lg border font-bold transition-all ${
              numeric === p
                ? "border-blue-400 bg-blue-50 text-blue-700 shadow-2xs"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            {formatToman(p)} ت
          </button>
        ))}
      </div>

      <div className="mt-3">
        <label className="text-[11px] text-slate-500 block mb-1">یا مبلغ دلخواه (تومان):</label>
        <input
          dir="ltr"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          className="input h-11 text-center font-bold text-base nums border-slate-300 rounded-lg"
          placeholder="مبلغ دلخواه (تومان)"
        />
      </div>

      {error && <p className="mt-2 text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">{error}</p>}

      <button
        onClick={topup}
        disabled={busy || numeric < 50_000}
        className="w-full h-11 mt-3 rounded-lg text-xs sm:text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 active:scale-98 shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {busy ? "در حال انتقال به درگاه…" : `شارژ ${numeric ? formatToman(numeric) : ""} تومان`}
      </button>

      <p className="mt-2.5 text-[11px] text-slate-400 text-center leading-relaxed">
        حداقل مبلغ شارژ {toFaDigits(50)} هزار تومان — تسویه آنی از طریق شبکه شاپرک و درگاه زرین‌پال.
      </p>
    </div>
  );
}
