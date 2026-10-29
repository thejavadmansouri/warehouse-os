"use client";

import { useState } from "react";

/*
 * ساخت دستی مشتری (مثلاً مشتری تلفنی) — رمز موقتی که سرور می‌سازد نمایش داده می‌شود
 * تا ادمین حضوری به مشتری بده. مسدود/فعالِ لیست‌شدگان از API PATCH همان مسیر است.
 */
export function AdminCreateForm() {
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

      setMsg(
        `مشتری ایجاد شد${data.tempPassword ? ` — رمز موقت: ${data.tempPassword}` : ""}`,
      );
      setForm({ companyName: "", contactName: "", phone: "", username: "" });
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start rounded-lg border border-primary/30 px-4 py-2 text-sm text-primary hover:bg-primary/5 transition"
      >
        + ساخت مشتری دستی
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
      {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}
      {msg && <p className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{msg}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="نام شرکت *" value={form.companyName} onChange={(v) => setForm((f) => ({ ...f, companyName: v }))} />
        <Input label="نام نماینده *" value={form.contactName} onChange={(v) => setForm((f) => ({ ...f, contactName: v }))} />
        <Input label="موبایل *" dir="ltr" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="09..." />
        <Input label="نام کاربری (اختیاری)" dir="ltr" value={form.username} onChange={(v) => setForm((f) => ({ ...f, username: v }))} placeholder="shop1" />
      </div>
      <div className="flex gap-2">
        <button
          onClick={create}
          disabled={busy || !form.companyName || !form.contactName || !form.phone}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm text-white active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "…" : "ایجاد"}
        </button>
        <button onClick={() => { setOpen(false); setMsg(null); setError(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-muted">
          بستن
        </button>
      </div>
    </div>
  );
}

function Input(props: { label: string; value: string; onChange: (v: string) => void; dir?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{props.label}</span>
      <input
        dir={props.dir}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}
