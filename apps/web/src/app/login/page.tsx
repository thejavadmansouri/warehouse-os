"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pass: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "خطا در ورود به سیستم");
      }

      // ذخیره در localStorage و Cookie (برای Middleware)
      localStorage.setItem("wos_token", data.access_token);
      localStorage.setItem("wos_user", JSON.stringify(data.user));
      
      // تنظیم کوکی برای ماندگاری (اگر مرا به خاطر داشته باش فعال باشد، 30 روزه)
      const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
      document.cookie = `wos_token=${data.access_token}; path=/; max-age=${maxAge}`;

      router.push("/admin");
    } catch (err: any) {
      setError(err.message || "اتصال به سرور برقرار نشد.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl space-y-6 text-slate-100">
        
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-amber-400 rounded-2xl mx-auto flex items-center justify-center font-black text-slate-900 text-2xl shadow-lg">
            W
          </div>
          <h1 className="text-2xl font-black text-white">سامانه انبارداری هوشمند</h1>
          <p className="text-xs text-slate-300">لطفاً برای ورود نام کاربری و رمز عبور وارد کنید</p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/40 text-red-300 text-xs p-3.5 rounded-xl font-bold text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">نام کاربری</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="مثال: admin"
              required
              className="w-full bg-slate-900 border border-slate-600 rounded-xl p-3.5 text-sm text-white outline-none focus:border-amber-400 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">رمز عبور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-slate-900 border border-slate-600 rounded-xl p-3.5 text-sm text-white outline-none focus:border-amber-400 font-mono"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-amber-400 focus:ring-amber-400"
              />
              مرا به خاطر داشته باش
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-black py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-amber-400/20 disabled:opacity-50"
          >
            {loading ? "در حال بررسی..." : "ورود به سیستم"}
          </button>
        </form>

        <div className="text-center pt-4 border-t border-slate-700 text-[11px] text-slate-400">
          پیش‌فرض سیستم: نام کاربری <strong className="text-amber-300 font-mono">admin</strong> | رمز <strong className="text-amber-300 font-mono">123456</strong>
        </div>

      </div>
    </div>
  );
}
