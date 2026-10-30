"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toFaDigits } from "@/lib/digits";
import { faDate } from "@/lib/date";

/*
 * صف تأیید مشتری — هر تصمیم مستقیم به API می‌رود و لیست تازه می‌شود.
 */
export function CustomersPanel(props: {
  initial: {
    id: string;
    companyName: string;
    contactName: string;
    phone: string;
    createdAt: string;
    nationalId?: string | null;
  }[];
}) {
  const router = useRouter();
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
      router.refresh();
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="card px-4 py-3 text-sm text-ink-soft">
        صف خالی است — همه بررسی شده‌اند.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="rounded-[2px] border border-alarm/40 bg-alarm-soft px-3 py-2 text-xs text-alarm">
          {error}
        </p>
      )}

      {items.map((c) => (
        <div key={c.id} className="card px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{c.companyName}</p>
              <p className="text-[11px] text-ink-soft mt-0.5 truncate">
                {c.contactName} · <span dir="ltr">{toFaDigits(c.phone)}</span>
                {c.nationalId ? (
                  <>
                    {" "}
                    · کد ملی <span dir="ltr">{toFaDigits(c.nationalId)}</span>
                  </>
                ) : null}
              </p>
              <p className="text-[10px] text-ink-soft mt-0.5">
                ثبت‌نام: {faDate(c.createdAt)}
              </p>
            </div>

            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={() => act(c.id, "activate")}
                disabled={busyId === c.id}
                className="btn btn-brass px-3 py-1.5 text-xs"
              >
                {busyId === c.id ? "…" : "تأیید"}
              </button>
              <button
                onClick={() => act(c.id, "reject")}
                disabled={busyId === c.id}
                className="btn btn-ghost px-3 py-1.5 text-xs text-alarm"
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
