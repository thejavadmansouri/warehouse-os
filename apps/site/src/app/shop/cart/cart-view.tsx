"use client";

// سبد خرید: ردیف‌ها با قیمتِ تازه‌ی سرور، ویرایش تعداد، مجموع و ورود به تسویه.
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, ShieldCheck, ShoppingCart, Trash2, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

import { useShopSettings } from "../_components/settings";
import { getShopProductsByIds } from "@/lib/shop-api";
import { assetUrl } from "@/lib/shop-api";
import { cartCount, useShopCart } from "@/lib/shop-cart";
import { shopMoney } from "@/lib/shop-format";
import { faToEn, toFa } from "@/lib/format";

export function CartView() {
  const { settings } = useShopSettings();
  const unit = settings?.unit ?? "TOMAN";
  const items = useShopCart((s) => s.items);
  const setQuantity = useShopCart((s) => s.setQuantity);
  const remove = useShopCart((s) => s.remove);

  const ids = items.map((i) => i.productId);
  const detailsQuery = useQuery({
    queryKey: ["shop", "cart-details", ids.slice().sort().join(",")],
    queryFn: () => getShopProductsByIds(ids),
    enabled: ids.length > 0,
  });

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <ShoppingCart className="mx-auto mb-3 size-12 text-muted-foreground/40" aria-hidden />
        <p className="text-lg font-medium">سبد خرید خالی است</p>
        <Link href="/shop" className="mt-3 inline-block">
          <Button>مشاهده‌ی فروشگاه</Button>
        </Link>
      </div>
    );
  }

  const byId = new Map((detailsQuery.data ?? []).map((p) => [p.id, p]));

  // فقط ردیف‌هایی که کالای‌شان هنوز قابل‌نمایش/قیمت‌دار است، مبلغ دارند.
  const pricedLines = items.filter((i) => {
    const p = byId.get(i.productId);
    return p && p.price != null;
  });
  const subtotal = pricedLines.reduce((s, it) => s + (byId.get(it.productId)!.price! * it.quantity), 0);

  const qtyInputCtl = (id: string, v: string) => {
    const n = parseInt(faToEn(v).replace(/[^\d]/g, "") || "1", 10);
    setQuantity(id, Math.max(1, Math.min(999, n)));
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-xl font-bold">سبد خرید ({toFa(cartCount(items))} قلم)</h1>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          {detailsQuery.isLoading ? (
            <div className="space-y-2">
              {items.map((it) => <Skeleton key={it.productId} className="h-24 w-full" />)}
            </div>
          ) : (
            items.map((it) => {
              const p = byId.get(it.productId);
              return (
                <Card key={it.productId}>
                  <CardContent className="flex items-center gap-3 p-3">
                    {p?.image ? (
                        <img
                        src={assetUrl(p.image)}
                        alt={p.name}
                        className="h-16 w-16 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground/40">
                        <ShoppingCart className="size-6" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <Link href={`/shop/product/${it.productId}`} className="block truncate text-sm font-medium hover:text-primary">
                        {p?.name ?? "کالا در دسترس نیست"}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {p?.price != null ? `${shopMoney(p.price, unit)} / واحد` : "قیمت نامشخص"}
                      </p>
                    </div>

                    <div className="flex items-center rounded-lg border">
                      <button type="button" aria-label="کم کردن" className="p-2 disabled:opacity-40" disabled={it.quantity <= 1} onClick={() => setQuantity(it.productId, it.quantity - 1)}>
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <input
                        aria-label="تعداد"
                        inputMode="numeric"
                        className="h-9 w-12 border-0 text-center text-sm font-semibold tabular-nums focus:outline-none"
                        value={toFa(it.quantity)}
                        onChange={(e) => qtyInputCtl(it.productId, e.target.value)}
                      />
                      <button type="button" aria-label="زیاد کردن" className="p-2" onClick={() => setQuantity(it.productId, it.quantity + 1)}>
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </div>

                    <div className="w-24 text-left text-sm font-semibold tabular-nums">
                      {p?.price != null ? shopMoney(p.price * it.quantity, unit) : "—"}
                    </div>

                    <button type="button" aria-label="حذف" className="text-muted-foreground hover:text-destructive" onClick={() => { remove(it.productId); toast.info("از سبد حذف شد"); }}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* خلاصه */}
        <Card className="h-fit">
          <CardContent className="space-y-3 p-5">
            <h2 className="font-bold">خلاصه‌ی سبد</h2>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">جمع کالاها</span>
              <span className="font-semibold tabular-nums">{shopMoney(subtotal, unit)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">هزینه‌ی ارسال</span>
              <span className="text-xs text-muted-foreground">در تسویه حساب</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>قابل پرداخت</span>
              <span className="tabular-nums">{shopMoney(subtotal, unit)}</span>
            </div>
            <Button className="w-full" size="lg">
              <Link href="/shop/checkout" className="flex w-full items-center justify-center">
                ادامه و تسویه حساب
              </Link>
            </Button>
            <Link href="/shop" className="block text-center text-sm text-muted-foreground hover:text-primary">
              ادامه‌ی خرید
            </Link>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5"><Truck className="size-3.5" aria-hidden /> ارسال به سراسر کشور</p>
              <p className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" aria-hidden /> پرداخت در محل امکان‌پذیر است</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}