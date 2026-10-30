"use client";

import { useEffect, useState } from "react";
import { formatToman, toFaDigits } from "@/lib/digits";
import { KERMAN_CITIES } from "@/lib/logistics";
import { TRANSFER_STATUS_MAP } from "@/lib/warehouse";

type WarehouseItem = {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  managerName: string | null;
  isCentral: boolean;
  isActive: boolean;
  productTypesCount: number;
  totalQuantity: number;
  totalReserved: number;
  availableQuantity: number;
};

type StockItem = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  partBrand: string | null;
  unit: string;
  price: number;
  quantity: number;
  reservedQty: number;
  availableQty: number;
  shelfLocation: string;
  minAlertQty: number;
};

type TransferItem = {
  id: string;
  number: string;
  fromWarehouse: { id: string; name: string; city: string; code: string };
  toWarehouse: { id: string; name: string; city: string; code: string };
  status: string;
  driverName: string | null;
  driverPhone: string | null;
  vehiclePlate: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  note: string | null;
  itemCount: number;
  items: { id: string; sku: string; name: string; qty: number; unit: string }[];
  createdAt: string;
};

export function WarehousesView() {
  const [tab, setTab] = useState<"warehouses" | "stocks" | "transfers">("warehouses");
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab 2: Stocks state
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [stockSearch, setStockSearch] = useState("");

  // Edit stock shelf modal
  const [editingStock, setEditingStock] = useState<StockItem | null>(null);
  const [newShelf, setNewShelf] = useState("");
  const [newQty, setNewQty] = useState(0);

  // Tab 3: Transfers state
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(false);

  // New transfer modal
  const [showNewTransferModal, setShowNewTransferModal] = useState(false);
  const [fromWh, setFromWh] = useState("");
  const [toWh, setToWh] = useState("");
  const [transferDriver, setTransferDriver] = useState("");
  const [transferPhone, setTransferPhone] = useState("");
  const [transferPlate, setTransferPlate] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferItems, setTransferItems] = useState<{ productId: string; qty: number; name: string; max: number }[]>([]);

  // Load initial warehouses
  async function loadWarehouses() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/warehouses");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در دریافت لیست انبارها");

      setWarehouses(data.warehouses || []);
      if (data.warehouses?.length > 0 && !selectedWarehouseId) {
        setSelectedWarehouseId(data.warehouses[0].id);
      }
    } catch (err: any) {
      setError(err.message || "ارتباط با سرور برقرار نشد");
    } finally {
      setLoading(false);
    }
  }

  async function loadStocks(whId: string, q = "") {
    if (!whId) return;
    setStocksLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/warehouses/${whId}?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setStocks(data.stocks || []);
      }
    } catch {
      // ignore
    } finally {
      setStocksLoading(false);
    }
  }

  async function loadTransfers() {
    setTransfersLoading(true);
    try {
      const res = await fetch("/api/admin/warehouses/transfers");
      const data = await res.json();
      if (res.ok) {
        setTransfers(data.transfers || []);
      }
    } catch {
      // ignore
    } finally {
      setTransfersLoading(false);
    }
  }

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    if (tab === "stocks" && selectedWarehouseId) {
      loadStocks(selectedWarehouseId, stockSearch);
    } else if (tab === "transfers") {
      loadTransfers();
    }
  }, [tab, selectedWarehouseId]);

  async function handleSaveStock(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStock || !selectedWarehouseId) return;
    try {
      const res = await fetch(`/api/admin/warehouses/${selectedWarehouseId}/stocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: editingStock.productId,
          quantity: newQty,
          shelfLocation: newShelf,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در به‌روزرسانی موجودی");

      setEditingStock(null);
      loadStocks(selectedWarehouseId, stockSearch);
      loadWarehouses();
    } catch (err: any) {
      alert(err.message || "خطا در ثبت");
    }
  }

  async function handleCreateTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!fromWh || !toWh) {
      alert("لطفاً انبار مبدأ و مقصد را انتخاب فرمایید");
      return;
    }
    if (transferItems.length === 0) {
      alert("حداقل یک قلم کالا باید برای انتقال انتخاب شود");
      return;
    }

    try {
      const res = await fetch("/api/admin/warehouses/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromWarehouseId: fromWh,
          toWarehouseId: toWh,
          driverName: transferDriver || undefined,
          driverPhone: transferPhone || undefined,
          vehiclePlate: transferPlate || undefined,
          note: transferNote || undefined,
          items: transferItems.map((it) => ({
            productId: it.productId,
            qty: it.qty,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در صدور حواله انتقال");

      setShowNewTransferModal(false);
      setTransferItems([]);
      loadTransfers();
    } catch (err: any) {
      alert(err.message || "خطا در ایجاد حواله");
    }
  }

  async function updateTransferStatus(transferId: string, status: string) {
    try {
      const res = await fetch(`/api/admin/warehouses/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در به‌روزرسانی وضعیت حواله");

      loadTransfers();
      loadWarehouses();
    } catch (err: any) {
      alert(err.message || "خطا در عملیات");
    }
  }

  return (
    <div className="space-y-6">
      {/* تب‌های پیمایش بالای صفحه */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          type="button"
          onClick={() => setTab("warehouses")}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all ${
            tab === "warehouses"
              ? "border-blue-600 text-blue-700 bg-blue-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          فهرست انبارها و هاب‌های کرمان ({toFaDigits(warehouses.length)})
        </button>
        <button
          type="button"
          onClick={() => setTab("stocks")}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all ${
            tab === "stocks"
              ? "border-blue-600 text-blue-700 bg-blue-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          موجودی و آدرس قفسه‌ها (Shelf Bins)
        </button>
        <button
          type="button"
          onClick={() => setTab("transfers")}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all ${
            tab === "transfers"
              ? "border-blue-600 text-blue-700 bg-blue-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          حواله‌های جابجایی بین‌انبار (Transfers)
        </button>
      </div>

      {/* تب ۱: کارت‌های انبارها */}
      {tab === "warehouses" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {warehouses.map((wh) => (
              <div
                key={wh.id}
                className="card p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-base text-slate-900">{wh.name}</span>
                      {wh.isCentral && (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
                          انبار مرکزی
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono nums mt-0.5">
                      کد انبار: <b>{wh.code}</b> · شهر: {wh.city}
                    </p>
                  </div>
                  <span className="size-3 rounded-full bg-emerald-500" title="انبار فعال"></span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <p>
                    <b className="text-slate-800">نشانی سوله:</b> {wh.address}
                  </p>
                  <p>
                    <b className="text-slate-800">سرپرست انبار:</b> {wh.managerName || "تعیین‌نشده"} ·{" "}
                    <span dir="ltr" className="font-mono nums">{wh.phone || "—"}</span>
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center text-xs">
                  <div>
                    <span className="text-slate-500">تنوع اقلام</span>
                    <p className="font-bold text-slate-800 mt-0.5 nums">{toFaDigits(wh.productTypesCount)} قلم</p>
                  </div>
                  <div>
                    <span className="text-slate-500">موجودی فیزیکی</span>
                    <p className="font-black text-slate-900 mt-0.5 nums">{toFaDigits(wh.totalQuantity)} عدد</p>
                  </div>
                  <div>
                    <span className="text-slate-500">آماده فروش</span>
                    <p className="font-black text-emerald-700 mt-0.5 nums">{toFaDigits(wh.availableQuantity)}</p>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedWarehouseId(wh.id);
                      setTab("stocks");
                    }}
                    className="btn btn-ghost px-3 py-1.5 text-xs text-blue-600 font-bold min-h-[36px]"
                  >
                    مشاهده قفسه‌ها و موجودی کالاها ←
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* تب ۲: موجودی قفسه‌ها */}
      {tab === "stocks" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold text-slate-700">انتخاب انبار:</label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="input text-xs px-3 py-1.5 border rounded-lg bg-white min-h-[38px] font-bold"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.city})
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="جستجو با کد فنی یا نام قطعه یا قفسه..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadStocks(selectedWarehouseId, stockSearch)}
                className="input text-xs px-3 py-1.5 border rounded-lg min-h-[38px] min-w-[220px]"
              >
              </input>

              <button
                type="button"
                onClick={() => loadStocks(selectedWarehouseId, stockSearch)}
                className="btn btn-ghost px-3 py-1.5 text-xs font-bold min-h-[38px]"
              >
                جستجو
              </button>
            </div>
          </div>

          {stocksLoading ? (
            <div className="p-8 text-center text-slate-500 text-sm">در حال بارگذاری اقلام قفسه‌های انبار...</div>
          ) : stocks.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm card bg-white">
              هیچ قطعه‌ای در این انبار ثبت نشده است.
            </div>
          ) : (
            <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-slate-700 font-bold">
                    <tr>
                      <th className="p-3">کد فنی (SKU)</th>
                      <th className="p-3">نام قطعه و مشخصات</th>
                      <th className="p-3">خودرو</th>
                      <th className="p-3">موقعیت فیزیکی قفسه</th>
                      <th className="p-3 text-center">موجودی فیزیکی</th>
                      <th className="p-3 text-center">رزرو</th>
                      <th className="p-3 text-center text-blue-700 font-bold">قابل فروش</th>
                      <th className="p-3 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stocks.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/70">
                        <td className="p-3 font-mono font-bold text-slate-800 nums">{s.sku}</td>
                        <td className="p-3 font-bold text-slate-900">{s.name}</td>
                        <td className="p-3 text-slate-600">{s.brand}</td>
                        <td className="p-3">
                          <span className="font-mono bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded font-bold">
                            {s.shelfLocation}
                          </span>
                        </td>
                        <td className="p-3 text-center nums font-bold text-slate-900">
                          {toFaDigits(s.quantity)} {s.unit}
                        </td>
                        <td className="p-3 text-center nums text-amber-700">{toFaDigits(s.reservedQty)}</td>
                        <td className="p-3 text-center nums font-black text-emerald-700">
                          {toFaDigits(s.availableQty)} {s.unit}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStock(s);
                              setNewShelf(s.shelfLocation);
                              setNewQty(s.quantity);
                            }}
                            className="btn btn-ghost px-2.5 py-1 text-xs text-blue-600 font-bold"
                          >
                            تغییر قفسه / شمارش
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* تب ۳: حواله‌های جابجایی بین انبارها */}
      {tab === "transfers" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h2 className="text-sm font-bold text-slate-800">حواله‌های جابجایی کالا بین انبارهای استان کرمان</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تأمین و جابجایی کالا از انبار مرکزی به انبارهای منطقه‌ای رفسنجان، سیرجان و جیرفت با بارنامه داخلی
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (warehouses.length >= 2) {
                  setFromWh(warehouses[0].id);
                  setToWh(warehouses[1].id);
                  // Load source warehouse stocks to pick items from
                  const res = await fetch(`/api/admin/warehouses/${warehouses[0].id}`);
                  const data = await res.json();
                  if (data.stocks?.length > 0) {
                    const first = data.stocks[0];
                    setTransferItems([
                      { productId: first.productId, qty: 1, name: first.name, max: first.availableQty },
                    ]);
                  }
                }
                setShowNewTransferModal(true);
              }}
              className="btn btn-blue px-4 py-2 text-xs font-bold min-h-[44px] flex items-center gap-1.5 shadow-xs"
            >
              <span>+</span>
              <span>صدور حواله انتقال جدید</span>
            </button>
          </div>

          {transfersLoading ? (
            <div className="p-8 text-center text-slate-500 text-sm">در حال بارگذاری حواله‌های انتقال...</div>
          ) : transfers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm card bg-white">
              تاکنون حواله جابجایی بین انبارها صادر نشده است.
            </div>
          ) : (
            <div className="space-y-3">
              {transfers.map((t) => {
                const st = TRANSFER_STATUS_MAP[t.status] || {
                  label: t.status,
                  badgeClass: "bg-slate-100 text-slate-700",
                };

                return (
                  <div key={t.id} className="card p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="nums font-extrabold text-sm text-slate-900">{t.number}</span>
                          <span className="text-xs text-slate-400">|</span>
                          <span className="text-xs text-slate-700 font-bold">
                            از {t.fromWarehouse.name} به {t.toWarehouse.name}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          مجموع اقلام: <b className="text-slate-800 nums font-bold">{toFaDigits(t.itemCount)} قطعه</b> · راننده: {t.driverName || "تعیین‌نشده"}
                          {t.vehiclePlate && ` (پلاک: ${t.vehiclePlate})`}
                        </p>
                      </div>
                      <div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${st.badgeClass}`}>
                          {st.label}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                      <span className="text-slate-500 font-bold">اقلام حواله:</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {t.items.map((it) => (
                          <span key={it.id} className="bg-white px-2 py-1 rounded border border-slate-200 text-slate-800">
                            {it.name} ({it.sku}): <b className="nums text-blue-700">{toFaDigits(it.qty)} {it.unit}</b>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                      <span className="text-slate-400 nums">
                        صدور: {new Date(t.createdAt).toLocaleDateString("fa-IR")}
                        {t.dispatchedAt && ` · خروج از مبدأ: ${new Date(t.dispatchedAt).toLocaleDateString("fa-IR")}`}
                        {t.receivedAt && ` · وصول به مقصد: ${new Date(t.receivedAt).toLocaleDateString("fa-IR")}`}
                      </span>

                      <div className="flex items-center gap-2">
                        {t.status === "DRAFT" && (
                          <button
                            type="button"
                            onClick={() => updateTransferStatus(t.id, "IN_TRANSIT")}
                            className="btn btn-blue px-3 py-1.5 text-xs font-bold min-h-[36px]"
                          >
                            تأیید خروج از مبدأ و تحویل به راننده
                          </button>
                        )}
                        {t.status === "IN_TRANSIT" && (
                          <button
                            type="button"
                            onClick={() => updateTransferStatus(t.id, "RECEIVED")}
                            className="btn btn-emerald px-3 py-1.5 text-xs font-bold min-h-[36px]"
                          >
                            تأیید تخلیه و شارژ موجودی انبار مقصد
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* مدال ۱: ویرایش موقعیت قفسه و شمارش انبار */}
      {editingStock && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">
                تنظیم قفسه و شمارش موجودی: {editingStock.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingStock(null)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStock} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  آدرس و لوکیشن فیزیکی قفسه (Aisle / Shelf / Bin)
                </label>
                <input
                  type="text"
                  placeholder="مثال: قفسه B-04-2 (راهرو B، ردیف ۴، طبقه ۲)"
                  value={newShelf}
                  onChange={(e) => setNewShelf(e.target.value)}
                  className="w-full input px-3 py-2 border rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  موجودی فیزیکی شمارش‌شده در این انبار ({editingStock.unit})
                </label>
                <input
                  type="number"
                  min={0}
                  value={newQty}
                  onChange={(e) => setNewQty(Number(e.target.value))}
                  className="w-full input px-3 py-2 border rounded-lg font-bold text-center nums text-blue-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingStock(null)}
                  className="btn btn-ghost px-4 py-2"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn btn-blue px-5 py-2 font-bold min-h-[40px]"
                >
                  ذخیره تغییرات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مدال ۲: صدور حواله انتقال جدید */}
      {showNewTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">
                صدور حواله انتقال بین انبارها
              </h3>
              <button
                type="button"
                onClick={() => setShowNewTransferModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">انبار مبدأ</label>
                  <select
                    value={fromWh}
                    onChange={(e) => setFromWh(e.target.value)}
                    className="w-full input px-3 py-2 border rounded-lg font-bold"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">انبار مقصد</label>
                  <select
                    value={toWh}
                    onChange={(e) => setToWh(e.target.value)}
                    className="w-full input px-3 py-2 border rounded-lg font-bold"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">نام راننده حامل</label>
                  <input
                    type="text"
                    placeholder="مثال: آقای کریمی"
                    value={transferDriver}
                    onChange={(e) => setTransferDriver(e.target.value)}
                    className="w-full input px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">شماره پلاک خودرو</label>
                  <input
                    type="text"
                    placeholder="مثال: ۴۵ ایران ۶۵۸ ب ۱۲"
                    value={transferPlate}
                    onChange={(e) => setTransferPlate(e.target.value)}
                    className="w-full input px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <span className="font-bold text-slate-800">اقلام انتقالی:</span>
                {transferItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-lg border">
                    <span className="font-bold text-slate-800 truncate">{item.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-500">تعداد:</span>
                      <input
                        type="number"
                        min={1}
                        max={item.max}
                        value={item.qty}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setTransferItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, qty: val } : it))
                          );
                        }}
                        className="input w-20 px-2 py-1 text-center font-bold nums border rounded"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">یادداشت حواله</label>
                <input
                  type="text"
                  placeholder="توضیحات تکمیلی یا شماره بارنامه ترانزیت"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  className="w-full input px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewTransferModal(false)}
                  className="btn btn-ghost px-4 py-2"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn btn-blue px-5 py-2 font-bold min-h-[40px]"
                >
                  صدور و تأیید پیش‌نویس حواله
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
