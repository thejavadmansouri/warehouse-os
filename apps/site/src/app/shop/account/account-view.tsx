"use client";

// حسابِ مشتری سایت: پروفایل (نام/شماره) و علاقه‌مندی‌ها.
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Heart, Package, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { useShopLogin } from "@/lib/shop-login-ui";
import { getShopFavorites, getShopMe } from "@/lib/shop-api";
import { useShopAuth } from "@/lib/shop-auth";
import { ProductCard } from "../_components/product-card";

export function AccountView() {
  const token = useShopAuth((s) => s.token);
  const requestLogin = useShopLogin((s) => s.request);

  const meQuery = useQuery({ queryKey: ["shop", "me"], queryFn: getShopMe, enabled: !!token });
  const favQuery = useQuery({ queryKey: ["shop", "favorites"], queryFn: getShopFavorites, enabled: !!token });

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <UserRound className="mx-auto size-10 text-primary" aria-hidden />
            <p className="text-lg font-bold">برای دیدن حساب خود وارد شوید</p>
            <Button className="w-full" onClick={() => requestLogin()}>ورود با شماره موبایل</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const me = meQuery.data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-bold">
                {me ? [me.firstName, me.lastName].filter(Boolean).join(" ") : "…"}
              </p>
              <p className="text-sm text-muted-foreground" dir="ltr">{me?.phone}</p>
            </div>
            <Link href="/shop/orders">
              <Button variant="outline">
                <Package className="size-4" aria-hidden /> سفارش‌های من
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-bold">
        <Heart className="size-5 text-rose-500" aria-hidden /> علاقه‌مندی‌ها
      </h2>
      {favQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-52 w-full" />)}
        </div>
      ) : favQuery.data && favQuery.data.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {favQuery.data.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      ) : (
        <div className="rounded-xl border py-12 text-center">
          <p className="text-muted-foreground">علاقه‌مندی‌ای ندارید.</p>
          <Link href="/shop" className="mt-2 inline-block">
            <Button variant="outline" size="sm">مشاهده‌ی فروشگاه</Button>
          </Link>
        </div>
      )}
    </div>
  );
}