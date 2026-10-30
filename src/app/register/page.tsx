"use client";

import { useState } from "react";
import Link from "next/link";

/*
 * ثبت‌نام شرکت / فروشگاه همکار — ساخت حساب B2B در انتظار تأیید کارشناسان
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
      <main className="min-h-dvh flex flex-col bg-slate-50 text-slate-900">
        <TopBar />
        <div className="flex-1 grid place-items-center px-4 py-10">
          <div className="card w-full max-w-sm p-6 sm:p-7 text-center bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
            <div className="mx-auto size-14 grid place-items-center rounded-full bg-emerald-50 text-emerald-600 text-2xl border border-emerald-200">
              ✓
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900">درخواست ثبت‌نام ارسال شد</h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              حساب «<b>{form.companyName}</b>» با موفقیت ثبت شد و در صف تأیید کارشناسان کاردو قرار گرفت.
              می‌توانید وارد حساب شوید و پیشرفت را مشاهده کنید.
            </p>
            <div className="py-2">
              <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full inline-block">
                در انتظار تأیید احراز هویت
              </span>
            </div>
            <Link
              href="/login"
              className="w-full h-12 rounded-xl text-sm font-black btn-blue active:scale-98 flex items-center justify-center transition-all"
            >
              ورود به حساب کاربری
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col bg-slate-50 text-slate-900">
      <TopBar />

      <div className="flex-1 grid place-items-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-5 text-center sm:text-start">
            <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full inline-block">
              افتتاح حساب همکار عمده
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 mt-2">ثبت‌نام همکار و خریدار</h1>
            <p className="text-xs text-slate-500 mt-1">
              اطلاعات فروشگاه یا شرکت خود را جهت تخصیص قیمت همکاری وارد نمایید.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && form.companyName && form.contactName && form.phone) {
                submit();
              }
            }}
            className="card p-5 sm:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col gap-3.5"
          >
            {error && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 font-medium">
                {error}
              </p>
            )}

            <Field label="نام شرکت / فروشگاه لوازم یدکی *" value={form.companyName} onChange={set("companyName")} placeholder="مثلاً: یدک‌گستر دیار کریمان" />
            <Field label="نام و نام خانوادگی مسئول خرید *" value={form.contactName} onChange={set("contactName")} placeholder="نام نماینده" />
            <Field label="شماره تلفن همراه *" value={form.phone} onChange={set("phone")} placeholder="0912 345 6789" dir="ltr" inputMode="tel" type="tel" />
            <Field label="کد ملی نماینده (اختیاری)" value={form.nationalId} onChange={set("nationalId")} placeholder="۱۰ رقم کد ملی" dir="ltr" inputMode="numeric" />
            <Field label="شهر و نشانی فروشگاه (اختیاری)" value={form.address} onChange={set("address")} placeholder="کرمان، خیابان شریعتی، …" />

            <button
              type="submit"
              disabled={busy || !form.companyName || !form.contactName || !form.phone}
              className="w-full h-12 rounded-xl text-sm font-black btn-blue active:scale-98 transition-all flex items-center justify-center gap-2 mt-1"
            >
              {busy ? (
                "در حال ثبت اطلاعات…"
              ) : (
                <>
                  <span>ثبت‌نام و افتتاح حساب</span>
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded-md bg-white/20">اینتر ↵</span>
                </>
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            قبلاً حساب ساخته‌اید؟{" "}
            <Link href="/login" className="text-blue-600 font-bold hover:underline">
              ورود به حساب
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function TopBar() {
  return (
    <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto w-full max-w-lg px-4 h-14 sm:h-15 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="size-8 grid place-items-center bg-slate-900 text-white text-sm font-bold rounded-lg shadow-sm">
            ک
          </span>
          <span className="font-extrabold tracking-tight text-base text-slate-900">
            کاردو <span className="text-blue-600 text-[10px] font-bold bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200/60 align-top">B2B</span>
          </span>
        </Link>
        <Link href="/" className="text-xs text-slate-500 hover:text-blue-600 font-medium">
          صفحه اصلی ←
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
      <span className="text-xs font-semibold text-slate-700 block mb-1">{props.label}</span>
      <input
        dir={props.dir}
        inputMode={props.inputMode}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        value={props.value}
        onChange={props.onChange}
        className="input h-11 border-slate-300 rounded-xl text-xs sm:text-sm"
      />
    </label>
  );
}
