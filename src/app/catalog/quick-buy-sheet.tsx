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
  shipping: ShippingOption[];
  wallet: number;
  availableCredit: number;
  creditLimit: number;
  tierDiscount: number;
  customerDiscount: number;
  onClose: () => void;
  onCreated: (orderId: string) => void;
}) {
  const { item } = props;

  const [qty, setQtyState] = useState(item.minQty);
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button
        aria-label="بستن"
        onClick={props.onClose}
        className="absolute inset-0 bg-ink/40 sheet-backdrop"
      />

      <div className="relative w-full sm:max-w-lg card sheet-panel rounded-b-none sm:rounded-[3px] max-h-[92dvh] overflow-y-auto">
        {/* هدر */}
        <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3 sticky top-0 bg-paper-raised z-10">
          <div className="min-w-0">
            <p className="text-[11px] text-ink-soft nums">{item.sku}</p>
            <h2 className="font-bold truncate">{item.name}</h2>
            <p className="text-[11px] text-ink-soft">
              {item.brand}
              {item.model ? ` · ${item.model}` : ""} · موجودی {toFaDigits(item.stockQty)} {item.unit}
            </p>
          </div>
          <button onClick={props.onClose} className="btn btn-quiet text-lg leading-none" aria-label="بستن">
            ×
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {error && (
            <p className="rounded-[2px] border border-alarm/40 bg-alarm-soft px-3 py-2 text-xs text-alarm">
              {error}
            </p>
          )}

          {/* تعداد */}
          <div>
            <div className="flex items-center justify-between">
              <span className="label">تعداد ({item.unit})</span>
              {item.packSize > 1 && (
                <span className="text-[11px] text-ink-soft">
                  بسته‌بندی {toFaDigits(item.packSize)} {item.unit}ی
                </span>
              )}
            </div>

            <div className="mt-1.5 flex items-stretch gap-2">
              <button
                onClick={() => setQty(qty - step)}
                disabled={qty <= item.minQty}
                className="btn btn-ghost w-12 text-xl"
                aria-label="کم کردن"
              >
                −
              </button>
              <input
                dir="ltr"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value.replace(/\D/g, "")))}
                className="input flex-1 text-center text-xl font-bold nums"
              />
              <button
                onClick={() => setQty(qty + step)}
                disabled={qty + step > item.stockQty}
                className="btn btn-ghost w-12 text-xl"
                aria-label="زیاد کردن"
              >
                +
              </button>
            </div>

            {item.volumePrices.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.volumePrices.map((v) => (
                  <button
                    key={v.qtyFrom}
                    onClick={() => setQty(v.qtyFrom)}
                    className={`text-[11px] nums border rounded-[2px] px-2 py-1 transition-colors ${
                      qty >= v.qtyFrom
                        ? "border-brass bg-brass-soft text-brass font-bold"
                        : "border-rule text-ink-soft hover:border-rule-strong"
                    }`}
                  >
                    {toFaDigits(v.qtyFrom)}+ ← {toFaDigits(v.discountPercent)}٪
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ارسال */}
          <div>
            <span className="label">نحوه ارسال</span>
            <div className="mt-1.5 grid gap-1.5">
              {props.shipping.map((s) => {
                const free = s.freeAbove !== null && lineTotal >= s.freeAbove;
                return (
                  <label
                    key={s.id}
                    className={`flex items-center justify-between gap-2 border rounded-[2px] px-3 py-2 cursor-pointer transition-colors ${
                      shippingId === s.id
                        ? "border-brass bg-brass-soft/50"
                        : "border-rule hover:border-rule-strong"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={shippingId === s.id}
                        onChange={() => setShippingId(s.id)}
                        className="accent-[var(--brass)]"
                      />
                      <span>
                        {s.name}
                        {s.note && <span className="block text-[10px] text-ink-soft">{s.note}</span>}
                      </span>
                    </span>
                    <span className="nums text-xs">
                      {s.cost === 0 ? "رایگان" : free ? "رایگان" : `${formatToman(s.cost)} ت`}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* جمع */}
          <div className="border-t border-rule pt-3 text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-ink-soft">
                {toFaDigits(qty)} {item.unit} × {formatToman(volumeUnit)}
              </span>
              <span className="nums">{formatToman(lineTotal)}</span>
            </div>
            {shippingCost > 0 && (
              <div className="flex justify-between py-0.5">
                <span className="text-ink-soft">کرایه ارسال</span>
                <span className="nums">{formatToman(shippingCost)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline border-t border-rule mt-2 pt-2">
              <span className="font-bold">قابل پرداخت</span>
              <span className="nums text-xl font-bold">{formatToman(total)} <span className="text-xs font-normal">تومان</span></span>
            </div>
            <p className="text-[11px] text-ink-soft mt-1">
              کیف پول: <span className="nums">{formatToman(props.wallet)}</span> · اعتبار قابل استفاده:{" "}
              <span className="nums">{formatToman(props.availableCredit)}</span>
            </p>
          </div>

          {/* روش پرداخت */}
          <div>
            <span className="label">پرداخت</span>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {(
                [
                  ["proforma", "پیش‌فاکتور"],
                  ["gateway", "درگاه"],
                  ["wallet", "کیف پول"],
                  ["credit", "اعتباری"],
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
                    className={`text-xs px-3 py-2 rounded-[2px] border transition-colors ${
                      payMode === mode
                        ? "border-ink bg-ink text-paper"
                        : "border-rule text-ink-soft hover:border-rule-strong"
                    } ${disabled ? "opacity-40" : ""}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {!canWallet && props.wallet > 0 && (
              <button
                onClick={() => setPayMode("split")}
                className={`mt-1.5 text-[11px] underline underline-offset-4 ${
                  payMode === "split" ? "text-brass font-bold" : "text-ink-soft"
                }`}
              >
                ترکیبی: {formatToman(Math.min(props.wallet, total))} از کیف پول + مابقی درگاه
              </button>
            )}
          </div>

          <button
            onClick={submit}
            disabled={busy || (payMode === "wallet" && !canWallet) || qty < item.minQty}
            className={`btn w-full py-3 text-base ${payMode === "proforma" ? "btn-ghost" : "btn-primary"}`}
          >
            {busy ? "در حال ثبت…" : payLabels[payMode]}
          </button>

          <p className="text-[11px] text-ink-soft text-center">
            با ثبت سند، موجودی تا ۲۴ ساعت برای شما رزرو می‌شود.
          </p>
        </div>
      </div>
    </div>
  );
}
