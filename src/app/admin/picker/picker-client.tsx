"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toFaDigits } from "@/lib/digits";

interface PickItem {
  id: string;
  productId: string;
  sku: string;
  name: string;
  qty: number;
  shelfLocation: string;
  barcode: string;
  partBrand: string | null;
  brand: string;
  model: string | null;
}

interface PickOrder {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerCity: string;
  carrierName: string;
  itemCount: number;
  items: PickItem[];
}

export function PickerClient() {
  const [pickLists, setPickLists] = useState<PickOrder[]>([]);
  const [activeOrderIndex, setActiveOrderIndex] = useState(0);
  const [warehouseName, setWarehouseName] = useState("انبار مرکزی کرمان");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // وضعیت جمع‌آوری اقلام (کد ردیف => boolean)
  const [pickedItems, setPickedItems] = useState<Record<string, boolean>>({});

  // اسکنر بارکد
  const [barcodeQuery, setBarcodeQuery] = useState("");
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [completing, setCompleting] = useState(false);
  const [customBijak, setCustomBijak] = useState("");

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // نت A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      //
    }
  };

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/picker");
      if (!res.ok) {
        setError("خطا در واکشی سفارش‌های آماده جمع‌آوری");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setPickLists(data.pickLists || []);
      setWarehouseName(data.warehouseName || "انبار مرکزی کرمان");
    } catch {
      setError("عدم دسترسی به شبکه انبار");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const currentOrder = pickLists[activeOrderIndex];

  // محاسبه پیشرفت جمع‌آوری سفارش فعلی
  const totalItemsCount = currentOrder ? currentOrder.items.length : 0;
  const pickedCount = currentOrder
    ? currentOrder.items.filter((it) => pickedItems[it.id]).length
    : 0;
  const isAllPicked = totalItemsCount > 0 && pickedCount === totalItemsCount;

  // پردازش اسکن بارکد
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeQuery.trim() || !currentOrder) return;

    const clean = barcodeQuery.trim().toLowerCase();
    const matched = currentOrder.items.find(
      (it) =>
        it.barcode.toLowerCase() === clean ||
        it.sku.toLowerCase() === clean
    );

    if (matched) {
      setPickedItems((prev) => ({ ...prev, [matched.id]: true }));
      playBeep();
      setScanFeedback(`✓ قطعه «${matched.name}» در قفسه ${matched.shelfLocation} تأیید شد.`);
      setTimeout(() => setScanFeedback(null), 3500);
      setBarcodeQuery("");
    } else {
      setScanFeedback(`❌ بارکد «${barcodeQuery}» در اقلام این سفارش وجود ندارد!`);
      setTimeout(() => setScanFeedback(null), 4000);
    }
  };

  const togglePickItem = (id: string) => {
    setPickedItems((prev) => {
      const next = !prev[id];
      if (next) playBeep();
      return { ...prev, [id]: next };
    });
  };

  const completeOrder = async () => {
    if (!currentOrder) return;
    setCompleting(true);
    try {
      const res = await fetch("/api/admin/picker/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: currentOrder.orderId,
          waybillNumber: customBijak.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "خطا در تأیید ارسال");
        setCompleting(false);
        return;
      }

      alert(`✅ بسته سفارش آماده گردید و با شماره بیجک ${data.waybillNumber} تحویل باربری ثبت شد. پیامک اطلاع‌رسانی برای خریدار ارسال گردید.`);
      setCustomBijak("");
      // بارگذاری مجدد سفارش‌ها
      await loadOrders();
      setPickedItems({});
    } catch {
      alert("خطای اتصال به سرور انبار");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* سربرگ تبلت انباردار */}
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="size-11 rounded-2xl bg-amber-500 text-slate-950 font-black text-xl grid place-items-center shadow-lg shadow-amber-500/20">
            📦
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-white">
                پنل تبلت و بارکدخوان انبار (Picker Mode)
              </h1>
              <span className="text-[11px] font-bold text-amber-400 bg-amber-950/80 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                {warehouseName}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              ترتیب بهینه قفسه‌ها، اسکن با بارکدخوان فیزیکی و تأیید بارگیری باربری‌های استان کرمان
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadOrders}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            🔄 بازخوانی صف
          </button>
          <Link
            href="/admin"
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            بازگشت به پنل مدیریت ←
          </Link>
        </div>
      </header>

      {error && (
        <div className="p-4 bg-rose-950/80 border border-rose-500/50 text-rose-300 rounded-xl text-sm font-bold">
          {error}
        </div>
      )}

      {/* انتخاب سفارش از صف */}
      {pickLists.length > 0 ? (
        <div className="space-y-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <span className="text-xs text-slate-400 font-bold shrink-0">صف سفارش‌ها:</span>
            {pickLists.map((order, idx) => (
              <button
                key={order.orderId}
                onClick={() => {
                  setActiveOrderIndex(idx);
                  setPickedItems({});
                }}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all shrink-0 border ${
                  activeOrderIndex === idx
                    ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20 scale-[1.02]"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
                }`}
              >
                <span>{order.customerName}</span>
                <span className="text-[10px] opacity-80 ms-1.5 font-mono nums">({order.orderNumber})</span>
              </button>
            ))}
          </div>

          {currentOrder && (
            <div className="space-y-4">
              {/* کارت مشخصات و پیشرفت سفارش فعال */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-800/90 border border-slate-700/80 shadow-lg space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <span className="text-xs text-slate-400 block font-medium">سفارش در دست جمع‌آوری:</span>
                    <span className="text-lg sm:text-xl font-black text-white">
                      {currentOrder.customerName} · مقصد: {currentOrder.customerCity}
                    </span>
                    <span className="text-xs text-slate-400 block mt-0.5">
                      ارسال با: <b className="text-amber-400">{currentOrder.carrierName}</b> · شماره سفارش: <span className="font-mono text-slate-300">{currentOrder.orderNumber}</span>
                    </span>
                  </div>

                  <div className="text-left bg-slate-900/90 border border-slate-700 p-3 rounded-xl nums">
                    <span className="text-xs text-slate-400 block">پیشرفت جمع‌آوری</span>
                    <span className="text-xl font-black text-amber-400">
                      {toFaDigits(pickedCount)} از {toFaDigits(totalItemsCount)} قلم
                    </span>
                  </div>
                </div>

                {/* نوار درصد پیشرفت */}
                <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-700">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${totalItemsCount ? (pickedCount / totalItemsCount) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* کادر اسکنر بارکد */}
              <form
                onSubmit={handleBarcodeSubmit}
                className="p-3.5 bg-slate-800/60 border border-slate-700 rounded-2xl flex items-center gap-3"
              >
                <span className="text-xl shrink-0">📟</span>
                <input
                  ref={barcodeInputRef}
                  type="text"
                  dir="ltr"
                  value={barcodeQuery}
                  onChange={(e) => setBarcodeQuery(e.target.value)}
                  placeholder="بارکد یا کد فنی را اسکن یا تایپ کنید (اینتر ↵)"
                  className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 h-12 text-white font-mono text-base focus:border-amber-500 outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn btn-orange px-5 h-12 rounded-xl font-black text-xs shrink-0"
                >
                  ثبت اسکن
                </button>
              </form>

              {scanFeedback && (
                <div
                  className={`p-3.5 rounded-xl text-xs sm:text-sm font-black border transition-all ${
                    scanFeedback.startsWith("✓")
                      ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/50"
                      : "bg-rose-950/90 text-rose-300 border-rose-500/50"
                  }`}
                >
                  {scanFeedback}
                </div>
              )}

              {/* لیست اقلام سفارش با فونت درشت و تفکیک راهروهای انبار */}
              <div className="space-y-3">
                <span className="text-xs font-black text-slate-400 block px-1">
                  اقلام برگه جمع‌آوری (مرتب‌شده بر مبنای راهرو و قفسه انبار):
                </span>

                <div className="grid grid-cols-1 gap-2.5">
                  {currentOrder.items.map((item, idx) => {
                    const isPicked = !!pickedItems[item.id];
                    return (
                      <div
                        key={item.id}
                        onClick={() => togglePickItem(item.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between gap-4 ${
                          isPicked
                            ? "bg-emerald-950/40 border-emerald-500/60 text-slate-200"
                            : "bg-slate-800/80 border-slate-700 hover:border-slate-600 text-white"
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {/* تیک لمسی درشت مخصوص کار با دستکش */}
                          <div
                            className={`size-10 rounded-xl border-2 grid place-items-center text-lg font-black shrink-0 transition-transform ${
                              isPicked
                                ? "bg-emerald-500 border-emerald-400 text-slate-950 scale-105"
                                : "border-slate-500 bg-slate-900 text-transparent"
                            }`}
                          >
                            ✓
                          </div>

                          <div className="min-w-0">
                            {/* لوکیشن قفسه با فونت خیلی درشت و طلایی */}
                            <div className="flex items-center gap-2 mb-1">
                              <span className="nums font-mono font-black text-xs sm:text-sm bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-lg">
                                لوکیشن: {item.shelfLocation}
                              </span>
                              <span className="font-mono text-xs text-slate-400 nums">
                                SKU: {item.sku}
                              </span>
                            </div>

                            <p className="font-black text-sm sm:text-base leading-snug truncate">
                              {item.name}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {item.brand} {item.model ? `· ${item.model}` : ""} {item.partBrand ? `(${item.partBrand})` : ""}
                            </p>
                          </div>
                        </div>

                        {/* تعداد درشت */}
                        <div className="text-left shrink-0 bg-slate-900/90 border border-slate-700/80 px-4 py-2 rounded-xl nums">
                          <span className="text-[10px] text-slate-400 block font-medium">تعداد کالا</span>
                          <span className="text-xl sm:text-2xl font-black text-amber-400">
                            {toFaDigits(item.qty)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* اکشن نهایی: تایید بسته‌بندی و صدور بیجک */}
              <div className="p-5 rounded-2xl bg-slate-800/90 border border-slate-700 space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      شماره بیجک باربری یا رسید پیک (در صورت وجود دستی وارد نمایید):
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={customBijak}
                      onChange={(e) => setCustomBijak(e.target.value)}
                      placeholder="مثال: BIJAK-78912 یا خالی بگذارید تا خودکار صادر شود"
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 h-11 text-white text-xs font-mono"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={completeOrder}
                    disabled={completing || !isAllPicked}
                    className={`btn text-sm px-6 py-3.5 rounded-xl font-black shadow-lg transition-all shrink-0 ${
                      isAllPicked
                        ? "btn-emerald scale-102"
                        : "bg-slate-700 text-slate-400 cursor-not-allowed opacity-60"
                    }`}
                  >
                    {completing
                      ? "در حال ثبت بسته‌بندی و ارسال پیامک…"
                      : isAllPicked
                      ? "✓ تأیید بسته‌بندی کامل و ثبت بیجک باربری"
                      : `تکمیل همه اقلام الزامی است (${toFaDigits(pickedCount)}/${toFaDigits(totalItemsCount)})`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-16 text-center rounded-2xl bg-slate-800/40 border border-slate-800 space-y-3">
          <span className="text-4xl block">✨</span>
          <h2 className="text-lg font-black text-white">صف جمع‌آوری انبار خالی است</h2>
          <p className="text-xs text-slate-400">
            کلیه سفارش‌های پرداخت‌شده جمع‌آوری و به باربری‌های استان تحویل داده شده‌اند.
          </p>
        </div>
      )}
    </div>
  );
}
