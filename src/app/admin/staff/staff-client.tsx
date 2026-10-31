"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toFaDigits } from "@/lib/digits";

export type StaffMember = {
  id: string;
  username: string;
  name: string | null;
  role: string;
  isActive: boolean;
  createdAt: string | Date;
};

export function StaffClient({ initialStaff }: { initialStaff: StaffMember[] }) {
  const [staffList, setStaffList] = useState<StaffMember[]>(initialStaff);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("ACCOUNTANT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "خطا در ثبت کاربر");
        return;
      }

      setStaffList([data.staff, ...staffList]);
      setName("");
      setUsername("");
      setPassword("");
      setSuccess(`کاربر «${data.staff.username}» با نقش ${role === "ACCOUNTANT" ? "حسابدار" : role} با موفقیت ثبت شد.`);
    } catch {
      setError("خطا در برقراری ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(member: StaffMember) {
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: member.id, isActive: !member.isActive }),
      });
      const data = await res.json();
      if (res.ok) {
        setStaffList(staffList.map((s) => (s.id === member.id ? { ...s, isActive: !member.isActive } : s)));
      }
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            مدیریت حسابداران و پرسنل کاردو
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            تعریف دسترسی حسابدار مالی، مسئول چک و انباردار جهت مدیریت فاکتورها و عملیات مالی
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* فرم ثبت حسابدار یا پرسنل جدید */}
        <Card className="lg:col-span-1 bg-white border-slate-200 text-slate-900 shadow-md">
          <CardHeader className="border-slate-100">
            <CardTitle className="text-slate-900 text-base flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-500" />
              تعریف حسابدار / پرسنل جدید
            </CardTitle>
            <CardDescription className="text-slate-500">
              مشخصات فردی و سطح دسترسی کاربر را وارد نمایید.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-semibold">
                  {success}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نام و نام خانوادگی:</label>
                <input
                  type="text"
                  placeholder="مثلاً: خانم رضایی (حسابدار ارشد)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نام کاربری (جهت ورود):</label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="accountant1"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">کلمه عبور:</label>
                <input
                  type="password"
                  dir="ltr"
                  placeholder="حداقل ۶ کاراکتر"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نقش سازمانی و سطح دسترسی:</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  <option value="ACCOUNTANT">حسابدار (دسترسی به فاکتورها، چک‌ها و اسناد مالی)</option>
                  <option value="WAREHOUSE">مسئول انبار (دسترسی به جمع‌آوری و موجودی کالا)</option>
                  <option value="ADMIN">مدیر ارشد (دسترسی کامل به تمام امکانات)</option>
                </select>
              </div>

              <Button type="submit" loading={loading} className="w-full">
                ثبت و فعال‌سازی حسابدار
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* لیست پرسنل موجود */}
        <Card className="lg:col-span-2 bg-white border-slate-200 text-slate-900 shadow-md">
          <CardHeader className="border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-slate-900 text-base">لیست پرسنل و دسترسی‌های ثبت‌شده</CardTitle>
              <CardDescription className="text-slate-500">
                مجموع {toFaDigits(staffList.length)} کاربر تعریف شده در سامانه
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-bold">نام و نام خانوادگی</th>
                    <th className="py-3 px-4 font-bold">نام کاربری</th>
                    <th className="py-3 px-4 font-bold">نقش سازمانی</th>
                    <th className="py-3 px-4 font-bold">وضعیت حساب</th>
                    <th className="py-3 px-4 font-bold">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffList.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {m.name || "نامشخص"}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600" dir="ltr">
                        {m.username}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-black ${
                            m.role === "ACCOUNTANT"
                              ? "bg-blue-100 text-blue-800"
                              : m.role === "WAREHOUSE"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-purple-100 text-purple-800"
                          }`}
                        >
                          {m.role === "ACCOUNTANT" ? "حسابدار" : m.role === "WAREHOUSE" ? "انباردار" : "مدیر ارشد"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            m.isActive ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          <span className={`size-1.5 rounded-full ${m.isActive ? "bg-emerald-600" : "bg-rose-600"}`} />
                          {m.isActive ? "فعال" : "مسدود"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => toggleStatus(m)}
                          className={`text-xs font-bold px-3 py-1 rounded-lg border transition-all ${
                            m.isActive
                              ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {m.isActive ? "غیرفعال‌سازی" : "فعال‌سازی مجدد"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
