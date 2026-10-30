"use client";

import { useEffect, useState } from "react";
import { formatToman, toFaDigits } from "@/lib/digits";

type TierItem = {
  id: string;
  name: string;
  creditLimit: number;
  baseDiscount: number;
  sortOrder: number;
  customerCount: number;
};

export function TiersView() {
  const [tiers, setTiers] = useState<TierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Tier modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCreditLimit, setNewCreditLimit] = useState(20_000_000);
  const [newBaseDiscount, setNewBaseDiscount] = useState(5);
  const [creating, setCreating] = useState(false);

  // Edit Tier modal
  const [editingTier, setEditingTier] = useState<TierItem | null>(null);
  const [editCreditLimit, setEditCreditLimit] = useState(0);
  const [editBaseDiscount, setEditBaseDiscount] = useState(0);
  const [updating, setUpdating] = useState(false);

  async function loadTiers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tiers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در دریافت سطوح");
      setTiers(data.tiers || []);
    } catch (err: any) {
      setError(err.message || "ارتباط با سرور برقرار نشد");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTiers();
  }, []);

  async function handleCreateTier(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/admin/tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          creditLimit: newCreditLimit,
          baseDiscount: newBaseDiscount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در ایجاد سطح");

      setShowCreateModal(false);
      setNewName("");
      loadTiers();
    } catch (err: any) {
      alert(err.message || "خطا در ایجاد");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateTier(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTier) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/tiers/${editingTier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditLimit: editCreditLimit,
          baseDiscount: editBaseDiscount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در ذخیره تغییرات");

      setEditingTier(null);
      loadTiers();
    } catch (err: any) {
      alert(err.message || "خطا در ویرایش");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* هدر اکشن و راهنما */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-sm font-bold text-slate-800">سیاست‌های قیمت‌گذاری پلکانی و تخفیف همکاری</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            همکاران منتسب به هر سطح، به صورت خودکار از تخفیف پایه روی کل کاتالوگ و سقف خرید اعتباری برخوردار می‌شوند.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="btn btn-blue px-4 py-2 text-xs font-bold min-h-[44px] flex items-center gap-1.5 shadow-xs"
        >
          <span>+</span>
          <span>تعریف سطح همکاری جدید</span>
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500 text-sm">در حال بارگذاری سطوح و تخفیف‌ها...</div>
      ) : error ? (
        <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tiers.map((t) => (
            <div
              key={t.id}
              className="card p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4 relative overflow-hidden"
            >
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">{t.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    تعداد همکاران: <b className="nums text-blue-700">{toFaDigits(t.customerCount)} مشتری</b>
                  </p>
                </div>
                <span className="text-xs bg-blue-50 text-blue-800 font-bold px-2 py-1 rounded-md border border-blue-200">
                  تخفیف پایه: {toFaDigits(t.baseDiscount)}٪
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="flex justify-between items-center">
                  <span>سقف خرید اعتباری:</span>
                  <span className="nums font-extrabold text-slate-900 text-sm">
                    {formatToman(t.creditLimit)} ت
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>درصد تخفیف همکاری:</span>
                  <span className="nums font-black text-emerald-700 text-sm">{toFaDigits(t.baseDiscount)}٪</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTier(t);
                    setEditCreditLimit(t.creditLimit);
                    setEditBaseDiscount(t.baseDiscount);
                  }}
                  className="btn btn-ghost px-3 py-1.5 text-xs text-blue-600 font-bold min-h-[36px]"
                >
                  ویرایش سقف اعتبار و تخفیف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* مدال ۱: ایجاد سطح جدید */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">تعریف سطح همکاری جدید</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTier} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">نام سطح همکاری</label>
                <input
                  type="text"
                  placeholder="مثال: تعمیرگاه‌های منتخب، ناوگان سازمانی، پخش عمده ۲"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="w-full input px-3 py-2 border rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">سقف اعتبار پیش‌فرض (تومان)</label>
                <input
                  type="number"
                  value={newCreditLimit}
                  onChange={(e) => setNewCreditLimit(Number(e.target.value))}
                  required
                  className="w-full input px-3 py-2 border rounded-lg font-bold nums text-blue-700"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">درصد تخفیف پایه روی کل کاتالوگ (۰ تا ۱۰۰)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={newBaseDiscount}
                  onChange={(e) => setNewBaseDiscount(Number(e.target.value))}
                  required
                  className="w-full input px-3 py-2 border rounded-lg font-bold nums text-emerald-700 text-center"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-ghost px-4 py-2"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn btn-blue px-5 py-2 font-bold min-h-[40px]"
                >
                  {creating ? "در حال ایجاد..." : "ایجاد سطح همکاری"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مدال ۲: ویرایش سطح */}
      {editingTier && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">ویرایش سطح: {editingTier.name}</h3>
              <button
                type="button"
                onClick={() => setEditingTier(null)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateTier} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">سقف اعتبار (تومان)</label>
                <input
                  type="number"
                  value={editCreditLimit}
                  onChange={(e) => setEditCreditLimit(Number(e.target.value))}
                  required
                  className="w-full input px-3 py-2 border rounded-lg font-bold nums text-blue-700"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">درصد تخفیف پایه (۰ تا ۱۰۰)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={editBaseDiscount}
                  onChange={(e) => setEditBaseDiscount(Number(e.target.value))}
                  required
                  className="w-full input px-3 py-2 border rounded-lg font-bold nums text-emerald-700 text-center"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingTier(null)}
                  className="btn btn-ghost px-4 py-2"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="btn btn-blue px-5 py-2 font-bold min-h-[40px]"
                >
                  {updating ? "در حال ذخیره..." : "ذخیره تغییرات"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
