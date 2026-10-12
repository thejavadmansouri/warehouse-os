"use client";

// پاورقی سایت — لینک‌های کاربردی، تماس، و یادداشتِ مدیر از تنظیماتِ مغازه.
import Link from "next/link";
import { MapPin, Phone, Store, CreditCard } from "lucide-react";

import { useShopSettings } from "./settings";
import { toFa } from "@/lib/format";

const QUICK_LINKS = [
  { href: "/shop", label: "فروشگاه" },
  { href: "/shop/cart", label: "سبد خرید" },
  { href: "/shop/orders", label: "پیگیری سفارش" },
  { href: "/shop/account", label: "حساب من" },
];

export function ShopFooter() {
  const { settings } = useShopSettings();
  const name = settings?.name ?? "فروشگاه اینترنتی";
  const year = toFa(new Date().getFullYear());

  return (
    <footer className="border-t bg-muted/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="flex items-center gap-2 font-bold text-primary">
            <Store className="size-5" aria-hidden /> {name}
          </p>
          {settings?.footer ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {settings.footer}
            </p>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              فروشگاه اینترنتی قطعات یدکی — خرید مستقیم با ضمانت اصالت.
            </p>
          )}
        </div>

        <nav aria-label="دسترسی سریع">
          <p className="mb-3 text-sm font-bold">دسترسی سریع</p>
          <ul className="space-y-2">
            {QUICK_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="mb-3 text-sm font-bold">تماس با ما</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {settings?.address && (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                {settings.address}
              </li>
            )}
            {settings?.phone && (
              <li className="flex items-center gap-2">
                <Phone className="size-4 shrink-0" aria-hidden />
                <span dir="ltr">{settings.phone}</span>
              </li>
            )}
            {settings?.cardNumber && settings?.cardHolder && (
              <li className="flex items-start gap-2">
                <CreditCard className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  کارت‌به‌کارت: <span dir="ltr">{settings.cardNumber}</span>
                  {" — "}
                  {settings.cardHolder}
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
          <span>
            © {year} {name} — تمامی حقوق محفوظ است.
          </span>
          <span>قدرت‌گرفته از کاردو</span>
        </div>
      </div>
    </footer>
  );
}
