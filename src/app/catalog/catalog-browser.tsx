"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatToman, toFaDigits } from "@/lib/digits";
import type { CatalogItem } from "@/lib/catalog";
import { QuickBuySheet } from "./quick-buy-sheet";

export type { CatalogItem };

export type ShippingOption = {
  id: string;
  name: string;
  cost: number;
  freeAbove: number | null;
  note: string | null;
};

export type CartItem = {
  item: CatalogItem;
  qty: number;
};

/*
 * کاتالوگ مدرن B2B کاردو:
 * - پشتیبانی همزمان از خرید فوری تکی و سبد چندقلمی عمده
 * - فیلترهای چیپسی لمسی مخصوص موبایل
 * - نوار شناور سبد سفارش در پایین صفحه
 * - جست‌وجوی هوشمند با کد فنی، OEM و نام خودرو
 */
export function CatalogBrowser(props: {
  initialItems: CatalogItem[];
  canOrder: boolean;
  wallet: number;
  availableCredit: number;
  creditLimit: number;
  tierDiscount: number;
  customerDiscount: number;
  shipping: ShippingOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<CatalogItem[]>(props.initialItems);
  const [loading, setLoading] = useState(props.initialItems.length === 0);
  const [selectedQuickBuy, setSelectedQuickBuy] = useState<CatalogItem | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [cartShippingId, setCartShippingId] = useState(props.shipping[0]?.id ?? "");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams();
    if (query.trim()) qs.set("q", query.trim());
    if (brand) qs.set("brand", brand);
    if (category) qs.set("category", category);

    try {
      const res = await fetch(`/api/catalog?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "کاتالوگ بارگذاری نشد");
        return;
      }

      setItems(data.items ?? []);
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  }, [query, brand, category]);

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      if (!query.trim() && !brand && !category && props.initialItems.length > 0) return;
    }

    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, query, brand, category, props.initialItems.length]);

  const brands = useMemo(() => Array.from(new Set(items.map((i) => i.brand))).filter(Boolean).sort(), [items]);
  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))).filter(Boolean).sort(), [items]);

  // افزودن به سبد خرید چندقلمی
  const addToCart = (item: CatalogItem, qtyToAdd?: number) => {
    const step = Math.max(1, item.packSize);
    const addQty = qtyToAdd ?? Math.max(item.minQty, step);

    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        const nextQty = Math.min(item.stockQty, existing.qty + addQty);
        return prev.map((c) => (c.item.id === item.id ? { ...c, qty: nextQty } : c));
      }
      return [...prev, { item, qty: Math.min(item.stockQty, addQty) }];
    });

    setAddedToast(`«${item.name}» به سبد اضافه شد`);
    setTimeout(() => setAddedToast(null), 2500);
  };

  const updateCartQty = (productId: string, newQty: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.item.id !== productId) return c;
          const step = Math.max(1, c.item.packSize);
          const snapped = Math.ceil(Math.max(c.item.minQty, newQty) / step) * step;
          return { ...c, qty: Math.min(c.item.stockQty, snapped) };
        })
        .filter((c) => c.qty > 0),
    );
  };

  const removeCartItem = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.item.id !== productId));
  };

  // محاسبه مبالغ سبد
  const cartSummary = useMemo(() => {
    let subtotal = 0;
    let itemCount = 0;

    for (const c of cart) {
      itemCount += c.qty;
      const base = c.item.priceBefore ?? c.item.price ?? 0;
      let volumeDiscount = 0;
      for (const v of c.item.volumePrices) {
        if (c.qty >= v.qtyFrom) volumeDiscount = Math.max(volumeDiscount, v.discountPercent);
      }
      const totalDisc = Math.min(90, volumeDiscount + props.tierDiscount + props.customerDiscount);
      const unit = Math.round(base * (1 - totalDisc / 100));
      subtotal += unit * c.qty;
    }

    const shipping = props.shipping.find((s) => s.id === cartShippingId);
    const shippingCost =
      shipping && !(shipping.freeAbove && subtotal >= shipping.freeAbove) ? shipping.cost : 0;

    return {
      subtotal,
      itemCount,
      shippingCost,
      total: subtotal + shippingCost,
      distinctCount: cart.length,
    };
  }, [cart, props.tierDiscount, props.customerDiscount, props.shipping, cartShippingId]);

  // ثبت پیش‌فاکتور از سبد خرید
  async function submitCartOrder() {
    setCheckoutBusy(true);
    setCheckoutError(null);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({ productId: c.item.id, qty: c.qty })),
          shippingId: cartShippingId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCheckoutError(data.message ?? "ثبت پیش‌فاکتور با خطا مواجه شد");
        setCheckoutBusy(false);
        return;
      }

      setCart([]);
      setShowCartDrawer(false);
      router.push(`/orders/${data.order.id}`);
    } catch {
      setCheckoutError("خطا در برقراری ارتباط با سرور");
      setCheckoutBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-3 sm:px-4 py-4 sm:py-6 pb-28">
      {/* اعلان موقت (Toast) */}
      {addedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-ink text-paper text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-200">
          <span className="size-2 rounded-full bg-ledger-green" />
          <span>{addedToast}</span>
        </div>
      )}

      {/* سر صفحه و وضعیت تخفیف‌ها */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">کاتالوگ و استعلام آنلاین</h1>
          <p className="text-xs text-ink-soft mt-0.5">
            تأمین مستقیم قطعات با تخفیف طبقاتی و تیراژ عمده
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs flex-wrap">
          <div className="border border-rule rounded-[3px] px-2.5 py-1 bg-paper/60">
            <span className="text-ink-soft">تخفیف طبقه: </span>
            <b className="text-brass nums font-bold">{toFaDigits(props.tierDiscount)}٪</b>
          </div>
          {props.customerDiscount > 0 && (
            <div className="border border-rule rounded-[3px] px-2.5 py-1 bg-paper/60">
              <span className="text-ink-soft">تخفیف همکار: </span>
              <b className="text-brass nums font-bold">{toFaDigits(props.customerDiscount)}٪</b>
            </div>
          )}
          {cart.length > 0 && (
            <button
              onClick={() => setShowCartDrawer(true)}
              className="btn btn-brass text-xs px-3 py-1 flex items-center gap-1.5 shadow-xs"
            >
              <span>🛒 سبد سفارش</span>
              <span className="nums font-bold bg-white text-ink rounded-full px-1.5 py-0.2 text-[10px]">
                {toFaDigits(cart.length)}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* فیلتر سریع برندها (چیپس‌های لمسی افقی) */}
      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        <button
          onClick={() => setBrand("")}
          className={`px-3 py-1.5 rounded-full shrink-0 transition-colors ${
            brand === ""
              ? "bg-ink text-paper font-bold shadow-xs"
              : "bg-paper-raised border border-rule text-ink-soft hover:text-ink"
          }`}
        >
          همه خودروها
        </button>
        {brands.map((b) => (
          <button
            key={b}
            onClick={() => setBrand(b === brand ? "" : b)}
            className={`px-3 py-1.5 rounded-full shrink-0 transition-colors ${
              brand === b
                ? "bg-ink text-paper font-bold shadow-xs"
                : "bg-paper-raised border border-rule text-ink-soft hover:text-ink"
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* جست‌وجو و انتخاب دسته‌بندی */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جست‌وجو با نام قطعه، کد فنی SKU، کد OEM یا مدل خودرو..."
            className="input py-2.5 text-xs sm:text-sm pl-8"
            autoComplete="off"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute inset-y-0 left-2 px-2 text-ink-soft hover:text-ink text-sm"
              aria-label="پاک کردن"
            >
              ✕
            </button>
          )}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input sm:w-44 text-xs"
        >
          <option value="">همه دسته‌ها (ترمز، فیلتر...)</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mt-3 card border-alarm/40 bg-alarm-soft p-3 text-xs text-alarm">
          {error}
        </div>
      )}

      {/* فهرست اقلام کاتالوگ */}
      <div className="mt-4 card overflow-hidden">
        <div className="hidden md:grid grid-cols-[7.5rem_1.4fr_5.5rem_8.5rem_9.5rem] gap-2 px-4 py-2.5 border-b border-rule bg-brass-soft/40 text-[11px] text-ink-soft">
          <span>کد فنی</span>
          <span>قطعه و مشخصات</span>
          <span className="text-center">موجودی انبار</span>
          <span className="text-left">قیمت پایه و همکار</span>
          <span className="text-center">اقدام خرید</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-ink-soft flex flex-col items-center gap-2">
            <span className="size-5 border-2 border-brass border-t-transparent rounded-full animate-spin" />
            <span>در حال واکشی موجودی قطعات...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-xs text-ink-soft space-y-2">
            <p className="font-semibold text-ink text-sm">قطعه‌ای با این مشخصات یافت نشد.</p>
            <p>می‌توانید قطعه مورد نظر را از بخش استعلام چندردیفی درخواست دهید.</p>
            <button
              onClick={() => router.push("/inquiries")}
              className="btn btn-brass text-xs px-4 py-1.5 mt-2"
            >
              ثبت استعلام این قطعه (RFQ)
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-rule/60">
            {items.map((item) => {
              const inCart = cart.find((c) => c.item.id === item.id);
              const hasVolumeDiscount = item.volumePrices && item.volumePrices.length > 0;

              return (
                <li
                  key={item.id}
                  className="p-3 sm:px-4 sm:py-3.5 md:grid md:grid-cols-[7.5rem_1.4fr_5.5rem_8.5rem_9.5rem] md:items-center gap-2 hover:bg-brass-soft/15 transition-colors"
                >
                  {/* کد فنی */}
                  <div className="flex items-center gap-2">
                    <span className="nums text-[11px] font-mono text-ink-soft border border-rule rounded-[2px] px-1.5 py-0.5 bg-paper">
                      {item.sku}
                    </span>
                    {item.oemCode && (
                      <span className="text-[10px] text-ink-soft/80 nums hidden sm:inline">
                        OEM: {item.oemCode}
                      </span>
                    )}
                  </div>

                  {/* نام و مدل */}
                  <div className="mt-1 md:mt-0 min-w-0">
                    <p className="font-semibold text-xs sm:text-sm leading-5">{item.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-ink-soft mt-0.5 flex-wrap">
                      <span className="font-medium text-ink">{item.brand}</span>
                      {item.model && <span>· {item.model}</span>}
                      <span>· {item.category}</span>
                      {item.packSize > 1 && (
                        <span className="text-brass bg-brass-soft/40 px-1 rounded text-[10px] nums">
                          بسته {toFaDigits(item.packSize)} تایی
                        </span>
                      )}
                      {hasVolumeDiscount && (
                        <span className="text-ledger-green bg-ledger-green/10 px-1 rounded text-[10px] nums">
                          تخفیف تیراژ دار
                        </span>
                      )}
                    </div>
                  </div>

                  {/* موجودی */}
                  <div className="mt-1.5 md:mt-0 md:text-center text-xs">
                    {item.stockQty > 0 ? (
                      <span className="text-ledger-green font-medium">
                        <span className="nums font-bold">{toFaDigits(item.stockQty)}</span> {item.unit}
                      </span>
                    ) : (
                      <span className="text-alarm font-medium text-[11px]">ناموجود</span>
                    )}
                  </div>

                  {/* قیمت */}
                  <div className="mt-1.5 md:mt-0 md:text-left text-xs">
                    {item.price !== null ? (
                      <div className="nums">
                        {item.priceBefore && item.priceBefore > item.price && (
                          <span className="block text-[10px] text-ink-soft line-through">
                            {formatToman(item.priceBefore)}
                          </span>
                        )}
                        <span className="font-bold text-sm text-ink">{formatToman(item.price)}</span>
                        <span className="text-[10px] text-ink-soft ms-1">ت</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-ink-soft">پس از تأیید حساب</span>
                    )}
                  </div>

                  {/* دکمه‌های خرید */}
                  <div className="mt-2.5 md:mt-0 flex items-center gap-1.5 justify-end">
                    {/* دکمه افزودن به سبد */}
                    <button
                      onClick={() => addToCart(item)}
                      disabled={!props.canOrder || item.stockQty <= 0 || item.price === null}
                      className={`btn text-xs px-2.5 py-1.5 flex-1 md:flex-initial ${
                        inCart
                          ? "btn-ghost border-brass text-brass font-bold"
                          : "btn-ghost border-rule-strong hover:border-ink"
                      }`}
                      title="افزودن به سبد سفارش"
                    >
                      {inCart ? `✓ در سبد (${toFaDigits(inCart.qty)})` : "+ سبد"}
                    </button>

                    {/* دکمه خرید تکی فوری */}
                    <button
                      onClick={() => setSelectedQuickBuy(item)}
                      disabled={!props.canOrder || item.stockQty <= 0 || item.price === null}
                      className="btn btn-brass text-xs px-3 py-1.5 flex-1 md:flex-initial font-semibold"
                    >
                      خرید فوری
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* نوار شناور پایین صفحه در صورت داشتن کالا در سبد */}
      {cart.length > 0 && (
        <div className="fixed bottom-16 sm:bottom-4 inset-x-3 sm:inset-x-auto sm:left-6 sm:right-6 sm:max-w-xl sm:mx-auto z-30 animate-in slide-in-from-bottom-4 duration-200">
          <div className="card bg-ink text-paper p-3 sm:px-4 sm:py-3 shadow-2xl flex items-center justify-between gap-3 border border-ink">
            <div className="flex items-center gap-3">
              <span className="size-9 grid place-items-center bg-brass text-paper rounded-[3px] font-bold text-xs">
                {toFaDigits(cartSummary.distinctCount)}
              </span>
              <div>
                <p className="text-xs font-bold leading-tight">سبد سفارش همکار</p>
                <p className="text-[11px] text-paper/70 mt-0.5 nums">
                  {toFaDigits(cartSummary.itemCount)} عدد قطعه · مجموع: {formatToman(cartSummary.subtotal)} ت
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowCartDrawer(true)}
              className="btn btn-brass text-xs px-4 py-2 font-bold shadow-xs hover:scale-102 transition-transform"
            >
              مشاهده و صدور پیش‌فاکتور
            </button>
          </div>
        </div>
      )}

      {/* شیت / کشوی سبد سفارش چندقلمی */}
      {showCartDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/50 backdrop-blur-xs">
          <div className="card w-full max-w-lg h-full overflow-y-auto p-4 sm:p-6 bg-paper-raised shadow-2xl flex flex-col justify-between border-s border-rule animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-rule">
                <div>
                  <h2 className="font-bold text-base text-ink">سبد سفارش B2B</h2>
                  <p className="text-[11px] text-ink-soft">
                    {toFaDigits(cartSummary.distinctCount)} قلم کالای انتخابی
                  </p>
                </div>
                <button
                  onClick={() => setShowCartDrawer(false)}
                  className="text-ink-soft hover:text-ink text-xl font-bold p-1"
                >
                  ✕
                </button>
              </div>

              {checkoutError && (
                <div className="mt-3 p-3 bg-alarm-soft border border-alarm/30 rounded text-alarm text-xs">
                  {checkoutError}
                </div>
              )}

              {/* لیست اقلام سبد */}
              <div className="mt-4 divide-y divide-rule/60">
                {cart.map((c) => (
                  <div key={c.item.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-xs text-ink leading-tight">{c.item.name}</p>
                      <p className="text-[10px] text-ink-soft font-mono nums mt-0.5">
                        {c.item.sku} · {c.item.brand}
                      </p>
                      <p className="text-xs text-brass font-bold nums mt-1">
                        فی: {formatToman(c.item.price ?? 0)} ت
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1 border border-rule rounded-[3px] bg-paper p-0.5">
                        <button
                          onClick={() => updateCartQty(c.item.id, c.qty - c.item.packSize)}
                          className="size-6 grid place-items-center text-xs font-bold hover:bg-brass-soft/40 rounded"
                        >
                          −
                        </button>
                        <span className="nums text-xs font-bold px-2">{toFaDigits(c.qty)}</span>
                        <button
                          onClick={() => updateCartQty(c.item.id, c.qty + c.item.packSize)}
                          className="size-6 grid place-items-center text-xs font-bold hover:bg-brass-soft/40 rounded"
                        >
                          +
                        </button>
                      </div>

                      <button
                        onClick={() => removeCartItem(c.item.id)}
                        className="text-[10px] text-alarm hover:underline"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* بخش نهایی و صدور */}
            <div className="pt-4 border-t border-rule space-y-3 mt-6">
              <div>
                <label className="label block mb-1">روش ارسال باربری:</label>
                <select
                  value={cartShippingId}
                  onChange={(e) => setCartShippingId(e.target.value)}
                  className="input text-xs"
                >
                  {props.shipping.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.cost > 0 ? `${formatToman(s.cost)} ت` : "پس‌کرایه"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-paper border border-rule rounded-[3px] space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-soft">جمع کالاها:</span>
                  <span className="nums font-bold">{formatToman(cartSummary.subtotal)} ت</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-soft">کرایه حمل:</span>
                  <span className="nums">
                    {cartSummary.shippingCost > 0 ? `${formatToman(cartSummary.shippingCost)} ت` : "رایگان"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-rule pt-2 font-bold text-sm">
                  <span>مبلغ پیش‌فاکتور:</span>
                  <span className="nums text-brass">{formatToman(cartSummary.total)} تومان</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCartDrawer(false)}
                  className="btn btn-ghost text-xs px-3 py-2.5 flex-1"
                >
                  ادامه خرید
                </button>
                <button
                  type="button"
                  onClick={submitCartOrder}
                  disabled={checkoutBusy || cart.length === 0}
                  className="btn btn-brass text-xs px-4 py-2.5 flex-2 font-bold"
                >
                  {checkoutBusy ? "در حال ثبت..." : "تأیید و صدور پیش‌فاکتور"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* مدال خرید سریع تکی */}
      {selectedQuickBuy && (
        <QuickBuySheet
          item={selectedQuickBuy}
          shipping={props.shipping}
          wallet={props.wallet}
          availableCredit={props.availableCredit}
          creditLimit={props.creditLimit}
          tierDiscount={props.tierDiscount}
          customerDiscount={props.customerDiscount}
          onClose={() => setSelectedQuickBuy(null)}
          onCreated={(orderId) => {
            setSelectedQuickBuy(null);
            router.push(`/orders/${orderId}`);
          }}
        />
      )}
    </div>
  );
}
