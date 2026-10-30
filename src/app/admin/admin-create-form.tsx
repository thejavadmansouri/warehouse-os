"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
 * ساخت دستی مشتری (مشتری تلفنی) — رمز موقت یک‌بار نمایش داده می‌شود.
 */
export function AdminCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ companyName: "", contactName: "", phone: "", username: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);

    let data: { ok?: boolean; tempPassword?: string; message?: string } = {};

    try {
      const res = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "خطای غیرمنتظره");
        return;
      }

      setMsg(`مشتری ایجاد شد${data.tempPassword ? ` — رمز موقت: ${data.tempPassword}` : ""}`);
      setForm({ companyName: "", contactName: "", phone: "", username: "" });
      router.refresh();
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-ghost px-3 py-1.5 text-xs">
        + ساخت مشتری دستی
      </button>
    );
  }

  return (
    <div className="w-full card p-4 flex flex-col gap-3">
      {error && (
        <p className="rounded-[2px] border border-alarm/40 bg-alarm-soft px-3 py-2 text-xs text-alarm">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded-[2px] border border-ledger-green/30 bg-ledger-green/5 px-3 py-2 text-xs text-ledger-green nums">
          {msg}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input label="نام شرکت *" value={form.companyName} onChange={(v) => setForm((f) => ({ ...f, companyName: v }))} />
        <Input label="نام نماینده *" value={form.contactName} onChange={(v) => setForm((f) => ({ ...f, contactName: v }))} />
        <Input label="موبایل *" dir="ltr" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="09…" />
        <Input label="نام کاربری (اختیاری)" dir="ltr" value={form.username} onChange={(v) => setForm((f) => ({ ...f, username: v }))} placeholder="shop1" />
      </div>

      <div className="flex gap-2">
        <button
          onClick={create}
          disabled={busy || !form.companyName || !form.contactName || !form.phone}
          className="btn btn-primary px-4 py-2 text-xs"
        >
          {busy ? "…" : "ایجاد"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setMsg(null);
            setError(null);
          }}
          className="btn btn-ghost px-4 py-2 text-xs"
        >
          بستن
        </button>
      </div>
    </div>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dir?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label block mb-0.5">{props.label}</span>
      <input
        dir={props.dir}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="input py-1.5 text-xs"
      />
    </label>
  );
}
