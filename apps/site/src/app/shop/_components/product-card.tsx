"use client";

// کارتِ کالا در فهرست/علاقه‌مندی/مرتبط: عکس، نام، برند/دسته، قیمت، موجودی و سبد.
import Link from "next/link";
import { PackageSearch, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { toFa } from "@/lib/format";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { Price } from "./price";
import { FavoriteButton } from "./favorites";
import { Stars } from "./stars";
import { assetUrl } from "@/lib/shop-api";
import { useShopCart } from "@/lib/shop-cart";
import { STOCK_LABELS } from "@/lib/shop-format";
import type { ShopProduct } from "@/lib/shop-types";

export function ProductCard({ product }: { product: ShopProduct }) {
  const add = useShopCart((s) => s.add);

  const stock = STOCK_LABELS[product.stock] ?? STOCK_LABELS.OUT;
  const img = product.image ? assetUrl(product.image) : null;
  // درصد تخفیفِ گرد — فقط وقتی معنادار است (قیمت قبلی بالاتر).
  const offPercent =
    product.compareAt != null &&
    product.price != null &&
    product.compareAt > product.price
      ? Math.round((1 - product.price / product.compareAt) * 100)
      : 0;

  const addToCart = () => {
    if (product.price == null) return;
    add(product.id, 1);
    toast.success(`«${product.name}» به سبد اضافه شد`, { position: "bottom-left" });
  };

  return (
    <Card className="group flex h-full flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
      <Link
        href={`/shop/product/${product.id}`}
        className="relative block aspect-square overflow-hidden bg-muted"
      >
        {img ? (
          <img
            src={img}
            alt={product.name}
            loading="lazy"
            width={300}
            height={300}
            className="h-full w-full bg-white object-contain p-2 transition-transform group-hover:scale-[1.03]"
          />
        ) : (
          // جایِ خالیِ عکس نباید حسِ «خراب» بدهد: آیکونِ برند + متنِ کوتاه.
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted/40 p-3 text-center">
            <PackageSearch className="size-9 text-muted-foreground/50" aria-hidden />
            <span className="text-[11px] leading-snug text-muted-foreground">
              عکس به‌زودی
            </span>
          </div>
        )}
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          <Badge variant="secondary" className={stock.cls}>
            {stock.label}
          </Badge>
          {offPercent > 0 && (
            <Badge className="bg-rose-600 font-bold text-white hover:bg-rose-600">
              {toFa(offPercent)}٪
            </Badge>
          )}
        </div>
      </Link>

      <CardContent className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/shop/product/${product.id}`} className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm font-medium leading-snug hover:text-primary">
              {product.name}
            </span>
          </Link>
          <FavoriteButton productId={product.id} />
        </div>
        {product.brand && (
          <span className="truncate text-xs text-muted-foreground">{product.brand}</span>
        )}
        {product.rating.count > 0 && (
          <span className="flex items-center gap-1">
            <Stars value={product.rating.average} size={12} />
            <span className="text-[11px] tabular-nums text-muted-foreground">
              ({toFa(product.rating.count)})
            </span>
          </span>
        )}
        {/* قیمت بالا، دکمه‌ی تمام‌عرض پایین: در کارتِ باریکِ ۶ستونه، چینشِ
            پهلویی سرریز می‌کرد (قیمتِ nowrap + دکمه) و «افزودن» نصف می‌شد. */}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <Price price={product.price} compareAt={product.compareAt} size="sm" />
          <Button
            size="sm"
            onClick={addToCart}
            disabled={product.price == null || product.stock === "OUT"}
            aria-label={`افزودن ${product.name} به سبد`}
            className="w-full"
          >
            <Plus className="size-4" aria-hidden /> افزودن به سبد
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}