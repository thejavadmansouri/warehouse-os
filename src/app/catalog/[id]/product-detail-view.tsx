"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatToman, toFaDigits } from "@/lib/digits";

interface VolumeStep {
  qtyFrom: number;
  discountPercent: number;
  effectiveUnitPrice: number;
  totalStepDiscount: number;
}

interface WarehouseStock {
  warehouseName: string;
  city: string;
  qty: number;
  reserved: number;
  available: number;
}

interface ProductDetailData {
  id: string;
  sku: string;
  oemCode: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  brand: string;
  model: string | null;
  category: string;
  partBrand: string | null;
  unit: string;
  packSize: number;
  minQty: number;
  stockQty: number;
  imageUrl: string | null;
  isActive: boolean;
  basePrice: number;
  customerUnitPrice: number;
  totalDiscountPercent: number;
  volumeSteps: VolumeStep[];
  warehouseStocks: WarehouseStock[];
}

interface RelatedProduct {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  partBrand: string | null;
  price: number;
  stockQty: number;
  imageUrl: string | null;
  unit: string;
}

interface ShippingMethodItem {
  id: string;
  name: string;
  cost: number;
  note: string | null;
}

interface ProductDetailViewProps {
  product: ProductDetailData;
  isAdmin: boolean;
  canOrder: boolean;
  wallet: number;
  availableCredit: number;
  shippingMethods: ShippingMethodItem[];
  relatedProducts: RelatedProduct[];
}

export function ProductDetailView({
  product,
  isAdmin,
  canOrder,
  wallet,
  availableCredit,
  shippingMethods,
  relatedProducts,
}: ProductDetailViewProps) {
  const router = useRouter();

  // تعداد سفارش
  const [qty, setQty] = useState(
    Math.max(product.minQty, product.packSize > 1 ? product.packSize : 1)
  );
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [cartSuccess, setCartSuccess] = useState(false);

  // مودال ویرایش ادمین (تصویر، مشخصات و ...)
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: product.name,
    sku: product.sku,
    oemCode: product.oemCode || "",
    barcode: product.barcode || "",
    brand: product.brand,
    model: product.model || "",
    category: product.category,
    partBrand: product.partBrand || "",
    description: product.description || "",
    imageUrl: product.imageUrl || "",
    price: product.basePrice,
    stockQty: product.stockQty,
    isActive: product.isActive,
  });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // محاسبه قیمت واحد بر اساس تعداد جاری (با پله‌های تخفیف)
  let effectiveUnitPrice = product.customerUnitPrice;
  let activeStepDiscount = product.totalDiscountPercent;

  if (product.volumeSteps.length > 0) {
    const applicableStep = [...product.volumeSteps]
      .reverse()
      .find((step) => qty >= step.qtyFrom);

    if (applicableStep) {
      effectiveUnitPrice = applicableStep.effectiveUnitPrice;
      activeStepDiscount = applicableStep.totalStepDiscount;
    }
  }

  const totalPrice = effectiveUnitPrice * qty;
  const consumerTotal = product.basePrice * qty;
  const partnerSavings = Math.max(0, consumerTotal - totalPrice);

  // افزایش و کاهش گام بر اساس packSize
  const step = Math.max(1, product.packSize);
  const handleIncrease = () => {
    if (product.stockQty > 0 && qty + step > product.stockQty) return;
    setQty((prev) => prev + step);
  };
  const handleDecrease = () => {
    setQty((prev) => Math.max(product.minQty, prev - step));
  };

  // افزودن به سبد و انتقال به کاتالوگ با باز شدن کشوی سبد خرید
  const handleAddToCart = () => {
    router.push(`/catalog?add=${product.id}&qty=${qty}`);
  };

  // ثبت فوری پیش‌فاکتور برای این قطعه و هدایت مستقیم به سند
  const handleDirectOrder = async () => {
    if (!canOrder) {
      alert("حساب شما هنوز تایید نشده است یا دسترسی به ثبت سفارش ندارید.");
      return;
    }
    setOrderBusy(true);
    setOrderError(null);

    try {
      const defaultShipping = shippingMethods[0]?.id;
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingMethodId: defaultShipping,
          items: [{ productId: product.id, qty }],
          note: `ثبت فوری از صفحه اختصاصی قطعه ${product.sku}`,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || json.message || "خطا در ثبت پیش‌فاکتور");
      }

      router.push(`/orders/${json.order.id}?new=1`);
    } catch (err: any) {
      setOrderError(err.message || "خطا در برقراری ارتباط");
      setOrderBusy(false);
    }
  };

  // ذخیره ویرایش‌های ادمین (تصویر و اطلاعات فنی)
  const handleSaveAdminEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditBusy(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          sku: editForm.sku.trim(),
          oemCode: editForm.oemCode.trim() || null,
          barcode: editForm.barcode.trim() || null,
          brand: editForm.brand.trim(),
          model: editForm.model.trim() || null,
          category: editForm.category.trim(),
          partBrand: editForm.partBrand.trim() || null,
          description: editForm.description.trim() || null,
          imageUrl: editForm.imageUrl.trim() || null,
          price: Number(editForm.price),
          stockQty: Number(editForm.stockQty),
          isActive: editForm.isActive,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || "خطا در ذخیره مشخصات قطعه");
      }

      setIsEditOpen(false);
      router.refresh();
    } catch (err: any) {
      setEditError(err.message || "خطا در ارتباط با سرور");
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* ردیف ناوبری و بازگشت */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/90 pb-4">
        <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
          <Link href="/catalog" className="text-blue-600 hover:underline font-bold flex items-center gap-1">
            <span>← بازگشت به کاتالوگ</span>
          </Link>
          <span className="text-slate-300">/</span>
          <span>{product.brand}</span>
          <span className="text-slate-300">/</span>
          <span>{product.category}</span>
          <span className="text-slate-300">/</span>
          <span className="font-bold text-slate-800 truncate max-w-[200px] sm:max-w-xs">{product.name}</span>
        </div>

        {isAdmin && (
          <button
            onClick={() => setIsEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition active:scale-95"
          >
            <span>📷 ویرایش تصویر و مشخصات قطعه</span>
          </button>
        )}
      </div>

      {/* بخش اصلی محصول (دو ستونه) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* ستون راست (ویترین تصویر و گالری) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative aspect-square w-full rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm overflow-hidden flex items-center justify-center group">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="size-24 rounded-2xl bg-gradient-to-tr from-slate-100 to-slate-200 flex items-center justify-center text-slate-400 text-4xl shadow-inner">
                  ⚙️
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500">تصویر رسمی قطعه‌ساز</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">انبار مرکزی کاردو دیار کریمان</p>
                </div>
              </div>
            )}

            {/* نشان برند و وضعیت روی تصویر */}
            <div className="absolute top-4 right-4 flex flex-col gap-1.5">
              {product.partBrand && (
                <span className="rounded-xl bg-slate-900/90 backdrop-blur-md px-3 py-1 text-xs font-black text-amber-400 shadow-md">
                  {product.partBrand}
                </span>
              )}
              {product.stockQty > 15 && (
                <span className="rounded-xl bg-rose-500/90 backdrop-blur-md px-2.5 py-1 text-[11px] font-bold text-white shadow-md flex items-center gap-1">
                  <span>🔥</span>
                  <span>پرفروش هفته کرمان</span>
                </span>
              )}
            </div>

            {/* برچسب انبار در گوشه پایین تصویر */}
            <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-2.5 flex items-center justify-between text-xs shadow-xs">
              <span className="flex items-center gap-1.5 font-bold text-slate-700">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>انبار مرکزی کرمان</span>
              </span>
              <span className="nums font-mono font-bold text-emerald-700">
                {product.stockQty > 0 ? `${toFaDigits(product.stockQty)} ${product.unit} موجود` : "ناموجود"}
              </span>
            </div>
          </div>

          {/* مزایای خرید این قطعه از کاردو */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="text-base text-blue-600">🚚</span>
              <span>تحویل همان‌روز به کلیه باربری‌های کرمان (شمس‌العماره، وطن، پیشتاز، پیام)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base text-emerald-600">🛡️</span>
              <span>تضمین اصالت فیزیکی قطعه و مهلت مرجوعی ۴۸ ساعته کاردو</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base text-amber-600">💳</span>
              <span>امکان تسویه از سقف اعتبار باز یا پرداخت چکی ۳۰ روزه همکاران</span>
            </div>
          </div>
        </div>

        {/* ستون چپ (عنوان، قیمت‌گذاری همکار، تخفیف تیراژ و ثبت فاکتور) */}
        <div className="lg:col-span-7 space-y-5">
          {/* عنوان و برندها */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-extrabold text-blue-800">
                {product.brand} {product.model ? `· ${product.model}` : ""}
              </span>
              <span className="rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                دسته: {product.category}
              </span>
              {product.partBrand && (
                <span className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                  سازنده: {product.partBrand}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 leading-snug">
              {product.name}
            </h1>

            {/* کدهای فنی */}
            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 font-mono flex-wrap">
              <span className="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 font-bold">
                کد کاردو: {product.sku}
              </span>
              {product.oemCode && (
                <span className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-600">
                  کد OEM: {product.oemCode}
                </span>
              )}
              {product.barcode && (
                <span className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-600">
                  بارکد: {product.barcode}
                </span>
              )}
            </div>
          </div>

          {/* اگر کاربر لاگین نکرده باشد یا حساب فعال نباشد */}
          {!canOrder ? (
            <div className="rounded-3xl border border-amber-200/90 bg-gradient-to-br from-amber-50/70 to-orange-50/40 p-6 text-center space-y-4 shadow-xs">
              <div className="size-14 rounded-2xl bg-amber-100 text-amber-800 text-2xl font-black mx-auto flex items-center justify-center shadow-inner">
                🔒
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-base text-slate-900">
                  قیمت ویژه همکار و امکان ثبت پیش‌فاکتور
                </h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                  جهت مشاهده قیمت‌های همکاری نقدی و اعتباری، درصد تخفیف تیراژ و صدور فوری پیش‌فاکتور این قطعه، لطفاً وارد حساب خود شوید.
                </p>
              </div>
              <div className="pt-1">
                <Link
                  href={`/login?next=/catalog/${product.id}`}
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-6 py-3 shadow-md transition active:scale-95"
                >
                  <span>ورود به سامانه همکاران</span>
                  <span>←</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* باکس مالی و قیمت همکار */}
              <div className="rounded-3xl border border-blue-200/90 bg-gradient-to-br from-blue-50/50 via-white to-slate-50/50 p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <span className="text-xs text-slate-400 block mb-0.5">قیمت مصوب مصرف‌کننده:</span>
                    <span className="text-sm text-slate-400 line-through nums font-bold font-mono">
                      {formatToman(product.basePrice)} تومان
                    </span>
                  </div>

                  <div className="text-left">
                    <span className="text-xs font-bold text-blue-700 block mb-0.5">قیمت ویژه همکار کاردو:</span>
                    <div className="text-2xl sm:text-3xl font-black text-blue-600 nums font-mono flex items-baseline gap-1 justify-end">
                      <span>{formatToman(effectiveUnitPrice)}</span>
                      <span className="text-xs font-bold text-slate-600 font-sans">تومان</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-100 pt-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                      {toFaDigits(activeStepDiscount)}٪ تخفیف کل
                    </span>
                    <span className="text-slate-500">
                      سود همکار در هر عدد: <strong className="text-emerald-700 font-mono">{formatToman(product.basePrice - effectiveUnitPrice)} تومان</strong>
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">واحد فروش: هر {product.unit}</span>
                </div>
              </div>

              {/* جدول تخفیف‌های پله‌ای تیراژ */}
              {product.volumeSteps.length > 0 && (
                <div className="rounded-2xl border border-amber-200/90 bg-amber-50/40 p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                    <span className="flex items-center gap-1.5">
                      <span>⚡</span>
                      <span>تخفیف‌های پلکانی تیراژ (خرید عمده‌تر = قیمت ارزان‌تر)</span>
                    </span>
                    <span className="text-[11px] font-normal text-amber-800">کلیک روی هر ردیف برای تنظیم تعداد</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {product.volumeSteps.map((step, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setQty(step.qtyFrom)}
                        className={`rounded-xl border p-2.5 text-right transition flex items-center justify-between ${
                          qty >= step.qtyFrom
                            ? "border-amber-500 bg-amber-100/80 font-bold shadow-xs text-amber-950"
                            : "border-amber-200 bg-white hover:bg-amber-50 text-slate-700"
                        }`}
                      >
                        <div>
                          <span>از {toFaDigits(step.qtyFrom)} {product.unit} به بالا:</span>
                          <span className="mr-1 text-amber-700 font-bold">({toFaDigits(step.totalStepDiscount)}٪)</span>
                        </div>
                        <span className="nums font-mono font-bold text-blue-700">
                          {formatToman(step.effectiveUnitPrice)} ت
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* کنترلر تعداد و دکمه‌های اقدام خرید */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="block text-xs font-bold text-slate-700 mb-1">
                      تعداد سفارش ({product.unit}):
                    </span>
                    {product.packSize > 1 && (
                      <span className="text-[11px] text-amber-700 block">
                        (فروش در بسته‌های {toFaDigits(product.packSize)} تایی)
                      </span>
                    )}
                  </div>

                  {/* شمارنده عددی */}
                  <div className="flex items-center gap-2 bg-slate-100 rounded-2xl p-1 border border-slate-200">
                    <button
                      type="button"
                      onClick={handleDecrease}
                      className="size-9 rounded-xl bg-white shadow-xs font-black text-slate-700 hover:bg-slate-200 active:scale-95 transition flex items-center justify-center text-lg"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={qty}
                      min={product.minQty}
                      step={step}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v >= product.minQty) setQty(v);
                      }}
                      className="w-16 text-center font-mono font-black text-slate-900 bg-transparent focus:outline-none nums text-base"
                    />
                    <button
                      type="button"
                      onClick={handleIncrease}
                      disabled={product.stockQty > 0 && qty + step > product.stockQty}
                      className="size-9 rounded-xl bg-white shadow-xs font-black text-slate-700 hover:bg-slate-200 active:scale-95 transition flex items-center justify-center text-lg disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* جمع کل فاکتور برای این قطعه */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <span className="text-slate-500">
                    مبلغ کل ({toFaDigits(qty)} {product.unit}):
                  </span>
                  <div className="nums font-mono font-black text-xl text-slate-900">
                    {formatToman(totalPrice)} <span className="text-xs font-normal text-slate-500 font-sans">تومان</span>
                  </div>
                </div>

                {partnerSavings > 0 && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2 text-center text-xs text-emerald-800 font-bold">
                    🎉 شما در این سفارش مبلغ {formatToman(partnerSavings)} تومان سود همکار کسب می‌کنید.
                  </div>
                )}

                {orderError && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                    {orderError}
                  </div>
                )}

                {cartSuccess && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 font-bold flex items-center justify-between">
                    <span>✓ به سبد خرید افزوده شد.</span>
                    <Link href="/catalog" className="text-blue-700 underline font-normal">
                      مشاهده سبد و ادامه خرید ↗
                    </Link>
                  </div>
                )}

                {/* دکمه‌های اقدام خرید */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleDirectOrder}
                    disabled={orderBusy || product.stockQty <= 0}
                    className="h-12 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <span>{orderBusy ? "در حال صدور پیش‌فاکتور..." : "⚡ صدور فوری پیش‌فاکتور"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={product.stockQty <= 0}
                    className="h-12 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm shadow-xs transition-all active:scale-98 flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <span>🛒 افزودن به سبد و ادامه</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* جدول مشخصات فنی کامل (Technical Specifications Table) */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
          <span>📋 مشخصات فنی و استانداردهای قطعه</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 text-slate-500 w-1/3">نام کامل قطعه:</td>
                <td className="py-3 px-4 font-bold text-slate-900">{product.name}</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 text-slate-500">برند قطعه‌ساز (تولیدکننده):</td>
                <td className="py-3 px-4 font-bold text-blue-700">{product.partBrand || "شرکتی استاندارد"}</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 text-slate-500">خودروهای سازگار:</td>
                <td className="py-3 px-4 font-bold text-slate-900">{product.brand} {product.model ? `(${product.model})` : ""}</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 text-slate-500">سیستم و قسمت خودرو:</td>
                <td className="py-3 px-4 font-semibold text-slate-800">{product.category}</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 text-slate-500">کد فنی کاردو (SKU):</td>
                <td className="py-3 px-4 font-mono font-bold text-slate-800">{product.sku}</td>
              </tr>
              {product.oemCode && (
                <tr className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 text-slate-500">کد استاندارد OEM فابریک:</td>
                  <td className="py-3 px-4 font-mono text-slate-700">{product.oemCode}</td>
                </tr>
              )}
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 text-slate-500">بسته‌بندی کارتن و تعداد در هر بسته:</td>
                <td className="py-3 px-4 text-slate-800 font-medium">
                  {toFaDigits(product.packSize)} {product.unit} در هر بسته
                </td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 text-slate-500">حداقل تعداد قابل سفارش:</td>
                <td className="py-3 px-4 text-slate-800 font-medium">
                  {toFaDigits(product.minQty)} {product.unit}
                </td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 text-slate-500">محل بارگیری و ارسال:</td>
                <td className="py-3 px-4 font-bold text-emerald-800">
                  انبار مرکزی کاردو (کرمان، شهرک صنعتی شماره ۲)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* بخش توضیحات و نکات نصب */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
          <span>📖 توضیحات و نکات فنی نصب</span>
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
          {product.description ||
            `این قطعه از باکیفیت‌ترین متریال اولیه تولید شده و مطابق با استانداردهای خط تولید خودروسازان اصلی کشور می‌باشد. جهت عملکرد ایده‌آل و حفظ ایمنی، نصب قطعه توسط مکانیک یا تعمیرکار ماهر و مورد تایید توصیه می‌شود. تمامی قطعات کاردو B2B دارای ضمانت اصالت فیزیکی و پشتیبانی فنی می‌باشند.`}
        </p>
      </div>

      {/* قطعات پیشنهادی و مرتبط */}
      {relatedProducts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-900">
              قطعات مرتبط با {product.brand}
            </h3>
            <Link href="/catalog" className="text-xs text-blue-600 hover:underline font-bold">
              مشاهده همه در کاتالوگ ←
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {relatedProducts.map((rel) => (
              <Link
                key={rel.id}
                href={`/catalog/${rel.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:shadow-md hover:border-amber-400 transition-all block space-y-3"
              >
                <div className="aspect-square w-full rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden">
                  {rel.imageUrl ? (
                    <img
                      src={rel.imageUrl}
                      alt={rel.name}
                      className="max-h-full max-w-full object-contain group-hover:scale-105 transition"
                    />
                  ) : (
                    <span className="text-2xl text-slate-300">📦</span>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1">
                    <span>{rel.sku}</span>
                    <span className="text-blue-700 font-sans font-bold">{rel.partBrand || rel.brand}</span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 line-clamp-2 leading-snug group-hover:text-amber-600 transition">
                    {rel.name}
                  </h4>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                  <span className="nums font-mono font-bold text-slate-900">
                    {formatToman(rel.price)} ت
                  </span>
                  <span className="text-[11px] text-emerald-700 font-bold">
                    {rel.stockQty > 0 ? "موجود" : "ناموجود"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* مودال ویرایش ادمین */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-black text-slate-900">
                ویرایش مشخصات و عکس قطعه ({product.sku})
              </h3>
              <button
                onClick={() => setIsEditOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveAdminEdit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    آدرس تصویر قطعه (Image URL)
                  </label>
                  <input
                    type="url"
                    dir="ltr"
                    value={editForm.imageUrl}
                    onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })}
                    placeholder="https://... یا /images/parts/..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    می‌توانید لینک مستقیم تصویر محصول را از هاست یا اینترنت در این قسمت قرار دهید.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نام قطعه *</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">کد فنی (SKU) *</label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={editForm.sku}
                    onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">برند سازنده قطعه</label>
                  <input
                    type="text"
                    value={editForm.partBrand}
                    onChange={(e) => setEditForm({ ...editForm, partBrand: e.target.value })}
                    placeholder="ایساکو، کروز، والئو، عظام..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">برند خودرو *</label>
                  <input
                    type="text"
                    required
                    value={editForm.brand}
                    onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">قیمت پایه مصوب (تومان) *</label>
                  <input
                    type="number"
                    required
                    min="1000"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">موجودی انبار مرکزی *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editForm.stockQty}
                    onChange={(e) => setEditForm({ ...editForm, stockQty: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">توضیحات و مشخصات فنی</label>
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="مشخصات آلیاژ، گارانتی، توصیه‌های نصب..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={editBusy}
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
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
