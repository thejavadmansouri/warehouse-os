"use client";

import { useState } from "react";
import { toFaDigits } from "@/lib/digits";

/*
 * لیست درانتظارِتأیید و دکمه‌های اکشن — داده اولیه از سرور؛
 * بعد از هر اکشن رفریش می‌شود تا وضعیت جدید همیشه حقیقت باشد.
 */
export function CustomersPanel(props: {
  initial: { id: string; companyName: string; contactName: string; phone: string; createdAt: string; nationalId?: string | null }[];
}) {
  const [items, setItems] = useState(props.initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "activate" | "reject") {
    setBusyId(id);
    setError(null);

    let data: { ok?: boolean; message?: string } = {};

    try {
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "خطای غیرمنتظره");
        return;
      }

      setItems((list) => list.filter((item) => item.id !== id));
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-muted">صف خالی است — همه بررسی شده‌اند.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {items.map((c) => (
        <div key={c.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{c.companyName}</p>
              <p className="text-xs text-muted mt-0.5 truncate">
                {c.contactName} · <span dir="ltr">{toFaDigits(c.phone)}</span>
                {c.nationalId ? <> · کد ملی <span dir="ltr">{toFaDigits(c.nationalId)}</span></> : null}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => act(c.id, "activate")}
                disabled={busyId === c.id}
                className="rounded-lg bg-green-700 px-4 py-2 text-xs font-medium text-white active:scale-[0.98] disabled:opacity-50"
              >
                تأیید
              </button>
              <button
                onClick={() => act(c.id, "reject")}
                disabled={busyId === c.id}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-xs text-red-700 active:scale-[0.98] disabled:opacity-50"
              >
                رد
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
