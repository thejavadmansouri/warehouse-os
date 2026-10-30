"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/*
 * ورود — «دفتر»: برگه‌ی وسط کاغذ، دو تب نازک، فیلدهای بزرگ لمسی.
 * موبایل + کد یک‌بارمصرف، یا نام کاربری/رمز (ادمین و مشتری ویژه).
 */
type Mode = "phone" | "password";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh grid place-items-center text-sm text-ink-soft">در حال بارگذاری…</main>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [mode, setMode] = useState<Mode>("phone");

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);

    let data: {
      ok?: boolean;
      error?: string;
      message?: string;
      devCode?: string;
      role?: string;
      status?: string;
    } = {};

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "خطای غیرمنتظره — دوباره امتحان کنید");
        return null;
      }

      return data;
    } catch {
      setError("ارتباط با سرور برقرار نشد");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function requestOtp() {
    const data = await post("/api/auth/otp/request", { phone });

    if (data) {
      setStep("code");
      setDevCode(data.devCode ?? null);
      setInfo("کد تأیید ارسال شد — در فاز آزمایشی همان‌جا نمایش داده می‌شود.");
    }
  }

  async function verifyOtp() {
    const data = await post("/api/auth/otp/verify", { phone, code });

    if (data) router.push(next || "/dashboard");
  }

  async function loginPassword() {
    const data = await post("/api/auth/login", { username, password });

    if (data) {
      if (data.role === "admin") {
        router.push("/admin");
        return;
      }

      // مشتری تأییدشده مستقیم به کاتالوگ؛ در انتظار → وضعیت حساب
      router.push(next || (data.status === "ACTIVE" ? "/catalog" : "/dashboard"));
    }
  }

  return (
    <main className="min-h-dvh flex flex-col bg-slate-50 text-slate-900">
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

      <div className="flex-1 grid place-items-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-5 text-center sm:text-start">
            <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full inline-block">
              پورتال همکاران و خریداران عمده
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 mt-2">ورود به حساب کاربری</h1>
            <p className="text-xs text-slate-500 mt-1">
              جهت مشاهده قیمت‌های عمده و ثبت سفارش وارد شوید.
            </p>
          </div>

          <div className="card p-5 bg-white border border-slate-200 rounded-2xl shadow-xs">
            <div className="grid grid-cols-2 border border-slate-200 rounded-xl overflow-hidden text-xs sm:text-sm font-bold p-0.5 bg-slate-100">
              <button
                type="button"
                onClick={() => setMode("phone")}
                className={`py-2 rounded-lg transition-all ${
                  mode === "phone"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                پیامک یک‌بارمصرف
              </button>
              <button
                type="button"
                onClick={() => setMode("password")}
                className={`py-2 rounded-lg transition-all ${
                  mode === "password"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                نام کاربری / رمز
              </button>
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
                {error}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">
              {mode === "phone" ? (
                step === "phone" ? (
                  <>
                    <label className="block">
                      <span className="label block mb-1">شماره تلفن همراه</span>
                      <input
                        dir="ltr"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="0912 345 6789"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="input text-center text-lg tracking-widest nums h-12 border-slate-300 rounded-xl"
                      />
                    </label>
                    <button
                      onClick={requestOtp}
                      disabled={busy || phone.length < 10}
                      className="w-full h-12 rounded-xl text-sm font-bold bg-slate-900 hover:bg-slate-800 active:scale-98 text-white shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {busy ? "در حال ارسال…" : "دریافت کد تأیید"}
                    </button>
                  </>
                ) : (
                  <>
                    {info && <p className="text-[11px] text-slate-500 leading-relaxed">{info}</p>}
                    {devCode && (
                      <p
                        dir="ltr"
                        className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-center text-xl font-bold tracking-[0.3em] text-blue-700 nums"
                      >
                        {devCode}
                      </p>
                    )}
                    <label className="block">
                      <span className="label block mb-1">کد ۶ رقمی</span>
                      <input
                        dir="ltr"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="- - - - - -"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        className="input text-center text-2xl tracking-[0.4em] nums h-12 border-slate-300 rounded-xl"
                      />
                    </label>
                    <button
                      onClick={verifyOtp}
                      disabled={busy || code.length !== 6}
                      className="w-full h-12 rounded-xl text-sm font-bold bg-slate-900 hover:bg-slate-800 active:scale-98 text-white shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {busy ? "در حال بررسی…" : "ورود"}
                    </button>
                    <button
                      onClick={() => {
                        setStep("phone");
                        setDevCode(null);
                        setInfo(null);
                      }}
                      className="text-xs text-slate-500 underline underline-offset-4 self-center"
                    >
                      تغییر شماره / ارسال دوباره
                    </button>
                  </>
                )
              ) : (
                <>
                  <label className="block">
                    <span className="label block mb-1">نام کاربری</span>
                    <input
                      dir="ltr"
                      autoComplete="username"
                      placeholder="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="input h-11 border-slate-300 rounded-xl"
                    />
                  </label>
                  <label className="block">
                    <span className="label block mb-1">رمز عبور</span>
                    <input
                      dir="ltr"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input h-11 border-slate-300 rounded-xl"
                    />
                  </label>
                  <button
                    onClick={loginPassword}
                    disabled={busy || !username || !password}
                    className="w-full h-12 rounded-xl text-sm font-bold bg-slate-900 hover:bg-slate-800 active:scale-98 text-white shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 mt-1"
                  >
                    {busy ? "در حال بررسی…" : "ورود"}
                  </button>
                  <p className="text-[10px] text-slate-400 text-center">
                    ادمین و مشتریان با نام کاربری وارد می‌شوند.
                  </p>
                </>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            ثبت‌نام شرکت جدید؟{" "}
            <Link href="/register" className="text-blue-600 font-bold hover:underline">
              ثبت‌نام همکار عمده
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
