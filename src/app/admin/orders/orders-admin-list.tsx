"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";

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
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
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
    <div className="mt-4 card overflow-hidden bg-white border border-slate-200/90 rounded-2xl shadow-xs">
      {error && (
        <p className="px-4 py-2 text-xs text-alarm bg-alarm-soft border-b border-alarm/30">{error}</p>
      )}

      {/* مودال مشاهده سریع جزئیات اقلام و نوار پیشرفت فاکتور */}
      <OrderDetailsModal
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        isAdmin={true}
        onStatusChanged={() => router.refresh()}
      />

      <ul className="divide-y divide-slate-100">
        {orders.map((o) => (
          <li key={o.id} className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setSelectedOrderId(o.id)}
                    className="nums font-mono font-black text-sm text-slate-900 hover:text-amber-600 transition-colors flex items-center gap-1.5"
                    title="مشاهده سریع اقلام فاکتور"
                  >
                    <span>{o.number}</span>
                    <span className="text-xs text-amber-500 font-bold">🔍</span>
                  </button>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      o.status === "PAID"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : o.status === "APPROVED_CREDIT"
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : o.status === "AWAITING_CREDIT_APPROVAL"
                        ? "bg-amber-50 text-amber-800 border-amber-300"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {o.statusLabel}
                  </span>

                  {o.status === "AWAITING_CREDIT_APPROVAL" && (
                    <span className="text-[10px] text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md font-bold animate-pulse">
                      نیازمند تصمیم
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-800">{o.companyName}</span>
                  <span>·</span>
                  <span dir="ltr" className="font-mono">{o.phone}</span>
                  <span>·</span>
                  <span>{o.createdAtLabel}</span>
                  <span>·</span>
                  <span className="font-bold text-slate-700 nums">{toFaDigits(o.itemCount)} قلم کالا</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <span className="nums font-black text-sm text-slate-900 whitespace-nowrap bg-slate-100 px-3 py-1 rounded-lg">
                  {formatToman(o.total)}
                </span>

                <button
                  onClick={() => setSelectedOrderId(o.id)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors shadow-2xs"
                >
                  مشاهده اقلام و وضعیت
                </button>

                <Link
                  href={`/orders/${o.id}`}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors shadow-xs"
                >
                  صفحه سند ↗
                </Link>

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
