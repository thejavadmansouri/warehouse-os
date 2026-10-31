"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatToman, toFaDigits, numberToTomanWords } from "@/lib/digits";
import { faDateTime } from "@/lib/date";
import { OrderProgressBar } from "./order-progress-bar";

export interface OrderDetailsModalProps {
  orderId: string | null;
  onClose: () => void;
  isAdmin?: boolean;
  onStatusChanged?: () => void;
}

export function OrderDetailsModal({
  orderId,
  onClose,
  isAdmin = false,
  onStatusChanged,
}: OrderDetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // فرم ثبت بیجک و باربری در گام ۸۰٪
  const [carrierName, setCarrierName] = useState("");
  const [waybillNumber, setWaybillNumber] = useState("");
  const [showShippingForm, setShowShippingForm] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      return;
    }

    setLoading(true);
    setError(null);
    fetch(`/api/orders/${orderId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.order) {
          setOrder(data.order);
          if (data.order.shipment) {
            setCarrierName(data.order.shipment.carrierName || "باربری پیام شمس کرمان");
            setWaybillNumber(data.order.shipment.waybillNumber || "");
          }
        } else {
          setError(data.message || "خطا در واکشی اطلاعات فاکتور");
        }
      })
      .catch(() => setError("عدم برقراری ارتباط با سرور"))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (!orderId) return null;

  async function handleAdminAction(
    action: "approve_credit" | "reject" | "set_preparing" | "set_shipped" | "set_delivered"
  ) {
    if (!order) return;
    setActionBusy(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          carrierName: carrierName || undefined,
          waybillNumber: waybillNumber || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.message || "عملیات با خطا مواجه شد");
        return;
      }

      // بارگذاری مجدد داده‌های این فاکتور
      const ref = await fetch(`/api/orders/${order.id}`);
      const refreshed = await ref.json();
      if (refreshed.ok) {
        setOrder(refreshed.order);
      }
      setShowShippingForm(false);
      onStatusChanged?.();
    } catch {
      setActionError("خطا در ارسال درخواست به سرور");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      {/* کادر اصلی مودال فاکتور */}
      <div
        className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* نوار سربرگ مودال */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <span className="size-9 rounded-xl bg-slate-900 text-white grid place-items-center font-bold text-sm shadow-xs">
              📄
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-slate-900 nums">
                  فاکتور شماره {order?.number || "..."}
                </h3>
                {order && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-800">
                    {order.status === "PAID"
                      ? "تسویه شده"
                      : order.status === "APPROVED_CREDIT"
                      ? "اعتباری تأییدشده"
                      : order.status === "AWAITING_CREDIT_APPROVAL"
                      ? "در انتظار تأیید اعتبار"
                      : "پیش‌فاکتور"}
                  </span>
                )}
              </div>
              {order && (
                <p className="text-xs text-slate-500 mt-0.5">
                  ثبت: {faDateTime(order.createdAt)} · خریدار: {order.customer?.companyName || "همکار"}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="size-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 grid place-items-center transition-colors"
            title="بستن"
          >
            ✕
          </button>
        </div>

        {/* محتوای بدنه اسکرول‌شونده فاکتور */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading && (
            <div className="py-16 text-center space-y-3">
              <div className="size-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-medium">در حال واکشی اقلام و جزئیات سند...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold text-center">
              {error}
            </div>
          )}

          {!loading && order && (
            <>
              {/* ۱. نوار پیشرفت زنده تحویل کالا (۲۰٪ تا ۱۰۰٪) */}
              <OrderProgressBar
                orderStatus={order.status}
                shipmentStatus={order.shipment?.status}
                paidAt={order.paidAt}
                shippedAt={order.shipment?.shippedAt}
                deliveredAt={order.shipment?.deliveredAt}
                waybillNumber={order.shipment?.waybillNumber}
                carrierName={order.shipment?.carrierName}
              />

              {/* ۲. بخش ابزار اختصاصی مدیر و انباردار جهت جلو بردن مراحل فاکتور */}
              {isAdmin && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-amber-600 animate-pulse" />
                      <span className="text-xs font-bold text-amber-950">
                        پنل مدیریت مراحل لجستیک و انبار کاردو
                      </span>
                    </div>
                    {actionBusy && (
                      <span className="text-[11px] text-amber-700 font-bold animate-pulse">
                        در حال اعمال تغییرات...
                      </span>
                    )}
                  </div>

                  {actionError && (
                    <div className="p-2 rounded-lg bg-rose-100 text-rose-800 text-xs font-bold">
                      {actionError}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {order.status === "AWAITING_CREDIT_APPROVAL" && (
                      <button
                        onClick={() => handleAdminAction("approve_credit")}
                        disabled={actionBusy}
                        className="btn btn-brass text-xs px-3.5 py-2 font-bold"
                      >
                        ✓ تأیید خرید اعتباری (۲۰٪)
                      </button>
                    )}

                    {(!order.shipment || order.shipment.status === "PREPARING") && (
                      <button
                        onClick={() => handleAdminAction("set_preparing")}
                        disabled={actionBusy}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-xs transition-colors"
                      >
                        📦 شروع جمع‌آوری در انبار مرکزی (۵۰٪)
                      </button>
                    )}

                    <button
                      onClick={() => setShowShippingForm(!showShippingForm)}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors"
                    >
                      🚚 ثبت بیجک و تحویل باربری (۸۰٪)
                    </button>

                    <button
                      onClick={() => handleAdminAction("set_delivered")}
                      disabled={actionBusy}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
                    >
                      ✅ ثبت تحویل قطعی به مشتری (۱۰۰٪)
                    </button>
                  </div>

                  {/* فرم ثبت اطلاعات بارنامه باربری */}
                  {showShippingForm && (
                    <div className="mt-3 p-3 rounded-xl bg-white border border-blue-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-600 font-medium mb-1">نام شرکت باربری یا پیک:</label>
                        <input
                          type="text"
                          value={carrierName}
                          onChange={(e) => setCarrierName(e.target.value)}
                          placeholder="مثلاً: باربری پیام شمس، پیشتاز، پیک شهری کرمان..."
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-medium mb-1">شماره بیجک / شماره بارنامه:</label>
                        <input
                          type="text"
                          value={waybillNumber}
                          onChange={(e) => setWaybillNumber(e.target.value)}
                          placeholder="مثلاً: BJ-98432"
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                        <button
                          onClick={() => setShowShippingForm(false)}
                          className="px-3 py-1 rounded-lg border text-slate-600 hover:bg-slate-100"
                        >
                          انصراف
                        </button>
                        <button
                          onClick={() => handleAdminAction("set_shipped")}
                          disabled={actionBusy}
                          className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-bold"
                        >
                          ثبت نهایی و ارسال نوتیفیکیشن بیجک (۸۰٪)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ۳. جدول اقلام سفارش */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-slate-900">
                    اقلام و قطعات فاکتور ({toFaDigits(order.items.length)} ردیف)
                  </h4>
                  <span className="text-xs text-slate-500 font-medium nums">
                    مجموع قطعات: {toFaDigits(order.items.reduce((s: number, i: any) => s + i.qty, 0))} عدد
                  </span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <tr>
                        <th className="py-2.5 px-3">ردیف</th>
                        <th className="py-2.5 px-3">قطعه</th>
                        <th className="py-2.5 px-3">کد فنی</th>
                        <th className="py-2.5 px-3">تعداد</th>
                        <th className="py-2.5 px-3">قیمت واحد (همکار)</th>
                        <th className="py-2.5 px-3">جمع کل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {order.items.map((it: any, idx: number) => (
                        <tr key={it.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3 nums text-slate-400 font-bold">{toFaDigits(idx + 1)}</td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{it.name}</div>
                            {it.brand && (
                              <span className="text-[10px] text-slate-400">خودرو: {it.brand}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-600">{it.sku}</td>
                          <td className="py-3 px-3 font-bold nums">
                            {toFaDigits(it.qty)} <span className="text-[10px] text-slate-400">{it.unit}</span>
                          </td>
                          <td className="py-3 px-3 nums text-slate-700">{formatToman(it.unitPrice)}</td>
                          <td className="py-3 px-3 nums font-extrabold text-slate-900">
                            {formatToman(it.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ۴. خلاصه مبالغ فاکتور */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
                <div className="text-xs text-slate-500 space-y-1">
                  <div>روش ارسال: <b>{order.shipping?.name || "باربری کرمان"}</b></div>
                  {order.discountTotal > 0 && (
                    <div className="text-emerald-700">
                      تخفیف کل همکار: <b>{formatToman(order.discountTotal)}</b>
                    </div>
                  )}
                </div>

                <div className="text-left">
                  <div className="text-xs text-slate-500">مبلغ نهایی قابل پرداخت:</div>
                  <div className="text-lg sm:text-xl font-black text-slate-900 nums">
                    {formatToman(order.total)}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {numberToTomanWords(order.total)}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* پاورقی مودال — دکمه‌های پرینت و رفتن به صفحه کامل */}
        {order && (
          <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/orders/${order.id}`}
                className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold transition-colors"
              >
                مشاهده صفحه کامل سند ↗
              </Link>
              <Link
                href={`/invoice/${order.publicToken}`}
                target="_blank"
                className="px-3.5 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors"
              >
                نسخه چاپی A4 🖨️
              </Link>
              <Link
                href={`/orders/${order.id}/tax-invoice`}
                target="_blank"
                className="px-3.5 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-colors"
              >
                صورت‌حساب مودیان 📄
              </Link>
              <Link
                href={`/orders/${order.id}/shipping-label`}
                target="_blank"
                className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors"
              >
                برچسب کارتن باربری 🏷️
              </Link>
            </div>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
            >
              بستن پنجره
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
