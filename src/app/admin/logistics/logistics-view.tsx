"use client";

import { useEffect, useState } from "react";
import { formatToman, toFaDigits } from "@/lib/digits";
import { KERMAN_CITIES, CARRIER_OPTIONS, SHIPMENT_STATUS_MAP, FREIGHT_PAYMENT_LABELS } from "@/lib/logistics";

type PendingOrder = {
  id: string;
  number: string;
  status: string;
  total: number;
  companyName: string;
  phone: string;
  address: string | null;
  createdAt: string;
};

type ShipmentItem = {
  id: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  customerName: string;
  customerContact: string;
  customerPhone: string;
  itemCount: number;
  itemsSummary: string;
  carrierName: string;
  carrierPhone: string | null;
  waybillNumber: string | null;
  destinationCity: string;
  destinationAddress: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  freightPaymentType: string;
  freightCost: number | null;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  adminNote: string | null;
  createdAt: string;
};

export function LogisticsView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalPreparing: 0,
    totalShipped: 0,
    totalDelivered: 0,
    pendingOrdersCount: 0,
  });
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [shipments, setShipments] = useState<ShipmentItem[]>([]);

  // Filters
  const [selectedCity, setSelectedCity] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal for new shipment
  const [targetOrder, setTargetOrder] = useState<PendingOrder | null>(null);
  const [carrierName, setCarrierName] = useState<string>(CARRIER_OPTIONS[0].name);
  const [carrierPhone, setCarrierPhone] = useState<string>(CARRIER_OPTIONS[0].phone);
  const [destinationCity, setDestinationCity] = useState("کرمان");
  const [waybillNumber, setWaybillNumber] = useState("");
  const [freightPaymentType, setFreightPaymentType] = useState("PAY_ON_DELIVERY");
  const [adminNote, setAdminNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Modal for updating status (e.g. adding waybill to preparing shipment)
  const [editingShipment, setEditingShipment] = useState<ShipmentItem | null>(null);
  const [editWaybill, setEditWaybill] = useState("");
  const [editStatus, setEditStatus] = useState("HANDED_TO_CARRIER");
  const [editAdminNote, setEditAdminNote] = useState("");

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedCity !== "ALL") params.set("city", selectedCity);
      if (selectedStatus !== "ALL") params.set("status", selectedStatus);
      if (searchQuery) params.set("q", searchQuery);

      const res = await fetch(`/api/admin/shipments?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در بارگذاری اطلاعات لجستیک");

      setStats(data.stats);
      setPendingOrders(data.pendingOrdersWithoutShipment || []);
      setShipments(data.shipments || []);
    } catch (err: any) {
      setError(err.message || "ارتباط با سرور برقرار نشد");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedCity, selectedStatus]);

  async function handleCreateShipment(e: React.FormEvent) {
    e.preventDefault();
    if (!targetOrder) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: targetOrder.id,
          carrierName,
          carrierPhone,
          destinationCity,
          waybillNumber: waybillNumber || undefined,
          freightPaymentType,
          adminNote: adminNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در ثبت حواله");

      setTargetOrder(null);
      setWaybillNumber("");
      setAdminNote("");
      loadData();
    } catch (err: any) {
      alert(err.message || "خطا در صدور حواله");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateShipment(e: React.FormEvent) {
    e.preventDefault();
    if (!editingShipment) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/shipments/${editingShipment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editStatus,
          waybillNumber: editWaybill || editingShipment.waybillNumber || undefined,
          adminNote: editAdminNote || editingShipment.adminNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در به‌روزرسانی حواله");

      setEditingShipment(null);
      loadData();
    } catch (err: any) {
      alert(err.message || "خطا در ویرایش");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* آمار بالاسری */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 border-amber-200 bg-amber-50/50">
          <p className="text-xs text-amber-800 font-medium">سفارش‌های منتظر صدور حواله</p>
          <p className="text-2xl font-black text-amber-900 mt-1 nums">{toFaDigits(stats.pendingOrdersCount)}</p>
        </div>
        <div className="card p-4 border-blue-200 bg-blue-50/50">
          <p className="text-xs text-blue-800 font-medium">در حال آماده‌سازی در انبار</p>
          <p className="text-2xl font-black text-blue-900 mt-1 nums">{toFaDigits(stats.totalPreparing)}</p>
        </div>
        <div className="card p-4 border-indigo-200 bg-indigo-50/50">
          <p className="text-xs text-indigo-800 font-medium">تحویل باربری (در مسیر شهرستان)</p>
          <p className="text-2xl font-black text-indigo-900 mt-1 nums">{toFaDigits(stats.totalShipped)}</p>
        </div>
        <div className="card p-4 border-emerald-200 bg-emerald-50/50">
          <p className="text-xs text-emerald-800 font-medium">تحویل قطعی به مشتری</p>
          <p className="text-2xl font-black text-emerald-900 mt-1 nums">{toFaDigits(stats.totalDelivered)}</p>
        </div>
      </div>

      {/* بخش ۱: سفارش‌های تسویه‌شده آماده صدور حواله باربری */}
      {pendingOrders.length > 0 && (
        <div className="card p-4 sm:p-5 border-amber-200 bg-white shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              <span>سفارش‌های تسویه‌شده جدید — نیازمند صدور بیجک باربری ({toFaDigits(pendingOrders.length)})</span>
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingOrders.map((o) => (
              <div key={o.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="nums font-extrabold text-sm text-slate-900">{o.number}</span>
                    <span className="text-xs text-slate-700 font-medium">{o.companyName}</span>
                    <span className="text-xs text-slate-400 font-mono nums" dir="ltr">{o.phone}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    مبلغ: <span className="nums font-bold text-slate-800">{formatToman(o.total)} ت</span> · آدرس: {o.address || "نامشخص"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTargetOrder(o);
                    setCarrierName(CARRIER_OPTIONS[0].name);
                    setCarrierPhone(CARRIER_OPTIONS[0].phone);
                    setDestinationCity("کرمان");
                  }}
                  className="btn btn-blue px-3.5 py-1.5 text-xs font-bold whitespace-nowrap min-h-[40px]"
                >
                  صدور حواله باربری / پیک
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* بخش ۲: فیلترها و جستجو */}
      <div className="card p-4 bg-white shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="جستجو بر اساس شماره بیجک، شماره فاکتور، نام مشتری یا باربری..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadData()}
              className="w-full text-xs input px-3 py-2 border border-slate-300 rounded-lg min-h-[42px]"
            />
          </div>

          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white min-h-[42px]"
          >
            <option value="ALL">همه شهرهای مقصد (استان کرمان)</option>
            {KERMAN_CITIES.map((c) => (
              <option key={c} value={c}>
                مقصد: {c}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white min-h-[42px]"
          >
            <option value="ALL">همه وضعیت‌های ارسال</option>
            <option value="PREPARING">در حال بسته‌بندی در انبار</option>
            <option value="HANDED_TO_CARRIER">تحویل باربری (در مسیر)</option>
            <option value="DELIVERED">تحویل شده به همکار</option>
            <option value="CANCELLED">لغو شده</option>
          </select>

          <button
            type="button"
            onClick={loadData}
            className="btn btn-ghost px-4 py-2 text-xs font-bold min-h-[42px]"
          >
            اعمال فیلتر
          </button>
        </div>
      </div>

      {/* بخش ۳: لیست حواله‌ها و بیجک‌های صادرشده */}
      {loading ? (
        <div className="p-8 text-center text-slate-500 text-sm">در حال بارگذاری لیست محموله‌ها...</div>
      ) : error ? (
        <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">{error}</div>
      ) : shipments.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-sm card bg-white">
          هیچ حواله ارسالی با این مشخصات یافت نشد.
        </div>
      ) : (
        <div className="space-y-3">
          {shipments.map((s) => {
            const st = SHIPMENT_STATUS_MAP[s.status] || {
              label: s.status,
              badgeClass: "bg-slate-100 text-slate-700",
            };

            return (
              <div key={s.id} className="card p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="nums font-extrabold text-sm text-slate-900">سند {s.orderNumber}</span>
                      <span className="text-xs font-bold text-slate-700">{s.customerName}</span>
                      <span className="text-xs text-slate-400 nums font-mono" dir="ltr">{s.customerPhone}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      مقصد: <b className="text-blue-700 font-bold">{s.destinationCity}</b> · اقلام: {toFaDigits(s.itemCount)} قلم ({s.itemsSummary})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${st.badgeClass}`}>
                      {st.label}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50/70 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-500">حامل / باربری:</span>
                    <p className="font-bold text-slate-800 mt-0.5">{s.carrierName}</p>
                    {s.carrierPhone && <p className="text-slate-400 font-mono nums mt-0.5">{s.carrierPhone}</p>}
                  </div>

                  <div>
                    <span className="text-slate-500">شماره بیجک / بارنامه:</span>
                    <p className="font-extrabold text-sm text-indigo-700 mt-0.5 nums">
                      {s.waybillNumber ? toFaDigits(s.waybillNumber) : "هنوز ثبت نشده"}
                    </p>
                    <p className="text-slate-400 text-[11px] mt-0.5">{FREIGHT_PAYMENT_LABELS[s.freightPaymentType] || s.freightPaymentType}</p>
                  </div>

                  <div>
                    <span className="text-slate-500">یادداشت ارسال:</span>
                    <p className="text-slate-700 mt-0.5">{s.adminNote || "—"}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                  <span className="text-slate-400 nums">
                    ثبت حواله: {new Date(s.createdAt).toLocaleDateString("fa-IR")}
                    {s.shippedAt && ` · خروج از انبار: ${new Date(s.shippedAt).toLocaleDateString("fa-IR")}`}
                    {s.deliveredAt && ` · تحویل: ${new Date(s.deliveredAt).toLocaleDateString("fa-IR")}`}
                  </span>

                  <div className="flex items-center gap-2">
                    {s.status === "PREPARING" && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingShipment(s);
                          setEditWaybill(s.waybillNumber || "");
                          setEditStatus("HANDED_TO_CARRIER");
                          setEditAdminNote(s.adminNote || "");
                        }}
                        className="btn btn-blue px-3 py-1.5 text-xs font-bold min-h-[36px]"
                      >
                        ثبت بیجک و تحویل باربری
                      </button>
                    )}
                    {s.status === "HANDED_TO_CARRIER" && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingShipment(s);
                          setEditWaybill(s.waybillNumber || "");
                          setEditStatus("DELIVERED");
                          setEditAdminNote(s.adminNote || "");
                        }}
                        className="btn btn-emerald px-3 py-1.5 text-xs font-bold min-h-[36px]"
                      >
                        ثبت تحویل نهایی به همکار
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* مدال ۱: صدور حواله جدید برای سفارش */}
      {targetOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">
                صدور حواله باربری برای سفارش {targetOrder.number}
              </h3>
              <button
                type="button"
                onClick={() => setTargetOrder(null)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateShipment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">شرکت باربری / روش ارسال</label>
                <select
                  value={carrierName}
                  onChange={(e) => {
                    const sel = CARRIER_OPTIONS.find((c) => c.name === e.target.value);
                    setCarrierName(e.target.value);
                    if (sel) setCarrierPhone(sel.phone);
                  }}
                  className="w-full input px-3 py-2 border rounded-lg"
                >
                  {CARRIER_OPTIONS.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.hub})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">شهرستان مقصد (استان کرمان)</label>
                  <select
                    value={destinationCity}
                    onChange={(e) => setDestinationCity(e.target.value)}
                    className="w-full input px-3 py-2 border rounded-lg"
                  >
                    {KERMAN_CITIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">نوع تسویه کرایه باربری</label>
                  <select
                    value={freightPaymentType}
                    onChange={(e) => setFreightPaymentType(e.target.value)}
                    className="w-full input px-3 py-2 border rounded-lg"
                  >
                    <option value="PAY_ON_DELIVERY">پس‌کرایه (تحویل در مقصد)</option>
                    <option value="PREPAID">پیش‌کرایه (روی فاکتور)</option>
                    <option value="FREE_SHIPPING">ارسال رایگان</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">شماره بیجک یا بارنامه (اختیاری در لحظه صدور حواله)</label>
                <input
                  type="text"
                  placeholder="مثلاً: ۹۸۴۲۱-شمس"
                  value={waybillNumber}
                  onChange={(e) => setWaybillNumber(e.target.value)}
                  className="w-full input px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">یادداشت برای راننده یا انباردار</label>
                <input
                  type="text"
                  placeholder="مثلاً: شامل ۳ کارتن سنگین لنت و دیسک، تحویل نمایندگی رفسنجان"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full input px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setTargetOrder(null)}
                  className="btn btn-ghost px-4 py-2"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-blue px-5 py-2 font-bold"
                >
                  {submitting ? "در حال صدور..." : "تأیید و صدور حواله ارسال"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مدال ۲: به‌روزرسانی بیجک و تحویل به باربری */}
      {editingShipment && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">
                به‌روزرسانی بیجک و وضعیت حواله {editingShipment.orderNumber}
              </h3>
              <button
                type="button"
                onClick={() => setEditingShipment(null)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateShipment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">وضعیت جدید محموله</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full input px-3 py-2 border rounded-lg"
                >
                  <option value="PREPARING">در حال بسته‌بندی در انبار مرکزی</option>
                  <option value="HANDED_TO_CARRIER">تحویل باربری گردید (ثبت بیجک)</option>
                  <option value="DELIVERED">تحویل قطعی شد به مشتری</option>
                  <option value="CANCELLED">لغو ارسال</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">شماره بیجک / بارنامه باربری</label>
                <input
                  type="text"
                  placeholder="شماره روی قبض بیجک باربری"
                  value={editWaybill}
                  onChange={(e) => setEditWaybill(e.target.value)}
                  className="w-full input px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">یادداشت اداری</label>
                <input
                  type="text"
                  placeholder="توضیحات تکمیلی یا شماره تماس راننده"
                  value={editAdminNote}
                  onChange={(e) => setEditAdminNote(e.target.value)}
                  className="w-full input px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingShipment(null)}
                  className="btn btn-ghost px-4 py-2"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-blue px-5 py-2 font-bold"
                >
                  {submitting ? "در حال ثبت..." : "ذخیره تغییرات"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
