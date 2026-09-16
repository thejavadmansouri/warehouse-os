"use client";

// نمایش قیمت کاتالوگ: قیمت فعلی + قیمتِ قبلیِ خط‌خورده (اگر تخفیف باشد).
import { useShopSettings } from "./settings";
import { shopMoney, shopMoneyOnly } from "@/lib/shop-format";

export function Price({
  price,
  compareAt,
  size = "default",
}: {
  price: number | null;
  compareAt: number | null;
  size?: "default" | "sm" | "lg";
}) {
  const { settings } = useShopSettings();
  const unit = settings?.unit ?? "TOMAN";

  if (price == null) {
    return <span className="text-sm font-medium text-muted-foreground">تماس بگیرید</span>;
  }

  const priceCls =
    size === "lg"
      ? "text-2xl font-bold text-foreground"
      : size === "sm"
        ? "text-sm font-semibold text-foreground"
        : "text-base font-bold text-foreground";

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className={priceCls}>
        {shopMoney(price, unit)}
      </span>
      {compareAt != null && compareAt > price && (
        <span className="text-xs font-medium text-muted-foreground line-through">
          {shopMoneyOnly(compareAt)}
        </span>
      )}
    </span>
  );
}