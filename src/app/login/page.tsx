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
    <main className="min-h-dvh flex flex-col">
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

      <div className="flex-1 grid place-items-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-5">
            <p className="label">دفتر سفارش عمده</p>
            <h1 className="text-xl font-bold tracking-tight mt-1">ورود به حساب</h1>
            <p className="text-xs text-ink-soft mt-1">
              فقط مشتریان عمده — پس از تأیید، قیمت‌ها و موجودی باز می‌شود.
            </p>
          </div>

          <div className="card p-5">
            <div className="grid grid-cols-2 border border-rule rounded-[2px] overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setMode("phone")}
                className={`py-2 transition-colors ${
                  mode === "phone"
                    ? "bg-ink text-paper font-bold"
                    : "text-ink-soft hover:bg-brass-soft/40"
                }`}
              >
                شماره موبایل
              </button>
              <button
                type="button"
                onClick={() => setMode("password")}
                className={`py-2 border-s border-rule transition-colors ${
                  mode === "password"
                    ? "bg-ink text-paper font-bold"
                    : "text-ink-soft hover:bg-brass-soft/40"
                }`}
              >
                نام کاربری
              </button>
            </div>

            {error && (
              <p className="mt-3 rounded-[2px] border border-alarm/40 bg-alarm-soft px-3 py-2 text-xs text-alarm">
                {error}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">
              {mode === "phone" ? (
                step === "phone" ? (
                  <>
                    <label className="block">
                      <span className="label block mb-1">شماره موبایل</span>
                      <input
                        dir="ltr"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="0912 345 6789"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="input text-center text-lg tracking-widest nums py-3"
                      />
                    </label>
                    <button
                      onClick={requestOtp}
                      disabled={busy || phone.length < 10}
                      className="btn btn-primary w-full py-3"
                    >
                      {busy ? "در حال ارسال…" : "دریافت کد تأیید"}
                    </button>
                  </>
                ) : (
                  <>
                    {info && <p className="text-[11px] text-ink-soft leading-5">{info}</p>}
                    {devCode && (
                      <p
                        dir="ltr"
                        className="rounded-[2px] border border-brass/40 bg-brass-soft/60 px-3 py-2 text-center text-xl font-bold tracking-[0.3em] text-brass nums"
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
                        className="input text-center text-2xl tracking-[0.4em] nums py-3"
                      />
                    </label>
                    <button
                      onClick={verifyOtp}
                      disabled={busy || code.length !== 6}
                      className="btn btn-primary w-full py-3"
                    >
                      {busy ? "در حال بررسی…" : "ورود"}
                    </button>
                    <button
                      onClick={() => {
                        setStep("phone");
                        setDevCode(null);
                        setInfo(null);
                      }}
                      className="text-xs text-ink-soft underline underline-offset-4 self-center"
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
                      className="input py-3"
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
                      className="input py-3"
                    />
                  </label>
                  <button
                    onClick={loginPassword}
                    disabled={busy || !username || !password}
                    className="btn btn-primary w-full py-3"
                  >
                    {busy ? "در حال ورود…" : "ورود"}
                  </button>
                  <p className="text-[10px] text-ink-soft text-center">
                    ادمین و مشتریان با نام کاربری وارد می‌شوند.
                  </p>
                </>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-ink-soft">
            ثبت‌نام شرکت جدید؟{" "}
            <Link href="/register" className="text-brass font-bold underline underline-offset-4">
              ثبت‌نام
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
