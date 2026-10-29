"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/*
 * فرم ورود — دو حالت: موبایل + OTP (مرحله‌ای) یا یوزرنیم/پسورد (ادمین/مشتری ویژه).
 * موبایل‌فرست: اینپوت‌های بزرگ، تماس لمسی، کد در یک خط.
 */
type Mode = "phone" | "password";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("phone");

  // حالت موبایل
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // حالت پسورد
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
      redirect?: string;
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
      setInfo("کد تأیید ارسال شد (فاز آزمایشی: کد پایین نمایش داده می‌شود).");
    }
  }

  async function verifyOtp() {
    const data = await post("/api/auth/otp/verify", { phone, code });

    if (data) {
      router.push("/dashboard");
    }
  }

  async function loginPassword() {
    const data = await post("/api/auth/login", { username, password });

    if (data) {
      router.push(data.role === "admin" ? "/admin" : "/dashboard");
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="text-center">
          <h1 className="text-xl font-bold">ورود</h1>
          <p className="text-sm text-muted mt-1">
            فقط مشتریان عمدهٔ تأییدشده وارد می‌شوند
          </p>
        </div>

        {/* کلیدهای انتخاب روش ورود */}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("phone")}
            className={`rounded-lg px-3 py-2 font-medium transition ${
              mode === "phone" ? "bg-primary text-primary-foreground shadow" : "text-muted"
            }`}
          >
            شماره موبایل
          </button>
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`rounded-lg px-3 py-2 font-medium transition ${
              mode === "password" ? "bg-primary text-primary-foreground shadow" : "text-muted"
            }`}
          >
            نام کاربری
          </button>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {mode === "phone" ? (
          step === "phone" ? (
            <>
              <input
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0912 345 6789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-lg tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                onClick={requestOtp}
                disabled={busy || phone.length < 10}
                className="rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? "در حال ارسال…" : "دریافت کد تأیید"}
              </button>
            </>
          ) : (
            <>
              {info && <p className="text-sm text-muted -mt-2">{info}</p>}
              {devCode && (
                <p dir="ltr" className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-center font-bold tracking-widest text-amber-800">
                  {devCode}
                </p>
              )}
              <input
                dir="ltr"
                inputMode="numeric"
                maxLength={6}
                placeholder="- - - - - -"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-2xl tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                onClick={verifyOtp}
                disabled={busy || code.length !== 6}
                className="rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? "در حال بررسی…" : "ورود"}
              </button>
              <button
                onClick={() => {
                  setStep("phone");
                  setDevCode(null);
                  setInfo(null);
                }}
                className="text-sm text-muted underline underline-offset-4"
              >
                تغییر شماره / ارسال دوباره
              </button>
            </>
          )
        ) : (
          <>
            <input
              dir="ltr"
              autoComplete="username"
              placeholder="نام کاربری"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <input
              dir="ltr"
              type="password"
              autoComplete="current-password"
              placeholder="رمز عبور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={loginPassword}
              disabled={busy || !username || !password}
              className="rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "در حال ورود…" : "ورود"}
            </button>
          </>
        )}

        <p className="text-center text-sm text-muted">
          ثبت‌نام شرکت جدید؟{" "}
          <Link href="/register" className="text-primary font-medium underline underline-offset-4">
            ثبت‌نام
          </Link>
        </p>
      </div>
    </main>
  );
}
