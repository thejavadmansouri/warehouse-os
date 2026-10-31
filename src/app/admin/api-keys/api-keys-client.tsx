"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toFaDigits } from "@/lib/digits";

export type ApiKeyItem = {
  id: string;
  name: string;
  key: string;
  system: string | null;
  isActive: boolean;
  lastUsedAt: string | Date | null;
  createdAt: string | Date;
};

export function ApiKeysClient({ initialKeys }: { initialKeys: ApiKeyItem[] }) {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [name, setName] = useState("");
  const [system, setSystem] = useState("PARSIAN");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, system }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "خطا در صدور کلید");
        return;
      }

      setKeys([data.apiKey, ...keys]);
      setName("");
      setSuccess("کلید وب‌سرویس حسابداری با موفقیت صادر شد.");
    } catch {
      setError("خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(k: ApiKeyItem) {
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: k.id, isActive: !k.isActive }),
      });
      const data = await res.json();
      if (res.ok) {
        setKeys(keys.map((x) => (x.id === k.id ? { ...x, isActive: !k.isActive } : x)));
      }
    } catch {}
  }

  function copyKey(k: ApiKeyItem) {
    navigator.clipboard.writeText(k.key);
    setCopiedId(k.id);
    setTimeout(() => setCopiedId(null), 2500);
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          اتصال وب‌سرویس حسابداری (Accounting API)
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          ارائه توکن اختصاصی و API جهت اتصال مستقیم نرم‌افزارهای مالی (پارسیان، هلو، سپیدار و...) به سایت کاردو
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* صدور کلید جدید */}
        <Card className="lg:col-span-1 bg-white border-slate-200 text-slate-900 shadow-md">
          <CardHeader className="border-slate-100">
            <CardTitle className="text-slate-900 text-base flex items-center gap-2">
              <span className="size-2 rounded-full bg-blue-600" />
              صدور کلید اتصال جدید
            </CardTitle>
            <CardDescription className="text-slate-500">
              نام اتصال و نرم‌افزار هدف را مشخص کنید تا کلید دسترسی امن تولید شود.
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
                <label className="block text-xs font-bold text-slate-700 mb-1">عنوان اتصال:</label>
                <input
                  type="text"
                  placeholder="مثلاً: اتصال پارسیان سرور مرکزی کرمان"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نرم‌افزار مالی / سیستم هدف:</label>
                <select
                  value={system}
                  onChange={(e) => setSystem(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="PARSIAN">حسابداری پارسیان (Parsian)</option>
                  <option value="SEPIDAR">همکاران سیستم / سپیدار (Sepidar)</option>
                  <option value="HOLOO">نرم‌افزار حسابداری هلو (Holoo)</option>
                  <option value="CUSTOM">سایر نرم‌افزارهای یکپارچه ERP / مالی</option>
                </select>
              </div>

              <Button type="submit" loading={loading} className="w-full">
                تولید کلید وب‌سرویس
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* لیست کلیدها */}
        <Card className="lg:col-span-2 bg-white border-slate-200 text-slate-900 shadow-md">
          <CardHeader className="border-slate-100">
            <CardTitle className="text-slate-900 text-base">کلیدهای فعال وب‌سرویس</CardTitle>
            <CardDescription className="text-slate-500">
              این کلیدها برای احراز هویت درخواست‌های نرم‌افزار حسابداری در هدر <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-blue-700">x-api-key</code> ارسال می‌شوند.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-bold">عنوان و سیستم</th>
                    <th className="py-3 px-4 font-bold">کلید امنیتی (API Key)</th>
                    <th className="py-3 px-4 font-bold">وضعیت</th>
                    <th className="py-3 px-4 font-bold">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {keys.map((k) => (
                    <tr key={k.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{k.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          سیستم: <span className="font-semibold text-blue-600">{k.system}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700" dir="ltr">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[160px] sm:max-w-[220px] bg-slate-100 px-2 py-1 rounded text-[11px] border border-slate-200">
                            {k.key}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyKey(k)}
                            className="text-[11px] font-bold px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors shrink-0"
                          >
                            {copiedId === k.id ? "کپی شد ✓" : "کپی"}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            k.isActive ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          <span className={`size-1.5 rounded-full ${k.isActive ? "bg-emerald-600" : "bg-rose-600"}`} />
                          {k.isActive ? "فعال" : "غیرفعال"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => toggleStatus(k)}
                          className={`text-xs font-bold px-3 py-1 rounded-lg border transition-all ${
                            k.isActive
                              ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {k.isActive ? "غیرفعال" : "فعال‌سازی"}
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

      {/* مستندات فنی اندپوینت‌ها جهت تحویل به برنامه‌نویس حسابداری */}
      <Card className="bg-slate-900 text-white border-slate-800 shadow-xl">
        <CardHeader className="border-slate-800">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <span>📘</span>
            مستندات وب‌سرویس حسابداری جهت ارتباط خودکار با پارسیان و سپیدار
          </CardTitle>
          <CardDescription className="text-slate-400">
            برنامه‌نویس یا کارشناس IT نرم‌افزار حسابداری می‌تواند از وب‌سرویس‌های زیر جهت خواندن سفارش‌ها و به‌روزرسانی موجودی و مانده‌حساب استفاده کند:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs font-mono">
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <span className="bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">GET</span>
              <span className="text-slate-200">/api/v1/accounting/orders</span>
            </div>
            <p className="text-slate-400 text-[11px] font-sans">
              دریافت لیست سفارش‌های جدید ثبت‌شده در سایت، مبالغ، تخفیفات و اقلام سبد به همراه کد ملی، شماره موبایل و آدرس مشتری جهت ثبت خودکار فاکتور فروش در حسابداری.
            </p>
            <div className="text-slate-500 text-[10px]" dir="ltr">
              curl -H "x-api-key: kardo_acc_..." http://localhost:3002/api/v1/accounting/orders
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 text-blue-400 font-bold">
              <span className="bg-blue-950 px-2 py-0.5 rounded border border-blue-800">POST</span>
              <span className="text-slate-200">/api/v1/accounting/sync-inventory</span>
            </div>
            <p className="text-slate-400 text-[11px] font-sans">
              به‌روزرسانی دسته‌ای موجودی انبار و قیمت قطعات از نرم‌افزار حسابداری به وب‌سایت.
            </p>
            <div className="text-slate-500 text-[10px]" dir="ltr">
              Body: {"{"} items: [{ "{"} sku: "SHK-ABS-PRD-01", price: 1250000, stockQty: 80 {"}"}] {"}"}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <span className="bg-amber-950 px-2 py-0.5 rounded border border-amber-800">POST</span>
              <span className="text-slate-200">/api/v1/accounting/sync-balance</span>
            </div>
            <p className="text-slate-400 text-[11px] font-sans">
              به‌روزرسانی مانده حساب بدهکار/بستانکار و سقف اعتبار مشتری بر اساس شماره تلفن یا کد ملی.
            </p>
            <div className="text-slate-500 text-[10px]" dir="ltr">
              Body: {"{"} phone: "09121111111", walletBalance: 50000000, creditLimit: 200000000 {"}"}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
