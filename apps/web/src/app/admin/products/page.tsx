"use client";

import { useEffect, useState } from "react";

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");

  // فرم افزودن محصول
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");

  const fetchProducts = async (query = "") => {
    try {
      const token = localStorage.getItem("wos_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/products?search=${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setProducts(data.data || []);
      } else {
        setError(data.message || "خطا در دریافت لیست محصولات");
      }
    } catch (err) {
      setError("خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const token = localStorage.getItem("wos_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, sku }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در ثبت محصول");

      setSuccess("محصول جدید با موفقیت ثبت شد.");
      setName("");
      setSku("");
      fetchProducts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-8" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-white">مدیریت محصولات انبار</h1>
        <p className="text-xs text-slate-400 mt-1">ثبت، جستجو و کنترل اقلام موجود در انبار</p>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-4 rounded-xl font-bold">{error}</div>}
      {success && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-4 rounded-xl font-bold">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* فرم ثبت محصول جدید */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-black text-white border-b border-slate-800 pb-3">افزودن محصول جدید</h2>
          <form onSubmit={handleCreateProduct} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">نام محصول / قطعه</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="مثال: لنت ترمز پژو ۴۰۵"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">کد کالا / SKU (اختیاری)</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="مثال: SKU-1002"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-400 font-mono"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-black py-3 rounded-xl text-xs transition-all shadow-lg shadow-amber-400/20"
            >
              ثبت محصول در انبار
            </button>
          </form>
        </div>

        {/* لیست محصولات */}
        <div className="lg:col-span-2 bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-black text-white">لیست محصولات ثبت‌شده</h2>
            <input
              type="text"
              placeholder="جستجو بر اساس نام یا کد..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                fetchProducts(e.target.value);
              }}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-amber-400 w-60"
            />
          </div>

          {loading ? (
            <div className="text-xs text-slate-400 py-6 text-center">در حال بارگذاری لیست...</div>
          ) : products.length === 0 ? (
            <div className="text-xs text-slate-400 py-6 text-center">هیچ محصولی یافت نشد.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold">
                    <th className="pb-3 pr-2">نام محصول</th>
                    <th className="pb-3">کد کالا (SKU)</th>
                    <th className="pb-3">تاریخ ثبت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-900/40">
                      <td className="py-3.5 pr-2 font-bold text-white">{p.name}</td>
                      <td className="py-3.5 font-mono text-amber-400">{p.sku}</td>
                      <td className="py-3.5 text-slate-500 font-mono text-[11px]">
                        {new Date(p.createdAt).toLocaleDateString("fa-IR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
