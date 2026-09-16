"use client";

// تسویه‌ی سبد: ورود (کد پیامکی)، اطلاعات گیرنده/آدرس، منطقه‌ی ارسال، روش پرداخت،
// کوپن و ثبتِ نهاییِ سفارش. ثبت با `idempotencyKey` است تا دکمه‌ی دوبارخورده
// سفارشِ دوباره نسازد.
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ShieldCheck, Ticket, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import { useShopSettings } from "../_components/settings";
import { useShopLogin } from "@/lib/shop-login-ui";
import {
  couponPreview,
  createShopOrder,
  getShippingZones,
  getShopProductsByIds,
} from "@/lib/shop-api";
import { assetUrl } from "@/lib/shop-api";
import { cartCount, useShopCart } from "@/lib/shop-cart";
import { useShopAuth, type ShopCustomer } from "@/lib/shop-auth";
import { shopMoney } from "@/lib/shop-format";
import { faToEn, toFa } from "@/lib/format";
import type { CurrencyUnit, ShopOrderDetail } from "@/lib/shop-types";

export function CheckoutView() {
  const { settings } = useShopSettings();
  const token = useShopAuth((s) => s.token);
  const customer = useShopAuth((s) => s.customer);
  const requestLogin = useShopLogin((s) => s.request);

  if (!token) {
    return <LoginGate unit={settings?.unit ?? "TOMAN"} onLogin={() => requestLogin()} />;
  }

  // کلیدِ «شناسه‌ی مشتری» باعث می‌شود فرم بعد از ورود نوساخته شود تا نام/شماره
  // از پروفایل پر شود؛ و بعد از خروج هم فرمِ تازه بدون اطلاعات قبلی دیده می‌شود.
  return <CheckoutForm key={customer?.id ?? "anon"} customer={customer} unit={settings?.unit ?? "TOMAN"} />;
}

function CheckoutForm({ customer, unit }: { customer: ShopCustomer | null; unit: CurrencyUnit }) {
  const { settings } = useShopSettings();
  const items = useShopCart((s) => s.items);
  const clearCart = useShopCart((s) => s.clear);

  const [placed, setPlaced] = React.useState<ShopOrderDetail | null>(null);
  const [busy, setBusy] = React.useState(false);

  // کلیدِ یکتایِ کلاینت برای ایدمپوتنسی — در طولِ همین فرم ثابت می‌ماند، پس
  // retry (مثلاً شبکه قطع شد و دوباره دکمه خورد) سفارشِ دوباره نمی‌سازد.
  const idempotencyKey = React.useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `shop-${Date.now()}`
  )[0];

  // پیش‌پرکردنِ نام/شماره از پروفایل ورود — lazy init چون فرم با key دوباره ساخته
  // می‌شود (بعد از ورود)، پس این مقدارِ اولیه همان لحظه درست است.
  const [receiverName, setReceiverName] = React.useState(
    () => customer ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") : ""
  );
  const [receiverPhone, setReceiverPhone] = React.useState(() => customer?.phone ?? "");
  const [address, setAddress] = React.useState("");
  const [note, setNote] = React.useState("");
  const [payMethod, setPayMethod] = React.useState("ON_DELIVERY");
  const [zoneId, setZoneId] = React.useState<string | null>(null);
  const [couponCode, setCouponCode] = React.useState("");
  const [coupon, setCoupon] = React.useState<{ code: string; discount: number } | null>(null);
  const [couponMsg, setCouponMsg] = React.useState<string | null>(null);

  const ids = items.map((i) => i.productId);
  const cartDetails = useQuery({
    queryKey: ["shop", "cart-details", ids.slice().sort().join(",")],
    queryFn: () => getShopProductsByIds(ids),
    enabled: ids.length > 0 && !placed,
  });
  const byId = new Map((cartDetails.data ?? []).map((p) => [p.id, p]));
  const subtotal = items.reduce((s, it) => s + (byId.get(it.productId)?.price ?? 0) * it.quantity, 0);

  const zonesQuery = useQuery({ queryKey: ["shop", "shipping-zones"], queryFn: getShippingZones, staleTime: 60_000 });

  if (placed) {
    return <SuccessScreen order={placed} unit={unit} />;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <p className="text-lg font-medium">سبد خرید خالی است</p>
        <Link href="/shop" className="mt-3 inline-block">
          <Button>مشاهده‌ی فروشگاه</Button>
        </Link>
      </div>
    );
  }

  const lines = items
    .map((it) => ({ productId: it.productId, quantity: it.quantity }))
    .filter((l) => byId.get(l.productId)?.price != null);

  const applyCoupon = async () => {
    if (!lines.length) return;
    setBusy(true);
    setCouponMsg(null);
    try {
      const r = await couponPreview(faToEn(couponCode).trim(), lines);
      setCouponMsg(r.message);
      if (r.ok && r.discount) setCoupon({ code: r.code!, discount: r.discount });
      else setCoupon(null);
    } catch (err) {
      setCoupon(null);
      setCouponMsg(err instanceof Error ? err.message : "کد تخفیف معتبر نیست");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) {
      toast.error("سبد خالی است");
      return;
    }
    setBusy(true);
    try {
      const order = await createShopOrder({
        lines,
        receiverName,
        receiverPhone: faToEn(receiverPhone).trim(),
        address,
        payMethod,
        couponCode: coupon?.code,
        note: note.trim() || undefined,
        shippingZoneId: zoneId ?? undefined,
        idempotencyKey,
      });
      clearCart();
      setPlaced(order);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ثبت سفارش ناموفق بود");
    } finally {
      setBusy(false);
    }
  };

  const discount = coupon?.discount ?? 0;
  const zone = zonesQuery.data?.find((z) => z.id === zoneId) ?? null;
  const shippingEstimate = zone ? zone.fee : (settings?.shippingFee ?? 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-xl font-bold">تسویه حساب</h1>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardContent className="space-y-4 p-5">
            <SectionTitle>اطلاعات گیرنده</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="co-name">نام گیرنده</Label>
                <Input id="co-name" required value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-phone">شمارهٔ موبایل</Label>
                <Input id="co-phone" dir="ltr" className="text-right" inputMode="tel" required value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-address">آدرس کامل</Label>
              <Textarea id="co-address" required rows={3} placeholder="استان، شهر، خیابان، پلاک…" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>

            <Separator />
            <SectionTitle>روش ارسال</SectionTitle>
            {zonesQuery.data && zonesQuery.data.length > 0 ? (
              <div className="space-y-1.5">
                <Label>منطقه‌ی ارسال</Label>
                <Select value={zoneId ?? "____"} onValueChange={(v) => setZoneId(v === "____" ? null : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="انتخاب منطقه" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="____">—</SelectItem>
                    {zonesQuery.data.map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.name} — {z.fee === 0 ? "رایگان" : shopMoney(z.fee, unit)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <Separator />
            <SectionTitle>روش پرداخت</SectionTitle>
            <div className="grid gap-2 sm:grid-cols-2">
              <PayOption active={payMethod === "ON_DELIVERY"} label="پرداخت در محل" desc="هنگام تحویل" onSelect={() => setPayMethod("ON_DELIVERY")} />
              <PayOption active={payMethod === "TRANSFER"} label="کارت‌به‌کارت" desc="شماره‌ی کارت پس از ثبت سفارش" onSelect={() => setPayMethod("TRANSFER")} />
            </div>

            <Separator />
            <SectionTitle>توضیحات</SectionTitle>
            <div className="space-y-1.5">
              <Label htmlFor="co-note" className="text-muted-foreground">توضیح برای فروشنده (اختیاری)</Label>
              <Textarea id="co-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* خلاصه */}
        <Card className="h-fit">
          <CardContent className="space-y-3 p-5">
            <h2 className="font-bold">خلاصه‌ی سفارش</h2>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {items.map((it) => {
                const p = byId.get(it.productId);
                return (
                  <div key={it.productId} className="flex items-center gap-2 text-sm">
                    {p?.image && (
                      <img src={assetUrl(p.image)} alt="" className="h-10 w-10 rounded object-cover" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{p?.name ?? "…"}</span>
                    <span className="text-xs text-muted-foreground">× {toFa(it.quantity)}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <Ticket className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Input
                dir="ltr"
                className="text-right"
                placeholder="کد تخفیف"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                aria-label="کد تخفیف"
              />
              <Button type="button" variant="outline" onClick={applyCoupon} disabled={busy || !couponCode.trim()}>
                اعمال
              </Button>
            </div>
            {couponMsg && <p className="text-xs text-muted-foreground">{couponMsg}</p>}

            <Separator />
            <Row label="جمع کالاها" value={shopMoney(subtotal, unit)} />
            {discount > 0 && <Row label="تخفیف" value={`− ${shopMoney(discount, unit)}`} accent />}
            <Row label="ارسال (تخمینی)" value={shippingEstimate > 0 ? shopMoney(shippingEstimate, unit) : "رایگان"} />
            <Separator />
            <RowLabeled label="قابل پرداخت (تخمینی)" value={shopMoney(Math.max(0, subtotal - discount + (shippingEstimate > 0 ? shippingEstimate : 0)), unit)} bold />

            <Button type="submit" size="lg" className="w-full" disabled={busy || !address.trim() || !receiverName.trim() || !receiverPhone.trim()}>
              {busy ? (<><Loader2 className="size-4 animate-spin" aria-hidden /> در حال ثبت…</>) : "ثبت نهایی سفارش"}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden /> مبلغ نهایی روی سرور محاسبه می‌شود
            </p>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function LoginGate({ unit, onLogin }: { unit: CurrencyUnit; onLogin: () => void }) {
  const items = useShopCart((s) => s.items);
  const count = cartCount(items);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <CardContent className="space-y-4 p-6 text-center">
          <Truck className="mx-auto size-10 text-primary" aria-hidden />
          <p className="text-lg font-bold">برای ادامه باید وارد شوید</p>
          <p className="text-sm text-muted-foreground">
            شامل {toFa(count)} قلم. با شماره‌ی موبایل و یک کد پیامکی وارد می‌شوید.
          </p>
          <Button className="w-full" size="lg" onClick={onLogin}>
            ورود با شماره موبایل
          </Button>
          <Link href="/shop" className="block text-sm text-muted-foreground hover:text-primary">بازگشت به فروشگاه</Link>
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">مبلغ نهایی پس از ورود و انتخاب ارسال نمایش داده می‌شود.</p>
    </div>
  );
}

function SuccessScreen({ order, unit }: { order: ShopOrderDetail; unit: CurrencyUnit }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <CheckCircle2 className="mx-auto mb-3 size-14 text-emerald-600" aria-hidden />
      <h1 className="text-xl font-bold">سفارش شما ثبت شد</h1>
      <p className="mt-2 text-muted-foreground">
        شماره‌ی سفارش: <span className="font-semibold text-foreground">{toFa(order.number)}</span>
      </p>
      <p className="mt-1 text-muted-foreground">
        مبلغ: <span className="font-semibold text-foreground">{shopMoney(order.total, unit)}</span>
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button asChild>
          <Link href={`/shop/orders/${order.id}`}>پیگیری سفارش</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/shop">بازگشت به فروشگاه</Link>
        </Button>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-bold text-foreground">{children}</h2>;
}

function PayOption({ active, label, desc, onSelect }: { active: boolean; label: string; desc: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`rounded-xl border p-3 text-right transition-colors ${active ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${accent ? "text-emerald-600" : ""}`}>{value}</span>
    </div>
  );
}

function RowLabeled({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-base">
      <span className={bold ? "font-bold" : "font-medium"}>{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}