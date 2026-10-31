"use client";

import { Suspense, useState, useRef, useEffect } from "react";
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

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "phone") {
      if (step === "code") {
        codeInputRef.current?.focus();
      } else {
        phoneInputRef.current?.focus();
      }
    } else {
      if (!username) {
        usernameInputRef.current?.focus();
      } else if (!password) {
        passwordInputRef.current?.focus();
      }
    }
  }, [mode, step]);

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

    if (data) router.push(next || "/catalog");
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

  function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!busy && phone.trim().length >= 10) {
      requestOtp();
    }
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!busy && code.trim().length === 6) {
      verifyOtp();
    }
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) {
      usernameInputRef.current?.focus();
      return;
    }
    if (!password) {
      passwordInputRef.current?.focus();
      return;
    }
    if (!busy) {
      loginPassword();
    }
  }

  return (
    <main className="min-h-dvh flex flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto w-full max-w-lg px-4 h-14 sm:h-15 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="size-8 grid place-items-center bg-blue-600 text-white text-sm font-bold rounded-lg shadow-sm">
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
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full inline-block">
              پورتال همکاران و خریداران عمده
            </span>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 mt-2">ورود به حساب کاربری</h1>
            <p className="text-xs text-slate-500 mt-1">
              جهت مشاهده قیمت‌های عمده و ثبت سفارش وارد شوید.
            </p>
          </div>

          <div className="card p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
            <div className="grid grid-cols-2 border border-slate-200 rounded-xl overflow-hidden text-xs sm:text-sm font-bold p-1 bg-slate-100/80 mb-4">
              <button
                type="button"
                onClick={() => setMode("phone")}
                className={`py-2 rounded-lg transition-all font-bold ${
                  mode === "phone"
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                پیامک یک‌بارمصرف
              </button>
              <button
                type="button"
                onClick={() => setMode("password")}
                className={`py-2 rounded-lg transition-all font-bold ${
                  mode === "password"
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                نام کاربری / رمز
              </button>
            </div>

            {error && (
              <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 font-medium">
                {error}
              </p>
            )}

            <div>
              {mode === "phone" ? (
                step === "phone" ? (
                  <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-3.5">
                    <label className="block">
                      <span className="label block mb-1 font-bold text-slate-700">شماره تلفن همراه</span>
                      <input
                        ref={phoneInputRef}
                        dir="ltr"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="0912 345 6789"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="input text-center text-lg tracking-widest nums h-12 border-slate-300 rounded-xl font-bold focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={busy || phone.trim().length < 10}
                      className="w-full h-12 rounded-xl text-sm font-black btn-blue active:scale-98 transition-all flex items-center justify-center gap-2"
                    >
                      {busy ? (
                        "در حال ارسال…"
                      ) : (
                        <>
                          <span>دریافت کد تأیید</span>
                          <span className="text-[11px] font-normal px-2 py-0.5 rounded-md bg-white/20">اینتر ↵</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleCodeSubmit} className="flex flex-col gap-3.5">
                    {info && <p className="text-[11px] text-slate-500 leading-relaxed font-medium">{info}</p>}
                    {devCode && (
                      <button
                        type="button"
                        onClick={() => setCode(devCode)}
                        title="کلیک برای درج خودکار کد تست"
                        className="w-full text-center rounded-xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100/80 p-2.5 transition-colors cursor-pointer group"
                      >
                        <span className="block text-[10px] text-blue-600 font-bold mb-0.5">کد آزمایشی (کلیک جهت درج خودکار):</span>
                        <span
                          dir="ltr"
                          className="text-2xl font-black tracking-[0.3em] text-blue-700 nums group-hover:scale-105 inline-block transition-transform"
                        >
                          {devCode}
                        </span>
                      </button>
                    )}
                    <label className="block">
                      <span className="label block mb-1 font-bold text-slate-700">کد ۶ رقمی تأیید</span>
                      <input
                        ref={codeInputRef}
                        dir="ltr"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="- - - - - -"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        className="input text-center text-2xl tracking-[0.4em] nums h-12 border-slate-300 rounded-xl font-bold focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={busy || code.trim().length !== 6}
                      className="w-full h-12 rounded-xl text-sm font-black btn-emerald active:scale-98 transition-all flex items-center justify-center gap-2"
                    >
                      {busy ? (
                        "در حال بررسی…"
                      ) : (
                        <>
                          <span>ورود به سامانه</span>
                          <span className="text-[11px] font-normal px-2 py-0.5 rounded-md bg-white/20">اینتر ↵</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStep("phone");
                        setDevCode(null);
                        setInfo(null);
                      }}
                      className="text-xs text-slate-500 hover:text-blue-600 underline underline-offset-4 self-center py-1 font-medium transition-colors"
                    >
                      تغییر شماره / ارسال دوباره
                    </button>
                  </form>
                )
              ) : (
                <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3.5">
                  <label className="block">
                    <span className="label block mb-1 font-bold text-slate-700">نام کاربری</span>
                    <input
                      ref={usernameInputRef}
                      dir="ltr"
                      autoComplete="username"
                      placeholder="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !password) {
                          e.preventDefault();
                          passwordInputRef.current?.focus();
                        }
                      }}
                      className="input h-11 border-slate-300 rounded-xl font-medium focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block">
                    <span className="label block mb-1 font-bold text-slate-700">رمز عبور</span>
                    <input
                      ref={passwordInputRef}
                      dir="ltr"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input h-11 border-slate-300 rounded-xl font-medium focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy || !username.trim() || !password}
                    className="w-full h-12 rounded-xl text-sm font-black btn-blue active:scale-98 transition-all flex items-center justify-center gap-2 mt-1"
                  >
                    {busy ? (
                      "در حال بررسی…"
                    ) : (
                      <>
                        <span>ورود به حساب</span>
                        <span className="text-[11px] font-normal px-2 py-0.5 rounded-md bg-white/20">اینتر ↵</span>
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-slate-500 text-center font-medium">
                    ادمین و مشتریان با نام کاربری و رمز وارد می‌شوند.
                  </p>
                </form>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500 font-medium">
            ثبت‌نام شرکت یا فروشگاه جدید؟{" "}
            <Link href="/register" className="text-blue-600 font-extrabold hover:text-blue-700 hover:underline">
              ثبت‌نام همکار عمده ←
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
