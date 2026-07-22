"use client";

import { useEffect, useState } from "react";

export default function UsersManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // فرم ساخت کاربر جدید
  const [username, setUsername] = useState("");
  const [pass, setPass] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("STAFF");

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("wos_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data);
      } else {
        setError(data.message || "خطا در دریافت لیست پرسنل");
      }
    } catch (err) {
      setError("خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const token = localStorage.getItem("wos_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username, pass, fullName, role }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در ساخت کاربر");

      setSuccess("کاربر جدید با موفقیت ایجاد شد.");
      setUsername("");
      setPass("");
      setFullName("");
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-8" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-white">مدیریت پرسنل و دسترسی‌ها</h1>
        <p className="text-xs text-slate-400 mt-1">ساخت حساب کاربری جدید برای کارمندان و تعیین سطح دسترسی آن‌ها</p>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-4 rounded-xl font-bold">{error}</div>}
      {success && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-4 rounded-xl font-bold">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* فرم ثبت کاربر */}
        <div className="bg-[#0B132B] border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-black text-white border-b border-slate-800 pb-3">افزودن کاربر جدید</h2>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">نام کامل</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="مثال: علی احمدی"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">نام کاربری</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="مثال: ali_ahmadi"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">رمز عبور</label>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">سطح دسترسی (نقش)</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-500"
              >
                <option value="STAFF">کاربر انبار (STAFF)</option>
                <option value="MANAGER">مدیر انبار (MANAGER)</option>
                <option value="ADMIN">مدیر کل (ADMIN)</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-3 rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20"
            >
              ثبت و ایجاد کاربر
            </button>
          </form>
        </div>

        {/* جدول لیست کاربران موجود */}
        <div className="lg:col-span-2 bg-[#0B132B] border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-black text-white border-b border-slate-800 pb-3">لیست پرسنل فعال سیستم</h2>
          {loading ? (
            <div className="text-xs text-slate-400 py-6 text-center">در حال بارگذاری لیست...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold">
                    <th className="pb-3 pr-2">نام کامل</th>
                    <th className="pb-3">نام کاربری</th>
                    <th className="pb-3">نقش سیستم</th>
                    <th className="pb-3">تاریخ ایجاد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-900/40">
                      <td className="py-3.5 pr-2 font-bold text-white">{u.fullName}</td>
                      <td className="py-3.5 font-mono text-slate-400">{u.username}</td>
                      <td className="py-3.5">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                          u.role === "ADMIN" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                          u.role === "MANAGER" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                          "bg-slate-800 text-slate-300"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 text-slate-500 font-mono text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString("fa-IR")}
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
