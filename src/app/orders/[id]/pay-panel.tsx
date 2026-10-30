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
    <div className="mt-4 card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold text-sm">پرداخت باقی‌مانده</h2>
        <span className="nums text-lg font-bold">{formatToman(props.remaining)} <span className="text-xs font-normal">تومان</span></span>
      </div>

      {error && (
        <p className="mt-2 rounded-[2px] border border-alarm/40 bg-alarm-soft px-3 py-2 text-xs text-alarm">
          {error}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          onClick={() => pay("gateway")}
          disabled={busy !== null}
          className="btn btn-primary py-3"
        >
          {busy === "gateway" ? "در حال انتقال…" : "پرداخت آنلاین (زرین‌پال)"}
        </button>

        <button
          onClick={() => pay("wallet")}
          disabled={busy !== null || !canWallet}
          className="btn btn-brass py-3"
          title={canWallet ? "" : "موجودی کیف پول کافی نیست"}
        >
          {busy === "wallet" ? "در حال پرداخت…" : `پرداخت از کیف پول (${formatToman(props.wallet)})`}
        </button>

        {props.wallet > 0 && !canWallet && (
          <button
            onClick={() => pay("split")}
            disabled={busy !== null}
            className="btn btn-ghost py-3 sm:col-span-2"
          >
            ترکیبی — {formatToman(walletPart)} از کیف پول + مابقی درگاه
          </button>
        )}

        <button
          onClick={() => pay("credit")}
          disabled={busy !== null || props.availableCredit < props.remaining}
          className="btn btn-ghost py-3 sm:col-span-2"
          title={props.availableCredit < props.remaining ? "سقف اعتبار کافی نیست" : ""}
        >
          درخواست خرید اعتباری (قابل استفاده: {formatToman(props.availableCredit)})
        </button>
      </div>

      <p className="mt-2 text-[11px] text-ink-soft">
        خرید اعتباری پس از تأیید ادمین نهایی می‌شود و مهلت پرداخت ۳۰ روز خواهد بود.
      </p>
    </div>
  );
}
