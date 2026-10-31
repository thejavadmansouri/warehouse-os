"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";
import { faDateTime } from "@/lib/date";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";

interface CustomerProfileViewProps {
  customerId: string;
  availableTiers: Array<{
    id: string;
    name: string;
    baseDiscount: number;
    creditLimit: number;
  }>;
}

export function CustomerProfileView({
  customerId,
  availableTiers,
}: CustomerProfileViewProps) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "searches" | "orders" | "products" | "cheques" | "info"
  >("searches");

  // مشاهده جزئیات سفارش در مودال
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // مودال ویرایش مشتری
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    companyName: "",
    contactName: "",
    phone: "",
    username: "",
    password: "",
    nationalId: "",
    address: "",
    tierId: "",
    discountPercent: 0,
    creditLimitOverride: "",
    status: "ACTIVE",
  });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // لود اولیه اطلاعات پرونده مشتری
  const loadCustomer = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/customers/${customerId}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || "خطا در دریافت پرونده مشتری");
      }
      setData(json.customer);

      // مقداردهی اولیه فرم ویرایش
      const c = json.customer;
      setEditForm({
        companyName: c.companyName || "",
        contactName: c.contactName || "",
        phone: c.phone || "",
        username: c.username || "",
        password: "",
        nationalId: c.nationalId || "",
        address: c.address || "",
        tierId: c.tier?.id || "",
        discountPercent: c.discountPercent || 0,
        creditLimitOverride:
          c.creditLimitOverride !== null && c.creditLimitOverride !== undefined
            ? String(c.creditLimitOverride)
            : "",
        status: c.status || "ACTIVE",
      });
    } catch (err: any) {
      setError(err.message || "خطای ناشناخته در بارگذاری");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomer();
  }, [customerId]);

  // تغییر وضعیت سریع (فعال‌سازی، مسدود، و...)
  const handleQuickStatus = async (action: string) => {
    if (!confirm("آیا از انجام این عملیات اطمینان دارید؟")) return;
    try {
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        alert(json.error?.message || "خطا در تغییر وضعیت");
        return;
      }
      await loadCustomer();
    } catch {
      alert("خطا در ارتباط با سرور");
    }
  };

  // ارسال فرم ویرایش
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditBusy(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      const payload: any = {
        companyName: editForm.companyName.trim(),
        contactName: editForm.contactName.trim(),
        phone: editForm.phone.trim(),
        username: editForm.username.trim() || null,
        nationalId: editForm.nationalId.trim() || null,
        address: editForm.address.trim() || null,
        tierId: editForm.tierId || null,
        discountPercent: Number(editForm.discountPercent) || 0,
        creditLimitOverride:
          editForm.creditLimitOverride.trim() !== ""
            ? Number(editForm.creditLimitOverride)
            : null,
        status: editForm.status,
      };

      if (editForm.password.trim().length > 0) {
        if (editForm.password.trim().length < 6) {
          throw new Error("رمز عبور جدید باید حداقل ۶ کاراکتر باشد");
        }
        payload.password = editForm.password.trim();
      }

      const res = await fetch(`/api/admin/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || "خطا در ذخیره تغییرات");
      }

      setEditSuccess("مشخصات مشتری با موفقیت به‌روزرسانی شد");
      setTimeout(() => {
        setIsEditOpen(false);
        setEditSuccess(null);
      }, 1000);
      await loadCustomer();
    } catch (err: any) {
      setEditError(err.message || "خطای ناشناخته");
    } finally {
      setEditBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-stone-500">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        <p className="mt-4 text-sm font-medium">
          در حال واکشی اطلاعات پرونده ۳۶۰ درجه مشتری...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
        <p className="font-bold">خطا در بارگذاری پرونده مشتری</p>
        <p className="mt-1 text-sm">{error}</p>
        <button
          onClick={loadCustomer}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
        >
          تلاش مجدد
        </button>
      </div>
    );
  }

  const statusMap: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: "فعال و تایید شده", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    PENDING: { label: "در انتظار بررسی", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    BLOCKED: { label: "مسدود شده", cls: "bg-rose-50 text-rose-700 border-rose-200" },
    REJECTED: { label: "رد شده", cls: "bg-stone-100 text-stone-600 border-stone-300" },
  };

  return (
    <div className="space-y-6">
      {/* سرفصل و دکمه بازگشت */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <Link href="/admin" className="hover:text-amber-600">
              پنل مدیریت
            </Link>
            <span>/</span>
            <span>مدیریت مشتریان و همکاران</span>
            <span>/</span>
            <span className="font-bold text-stone-800">{data.companyName}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black text-stone-900">
              {data.companyName}
            </h1>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${
                statusMap[data.status]?.cls || "bg-stone-100 text-stone-600"
              }`}
            >
              {statusMap[data.status]?.label || data.status}
            </span>
            {data.tier && (
              <span className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-900 border border-amber-200">
                سطح: {data.tier.name}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-stone-500">
            <span>مسئول خرید: <strong className="text-stone-700">{data.contactName}</strong></span>
            <span>شماره تماس: <strong className="text-stone-700 font-mono" dir="ltr">{toFaDigits(data.phone)}</strong></span>
            {data.nationalId && <span>شناسه/کد ملی: <strong className="text-stone-700">{toFaDigits(data.nationalId)}</strong></span>}
            <span>تاریخ عضویت: {faDateTime(data.createdAt)}</span>
          </div>
        </div>

        {/* دکمه‌های اقدام سریع ادمین */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-stone-800 active:scale-95"
          >
            ✏️ ویرایش مشخصات و دسترسی
          </button>

          {data.status === "PENDING" && (
            <button
              onClick={() => handleQuickStatus("activate")}
              className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              ✓ تایید و فعال‌سازی
            </button>
          )}

          {data.status === "ACTIVE" && (
            <button
              onClick={() => handleQuickStatus("block")}
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
            >
              🚫 مسدود کردن حساب
            </button>
          )}

          {data.status === "BLOCKED" && (
            <button
              onClick={() => handleQuickStatus("unblock")}
              className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              ✓ رفع مسدودیت
            </button>
          )}
        </div>
      </div>

      {/* کارتهای KPI تحلیلی ۳۶۰ درجه (Finance & Behavior) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* ۱. خرید تاریخی کل */}
        <div className="rounded-2xl border border-stone-200/90 bg-gradient-to-br from-white to-stone-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
            <span>مجموع خرید تاریخی</span>
            <span className="text-base">💼</span>
          </div>
          <div className="mt-2 text-xl font-black text-stone-900">
            {formatToman(data.behavior.totalLifetimePurchase)}
          </div>
          <div className="mt-1 text-[11px] text-stone-500">
            {toFaDigits(data.behavior.paidOrdersCount)} فاکتور نهایی شده از کل {toFaDigits(data.behavior.totalOrdersCount)} سفارش
          </div>
        </div>

        {/* ۲. میانگین ارزش فاکتور (AOV) */}
        <div className="rounded-2xl border border-stone-200/90 bg-gradient-to-br from-white to-stone-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
            <span>میانگین ارزش سبد خرید (AOV)</span>
            <span className="text-base">📊</span>
          </div>
          <div className="mt-2 text-xl font-black text-stone-900">
            {formatToman(data.behavior.averageOrderValue)}
          </div>
          <div className="mt-1 text-[11px] text-stone-500">
            متوسط ارزش سفارش‌های قطعات یدکی
          </div>
        </div>

        {/* ۳. شیوه ترجیحی پرداخت */}
        <div className="rounded-2xl border border-stone-200/90 bg-gradient-to-br from-white to-stone-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
            <span>الگوی تسویه (اعتباری / نقدی)</span>
            <span className="text-base">💳</span>
          </div>
          <div className="mt-2 text-xl font-black text-amber-600">
            {toFaDigits(data.behavior.creditPreferenceRatio)}٪ <span className="text-xs text-stone-600 font-normal">اعتباری</span>
          </div>
          <div className="mt-1 text-[11px] text-stone-500">
            {toFaDigits(100 - data.behavior.creditPreferenceRatio)}٪ پرداخت نقد / آنلاین
          </div>
        </div>

        {/* ۴. موجودی کیف پول و اعتبار باز */}
        <div className="rounded-2xl border border-stone-200/90 bg-gradient-to-br from-white to-stone-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
            <span>کیف پول و اعتبار باز</span>
            <span className="text-base">🏦</span>
          </div>
          <div className="mt-2 text-xl font-black text-emerald-700">
            {formatToman(data.financials.availableCredit)}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-stone-500">
            <span>سقف کل: {formatToman(data.financials.creditLimit)}</span>
            <span>کیف پول: {formatToman(data.financials.wallet)}</span>
          </div>
        </div>
      </div>

      {/* تب‌های تفکیک اطلاعات پرونده */}
      <div className="border-b border-stone-200">
        <nav className="flex space-x-2 space-x-reverse">
          <button
            onClick={() => setActiveTab("searches")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${
              activeTab === "searches"
                ? "border-amber-600 text-amber-600"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <span>🔍 آمار و رفتار سرچ همکار</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              {toFaDigits(data.searchAnalytics.totalSearchesLogged)}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("orders")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${
              activeTab === "orders"
                ? "border-amber-600 text-amber-600"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <span>📄 فاکتورها و سوابق خرید</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
              {toFaDigits(data.orders.length)}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("products")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${
              activeTab === "products"
                ? "border-amber-600 text-amber-600"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <span>📦 قطعات پرمصرف و پرخرید</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
              {toFaDigits(data.behavior.topPurchasedProducts?.length || 0)}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("cheques")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${
              activeTab === "cheques"
                ? "border-amber-600 text-amber-600"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <span>📑 چک‌های صیادی</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
              {toFaDigits(data.cheques.length)}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("info")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${
              activeTab === "info"
                ? "border-amber-600 text-amber-600"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <span>🏢 مشخصات رسمی و نشانی</span>
          </button>
        </nav>
      </div>

      {/* محتوای تب ۱: تحلیل سرچ مشتری (Search Analytics & Intent) */}
      {activeTab === "searches" && (
        <div className="space-y-6">
          {/* کلمات کلیدی بیشترین سرچ */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <span>🔥 بیشترین قطعات و کلمات جستجو شده توسط این همکار</span>
              <span className="text-xs font-normal text-stone-500">
                (شناسایی دقیق نیاز و قطعات مدنظر مشتری جهت بازاریابی و فروش تلفنی)
              </span>
            </h3>

            {data.searchAnalytics.topSearchedKeywords.length === 0 ? (
              <p className="mt-4 text-xs text-stone-400">
                هنوز کلمه کلیدی با فراوانی مشخص ثبت نشده است. به محض اینکه همکار در کاتالوگ جستجو کند، کلمات پرتکرار در اینجا نمایش داده خواهند شد.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2.5">
                {data.searchAnalytics.topSearchedKeywords.map(
                  (item: { query: string; count: number }, idx: number) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
                    >
                      <span>🔎 {item.query}</span>
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-900">
                        {toFaDigits(item.count)} مرتبه
                      </span>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* لاگ زنده جستجوهای اخیر */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-stone-900 mb-3">
              تاریخچه ۲۰ جستجوی اخیر در فروشگاه
            </h3>

            {data.searchAnalytics.recentSearchLogs.length === 0 ? (
              <p className="text-xs text-stone-400">
                هیچ جستجویی ثبت نشده است.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 font-bold">
                      <th className="py-2.5 px-3">عبارت جستجو شده</th>
                      <th className="py-2.5 px-3">دسته‌بندی فیلتر شده</th>
                      <th className="py-2.5 px-3">برند خودرو / قطعه</th>
                      <th className="py-2.5 px-3">تعداد نتایج یافت شده</th>
                      <th className="py-2.5 px-3">زمان جستجو</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {data.searchAnalytics.recentSearchLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-stone-50/50">
                        <td className="py-2.5 px-3 font-bold text-stone-900">
                          {log.query || <span className="text-stone-400 font-normal">تمام کاتالوگ (فیلتر بدون متن)</span>}
                        </td>
                        <td className="py-2.5 px-3 text-stone-600">
                          {log.category || "-"}
                        </td>
                        <td className="py-2.5 px-3 text-stone-600">
                          {[log.brand, log.partBrand].filter(Boolean).join(" / ") || "-"}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${
                              log.resultsCount > 0
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {toFaDigits(log.resultsCount)} قلم کالا
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-stone-500 font-mono">
                          {faDateTime(log.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* محتوای تب ۲: فاکتورها و سفارش‌ها */}
      {activeTab === "orders" && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-stone-900 mb-4 flex items-center justify-between">
            <span>لیست تمام سفارش‌ها و پیش‌فاکتورها</span>
            <span className="text-xs text-stone-500 font-normal">
              کل فاکتورها: {toFaDigits(data.orders.length)} عدد
            </span>
          </h3>

          {data.orders.length === 0 ? (
            <p className="text-xs text-stone-400">
              هنوز هیچ سفارشی توسط این مشتری ثبت نشده است.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 font-bold">
                    <th className="py-3 px-3">شماره سفارش</th>
                    <th className="py-3 px-3">تاریخ ثبت</th>
                    <th className="py-3 px-3">مبلغ کل (تومان)</th>
                    <th className="py-3 px-3">شیوه پرداخت</th>
                    <th className="py-3 px-3">وضعیت مالی</th>
                    <th className="py-3 px-3">وضعیت ارسال / باربری</th>
                    <th className="py-3 px-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {data.orders.map((order: any) => {
                    return (
                      <tr key={order.id} className="hover:bg-amber-50/30 transition">
                        <td className="py-3 px-3 font-mono font-bold text-stone-900">
                          {order.number}
                        </td>
                        <td className="py-3 px-3 text-stone-500 font-mono">
                          {faDateTime(order.createdAt)}
                        </td>
                        <td className="py-3 px-3 font-bold text-stone-900">
                          {formatToman(order.total)}
                        </td>
                        <td className="py-3 px-3 text-stone-600">
                          {order.creditAmount > 0
                            ? `اعتباری (${formatToman(order.creditAmount)})`
                            : "نقدی / آنلاین"}
                        </td>
                        <td className="py-3 px-3">
                          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-bold text-stone-800">
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-stone-600">
                          {order.carrierName ? (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                              🚚 {order.carrierName}
                              {order.waybillNumber && ` (${order.waybillNumber})`}
                            </span>
                          ) : (
                            <span className="text-stone-400">در حال آماده‌سازی</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => setSelectedOrderId(order.id)}
                            className="rounded-lg bg-stone-900 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-stone-800"
                          >
                            مشاهده فاکتور و اقلام
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* محتوای تب ۳: قطعات پرمصرف و پرخرید */}
      {activeTab === "products" && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-stone-900 mb-4">
            تحلیل اقلام پرخرید همکار بر اساس سفارش‌های تایید شده
          </h3>

          {data.behavior.topPurchasedProducts.length === 0 ? (
            <p className="text-xs text-stone-400">
              هنوز کالایی به طور نهایی خریداری نشده است.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.behavior.topPurchasedProducts.map((p: any, idx: number) => (
                <div
                  key={idx}
                  className="rounded-xl border border-stone-200 p-4 transition hover:border-amber-300 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs text-stone-500 font-mono">
                    <span>کد کالا: {p.sku}</span>
                    <span className="font-bold text-amber-600">
                      رتبه {toFaDigits(idx + 1)}
                    </span>
                  </div>
                  <h4 className="mt-1 font-bold text-stone-900 text-sm">
                    {p.name}
                  </h4>
                  <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2 text-xs">
                    <span className="text-stone-600">
                      تعداد کل خریداری‌شده:
                    </span>
                    <span className="font-black text-stone-900 text-sm">
                      {toFaDigits(p.qty)} عدد
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-stone-500">
                    <span>تعداد دفعات تکرار در سفارش‌ها:</span>
                    <span>{toFaDigits(p.count)} بار</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* محتوای تب ۴: چک‌های صیادی */}
      {activeTab === "cheques" && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-stone-900 mb-4">
            چک‌های صیادی ثبت‌شده همکار در کاردو B2B
          </h3>

          {data.cheques.length === 0 ? (
            <p className="text-xs text-stone-400">
              هیچ چک صیادی برای این مشتری ثبت نشده است.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-600 font-bold">
                    <th className="py-2.5 px-3">شناسه ۱۶ رقمی صیاد</th>
                    <th className="py-2.5 px-3">بانک عامل</th>
                    <th className="py-2.5 px-3">مبلغ چک (تومان)</th>
                    <th className="py-2.5 px-3">تاریخ سررسید</th>
                    <th className="py-2.5 px-3">وضعیت وصول</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {data.cheques.map((ch: any) => (
                    <tr key={ch.id}>
                      <td className="py-2.5 px-3 font-mono font-bold text-stone-900" dir="ltr">
                        {ch.sayadNumber}
                      </td>
                      <td className="py-2.5 px-3 text-stone-700">{ch.bankName}</td>
                      <td className="py-2.5 px-3 font-bold text-stone-900">
                        {formatToman(ch.amount)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-stone-600">
                        {faDateTime(ch.dueDate)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700">
                          {ch.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* محتوای تب ۵: مشخصات ثبتی و نشانی */}
      {activeTab === "info" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-stone-900 border-b pb-2">
              مشخصات هویتی و ثبت سفارش
            </h3>
            <div className="flex justify-between text-xs py-1 border-b border-stone-100">
              <span className="text-stone-500">نام فروشگاه / شرکت:</span>
              <span className="font-bold text-stone-900">{data.companyName}</span>
            </div>
            <div className="flex justify-between text-xs py-1 border-b border-stone-100">
              <span className="text-stone-500">نام و نام خانوادگی مسئول:</span>
              <span className="font-bold text-stone-900">{data.contactName}</span>
            </div>
            <div className="flex justify-between text-xs py-1 border-b border-stone-100">
              <span className="text-stone-500">شماره موبایل:</span>
              <span className="font-mono font-bold text-stone-900" dir="ltr">{toFaDigits(data.phone)}</span>
            </div>
            <div className="flex justify-between text-xs py-1 border-b border-stone-100">
              <span className="text-stone-500">نام کاربری اختصاصی:</span>
              <span className="font-mono text-stone-800">{data.username || "ندارد (ورود با موبایل)"}</span>
            </div>
            <div className="flex justify-between text-xs py-1">
              <span className="text-stone-500">کد ملی / شناسه ملی:</span>
              <span className="font-mono font-bold text-stone-900">{data.nationalId ? toFaDigits(data.nationalId) : "ثبت نشده"}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-stone-900 border-b pb-2">
              نشانی ارسال و تنظیمات مالی
            </h3>
            <div className="text-xs">
              <span className="text-stone-500 block mb-1">آدرس پستی جهت ارسال بار و باربری:</span>
              <p className="rounded-xl bg-stone-50 p-3 text-stone-800 leading-relaxed">
                {data.address || "آدرسی ثبت نشده است."}
              </p>
            </div>
            <div className="flex justify-between text-xs py-1 border-b border-stone-100">
              <span className="text-stone-500">سطح قیمتی (Tier):</span>
              <span className="font-bold text-amber-700">{data.tier?.name || "پیش‌فرض"}</span>
            </div>
            <div className="flex justify-between text-xs py-1 border-b border-stone-100">
              <span className="text-stone-500">تخفیف سفارشی همکار:</span>
              <span className="font-bold text-stone-900">{toFaDigits(data.discountPercent)}٪</span>
            </div>
            <div className="flex justify-between text-xs py-1">
              <span className="text-stone-500">سقف اعتبار سفارشی:</span>
              <span className="font-bold text-stone-900">
                {data.creditLimitOverride !== null
                  ? formatToman(data.creditLimitOverride)
                  : "بر اساس سطح Tier"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* مودال مشاهده جزئیات سفارش */}
      {selectedOrderId && (
        <OrderDetailsModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          isAdmin={true}
          onStatusChanged={loadCustomer}
        />
      )}

      {/* مودال جامع ویرایش مشتری */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-black text-stone-900">
                ویرایش پرونده مشتری و تنظیمات اعتبار
              </h3>
              <button
                onClick={() => setIsEditOpen(false)}
                className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {editError}
              </div>
            )}

            {editSuccess && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                {editSuccess}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    نام فروشگاه / شرکت *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.companyName}
                    onChange={(e) =>
                      setEditForm({ ...editForm, companyName: e.target.value })
                    }
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    نام مسئول خرید *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.contactName}
                    onChange={(e) =>
                      setEditForm({ ...editForm, contactName: e.target.value })
                    }
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    شماره موبایل *
                  </label>
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({ ...editForm, phone: e.target.value })
                    }
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    نام کاربری (اختیاری)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={editForm.username}
                    onChange={(e) =>
                      setEditForm({ ...editForm, username: e.target.value })
                    }
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    کد ملی / شناسه ملی
                  </label>
                  <input
                    type="text"
                    value={editForm.nationalId}
                    onChange={(e) =>
                      setEditForm({ ...editForm, nationalId: e.target.value })
                    }
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    تغییر رمز عبور (در صورت نیاز به ریست)
                  </label>
                  <input
                    type="password"
                    placeholder="فقط در صورت تمایل به تغییر وارد کنید"
                    value={editForm.password}
                    onChange={(e) =>
                      setEditForm({ ...editForm, password: e.target.value })
                    }
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    سطح قیمتی (Tier)
                  </label>
                  <select
                    value={editForm.tierId}
                    onChange={(e) =>
                      setEditForm({ ...editForm, tierId: e.target.value })
                    }
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">پیش‌فرض</option>
                    {availableTiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} (تخفیف پایه: {toFaDigits(t.baseDiscount)}٪ - سقف اعتبار: {formatToman(t.creditLimit)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    تخفیف اضافی مشتری (درصد ۰ تا ۱۰۰)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editForm.discountPercent}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        discountPercent: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    سقف اعتبار اختصاصی (تومان - خالی برای ارث‌بری از Tier)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="مثلاً 50000000"
                    value={editForm.creditLimitOverride}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        creditLimitOverride: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    وضعیت حساب
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({ ...editForm, status: e.target.value })
                    }
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                  >
                    <option value="ACTIVE">فعال و تایید شده</option>
                    <option value="PENDING">در انتظار بررسی</option>
                    <option value="BLOCKED">مسدود شده</option>
                    <option value="REJECTED">رد شده</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  آدرس و اطلاعات ارسال باربری
                </label>
                <textarea
                  rows={2}
                  value={editForm.address}
                  onChange={(e) =>
                    setEditForm({ ...editForm, address: e.target.value })
                  }
                  className="w-full rounded-xl border border-stone-200 p-2.5 text-xs focus:border-amber-500 focus:outline-none"
                  placeholder="کرمان، خیابان ..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={editBusy}
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-stone-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {editBusy ? "در حال ذخیره..." : "ذخیره تغییرات"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
