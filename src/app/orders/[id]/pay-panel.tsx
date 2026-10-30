"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatToman } from "@/lib/digits";

/*
 * پنل پرداخت سند — کیف پول / درگاه / ترکیبی / اعتباری.
 * دکمه‌ها همان‌جا نتیجه را نشان می‌دهند؛ درگاه یعنی رفتن به زرین‌پال.
 */
export function PayPanel(props: {
  orderId: string;
  remaining: number;
  wallet: number;
  availableCredit: number;
  expiresAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canWallet = props.wallet >= props.remaining;
  const walletPart = Math.min(props.wallet, props.remaining);

  async function pay(method: "wallet" | "gateway" | "split" | "credit") {
    setBusy(method);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${props.orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          walletAmount: method === "split" ? props.wallet : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "پرداخت انجام نشد");
        return;
      }

      if (data.redirect) {
        window.location.href = data.redirect as string;
        return;
      }

      router.refresh();
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 card p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-2xs">
      <div className="flex items-baseline justify-between pb-3 border-b border-slate-100">
        <h2 className="font-extrabold text-sm sm:text-base text-slate-900">تسویه و پرداخت باقی‌مانده سند</h2>
        <div className="nums text-lg font-extrabold text-blue-600 flex items-baseline gap-1">
          <span>{formatToman(props.remaining)}</span>
          <span className="text-xs font-normal text-slate-500">تومان</span>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <button
          onClick={() => pay("gateway")}
          disabled={busy !== null}
          className="h-12 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 active:scale-98 shadow-sm transition-all flex items-center justify-center gap-2"
        >
          {busy === "gateway" ? "در حال اتصال به شاپرک..." : "پرداخت آنلاین شتاب (زرین‌پال)"}
        </button>

        <button
          onClick={() => pay("wallet")}
          disabled={busy !== null || !canWallet}
          className="h-12 rounded-xl text-xs sm:text-sm font-bold border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-98 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          title={canWallet ? "" : "موجودی کیف پول کافی نیست"}
        >
          {busy === "wallet" ? "در حال کسر از کیف پول..." : `کسر از کیف پول (${formatToman(props.wallet)} ت)`}
        </button>

        {props.wallet > 0 && !canWallet && (
          <button
            onClick={() => pay("split")}
            disabled={busy !== null}
            className="h-12 rounded-xl text-xs sm:text-sm font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:scale-98 sm:col-span-2 transition-all flex items-center justify-center gap-1.5"
          >
            پرداخت ترکیبی: {formatToman(walletPart)} تومان از کیف پول + مابقی درگاه
          </button>
        )}

        <button
          onClick={() => pay("credit")}
          disabled={busy !== null || props.availableCredit < props.remaining}
          className="h-12 rounded-xl text-xs sm:text-sm font-bold border border-amber-300 bg-amber-50/70 text-amber-800 hover:bg-amber-100 active:scale-98 sm:col-span-2 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          title={props.availableCredit < props.remaining ? "سقف اعتبار کافی نیست" : ""}
        >
          درخواست تسویه اعتباری ۳۰ روزه (اعتبار در دسترس: {formatToman(props.availableCredit)} ت)
        </button>
      </div>

      <p className="mt-3 text-[11px] text-slate-500 text-center">
        تسویه اعتباری مخصوص همکاران دارای خط اعتباری فعال بوده و سررسید آن ۳۰ روز پس از صدور بارنامه است.
      </p>
    </div>
  );
}
