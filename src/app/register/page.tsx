"use client";

import { useState } from "react";
import Link from "next/link";

/*
 * فرم ثبت‌نام شرکت — حساب PENDING می‌سازد.
 * پیام پایانی روشن میگوید: تا تأیید ادمین، وارد شوید ولی قیمت نمی‌بینید.
 */
export default function RegisterPage() {
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    phone: "",
    nationalId: "",
    address: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setBusy(true);
    setError(null);

    let data: { message?: string } = {};

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "خطای غیرمنتظره — دوباره امتحان کنید");
        return;
      }

      setDone(true);
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="size-14 rounded-2xl bg-green-100 text-3xl leading-[3.5rem]">✓</div>
        <h1 className="text-xl font-bold">ثبت‌نام انجام شد</h1>
        <p className="max-w-sm leading-7 text-muted">
          حساب «{form.companyName}» ساخته شد و در انتظار تأیید ادمین است.
          می‌توانید همین حالا وارد شوید؛ به‌محض تأیید، قیمت‌ها و موجودی برای
          شما فعال می‌شود.
        </p>
        <Link
          href="/login"
          className="rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground"
        >
          ورود به حساب
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="text-center">
          <h1 className="text-xl font-bold">ثبت‌نام مشتری عمده</h1>
          <p className="text-sm text-muted mt-1">
            اطلاعات شرکت را وارد کنید — تأیید حساب دستِ ادمین است
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <Field label="نام شرکت / فروشگاه *" value={form.companyName} onChange={set("companyName")} placeholder="فروشگاه پخش مرکزی کرمان" />
        <Field label="نام نماینده *" value={form.contactName} onChange={set("contactName")} placeholder="نام و نام خانوادگی" />
        <Field label="شماره موبایل *" value={form.phone} onChange={set("phone")} placeholder="۰۹۱۲ ۳۴۵ ۶۷۸۹" dir="ltr" inputMode="tel" type="tel" />
        <Field label="کد ملی نماینده (اختیاری)" value={form.nationalId} onChange={set("nationalId")} placeholder="۱۰ رقم" dir="ltr" inputMode="numeric" />
        <Field label="آدرس (اختیاری)" value={form.address} onChange={set("address")} placeholder="کرمان، …" />

        <button
          onClick={submit}
          disabled={busy || !form.companyName || !form.contactName || !form.phone}
          className="rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "در حال ثبت…" : "ثبت‌نام"}
        </button>

        <p className="text-center text-sm text-muted">
          قبلاً ثبت‌نام کرده‌اید؟{" "}
          <Link href="/login" className="text-primary font-medium underline underline-offset-4">
            ورود
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field(props: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  dir?: string;
  inputMode?: "tel" | "numeric" | "text";
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{props.label}</span>
      <input
        dir={props.dir}
        inputMode={props.inputMode}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        value={props.value}
        onChange={props.onChange}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}
