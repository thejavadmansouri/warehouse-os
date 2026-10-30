"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatToman } from "@/lib/digits";

/*
 * شارژ/اصلاح کیف پول توسط ادمین.
 * مبلغ مثبت = شارژ، منفی = اصلاح. هیچ تراکنشی حذف یا ویرایش نمی‌شود.
 */
export type AdminWalletCustomer = {
  id: string;
  companyName: string;
  phone: string;
  status: string;
  balance: number;
  balanceLabel: string;
};

export function WalletAdminPanel({ customers }: { customers: AdminWalletCustomer[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;

    return customers.filter((c) =>
      [c.companyName, c.phone].join(" ").toLowerCase().includes(q),
    );
  }, [customers, query]);

  const selected = customers.find((c) => c.id === selectedId) ?? null;
  const numeric = Number(amount.replace(/\D/g, "")) || 0;

  async function submit() {
    setBusy(true);
    setError(null);
    setOkMsg(null);

    try {
      const res = await fetch("/api/admin/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedId,
          amount: numeric,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "عملیات انجام نشد");
        return;
      }

      setOkMsg(`ثبت شد — موجودی جدید: ${formatToman(data.balance)} تومان`);
      setAmount("");
      setNote("");
      router.refresh();
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="order-2 lg:order-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جست‌وجوی مشتری…"
          className="input mb-3"
        />

        <div className="card overflow-hidden">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink-soft">مشتری نیست.</p>
          ) : (
            <ul>
              {filtered.map((c) => (
                <li key={c.id} className="border-b border-rule/60 last:border-0">
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-start transition-colors ${
                      selectedId === c.id ? "bg-brass-soft/40" : "hover:bg-brass-soft/20"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.companyName}</p>
                      <p className="text-[11px] text-ink-soft nums" dir="ltr">
                        {c.phone}
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className={`nums text-sm font-bold ${c.balance > 0 ? "text-ledger-green" : "text-ink-soft"}`}>
                        {c.balanceLabel}
                      </p>
                      <p className="text-[10px] text-ink-soft">
                        {c.status === "ACTIVE" ? "فعال" : c.status === "PENDING" ? "در انتظار" : c.status}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="order-1 lg:order-2">
        <div className="card p-4 lg:sticky lg:top-20">
          <h2 className="font-bold text-sm">شارژ / اصلاح</h2>

          <p className="mt-2 text-xs text-ink-soft">
            {selected ? (
              <>
                مشتری: <b className="text-ink">{selected.companyName}</b>
                <br />
                موجودی فعلی: <span className="nums">{selected.balanceLabel}</span> تومان
              </>
            ) : (
              "یک مشتری از لیست انتخاب کنید."
            )}
          </p>

          {error && (
            <p className="mt-2 rounded-[2px] border border-alarm/40 bg-alarm-soft px-2.5 py-1.5 text-[11px] text-alarm">
              {error}
            </p>
          )}
          {okMsg && (
            <p className="mt-2 rounded-[2px] border border-ledger-green/30 bg-ledger-green/5 px-2.5 py-1.5 text-[11px] text-ledger-green">
              {okMsg}
            </p>
          )}

          <label className="block mt-3">
            <span className="label block mb-0.5">مبلغ (تومان) — منفی برای کسر</span>
            <input
              dir="ltr"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              className="input text-center nums"
              placeholder="1000000"
            />
          </label>

          <label className="block mt-2">
            <span className="label block mb-0.5">یادداشت</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input text-xs"
              placeholder="تسویه نقدی / چک شماره…"
            />
          </label>

          <div className="mt-2 flex gap-1.5">
            {[500_000, 1_000_000, 5_000_000].map((p) => (
              <button
                key={p}
                onClick={() => setAmount(String(p))}
                className="text-[10px] nums border border-rule rounded-[2px] px-2 py-1 text-ink-soft hover:border-rule-strong"
              >
                {formatToman(p)}
              </button>
            ))}
          </div>

          <button
            onClick={submit}
            disabled={busy || !selectedId || numeric === 0}
            className="btn btn-primary w-full mt-3 py-2.5 text-sm"
          >
            {busy ? "در حال ثبت…" : `ثبت ${numeric ? formatToman(numeric) : ""} تومان`}
          </button>

          <p className="mt-2 text-[10px] text-ink-soft leading-5">
            تراکنش‌ها تغییرناپذیرند؛ برای برگشت، تراکنش معکوس ثبت کنید.
          </p>
        </div>
      </div>
    </div>
  );
}
