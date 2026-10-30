"use client";

import { useState } from "react";
import { formatToman, toFaDigits } from "@/lib/digits";

/*
 * شارژ کیف پول — مبلغ‌های آماده + مبلغ دلخواه.
 * بعد از ثبت، به درگاه زرین‌پال می‌رود و کال‌بک خودش شارژ را اعمال می‌کند.
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
    <div className="card p-4">
      <p className="label">شارژ کیف پول</p>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setAmount(String(p))}
            className={`text-xs nums px-2 py-2 rounded-[2px] border transition-colors ${
              numeric === p
                ? "border-brass bg-brass-soft text-brass font-bold"
                : "border-rule text-ink-soft hover:border-rule-strong"
            }`}
          >
            {formatToman(p)}
          </button>
        ))}
      </div>

      <input
        dir="ltr"
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
        className="input mt-2 text-center nums"
        placeholder="مبلغ دلخواه (تومان)"
      />

      {error && <p className="mt-2 text-[11px] text-alarm">{error}</p>}

      <button
        onClick={topup}
        disabled={busy || numeric < 50_000}
        className="btn btn-primary w-full mt-2 py-2.5 text-sm"
      >
        {busy ? "در حال انتقال به درگاه…" : `شارژ ${numeric ? formatToman(numeric) : ""} تومان`}
      </button>

      <p className="mt-2 text-[10px] text-ink-soft leading-5">
        حداقل شارژ {toFaDigits(50)} هزار تومان — پرداخت امن از طریق زرین‌پال.
      </p>
    </div>
  );
}
