"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatToman } from "@/lib/digits";

export type AdminOrder = {
  id: string;
  number: string;
  status: string;
  statusLabel: string;
  total: number;
  creditAmount: number;
  createdAtLabel: string;
  itemCount: number;
  companyName: string;
  phone: string;
};

export function OrdersAdminList({ orders }: { orders: AdminOrder[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, action: "approve_credit" | "reject") {
    setBusyId(id);
    setError(null);

    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "عملیات انجام نشد");
        return;
      }

      router.refresh();
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusyId(null);
    }
  }

  if (orders.length === 0) {
    return <p className="mt-4 card p-8 text-center text-sm text-ink-soft">سندی ثبت نشده است.</p>;
  }

  return (
    <div className="mt-4 card overflow-hidden">
      {error && (
        <p className="px-4 py-2 text-xs text-alarm bg-alarm-soft border-b border-alarm/30">{error}</p>
      )}
      <ul>
        {orders.map((o) => (
          <li key={o.id} className="border-b border-rule/60 last:border-0 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="nums font-bold text-sm">{o.number}</span>
                  <span className="text-[10px] border border-rule rounded-[2px] px-1.5 py-0.5 text-ink-soft">
                    {o.statusLabel}
                  </span>
                  {o.status === "AWAITING_CREDIT_APPROVAL" && (
                    <span className="text-[10px] text-brass font-bold">نیازمند تصمیم</span>
                  )}
                </div>
                <p className="text-[11px] text-ink-soft mt-1">
                  {o.companyName} · <span dir="ltr">{o.phone}</span> · {o.createdAtLabel} ·{" "}
                  {o.itemCount} قلم
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="nums font-bold text-sm whitespace-nowrap">{formatToman(o.total)}</span>

                {o.status === "AWAITING_CREDIT_APPROVAL" && (
                  <>
                    <button
                      onClick={() => decide(o.id, "approve_credit")}
                      disabled={busyId === o.id}
                      className="btn btn-brass px-3 py-1.5 text-xs"
                    >
                      تأیید اعتباری
                    </button>
                    <button
                      onClick={() => decide(o.id, "reject")}
                      disabled={busyId === o.id}
                      className="btn btn-ghost px-3 py-1.5 text-xs text-alarm"
                    >
                      رد
                    </button>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
