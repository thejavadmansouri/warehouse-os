"use client";

// کارتِ کالا در فهرست/علاقه‌مندی/مرتبط: عکس، نام، برند/دسته، قیمت، موجودی و سبد.
import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { Price } from "./price";
import { FavoriteButton } from "./favorites";
import { assetUrl } from "@/lib/shop-api";
import { useShopCart } from "@/lib/shop-cart";
import { STOCK_LABELS } from "@/lib/shop-format";
import type { ShopProduct } from "@/lib/shop-types";

export function ProductCard({ product }: { product: ShopProduct }) {
  const add = useShopCart((s) => s.add);

  const stock = STOCK_LABELS[product.stock] ?? STOCK_LABELS.OUT;
  const img = product.image ? assetUrl(product.image) : null;

  const addToCart = () => {
    if (product.price == null) return;
    add(product.id, 1);
    toast.success(`«${product.name}» به سبد اضافه شد`, { position: "bottom-left" });
  };

  return (
    <Card className="group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
      <Link
        href={`/shop/product/${product.id}`}
        className="relative block aspect-square overflow-hidden bg-muted"
      >
        {img ? (
          <img
            src={img}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <ShoppingCart className="size-8" aria-hidden />
          </div>
        )}
        <Badge variant="secondary" className={`absolute right-2 top-2 ${stock.cls}`}>
          {stock.label}
        </Badge>
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
          <span className="text-xs text-muted-foreground">{product.brand}</span>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <Price price={product.price} compareAt={product.compareAt} size="sm" />
          <Button
            size="sm"
            onClick={addToCart}
            disabled={product.price == null || product.stock === "OUT"}
            aria-label="افزودن به سبد"
          >
            <Plus className="size-4" aria-hidden /> <span className="hidden sm:inline">افزودن</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}