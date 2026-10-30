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
 * کاتالوگ پیشرفته سازمانی کاردو B2B:
 * - فیلترهای چندگانه: خودرو، مدل، قسمت‌های خودرو، سازنده قطعه، تاریخ و موجودی
 * - چیپس‌های لمسی سریع برای موبایل و تبلت
 * - کشوی فیلترهای پیشرفته با نشانگر تعداد فیلترهای فعال
 * - مرتب‌سازی هوشمند (جدیدترین، قیمت، موجودی)
 * - بدون لرزش و بدون درخواست‌های تکراری
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

  // فیلترهای اصلی
  const [query, setQuery] = useState("");
  const [carBrand, setCarBrand] = useState(""); // برند خودرو: پراید، پژو...
  const [carModel, setCarModel] = useState(""); // مدل خودرو
  const [category, setCategory] = useState(""); // قسمت خودرو: ترمز، موتور...
  const [partBrand, setPartBrand] = useState(""); // سازنده قطعه: ایساکو، والئو...
  const [dateFilter, setDateFilter] = useState("all"); // تاریخ: all, week, month, quarter
  const [inStockOnly, setInStockOnly] = useState(false); // فقط موجود
  const [sort, setSort] = useState("default"); // مرتب‌سازی

  // وضعیت رابط و کشوها
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>(props.initialItems);
  const [loading, setLoading] = useState(false);
  const [selectedQuickBuy, setSelectedQuickBuy] = useState<{ item: CatalogItem; qty: number } | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [cartShippingId, setCartShippingId] = useState(props.shipping[0]?.id ?? "");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  const isInitialMount = useRef(true);

  // واکشی کاتالوگ با فیلترها
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams();
    if (query.trim()) qs.set("q", query.trim());
    if (carBrand) qs.set("brand", carBrand);
    if (carModel) qs.set("model", carModel);
    if (category) qs.set("category", category);
    if (partBrand) qs.set("partBrand", partBrand);
    if (inStockOnly) qs.set("inStock", "true");
    if (dateFilter !== "all") qs.set("dateFilter", dateFilter);
    if (sort !== "default") qs.set("sort", sort);

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
    }
  }, [query, carBrand, carModel, category, partBrand, inStockOnly, dateFilter, sort]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const t = setTimeout(() => {
      load();
    }, 280);

    return () => clearTimeout(t);
  }, [query, carBrand, carModel, category, partBrand, inStockOnly, dateFilter, sort, load]);

  // استخراج لیست گزینه‌های فیلتر از کل کاتالوگ
  const allCarBrands = useMemo(
    () => Array.from(new Set(props.initialItems.map((i) => i.brand))).filter(Boolean).sort(),
    [props.initialItems],
  );

  const allCategories = useMemo(
    () => Array.from(new Set(props.initialItems.map((i) => i.category))).filter(Boolean).sort(),
    [props.initialItems],
  );

  const allPartBrands = useMemo(
    () => Array.from(new Set(props.initialItems.map((i) => i.partBrand))).filter(Boolean).sort() as string[],
    [props.initialItems],
  );

  const allModels = useMemo(() => {
    const list = props.initialItems
      .filter((i) => !carBrand || i.brand === carBrand)
      .map((i) => i.model)
      .filter(Boolean) as string[];
    return Array.from(new Set(list)).sort();
  }, [props.initialItems, carBrand]);

  // شمارش تعداد فیلترهای فعال
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (carBrand) count++;
    if (carModel) count++;
    if (category) count++;
    if (partBrand) count++;
    if (inStockOnly) count++;
    if (dateFilter !== "all") count++;
    if (sort !== "default") count++;
    return count;
  }, [carBrand, carModel, category, partBrand, inStockOnly, dateFilter, sort]);

  const resetAllFilters = () => {
    setQuery("");
    setCarBrand("");
    setCarModel("");
    setCategory("");
    setPartBrand("");
    setInStockOnly(false);
    setDateFilter("all");
    setSort("default");
  };

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

    setAddedToast(`«${item.name}» (${toFaDigits(addQty)} ${item.unit}) به سبد سفارش اضافه شد`);
    setTimeout(() => setAddedToast(null), 2500);
  };

  const updateCartQty = useCallback((productId: string, newQty: number) => {
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
  }, []);

  const removeCartItem = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.item.id !== productId));
  };

  // مدیریت تعداد انتخابی در لحظه برای هر کالا
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [rawInputValues, setRawInputValues] = useState<Record<string, string>>({});

  const getItemQty = useCallback(
    (item: CatalogItem) => {
      const inCart = cart.find((c) => c.item.id === item.id);
      if (inCart) return inCart.qty;
      return itemQuantities[item.id] ?? Math.max(item.minQty, item.packSize, 1);
    },
    [cart, itemQuantities],
  );

  const setItemQty = useCallback(
    (item: CatalogItem, desired: number) => {
      const min = Math.max(1, item.minQty);
      const max = item.stockQty > 0 ? item.stockQty : 1;
      const valid = Math.max(min, Math.min(max, desired));

      const inCart = cart.find((c) => c.item.id === item.id);
      if (inCart) {
        updateCartQty(item.id, valid);
      } else {
        setItemQuantities((prev) => ({ ...prev, [item.id]: valid }));
      }
      setRawInputValues((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    },
    [cart, updateCartQty],
  );

  const adjustItemQty = useCallback(
    (item: CatalogItem, delta: number) => {
      const current = getItemQty(item);
      const step = Math.max(1, item.packSize);
      const next = current + delta * step;
      setItemQty(item, next);
    },
    [getItemQty, setItemQty],
  );

  const handleQtyInputChange = (item: CatalogItem, text: string) => {
    const digitsOnly = text.replace(/\D/g, "");
    setRawInputValues((prev) => ({ ...prev, [item.id]: digitsOnly }));
    if (digitsOnly.length > 0) {
      const parsed = parseInt(digitsOnly, 10);
      if (!isNaN(parsed) && parsed > 0) {
        const inCart = cart.find((c) => c.item.id === item.id);
        const max = item.stockQty > 0 ? item.stockQty : 1;
        const clamped = Math.min(max, parsed);
        if (inCart) {
          updateCartQty(item.id, clamped);
        } else {
          setItemQuantities((prev) => ({ ...prev, [item.id]: clamped }));
        }
      }
    }
  };

  const handleQtyInputBlur = (item: CatalogItem) => {
    const raw = rawInputValues[item.id];
    if (raw !== undefined) {
      const parsed = parseInt(raw, 10);
      const min = Math.max(1, item.minQty);
      if (isNaN(parsed) || parsed < min) {
        setItemQty(item, min);
      } else {
        setItemQty(item, parsed);
      }
    }
  };

  // خلاصه مبالغ سبد
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
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 pb-28">
      {/* اعلان موقت (Toast) */}
      {addedToast && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-200">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span>{addedToast}</span>
        </div>
      )}

      {/* سر صفحه و وضعیت تخفیف‌ها */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
            کاتالوگ قطعات یدکی خودرو
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            فیلتر پیشرفته بر اساس خودرو، مدل، قسمت فنی، برند سازنده قطعه و تاریخ ورود
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs flex-wrap">
          <div className="border border-slate-200 rounded-lg px-3 py-1.5 bg-white shadow-2xs">
            <span className="text-slate-500 font-medium">تخفیف طبقه: </span>
            <b className="text-blue-600 nums font-bold text-sm">{toFaDigits(props.tierDiscount)}٪</b>
          </div>
          {props.customerDiscount > 0 && (
            <div className="border border-slate-200 rounded-lg px-3 py-1.5 bg-white shadow-2xs">
              <span className="text-slate-500 font-medium">تخفیف همکار: </span>
              <b className="text-blue-600 nums font-bold text-sm">{toFaDigits(props.customerDiscount)}٪</b>
            </div>
          )}
          {cart.length > 0 && (
            <button
              onClick={() => setShowCartDrawer(true)}
              className="btn btn-orange text-xs px-3.5 py-1.5 flex items-center gap-2 shadow-sm font-black rounded-lg"
            >
              <span>سبد سفارش</span>
              <span className="nums font-black bg-white text-orange-700 rounded-full px-1.5 py-0.5 text-[11px] leading-none shadow-2xs">
                {toFaDigits(cart.length)}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* مرکز صفحه: بخش جست‌وجوی هوشمند محصول و فیلترهای انتخابی */}
      <div className="mt-4 p-4 sm:p-5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs space-y-4">
        {/* ۱. نوار جست‌وجوی هوشمند قطعه در مرکز */}
        <div className="flex flex-col gap-2.5 sm:flex-row items-center">
          <div className="relative flex-1 w-full">
            <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" x2="16.65" y1="21" y2="16.65" />
              </svg>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جست‌وجوی نام قطعه، کد فنی SKU، کد OEM، بارکد یا برند سازنده قطعه..."
              className="input py-3 pr-11 pl-9 text-xs sm:text-sm border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 rounded-xl bg-slate-50/50 hover:bg-white transition-all w-full font-medium"
              autoComplete="off"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute inset-y-0 left-2.5 px-2 text-slate-400 hover:text-slate-700 text-sm"
                aria-label="پاک کردن"
              >
                ✕
              </button>
            )}
          </div>

          {/* دکمه فیلترهای تکمیلی */}
          <button
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
            className={`btn text-xs px-4 py-3 rounded-xl flex items-center gap-2 border transition-all w-full sm:w-auto shrink-0 min-h-[46px] ${
              activeFiltersCount > 0 || showAdvancedFilters
                ? "bg-blue-50 border-blue-300 text-blue-700 font-bold"
                : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span>فیلترهای پیشرفته و سازنده</span>
            {activeFiltersCount > 0 && (
              <span className="size-5 rounded-full bg-blue-600 text-white grid place-items-center text-[10px] font-bold nums">
                {toFaDigits(activeFiltersCount)}
              </span>
            )}
          </button>
        </div>

            {/* ۱. چیپس‌های لمسی سریع برای برند خودروها */}
            <div className="pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1.5">
                <span className="font-bold text-slate-700">انتخاب خودرو:</span>
                {carBrand && (
                  <button onClick={() => setCarBrand("")} className="text-blue-600 hover:underline font-bold">
                    همه خودروها
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                <button
                  onClick={() => setCarBrand("")}
                  className={`px-3.5 py-1.5 rounded-full shrink-0 transition-all font-bold ${
                    carBrand === ""
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/25"
                      : "bg-slate-50 border border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-white"
                  }`}
                >
                  همه خودروها
                </button>
                {allCarBrands.map((b) => (
                  <button
                    key={b}
                    onClick={() => setCarBrand(b === carBrand ? "" : b)}
                    className={`px-3.5 py-1.5 rounded-full shrink-0 transition-all font-bold ${
                      carBrand === b
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/25"
                        : "bg-slate-50 border border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-white"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* ۲. چیپس‌های لمسی سریع برای قسمت‌ها و بخش‌های فنی خودرو */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1.5">
                <span className="font-bold text-slate-700">قسمت و بخش فنی خودرو:</span>
                {category && (
                  <button onClick={() => setCategory("")} className="text-orange-600 hover:underline font-bold">
                    همه قسمت‌ها
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                <button
                  onClick={() => setCategory("")}
                  className={`px-3.5 py-1.5 rounded-full shrink-0 transition-all font-bold ${
                    category === ""
                      ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-sm shadow-orange-500/25"
                      : "bg-slate-50 border border-slate-200 text-slate-700 hover:border-orange-300 hover:bg-white"
                  }`}
                >
                  همه قسمت‌ها
                </button>
                {allCategories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c === category ? "" : c)}
                    className={`px-3.5 py-1.5 rounded-full shrink-0 transition-all font-bold ${
                      category === c
                        ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-sm shadow-orange-500/25"
                        : "bg-slate-50 border border-slate-200 text-slate-700 hover:border-orange-300 hover:bg-white"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
      </div>

      {/* ۴. پنل فیلترهای پیشرفته: در دسکتاپ پنل آکاردئونی و در موبایل Bottom Sheet استاندارد */}
      {showAdvancedFilters && (
        <>
          {/* نسخه دسکتاپ (md به بالا) */}
          <div className="hidden md:block mt-3 p-5 card bg-white border border-slate-200 rounded-xl shadow-xs space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-bold text-sm text-slate-800">
                تنظیمات فیلترهای تخصصی و مرتب‌سازی
              </span>
              <button
                onClick={resetAllFilters}
                className="text-xs text-rose-600 hover:underline font-medium"
              >
                پاک‌سازی همه فیلترها
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3.5 text-xs">
              <div>
                <label className="label block mb-1">برند سازنده قطعه (پارت برند):</label>
                <select
                  value={partBrand}
                  onChange={(e) => setPartBrand(e.target.value)}
                  className="input text-xs border-slate-300 rounded-lg bg-white"
                >
                  <option value="">همه برندهای سازنده</option>
                  {allPartBrands.map((pb) => (
                    <option key={pb} value={pb}>
                      {pb}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label block mb-1">مدل دقیق خودرو:</label>
                <select
                  value={carModel}
                  onChange={(e) => setCarModel(e.target.value)}
                  className="input text-xs border-slate-300 rounded-lg bg-white"
                >
                  <option value="">همه مدل‌ها</option>
                  {allModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label block mb-1">تاریخ ورود به انبار:</label>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="input text-xs border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">همه زمان‌ها</option>
                  <option value="week">اقلام جدید (۷ روز اخیر)</option>
                  <option value="month">اقلام ماه اخیر (۳۰ روز)</option>
                  <option value="quarter">سه ماه اخیر (۹۰ روز)</option>
                </select>
              </div>

              <div>
                <label className="label block mb-1">مرتب‌سازی بر اساس:</label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="input text-xs border-slate-300 rounded-lg bg-white font-medium"
                >
                  <option value="default">پیش‌فرض (خودرو و گروه کالا)</option>
                  <option value="newest">جدیدترین قطعات اضافه شده</option>
                  <option value="price_asc">ارزان‌ترین به گران‌ترین</option>
                  <option value="price_desc">گران‌ترین به ارزان‌ترین</option>
                  <option value="stock_desc">بیشترین موجودی انبار</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>فقط نمایش قطعات موجود در انبار مرکزی</span>
              </label>

              <span className="nums text-xs text-slate-500">
                تعداد نتایج منطبق: <b className="text-slate-900 font-bold">{toFaDigits(items.length)}</b> قلم کالا
              </span>
            </div>
          </div>

          {/* نسخه موبایل: کشوی لغزنده از پایین (Mobile Filter Bottom Sheet) */}
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white w-full rounded-t-2xl max-h-[85vh] overflow-y-auto p-4 flex flex-col border-t border-slate-200 shadow-2xl animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">فیلترهای تخصصی و مرتب‌سازی</span>
                  {activeFiltersCount > 0 && (
                    <span className="size-5 rounded-full bg-blue-600 text-white grid place-items-center text-[10px] font-bold nums">
                      {toFaDigits(activeFiltersCount)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowAdvancedFilters(false)}
                  className="size-8 grid place-items-center text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 text-base"
                  aria-label="بستن فیلترها"
                >
                  ✕
                </button>
              </div>

              <div className="py-4 space-y-3.5 text-xs">
                <div>
                  <label className="label block mb-1">برند سازنده قطعه (پارت برند):</label>
                  <select
                    value={partBrand}
                    onChange={(e) => setPartBrand(e.target.value)}
                    className="input text-xs border-slate-300 rounded-lg bg-white h-11"
                  >
                    <option value="">همه برندهای سازنده</option>
                    {allPartBrands.map((pb) => (
                      <option key={pb} value={pb}>
                        {pb}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label block mb-1">مدل دقیق خودرو:</label>
                  <select
                    value={carModel}
                    onChange={(e) => setCarModel(e.target.value)}
                    className="input text-xs border-slate-300 rounded-lg bg-white h-11"
                  >
                    <option value="">همه مدل‌ها</option>
                    {allModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label block mb-1">تاریخ ورود به انبار:</label>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="input text-xs border-slate-300 rounded-lg bg-white h-11"
                  >
                    <option value="all">همه زمان‌ها</option>
                    <option value="week">اقلام جدید (۷ روز اخیر)</option>
                    <option value="month">اقلام ماه اخیر (۳۰ روز)</option>
                    <option value="quarter">سه ماه اخیر (۹۰ روز)</option>
                  </select>
                </div>

                <div>
                  <label className="label block mb-1">مرتب‌سازی بر اساس:</label>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="input text-xs border-slate-300 rounded-lg bg-white h-11 font-medium"
                  >
                    <option value="default">پیش‌فرض (خودرو و گروه کالا)</option>
                    <option value="newest">جدیدترین قطعات اضافه شده</option>
                    <option value="price_asc">ارزان‌ترین به گران‌ترین</option>
                    <option value="price_desc">گران‌ترین به ارزان‌ترین</option>
                    <option value="stock_desc">بیشترین موجودی انبار</option>
                  </select>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer select-none text-xs text-slate-800 font-medium">
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                      className="size-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>فقط نمایش قطعات موجود در انبار مرکزی</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="btn btn-ghost text-xs px-3 py-3 rounded-lg text-rose-600 hover:bg-rose-50"
                >
                  پاک‌سازی همه
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(false)}
                  className="btn btn-brass flex-1 text-xs py-3 rounded-lg font-bold shadow-sm"
                >
                  اعمال و مشاهده نتایج ({toFaDigits(items.length)})
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* برچسب‌های فیلترهای فعال با امکان حذف تک‌تک */}
      {activeFiltersCount > 0 && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap text-[11px]">
          <span className="text-slate-500 font-medium">فیلترهای فعال:</span>

          {carBrand && (
            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200">
              <span>خودرو: {carBrand}</span>
              <button onClick={() => setCarBrand("")} className="hover:text-rose-600">✕</button>
            </span>
          )}

          {category && (
            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200">
              <span>بخش: {category}</span>
              <button onClick={() => setCategory("")} className="hover:text-rose-600">✕</button>
            </span>
          )}

          {partBrand && (
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200">
              <span>سازنده: {partBrand}</span>
              <button onClick={() => setPartBrand("")} className="hover:text-rose-600">✕</button>
            </span>
          )}

          {carModel && (
            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200">
              <span>مدل: {carModel}</span>
              <button onClick={() => setCarModel("")} className="hover:text-rose-600">✕</button>
            </span>
          )}

          {dateFilter !== "all" && (
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200">
              <span>
                تاریخ: {dateFilter === "week" ? "هفته اخیر" : dateFilter === "month" ? "ماه اخیر" : "سه ماه اخیر"}
              </span>
              <button onClick={() => setDateFilter("all")} className="hover:text-rose-600">✕</button>
            </span>
          )}

          {inStockOnly && (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200">
              <span>فقط موجود</span>
              <button onClick={() => setInStockOnly(false)} className="hover:text-rose-600">✕</button>
            </span>
          )}

          {sort !== "default" && (
            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200">
              <span>
                مرتب‌سازی:{" "}
                {sort === "newest"
                  ? "جدیدترین"
                  : sort === "price_asc"
                  ? "ارزان‌ترین"
                  : sort === "price_desc"
                  ? "گران‌ترین"
                  : "بیشترین موجودی"}
              </span>
              <button onClick={() => setSort("default")} className="hover:text-rose-600">✕</button>
            </span>
          )}

          <button onClick={resetAllFilters} className="text-rose-600 hover:underline ms-1 font-medium">
            حذف همه
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 card border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 rounded-lg">
          {error}
        </div>
      )}

      {/* نمایش قطعات کاتالوگ: طراحی اختصاصی دوگانه (جدول متراکم برای دسکتاپ، کارت‌های لمسی مدرن برای موبایل) */}
      <div className="mt-4">
        {loading ? (
          <div className="card p-14 text-center text-xs text-slate-500 flex flex-col items-center gap-2.5 bg-white border border-slate-200 rounded-xl">
            <span className="size-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>در حال واکشی قطعات مطابق فیلترها...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="card p-10 sm:p-14 text-center text-xs text-slate-500 space-y-3 bg-white border border-slate-200 rounded-xl">
            <p className="font-bold text-slate-800 text-base">قطعه‌ای مطابق با این فیلترها پیدا نشد.</p>
            <p className="text-slate-500 max-w-md mx-auto">
              می‌توانید فیلترها را حذف کنید، یا قطعه مورد نظر را در استعلام چندردیفی (RFQ) ثبت نمایید.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button onClick={resetAllFilters} className="btn btn-ghost text-xs px-4 py-2">
                پاک‌سازی فیلترها
              </button>
              <button
                onClick={() => router.push("/inquiries")}
                className="btn btn-brass text-xs px-4 py-2"
              >
                ثبت استعلام (RFQ)
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ۱. نمای موبایل (Mobile Cards) — کاملاً لمسی، خوانا و با استانداردهای اپلیکیشن‌های B2B برتر دنیا */}
            <div className="md:hidden space-y-3">
              {items.map((item) => {
                const inCart = cart.find((c) => c.item.id === item.id);
                const hasVolumeDiscount = item.volumePrices && item.volumePrices.length > 0;
                const currentQty = getItemQty(item);

                return (
                  <div
                    key={item.id}
                    className="p-3.5 bg-white border border-slate-200/90 rounded-xl shadow-2xs space-y-3 transition-shadow hover:shadow-xs"
                  >
                    {/* ردیف اول: برند سازنده قطعه + کد فنی SKU + برچسب موجودی */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        {item.partBrand && (
                          <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 rounded-md px-2 py-0.5">
                            {item.partBrand}
                          </span>
                        )}
                        <span className="nums text-[11px] font-mono font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-md px-2 py-0.5">
                          {item.sku}
                        </span>
                      </div>

                      {item.stockQty > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full font-medium text-[11px] shrink-0">
                          <span className="size-1.5 rounded-full bg-emerald-600" />
                          <span className="nums font-bold">{toFaDigits(item.stockQty)}</span> {item.unit}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full font-medium text-[11px] shrink-0">
                          <span className="size-1.5 rounded-full bg-rose-600" />
                          <span>ناموجود</span>
                        </span>
                      )}
                    </div>

                    {/* نام قطعه و جزئیات سازگاری */}
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 leading-snug">{item.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-2 flex-wrap">
                        <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                          {item.brand} {item.model ? `· ${item.model}` : ""}
                        </span>
                        <span className="text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                          {item.category}
                        </span>
                        {item.packSize > 1 && (
                          <span className="text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px] nums">
                            بسته {toFaDigits(item.packSize)} تایی
                          </span>
                        )}
                        {hasVolumeDiscount && (
                          <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[11px] font-medium">
                            تخفیف تیراژ
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ردیف قیمت */}
                    <div className="pt-2 border-t border-slate-100 flex items-baseline justify-between">
                      <span className="text-xs text-slate-500 font-medium">قیمت همکاری:</span>
                      <div className="text-left nums">
                        {item.priceBefore && item.priceBefore > (item.price ?? 0) && (
                          <span className="block text-[11px] text-slate-400 line-through">
                            {formatToman(item.priceBefore)} تومان
                          </span>
                        )}
                        <div className="flex items-baseline gap-1">
                          {item.price !== null ? (
                            <>
                              <span className="font-black text-xl text-blue-700">
                                {formatToman(item.price)}
                              </span>
                              <span className="text-xs text-slate-500 font-bold">تومان</span>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">پس از تأیید حساب</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* نوار انتخاب تعداد در لحظه (Instant Inline Quantity) */}
                    <div className="pt-2.5 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 font-bold">
                          <span>تعداد موردنیاز:</span>
                          {item.packSize > 1 && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              (بسته {toFaDigits(item.packSize)} عددی)
                            </span>
                          )}
                        </div>

                        {/* استپر تعداد با قابلیت درج مستقیم هر عدد */}
                        <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-slate-50 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => adjustItemQty(item, -1)}
                            disabled={currentQty <= item.minQty || item.stockQty <= 0}
                            className="size-9 grid place-items-center text-slate-700 hover:bg-slate-200 active:scale-90 font-black text-lg disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                            aria-label="کاهش تعداد"
                          >
                            −
                          </button>
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={rawInputValues[item.id] ?? currentQty}
                              onChange={(e) => handleQtyInputChange(item, e.target.value)}
                              onBlur={() => handleQtyInputBlur(item)}
                              disabled={item.stockQty <= 0}
                              className="w-14 h-9 text-center bg-white font-black text-sm text-slate-900 border-x border-slate-300 outline-none focus:bg-blue-50 focus:text-blue-700 transition-colors nums"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => adjustItemQty(item, 1)}
                            disabled={currentQty >= item.stockQty || item.stockQty <= 0}
                            className="size-9 grid place-items-center text-slate-700 hover:bg-slate-200 active:scale-90 font-black text-lg disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                            aria-label="افزایش تعداد"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* چیپس‌های میانبر پله‌های تخفیف تیراژ در صورت وجود */}
                      {hasVolumeDiscount && item.volumePrices.length > 0 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
                          <span className="text-slate-400 text-[10px] shrink-0 font-medium">پله‌های تیراژ:</span>
                          {item.volumePrices.map((vp) => (
                            <button
                              key={vp.qtyFrom}
                              type="button"
                              onClick={() => setItemQty(item, vp.qtyFrom)}
                              className={`px-2 py-0.5 rounded-lg font-bold shrink-0 transition-colors text-[10px] ${
                                currentQty >= vp.qtyFrom
                                  ? "bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs"
                                  : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
                              }`}
                            >
                              {toFaDigits(vp.qtyFrom)} {item.unit} ({toFaDigits(vp.discountPercent)}٪-)
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* دکمه‌های اقدام خرید */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {inCart ? (
                        <div className="h-11 rounded-xl px-2.5 text-xs font-black bg-blue-50 border border-blue-300 text-blue-800 flex items-center justify-between gap-1 shadow-2xs">
                          <span className="truncate">در سبد: {toFaDigits(inCart.qty)} {item.unit}</span>
                          <button
                            type="button"
                            onClick={() => removeCartItem(item.id)}
                            className="size-6 grid place-items-center text-rose-500 hover:text-rose-700 hover:bg-rose-100 rounded-md transition-colors font-bold text-xs"
                            title="حذف از سبد"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCart(item, currentQty)}
                          disabled={!props.canOrder || item.stockQty <= 0 || item.price === null}
                          className="h-11 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 active:scale-98 text-white shadow-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <svg className="size-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="8" cy="21" r="1" />
                            <circle cx="19" cy="21" r="1" />
                            <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                          </svg>
                          <span>+ سبد ({toFaDigits(currentQty)})</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedQuickBuy({ item, qty: currentQty })}
                        disabled={!props.canOrder || item.stockQty <= 0 || item.price === null}
                        className="h-11 rounded-xl text-xs font-black btn-blue active:scale-98 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                        <span>خرید فوری ({toFaDigits(currentQty)})</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ۲. نمای دسکتاپ (Desktop Table View) */}
            <div className="hidden md:block card overflow-hidden border-slate-200 shadow-2xs rounded-xl bg-white">
              <div className="grid grid-cols-[7.5rem_1.3fr_5.5rem_8rem_16.5rem] gap-2 px-5 py-3 border-b border-slate-200 bg-slate-50/90 text-xs font-semibold text-slate-600">
                <span>کد فنی و برند</span>
                <span>شرح قطعه و مشخصات</span>
                <span className="text-center">موجودی انبار</span>
                <span className="text-left">قیمت همکار</span>
                <span className="text-center">تعداد و اقدام سفارش</span>
              </div>

              <ul className="divide-y divide-slate-100">
                {items.map((item) => {
                  const inCart = cart.find((c) => c.item.id === item.id);
                  const hasVolumeDiscount = item.volumePrices && item.volumePrices.length > 0;
                  const currentQty = getItemQty(item);

                  return (
                    <li
                      key={item.id}
                      className="px-5 py-4 grid grid-cols-[7.5rem_1.3fr_5.5rem_8rem_16.5rem] items-center gap-2 hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="nums text-[11px] font-mono font-semibold text-slate-700 border border-slate-200 rounded px-2 py-0.5 bg-slate-50 self-start">
                          {item.sku}
                        </span>
                        {item.partBrand && (
                          <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200/60 rounded px-1.5 py-0.2 self-start">
                            {item.partBrand}
                          </span>
                        )}
                        {item.oemCode && (
                          <span className="text-[10px] text-slate-400 font-mono hidden lg:inline">
                            OEM: {item.oemCode}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 leading-snug">{item.name}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                          <span className="font-semibold text-slate-800">{item.brand}</span>
                          {item.model && <span>· {item.model}</span>}
                          <span className="text-slate-400">· {item.category}</span>
                          {item.packSize > 1 && (
                            <span className="text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded text-[10px] nums font-medium">
                              بسته {toFaDigits(item.packSize)} تایی
                            </span>
                          )}
                          {hasVolumeDiscount && (
                            <span className="text-amber-700 bg-amber-50 border border-amber-200/60 px-1.5 py-0.2 rounded text-[10px] nums font-medium">
                              تخفیف تیراژ
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-center text-xs">
                        {item.stockQty > 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full font-medium text-[11px]">
                            <span className="size-1.5 rounded-full bg-emerald-600" />
                            <span className="nums font-bold">{toFaDigits(item.stockQty)}</span> {item.unit}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full font-medium text-[11px]">
                            <span className="size-1.5 rounded-full bg-rose-600" />
                            <span>ناموجود</span>
                          </span>
                        )}
                      </div>

                      <div className="text-left text-xs">
                        {item.price !== null ? (
                          <div className="nums">
                            {item.priceBefore && item.priceBefore > item.price && (
                              <span className="block text-[10px] text-slate-400 line-through">
                                {formatToman(item.priceBefore)}
                              </span>
                            )}
                            <span className="font-black text-base text-blue-700">{formatToman(item.price)}</span>
                            <span className="text-[11px] text-slate-400 font-normal ms-1">تومان</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">پس از تأیید حساب</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 justify-end">
                        {/* استپر تعداد با قابلیت درج مستقیم هر عدد */}
                        <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs h-8 shrink-0">
                          <button
                            type="button"
                            onClick={() => adjustItemQty(item, -1)}
                            disabled={currentQty <= item.minQty || item.stockQty <= 0}
                            className="w-7 h-full grid place-items-center text-slate-700 hover:bg-slate-100 active:scale-90 font-black text-sm disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                            aria-label="کاهش"
                          >
                            −
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={rawInputValues[item.id] ?? currentQty}
                            onChange={(e) => handleQtyInputChange(item, e.target.value)}
                            onBlur={() => handleQtyInputBlur(item)}
                            disabled={item.stockQty <= 0}
                            className="w-12 h-full text-center font-black text-xs text-slate-900 border-x border-slate-200 outline-none focus:bg-blue-50 focus:text-blue-700 transition-colors nums"
                          />
                          <button
                            type="button"
                            onClick={() => adjustItemQty(item, 1)}
                            disabled={currentQty >= item.stockQty || item.stockQty <= 0}
                            className="w-7 h-full grid place-items-center text-slate-700 hover:bg-slate-100 active:scale-90 font-black text-sm disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                            aria-label="افزایش"
                          >
                            +
                          </button>
                        </div>

                        {/* دکمه‌های اقدام سفارش */}
                        {inCart ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg">
                              در سبد
                            </span>
                            <button
                              type="button"
                              onClick={() => removeCartItem(item.id)}
                              className="size-7 grid place-items-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors text-xs font-bold cursor-pointer"
                              title="حذف از سبد"
                            >
                              ✕
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedQuickBuy({ item, qty: currentQty })}
                              disabled={!props.canOrder || item.stockQty <= 0 || item.price === null}
                              className="btn btn-blue text-xs px-2.5 py-1.5 rounded-lg font-black shadow-xs shrink-0"
                            >
                              فوری
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => addToCart(item, currentQty)}
                              disabled={!props.canOrder || item.stockQty <= 0 || item.price === null}
                              className="btn btn-ghost text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold hover:bg-slate-100 hover:border-slate-400 shrink-0"
                              title="افزودن تعداد مشخص به سبد"
                            >
                              + سبد
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedQuickBuy({ item, qty: currentQty })}
                              disabled={!props.canOrder || item.stockQty <= 0 || item.price === null}
                              className="btn btn-blue text-xs px-2.5 py-1.5 rounded-lg font-black shadow-xs hover:shadow-blue-500/20 shrink-0"
                            >
                              فوری
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </div>

      {/* نوار شناور پایین صفحه در صورت داشتن کالا در سبد — با فاصله امن از نوار پایین موبایل */}
      {cart.length > 0 && (
        <div className="fixed bottom-[calc(4.2rem+env(safe-area-inset-bottom))] md:bottom-6 inset-x-3 md:inset-x-auto md:left-8 md:right-8 md:max-w-2xl md:mx-auto z-30 animate-in slide-in-from-bottom-4 duration-200">
          <div className="card bg-slate-900 text-white p-3 sm:px-5 sm:py-3.5 rounded-xl shadow-2xl flex items-center justify-between gap-3 border border-slate-800">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <span className="size-9 sm:size-10 grid place-items-center bg-blue-600 text-white rounded-lg font-bold text-xs sm:text-sm shrink-0">
                {toFaDigits(cartSummary.distinctCount)}
              </span>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-white leading-tight truncate">سبد سفارش همکار</p>
                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 nums truncate">
                  {toFaDigits(cartSummary.itemCount)} قطعه · مجموع: {formatToman(cartSummary.subtotal)} ت
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowCartDrawer(true)}
              className="btn btn-orange text-xs px-3.5 sm:px-5 py-2 font-black shadow-md shadow-orange-500/20 hover:scale-102 transition-transform shrink-0"
            >
              مشاهده سبد سفارش
            </button>
          </div>
        </div>
      )}

      {/* شیت / کشوی سبد سفارش چندقلمی */}
      {showCartDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs">
          <div className="card w-full max-w-lg h-full overflow-y-auto p-4 sm:p-6 bg-white shadow-2xl flex flex-col justify-between border-s border-slate-200 animate-in slide-in-from-left duration-200 rounded-none sm:rounded-s-2xl">
            <div>
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-200">
                <div>
                  <h2 className="font-extrabold text-base text-slate-900">سبد سفارش B2B</h2>
                  <p className="text-xs text-slate-500">
                    {toFaDigits(cartSummary.distinctCount)} ردیف کالای انتخابی
                  </p>
                </div>
                <button
                  onClick={() => setShowCartDrawer(false)}
                  className="text-slate-400 hover:text-slate-700 text-xl font-bold p-1"
                >
                  ✕
                </button>
              </div>

              {checkoutError && (
                <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
                  {checkoutError}
                </div>
              )}

              {/* لیست اقلام سبد */}
              <div className="mt-4 divide-y divide-slate-100">
                {cart.map((c) => (
                  <div key={c.item.id} className="py-3.5 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs sm:text-sm text-slate-900 leading-snug">{c.item.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono nums mt-0.5">
                        {c.item.sku} · {c.item.brand} {c.item.partBrand ? `· ${c.item.partBrand}` : ""}
                      </p>
                      <p className="text-xs text-blue-600 font-extrabold nums mt-1">
                        فی: {formatToman(c.item.price ?? 0)} تومان
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1 border border-slate-200 rounded-lg bg-slate-50 p-0.5">
                        <button
                          onClick={() => updateCartQty(c.item.id, c.qty - c.item.packSize)}
                          className="size-7 grid place-items-center text-xs font-bold hover:bg-slate-200 rounded"
                        >
                          −
                        </button>
                        <span className="nums text-xs font-bold px-2 text-slate-800">{toFaDigits(c.qty)}</span>
                        <button
                          onClick={() => updateCartQty(c.item.id, c.qty + c.item.packSize)}
                          className="size-7 grid place-items-center text-xs font-bold hover:bg-slate-200 rounded"
                        >
                          +
                        </button>
                      </div>

                      <button
                        onClick={() => removeCartItem(c.item.id)}
                        className="text-[11px] text-rose-600 hover:underline font-medium"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* بخش نهایی و صدور */}
            <div className="pt-4 border-t border-slate-200 space-y-3.5 mt-6">
              <div>
                <label className="label block mb-1">روش ارسال باربری:</label>
                <select
                  value={cartShippingId}
                  onChange={(e) => setCartShippingId(e.target.value)}
                  className="input text-xs border-slate-300 rounded-lg"
                >
                  {props.shipping.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.cost > 0 ? `${formatToman(s.cost)} ت` : "پس‌کرایه"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">جمع ناخالص کالاها:</span>
                  <span className="nums font-bold text-slate-800">{formatToman(cartSummary.subtotal)} ت</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">کرایه حمل و نقل:</span>
                  <span className="nums text-slate-800 font-medium">
                    {cartSummary.shippingCost > 0 ? `${formatToman(cartSummary.shippingCost)} ت` : "رایگان"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-sm">
                  <span className="text-slate-900">مبلغ پیش‌فاکتور:</span>
                  <span className="nums text-blue-600 font-extrabold text-base">{formatToman(cartSummary.total)} تومان</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCartDrawer(false)}
                  className="btn btn-ghost text-xs px-3 py-2.5 flex-1 rounded-lg"
                >
                  ادامه انتخاب
                </button>
                <button
                  type="button"
                  onClick={submitCartOrder}
                  disabled={checkoutBusy || cart.length === 0}
                  className="btn btn-emerald text-sm px-4 py-2.5 flex-2 font-black rounded-xl shadow-md shadow-emerald-500/25 active:scale-98"
                >
                  {checkoutBusy ? "در حال ثبت..." : "تأیید و صدور پیش‌فاکتور ←"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* مدال خرید سریع تکی */}
      {selectedQuickBuy && (
        <QuickBuySheet
          item={selectedQuickBuy.item}
          initialQty={selectedQuickBuy.qty}
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
