"use client";

import { useState } from "react";
import Link from "next/link";

/*
 * ثبت‌نام شرکت — حساب PENDING می‌سازد؛ پیام پایانی شفاف می‌گوید
 * تا تأیید ادمین، قیمت‌ها بسته است.
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
      <main className="min-h-dvh flex flex-col">
        <TopBar />
        <div className="flex-1 grid place-items-center px-4 py-10">
          <div className="card w-full max-w-sm p-6 text-center">
            <div className="mx-auto size-12 grid place-items-center rounded-full bg-ledger-green/10 text-ledger-green text-xl">
              ✓
            </div>
            <h1 className="mt-3 text-lg font-bold">ثبت‌نام انجام شد</h1>
            <p className="mt-2 text-xs text-ink-soft leading-6">
              حساب «{form.companyName}» ساخته شد و در انتظار تأیید ادمین است.
              می‌توانید همین حالا وارد شوید؛ به‌محض تأیید، قیمت‌ها و موجودی فعال می‌شود.
            </p>
            <span className="stamp text-brass mt-4">در انتظار تأیید</span>
            <Link href="/login" className="btn btn-primary w-full mt-5 py-2.5">
              ورود به حساب
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col">
      <TopBar />

      <div className="flex-1 grid place-items-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-5">
            <p className="label">افتتاح حساب عمده</p>
            <h1 className="text-xl font-bold tracking-tight mt-1">ثبت‌نام مشتری</h1>
            <p className="text-xs text-ink-soft mt-1">
              اطلاعات شرکت را وارد کنید — تأیید حساب دستِ ادمین است.
            </p>
          </div>

          <div className="card p-5 flex flex-col gap-3">
            {error && (
              <p className="rounded-[2px] border border-alarm/40 bg-alarm-soft px-3 py-2 text-xs text-alarm">
                {error}
              </p>
            )}

            <Field label="نام شرکت / فروشگاه *" value={form.companyName} onChange={set("companyName")} placeholder="فروشگاه پخش مرکزی کرمان" />
            <Field label="نام نماینده *" value={form.contactName} onChange={set("contactName")} placeholder="نام و نام خانوادگی" />
            <Field label="شماره موبایل *" value={form.phone} onChange={set("phone")} placeholder="0912 345 6789" dir="ltr" inputMode="tel" type="tel" />
            <Field label="کد ملی نماینده (اختیاری)" value={form.nationalId} onChange={set("nationalId")} placeholder="۱۰ رقم" dir="ltr" inputMode="numeric" />
            <Field label="آدرس (اختیاری)" value={form.address} onChange={set("address")} placeholder="کرمان، …" />

            <button
              onClick={submit}
              disabled={busy || !form.companyName || !form.contactName || !form.phone}
              className="btn btn-primary w-full py-3 mt-1"
            >
              {busy ? "در حال ثبت…" : "ثبت‌نام"}
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-ink-soft">
            قبلاً ثبت‌نام کرده‌اید؟{" "}
            <Link href="/login" className="text-brass font-bold underline underline-offset-4">
              ورود
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function TopBar() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto w-full max-w-lg px-4 h-14 flex items-center">
        <Link href="/" className="flex items-center gap-2">
          <span className="size-7 grid place-items-center bg-ink text-paper text-sm font-bold rounded-[2px]">
            ک
          </span>
          <span className="font-bold tracking-tight">
            کاردو <span className="text-brass text-xs align-top">B2B</span>
          </span>
        </Link>
      </div>
    </header>
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
      <span className="label block mb-1">{props.label}</span>
      <input
        dir={props.dir}
        inputMode={props.inputMode}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        value={props.value}
        onChange={props.onChange}
        className="input py-2.5"
      />
    </label>
  );
}
