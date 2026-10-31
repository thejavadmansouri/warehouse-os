"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toFaDigits } from "@/lib/digits";

export type TierOption = { id: string; name: string };
export type CustomerOption = { id: string; companyName: string; phone: string };

export function SendNotificationClient({
  tiers,
  customers,
}: {
  tiers: TierOption[];
  customers: CustomerOption[];
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("PROMO");
  const [target, setTarget] = useState("ALL");
  const [selectedTier, setSelectedTier] = useState(tiers[0]?.id ?? "");
  const [selectedCustomer, setSelectedCustomer] = useState(customers[0]?.id ?? "");
  const [link, setLink] = useState("");
  const [makeBanner, setMakeBanner] = useState(false);
  const [bannerLevel, setBannerLevel] = useState("WARNING");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          message,
          type,
          target,
          tierId: target === "TIER" ? selectedTier : undefined,
          customerId: target === "CUSTOMER" ? selectedCustomer : undefined,
          link: link.trim() || undefined,
          makeBanner,
          bannerLevel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "خطا در ارسال اعلان");
        return;
      }

      setSuccess(data.message || "اعلان با موفقیت ارسال شد.");
      setTitle("");
      setMessage("");
      setLink("");
    } catch {
      setError("خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          ارسال نوتیفیکیشن و پیام همگانی به همکاران
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          ارسال اطلاعیه، تغییرات قیمت، بار جدید و تخفیف‌های ویژه به تفکیک سطح همکاری یا برای همه کاربران
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* فرم ارسال پیام */}
        <Card className="lg:col-span-2 bg-white border-slate-200 text-slate-900 shadow-md">
          <CardHeader className="border-slate-100">
            <CardTitle className="text-slate-900 text-base flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-500" />
              فرم ایجاد پیام و اعلان جدید
            </CardTitle>
            <CardDescription className="text-slate-500">
              پیام ارسال‌شده در صندوق نوتیفیکیشن (زنگوله) همکاران قرار می‌گیرد.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSend} className="space-y-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">عنوان اعلان:</label>
                  <input
                    type="text"
                    placeholder="مثلاً: بار جدید لنت ترمز عظام رسید"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">دسته‌بندی پیام:</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  >
                    <option value="PROMO">تخفیف و پیشنهاد ویژه (Promo)</option>
                    <option value="SYSTEM">اطلاعیه عمومی سامانه (System)</option>
                    <option value="ORDER_STATUS">وضعیت سفارش و باربری</option>
                    <option value="CREDIT_UPDATE">تغییر خط اعتبار و مالی</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">متن کامل پیام:</label>
                <textarea
                  rows={4}
                  placeholder="متن اعلان را به همراه جزئیات برای همکاران شرح دهید..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">جامعه هدف (مخاطبان):</label>
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  >
                    <option value="ALL">همه همکاران فعال ({toFaDigits(customers.length)} همکار)</option>
                    <option value="TIER">مشتریان یک سطح همکاری خاص</option>
                    <option value="CUSTOMER">یک مشتری مشخص</option>
                  </select>
                </div>

                {target === "TIER" && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">انتخاب سطح همکاری:</label>
                    <select
                      value={selectedTier}
                      onChange={(e) => setSelectedTier(e.target.value)}
                      className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    >
                      {tiers.map((t) => (
                        <option key={t.id} value={t.id}>
                          سطح {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {target === "CUSTOMER" && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">انتخاب مشتری:</label>
                    <select
                      value={selectedCustomer}
                      onChange={(e) => setSelectedCustomer(e.target.value)}
                      className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.companyName} ({c.phone})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">لینک اقدام (اختیاری):</label>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="/catalog یا /orders/bulk"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
              </div>

              {/* گزینه تبدیل به بنر بالای سایت */}
              <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="makeBanner"
                    checked={makeBanner}
                    onChange={(e) => setMakeBanner(e.target.checked)}
                    className="size-4 text-amber-600 rounded"
                  />
                  <label htmlFor="makeBanner" className="text-xs font-bold text-slate-800 cursor-pointer">
                    نمایش به صورت بنر سراسری در بالای تمام صفحات کاتالوگ و داشبورد
                  </label>
                </div>

                {makeBanner && (
                  <select
                    value={bannerLevel}
                    onChange={(e) => setBannerLevel(e.target.value)}
                    className="text-xs font-bold px-2 py-1 border border-amber-300 rounded-lg bg-white"
                  >
                    <option value="WARNING">رنگ نارنجی کاردو (ویژه / مهم)</option>
                    <option value="URGENT">رنگ قرمز (فوری / اعلام قیمت)</option>
                    <option value="SUCCESS">رنگ سبز (تخفیف و پیشنهاد ویژه)</option>
                    <option value="INFO">رنگ آبی (اطلاعیه عمومی)</option>
                  </select>
                )}
              </div>

              <Button type="submit" loading={loading} className="w-full">
                ارسال اعلان به مخاطبان
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* راهنمای پیش‌نمایش */}
        <Card className="lg:col-span-1 bg-slate-900 text-white border-slate-800 shadow-md">
          <CardHeader className="border-slate-800">
            <CardTitle className="text-white text-base">پیش‌نمایش ظاهر اعلان</CardTitle>
            <CardDescription className="text-slate-400">
              این پیام دقیقاً به شکل زیر در گوشه بالای صفحه مشتریان ظاهر خواهد شد.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400">
                  {title || "عنوان اعلان"}
                </span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">
                  هم‌اکنون
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {message || "متن پیام در اینجا برای کاربر نمایش داده خواهد شد..."}
              </p>
              {link && (
                <div className="pt-1 text-[11px] text-blue-400 hover:underline">
                  کلیک جهت مشاهده ←
                </div>
              )}
            </div>

            <div className="text-xs text-slate-400 space-y-1.5 pt-2 border-t border-slate-800">
              <p className="font-bold text-slate-300">💡 نکته کاربردی:</p>
              <p className="text-[11px] leading-relaxed">
                اعلان‌های ارسال شده بلافاصله در آیکون زنگوله کاتالوگ همکاران قرمز می‌شود و با کلیک روی آن لیست پیام‌ها باز می‌شود.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
