"use client";

// نوار بالای سایت: بنر مغازه، جستجو، سبد، ورود/اکانت.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Package, Search, ShoppingBag, Store, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useShopSettings } from "./settings";
import { OtpDialog } from "./otp-dialog";
import { cartCount, useShopCart } from "@/lib/shop-cart";
import { useShopAuth } from "@/lib/shop-auth";
import { useShopLogin } from "@/lib/shop-login-ui";
import { toFa } from "@/lib/format";

export function ShopNavbar() {
  const { settings } = useShopSettings();
  const router = useRouter();
  const items = useShopCart((s) => s.items);
  const { token, customer, clear } = useShopAuth();
  const [q, setQ] = React.useState("");
  const loginOpen = useShopLogin((s) => s.open);
  const requestLogin = useShopLogin((s) => s.request);
  const setLoginOpen = useShopLogin((s) => s.setOpen);
  const loginOnSuccess = useShopLogin((s) => s.onSuccess);

  const count = cartCount(items);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link href="/shop" className="flex items-center gap-2 font-bold text-primary">
          <Store className="size-5" aria-hidden />
          <span className="truncate">{settings?.name ?? "فروشگاه اینترنتی"}</span>
        </Link>

        <form onSubmit={submitSearch} className="relative ml-auto hidden flex-1 sm:block">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="pr-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی کالا…"
            aria-label="جستجوی کالا"
          />
        </form>

        <nav className="ml-auto flex items-center gap-1 sm:ml-0">
          <Link href="/shop/orders" className="hidden md:inline-flex">
            <Button variant="ghost" size="sm">
              <Package className="size-4" aria-hidden /> سفارش‌ها
            </Button>
          </Link>

          <Link href="/shop/cart" aria-label="سبد خرید">
            <Button variant="ghost" size="icon" className="relative">
              <ShoppingBag className="size-5" aria-hidden />
              {count > 0 && (
                <Badge className="absolute -left-1 -top-1 h-5 min-w-5 rounded-full px-1 text-[11px]">
                  {toFa(count)}
                </Badge>
              )}
            </Button>
          </Link>

          {token ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <UserRound className="size-4" aria-hidden />
                  <span className="hidden sm:inline">{customer?.firstName ?? "حساب من"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>{customer?.phone}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/shop/account">حساب من / علاقه‌مندی</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/shop/orders">سفارش‌های من</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={() => clear()}
                >
                  <LogOut className="size-4" aria-hidden /> خروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="default" size="sm" onClick={() => requestLogin()}>
              ورود
            </Button>
          )}
        </nav>
      </div>

      {/* جستجوی موبایل زیر نوار */}
      <form onSubmit={submitSearch} className="border-t bg-background px-4 py-2 sm:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="pr-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی کالا…"
            aria-label="جستجوی کالا"
          />
        </div>
      </form>

      <OtpDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={loginOnSuccess ?? undefined}
      />
    </header>
  );
}