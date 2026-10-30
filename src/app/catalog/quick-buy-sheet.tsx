"use client";

import { useMemo, useState } from "react";
import { formatToman, toFaDigits } from "@/lib/digits";
import type { CatalogItem, ShippingOption } from "./catalog-browser";

/*
 * شیت خرید سریع — همه‌چیز در یک نما:
 * تعداد (با گام بسته‌بندی)، ارسال، قیمت زنده، کیف پول/اعتبار، و دکمه پرداخت.
 */
type PayMode = "proforma" | "wallet" | "gateway" | "split" | "credit";

export function QuickBuySheet(props: {
  item: CatalogItem;
  initialQty?: number;
  shipping: ShippingOption[];
  wallet: number;
  availableCredit: number;
  creditLimit: number;
  tierDiscount: number;
  customerDiscount: number;
  onClose: () => void;
  onCreated: (orderId: string) => void;
}) {
  const { item, initialQty } = props;

  const [qty, setQtyState] = useState(
    initialQty ? Math.min(item.stockQty, Math.max(item.minQty, initialQty)) : item.minQty,
  );
  const [shippingId, setShippingId] = useState(props.shipping[0]?.id ?? "");
  const [payMode, setPayMode] = useState<PayMode>("gateway");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = Math.max(1, item.packSize);

  const setQty = (value: number) => {
    const safe = Math.max(item.minQty, Math.floor(value) || item.minQty);
    // به مضرب بسته‌بندی گرد کن
    const snapped = Math.ceil(safe / step) * step;
    setQtyState(Math.min(snapped, item.stockQty));
  };

  const volumePercent = useMemo(() => {
    let best = 0;
    for (const v of item.volumePrices) if (qty >= v.qtyFrom) best = Math.max(best, v.discountPercent);
    return best;
  }, [item.volumePrices, qty]);

  // همان فرمول سمت سرور (lib/pricing.ts): پله حجمی + طبقه + تخفیف اختصاصی
  const basePrice = item.priceBefore ?? 0;
  const totalPercent = Math.min(
    90,
    volumePercent + props.tierDiscount + props.customerDiscount,
  );
  const volumeUnit = Math.round(basePrice * (1 - totalPercent / 100));
  const lineTotal = volumeUnit * qty;

  const shipping = props.shipping.find((s) => s.id === shippingId);
  const shippingCost =
    shipping && !(shipping.freeAbove && lineTotal >= shipping.freeAbove) ? shipping.cost : 0;

  const total = lineTotal + shippingCost;

  const canWallet = props.wallet >= total;

  const payLabels: Record<PayMode, string> = {
    proforma: "ثبت پیش‌فاکتور",
    wallet: canWallet ? "پرداخت از کیف پول" : "کیف پول کافی نیست",
    gateway: "پرداخت آنلاین",
    split: "کیف پول + درگاه",
    credit: "درخواست خرید اعتباری",
  };

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: item.id, qty }],
          shippingId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "ثبت سفارش ناموفق بود");
        return;
      }

      const orderId = data.order.id as string;

      if (payMode === "proforma") {
        props.onCreated(orderId);
        return;
      }

      const payRes = await fetch(`/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: payMode,
          walletAmount: payMode === "split" ? props.wallet : undefined,
        }),
      });

      const payData = await payRes.json().catch(() => ({}));

      if (!payRes.ok) {
        // سند ثبت شده — به صفحه‌اش برو تا کاربر مسیر پرداخت را ببیند
        setError(payData.message ?? "پرداخت آغاز نشد");
        props.onCreated(orderId);
        return;
      }

      if (payData.redirect) {
        window.location.href = payData.redirect as string;
        return;
      }

      props.onCreated(orderId);
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        aria-label="بستن"
        onClick={props.onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
      />

      <div className="relative w-full sm:max-w-lg card rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto bg-white border border-slate-200 shadow-2xl animate-in slide-in-from-bottom duration-200">
        {/* هدر کشو */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 sm:px-6 py-3.5 sticky top-0 bg-white/95 backdrop-blur-md z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-500 font-mono nums bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                {item.sku}
              </span>
              {item.partBrand && (
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                  {item.partBrand}
                </span>
              )}
            </div>
            <h2 className="font-extrabold text-sm sm:text-base text-slate-900 truncate mt-1">{item.name}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {item.brand}
              {item.model ? ` · ${item.model}` : ""} · موجودی انبار: <b className="text-slate-800">{toFaDigits(item.stockQty)}</b> {item.unit}
            </p>
          </div>
          <button
            onClick={props.onClose}
            className="size-8 grid place-items-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 text-lg transition-colors shrink-0"
            aria-label="بستن"
          >
            ✕
          </button>
        </div>

        <div className="p-4 sm:p-6 flex flex-col gap-4">
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
              {error}
            </p>
          )}

          {/* تعداد */}
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">تعداد درخواستی ({item.unit})</span>
              {item.packSize > 1 && (
                <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  ضریب بسته: {toFaDigits(item.packSize)} {item.unit}
                </span>
              )}
            </div>

            <div className="mt-2 flex items-stretch gap-2">
              <button
                onClick={() => setQty(qty - step)}
                disabled={qty <= item.minQty}
                className="btn btn-ghost w-12 h-11 text-xl rounded-lg border border-slate-300 disabled:opacity-40"
                aria-label="کم کردن"
              >
                −
              </button>
              <input
                dir="ltr"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value.replace(/\D/g, "")))}
                className="input flex-1 h-11 text-center text-xl font-bold nums border-slate-300 rounded-lg"
              />
              <button
                onClick={() => setQty(qty + step)}
                disabled={qty + step > item.stockQty}
                className="btn btn-ghost w-12 h-11 text-xl rounded-lg border border-slate-300 disabled:opacity-40"
                aria-label="زیاد کردن"
              >
                +
              </button>
            </div>

            {item.volumePrices.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {item.volumePrices.map((v) => (
                  <button
                    key={v.qtyFrom}
                    onClick={() => setQty(v.qtyFrom)}
                    className={`text-[11px] nums border rounded-lg px-2.5 py-1 transition-all ${
                      qty >= v.qtyFrom
                        ? "border-blue-400 bg-blue-50 text-blue-700 font-bold shadow-2xs"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {toFaDigits(v.qtyFrom)}+ ← {toFaDigits(v.discountPercent)}٪ تخفیف
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ارسال */}
          <div>
            <span className="text-xs font-bold text-slate-800 block mb-1.5">روش ارسال باربری</span>
            <div className="grid gap-2">
              {props.shipping.map((s) => {
                const free = s.freeAbove !== null && lineTotal >= s.freeAbove;
                return (
                  <label
                    key={s.id}
                    className={`flex items-center justify-between gap-2 border rounded-xl p-3 cursor-pointer transition-all ${
                      shippingId === s.id
                        ? "border-blue-400 bg-blue-50/60 shadow-2xs"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-2.5 text-xs sm:text-sm">
                      <input
                        type="radio"
                        checked={shippingId === s.id}
                        onChange={() => setShippingId(s.id)}
                        className="size-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span>
                        <span className="font-semibold text-slate-900">{s.name}</span>
                        {s.note && <span className="block text-[11px] text-slate-500 mt-0.5">{s.note}</span>}
                      </span>
                    </span>
                    <span className="nums text-xs font-bold text-slate-700 shrink-0">
                      {s.cost === 0 ? "رایگان" : free ? "رایگان" : `${formatToman(s.cost)} ت`}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* ریز محاسبات و جمع فاکتور */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
            <div className="flex justify-between py-0.5 text-slate-600">
              <span>
                {toFaDigits(qty)} {item.unit} × {formatToman(volumeUnit)} تومان
              </span>
              <span className="nums font-semibold text-slate-900">{formatToman(lineTotal)} ت</span>
            </div>
            {shippingCost > 0 && (
              <div className="flex justify-between py-0.5 text-slate-600">
                <span>کرایه ارسال</span>
                <span className="nums font-semibold text-slate-900">{formatToman(shippingCost)} ت</span>
              </div>
            )}
            <div className="flex justify-between items-baseline border-t border-slate-200 pt-2 font-bold text-sm">
              <span className="text-slate-900">مبلغ نهایی قابل پرداخت:</span>
              <div className="nums text-blue-600 text-lg font-extrabold flex items-baseline gap-1">
                <span>{formatToman(total)}</span>
                <span className="text-xs font-medium text-slate-500">تومان</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/80">
              موجودی کیف پول: <span className="nums font-bold text-slate-800">{formatToman(props.wallet)} ت</span> · اعتبار در دسترس:{" "}
              <span className="nums font-bold text-slate-800">{formatToman(props.availableCredit)} ت</span>
            </p>
          </div>

          {/* روش پرداخت */}
          <div>
            <span className="text-xs font-bold text-slate-800 block mb-1.5">انتخاب شیوه تسویه</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["proforma", "صدور پیش‌فاکتور"],
                  ["gateway", "درگاه بانکی شتاب"],
                  ["wallet", "برداشت از کیف پول"],
                  ["credit", "تسویه اعتباری ۳۰ روزه"],
                ] as [PayMode, string][]
              ).map(([mode, label]) => {
                const disabled =
                  (mode === "wallet" && !canWallet) ||
                  (mode === "credit" && props.availableCredit < total);
                return (
                  <button
                    key={mode}
                    onClick={() => setPayMode(mode)}
                    disabled={disabled}
                    className={`h-11 text-xs px-2.5 rounded-xl border font-black transition-all ${
                      payMode === mode
                        ? "border-blue-600 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/25 scale-[1.02]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-200"
                    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {!canWallet && props.wallet > 0 && (
              <button
                onClick={() => setPayMode("split")}
                className={`mt-2 text-xs font-medium ${
                  payMode === "split" ? "text-blue-600 font-bold underline" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                تسویه ترکیبی: {formatToman(Math.min(props.wallet, total))} تومان از کیف پول + مابقی درگاه
              </button>
            )}
          </div>

          <button
            onClick={submit}
            disabled={busy || (payMode === "wallet" && !canWallet) || qty < item.minQty}
            className={`w-full h-12 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 active:scale-98 ${
              payMode === "proforma"
                ? "btn-blue"
                : "btn-emerald"
            }`}
          >
            {busy ? "در حال ثبت سفارش..." : payLabels[payMode]}
          </button>

          <p className="text-[11px] text-slate-500 text-center">
            با ثبت سند، موجودی قطعه تا ۲۴ ساعت در انبار مرکزی کرمان برای شما رزرو می‌گردد.
          </p>
        </div>
      </div>
    </div>
  );
}
