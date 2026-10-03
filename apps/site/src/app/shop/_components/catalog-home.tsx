"use client";

// صفحه‌ی نخست کاتالوگ: بنرها، فیلتر (دسته/برند/موجود)، مرتب‌سازی، شبکه‌ی کالا و صفحه‌بندی.
// فیلترها در URL می‌نشینند تا پیوندها قابل اشتراک و بازگشت باشند.
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ListFilter, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";

import { ProductCard } from "./product-card";
import { getShopBanners, getShopFacets, getShopProducts } from "@/lib/shop-api";
import { assetUrl } from "@/lib/shop-api";
import { toFa } from "@/lib/format";

const SORTS: { value: string; label: string }[] = [
  { value: "newest", label: "جدیدترین" },
  { value: "cheapest", label: "ارزان‌ترین" },
  { value: "expensive", label: "گران‌ترین" },
  { value: "name", label: "نام (الفبا)" },
];

export function CatalogHome() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const categoryId = searchParams.get("category") ?? undefined;
  const brandId = searchParams.get("brand") ?? undefined;
  const sort = (searchParams.get("sort") ?? "newest") as
    | "newest"
    | "cheapest"
    | "expensive"
    | "name";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const inStock = searchParams.get("inStock") === "true";

  const setParams = React.useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      // عوض‌شدنِ فیلتر صفحه را به اول برمی‌گرداند.
      if (patch.page === undefined) next.delete("page");
      const qs = next.toString();
      router.push(qs ? `/shop?${qs}` : "/shop", { scroll: false });
    },
    [router, searchParams]
  );

  const facetsQuery = useQuery({ queryKey: ["shop", "facets"], queryFn: getShopFacets, staleTime: 60_000 });
  const bannerQuery = useQuery({ queryKey: ["shop", "banners"], queryFn: getShopBanners, staleTime: 60_000 });

  const productsQuery = useQuery({
    queryKey: ["shop", "products", { q, categoryId, brandId, sort, page, inStock }],
    queryFn: () => getShopProducts({ q: q || undefined, categoryId, brandId, sort, page, pageSize: 24, inStock }),
    placeholderData: (prev) => prev,
  });

  const loading = productsQuery.isLoading;
  const data = productsQuery.data;
  const facets = facetsQuery.data;

  const activeCategory = facets?.categories.find((c) => c.id === categoryId)?.name;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* بنرها */}
      {bannerQuery.data && bannerQuery.data.length > 0 && page === 1 && !categoryId && !q && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bannerQuery.data.map((b) => (
            <a
              key={b.id}
              href={b.linkUrl ?? "/shop"}
              className="relative block aspect-[3/1] overflow-hidden rounded-xl bg-muted lg:aspect-auto lg:min-h-28"
            >
              {b.imageUrl && (
                  <img
                  src={assetUrl(b.imageUrl)}
                  alt={b.title ?? "بنر"}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              {b.title && (
                <span className="absolute right-3 bottom-2 rounded-md bg-black/50 px-2 py-1 text-sm font-medium text-white">
                  {b.title}
                </span>
              )}
            </a>
          ))}
        </div>
      )}

      {/* نوار فیلتر و مرتب */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <SlidersHorizontal className="size-4" aria-hidden />
        </div>
        {q && (
          <Badge variant="secondary" className="gap-1">
            جستجو: {q}
            <button type="button" onClick={() => setParams({ q: undefined })} aria-label="حذف جستجو">
              ✕
            </button>
          </Badge>
        )}
        {activeCategory && (
          <Badge variant="secondary" className="gap-1">
            {activeCategory}
            <button type="button" onClick={() => setParams({ category: undefined, brand: undefined })} aria-label="حذف دسته">
              ✕
            </button>
          </Badge>
        )}
        <div className="ms-auto flex items-center gap-2">
          {facets && facets.categories.length > 0 && (
            <Select
              value={categoryId ?? "__all__"}
              onValueChange={(v) => setParams({ category: v === "__all__" ? undefined : v })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="گروه کالا" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">همهٔ گروه‌ها</SelectItem>
                {facets.categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({toFa(c.count)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={sort} onValueChange={(v) => setParams({ sort: v })}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <ProductGridSkeleton />
      ) : data && data.items.length > 0 ? (
        <>
          <div className="mb-3 text-sm text-muted-foreground">
            {toFa(data.total)} کالا
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {data.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <Pagination className="mt-8">
            <PaginationContent>
              <PaginationItem>
                <PaginationLink
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (data.page > 1) setParams({ page: String(data.page - 1) });
                  }}
                  aria-disabled={data.page <= 1}
                >
                  قبلی
                </PaginationLink>
              </PaginationItem>
              {Array.from({ length: data.pageCount }, (_, i) => i + 1).map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink
                    href="#"
                    isActive={p === data.page}
                    onClick={(e) => {
                      e.preventDefault();
                      if (p !== data.page) setParams({ page: String(p) });
                    }}
                  >
                    {toFa(p)}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationLink
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (data.page < data.pageCount) setParams({ page: String(data.page + 1) });
                  }}
                  aria-disabled={data.page >= data.pageCount}
                >
                  بعدی
                </PaginationLink>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </>
      ) : (
        <EmptyState
          title="کالایی یافت نشد"
          text="فیلترها را عوض کنید یا عبارتِ دیگری جستجو کنید."
          onReset={() => setParams({ q: undefined, category: undefined, brand: undefined, inStock: undefined })}
        />
      )}
    </div>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="space-y-2 rounded-xl border p-3">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, text, onReset }: { title: string; text: string; onReset?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border py-16 text-center">
      <ListFilter className="size-10 text-muted-foreground/40" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{text}</p>
      {onReset && (
        <Button variant="outline" onClick={onReset}>
          حذف فیلترها
        </Button>
      )}
    </div>
  );
}