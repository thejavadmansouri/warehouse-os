"use client";

import { useEffect, useState } from "react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ productsCount: 0, locationsCount: 0 });
  const [loading, setLoading] = useState(true);

  // فرم ایجاد مکان
  const [locName, setLocName] = useState("");
  const [locCode, setLocCode] = useState("");
  const [locMessage, setLocMessage] = useState("");

  // فرم ایجاد محصول
  const [prodName, setProdName] = useState("");
  const [prodSku, setProdSku] = useState("");
  const [prodBrand, setProdBrand] = useState("");
  const [prodMessage, setProdMessage] = useState("");

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("wos_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

      const [prodRes, locRes] = await Promise.all([
        fetch(`${apiUrl}/products`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/locations`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const prodData = await prodRes.json();
      const locData = await locRes.json();

      setStats({
        productsCount: prodData.meta?.total || prodData.data?.length || 0,
        locationsCount: Array.isArray(locData) ? locData.length : 0,
      });
    } catch (err) {
      console.error("خطا در دریافت آمار داشبورد", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocMessage("");
    try {
      const token = localStorage.getItem("wos_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/locations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: locName, barcode: locCode }),
      });
      if (!res.ok) throw new Error("خطا در ثبت مکان");
      setLocMessage("✅ مکان با موفقیت ثبت شد.");
      setLocName("");
      setLocCode("");
      fetchStats();
    } catch (err: any) {
      setLocMessage("❌ خطا در ثبت مکان");
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProdMessage("");
    try {
      const token = localStorage.getItem("wos_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: prodName, sku: prodSku, brand: prodBrand }),
      });
      if (!res.ok) throw new Error("خطا در ثبت محصول");
      setProdMessage("✅ محصول با موفقیت در PostgreSQL ذخیره شد.");
      setProdName("");
      setProdSku("");
      setProdBrand("");
      fetchStats();
    } catch (err: any) {
      setProdMessage("❌ خطا در ثبت محصول");
    }
  };

  return (
    <div className="space-y-8" dir="rtl">
      {/* هدر بخش داشبورد */}
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white">داشبورد مدیریتی انبار (متصل به دیتابیس)</h1>
          <p className="text-xs text-slate-400 mt-1">آمار لحظه‌ای اقلام، موجودی‌ها و موقعیت‌های ثبت‌شده در بک‌اند</p>
        </div>

        {/* کارت‌های آماری */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-[11px] text-slate-400 font-bold">منطقه کاری فعال</span>
            <div className="text-lg font-black text-amber-400">مرکزی / تهران</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-[11px] text-slate-400 font-bold">وضعیت اتصال سرور</span>
            <div className="text-lg font-black text-emerald-400 flex items-center gap-2">
              <span>✅</span> متصل
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-[11px] text-slate-400 font-bold">کل محصولات تعریف‌شده</span>
            <div className="text-2xl font-black text-white font-mono">
              {loading ? "..." : stats.productsCount} <span className="text-xs font-normal text-slate-400">محصول</span>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-[11px] text-slate-400 font-bold">تعداد مکان‌ها / انبارها</span>
            <div className="text-2xl font-black text-amber-400 font-mono">
              {loading ? "..." : stats.locationsCount} <span className="text-xs font-normal text-slate-400">مکان</span>
            </div>
          </div>
        </div>
      </div>

      {/* بخش فرم‌های سریع عملیاتی */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* فرم ایجاد مکان */}
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-sm font-black text-white">📍 ایجاد مکان / قفسه جدید</h2>
          </div>
          {locMessage && <div className="text-xs font-bold p-3 rounded-xl bg-slate-900 text-amber-300">{locMessage}</div>}
          <form onSubmit={handleCreateLocation} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">نام مکان (مثلاً قفسه A-1)</label>
              <input
                type="text"
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                required
                placeholder="مثلاً قفسه A-1"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">کد یکتا (مثلاً LOC-A1)</label>
              <input
                type="text"
                value={locCode}
                onChange={(e) => setLocCode(e.target.value)}
                required
                placeholder="مثلاً LOC-A1"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-400 font-mono"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-black py-3 rounded-xl text-xs transition-all shadow-lg shadow-amber-400/20"
            >
              ثبت مکان در ساختار درختی
            </button>
          </form>
        </div>

        {/* فرم ثبت سریع محصول */}
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-sm font-black text-white">➕ ثبت سریع محصول جدید در دیتابیس</h2>
          </div>
          {prodMessage && <div className="text-xs font-bold p-3 rounded-xl bg-slate-900 text-amber-300">{prodMessage}</div>}
          <form onSubmit={handleCreateProduct} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">نام قطعه (مثلاً لنت ترمز جلو)</label>
              <input
                type="text"
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                required
                placeholder="مثلاً لنت ترمز جلو"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">کد SKU (مثلاً AP-10024)</label>
              <input
                type="text"
                value={prodSku}
                onChange={(e) => setProdSku(e.target.value)}
                placeholder="مثلاً AP-10024"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-400 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">برند (مثلاً TRW)</label>
              <input
                type="text"
                value={prodBrand}
                onChange={(e) => setProdBrand(e.target.value)}
                placeholder="مثلاً TRW"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-400"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-black py-3 rounded-xl text-xs transition-all shadow-lg shadow-amber-400/20"
            >
              ذخیره محصول در PostgreSQL
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
