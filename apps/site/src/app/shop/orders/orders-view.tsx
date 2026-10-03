"use client";

// سفارش‌های من. ورود لازم است؛ سفارشی فقط برای صاحبش دیده می‌شود.
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Package, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { useShopSettings } from "../_components/settings";
import { useShopLogin } from "@/lib/shop-login-ui";
import { getShopMyOrders } from "@/lib/shop-api";
import { useShopAuth } from "@/lib/shop-auth";
import { SHOP_STATUS_BADGE, SHOP_STATUS_LABELS, shopMoney } from "@/lib/shop-format";
import { faDateTime, toFa } from "@/lib/format";

export function OrdersView() {
  const { settings } = useShopSettings();
  const unit = settings?.unit ?? "TOMAN";
  const token = useShopAuth((s) => s.token);
  const requestLogin = useShopLogin((s) => s.request);

  const ordersQuery = useQuery({
    queryKey: ["shop", "my-orders"],
    queryFn: getShopMyOrders,
    enabled: !!token,
  });

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <Truck className="mx-auto size-10 text-primary" aria-hidden />
            <p className="text-lg font-bold">برای دیدن سفارش‌ها وارد شوید</p>
            <Button className="w-full" onClick={() => requestLogin()}>ورود با شماره موبایل</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-xl font-bold">سفارش‌های من</h1>

      {ordersQuery.isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : ordersQuery.data && ordersQuery.data.length > 0 ? (
        <div className="space-y-3">
          {ordersQuery.data.map((o) => (
            <Link key={o.id} href={`/shop/orders/${o.id}`}>
              <Card className="hover:border-primary/40 hover:shadow-sm">
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Package className="size-5 text-muted-foreground" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">سفارش #{toFa(o.number)}</p>
                    <p className="text-xs text-muted-foreground">{faDateTime(o.createdAt)} · {toFa(o.lineCount)} قلم</p>
                  </div>
                  <Badge className={SHOP_STATUS_BADGE[o.status as keyof typeof SHOP_STATUS_BADGE] ?? "bg-slate-100 text-slate-700"}>
                    {SHOP_STATUS_LABELS[o.status as keyof typeof SHOP_STATUS_LABELS] ?? o.status}
                  </Badge>
                  <span className="font-bold tabular-nums">{shopMoney(o.total, unit)}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <p className="text-muted-foreground">هنوز سفارشی ثبت نکرده‌اید.</p>
          <Link href="/shop" className="mt-3 inline-block">
            <Button>مشاهده‌ی فروشگاه</Button>
          </Link>
        </div>
      )}
    </div>
  );
}