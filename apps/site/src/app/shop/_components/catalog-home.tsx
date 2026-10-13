"use client";

// صفحه‌ی نخست کاتالوگ: بنرها، فیلتر (دسته/برند/موجود)، مرتب‌سازی، شبکه‌ی کالا و صفحه‌بندی.
// فیلترها در URL می‌نشینند تا پیوندها قابل اشتراک و بازگشت باشند.
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ListFilter, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { VehicleStrip, CategoryTiles, BrandStrip } from "./home-sections";
import { getShopBanners, getShopFacets, getShopProducts } from "@/lib/shop-api";
import { assetUrl } from "@/lib/shop-api";
import { toFa, faToEn, parseNum } from "@/lib/format";

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
  // فیلتر خودرو (اتوموبی‌وار): تا امروز فقط در تایپِ API تعریف شده بود و هیچ
  // رابطی آن را ست نمی‌کرد. نام پارام `vehicle` کوتاه است تا لینک تمیز بماند.
  const vehicleId = searchParams.get("vehicle") ?? undefined;
  const sort = (searchParams.get("sort") ?? "newest") as
    | "newest"
    | "cheapest"
    | "expensive"
    | "name";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const inStock = searchParams.get("inStock") === "true";
  // بازه‌ی قیمت به تومان (همان واحدِ سایت)؛ خالی یعنی بدون سقف/کف.
  const minPriceParam = searchParams.get("minPrice") ?? "";
  const maxPriceParam = searchParams.get("maxPrice") ?? "";
  const numOrUndef = (s: string) => {
    const n = Number(s.replace(/[^\d]/g, ""));
    return s && Number.isFinite(n) ? n : undefined;
  };

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
    queryKey: ["shop", "products", { q, categoryId, brandId, vehicleId, sort, page, inStock, minPriceParam, maxPriceParam }],
    queryFn: () => getShopProducts({ q: q || undefined, categoryId, brandId, vehicleModelId: vehicleId, sort, page, pageSize: 24, inStock, minPrice: numOrUndef(minPriceParam), maxPrice: numOrUndef(maxPriceParam) }),
    placeholderData: (prev) => prev,
  });

  const loading = productsQuery.isLoading;
  const data = productsQuery.data;
  const facets = facetsQuery.data;

  const activeCategory = facets?.categories.find((c) => c.id === categoryId)?.name;
  const activeVehicle = facets?.vehicles.find((v) => v.id === vehicleId)?.name;
  const activeBrand = facets?.brands.find((b) => b.id === brandId)?.name;

  // ورودی‌های قیمت، state محلی دارند تا با هر رقم، کوئری refetch نشود؛ «اعمال»
  // آن‌ها را وارد URL می‌کند. با عقب/جلو مرورگر، از URL همگام می‌شوند.
  const [minInput, setMinInput] = React.useState(minPriceParam);
  const [maxInput, setMaxInput] = React.useState(maxPriceParam);
  React.useEffect(() => {
    setMinInput(minPriceParam);
    setMaxInput(maxPriceParam);
  }, [minPriceParam, maxPriceParam]);

  const faMoney = (n: number) => `${n.toLocaleString("fa-IR")} تومان`;

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

      {/* سکشن‌های ناوبری به سبک فروشگاه‌های قطعه: خودرو، دسته، برند. */}
      {!q && (
        <>
          <VehicleStrip
            vehicles={facets?.vehicles ?? []}
            activeId={vehicleId}
            onSelect={(id) => setParams({ vehicle: id })}
          />
          <CategoryTiles
            categories={facets?.categories ?? []}
            activeId={categoryId}
            onSelect={(id) => setParams({ category: id, brand: undefined })}
          />
        </>
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
        {activeVehicle && (
          <Badge variant="secondary" className="gap-1">
            خودرو: {activeVehicle}
            <button type="button" onClick={() => setParams({ vehicle: undefined })} aria-label="حذف فیلتر خودرو">
              ✕
            </button>
          </Badge>
        )}
        {activeBrand && (
          <Badge variant="secondary" className="gap-1">
            برند: {activeBrand}
            <button type="button" onClick={() => setParams({ brand: undefined })} aria-label="حذف فیلتر برند">
              ✕
            </button>
          </Badge>
        )}
        {inStock && (
          <Badge variant="secondary" className="gap-1">
            فقط موجودها
            <button type="button" onClick={() => setParams({ inStock: undefined })} aria-label="حذف فیلتر موجودی">
              ✕
            </button>
          </Badge>
        )}
        {(minPriceParam || maxPriceParam) && (
          <Badge variant="secondary" className="gap-1">
            {numOrUndef(minPriceParam) != null ? `از ${faMoney(numOrUndef(minPriceParam)!)}` : ""}
            {numOrUndef(minPriceParam) != null && numOrUndef(maxPriceParam) != null ? " ـ " : ""}
            {numOrUndef(maxPriceParam) != null ? `تا ${faMoney(numOrUndef(maxPriceParam)!)}` : ""}
            <button type="button" onClick={() => setParams({ minPrice: undefined, maxPrice: undefined })} aria-label="حذف فیلتر قیمت">
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
              <SelectTrigger className="w-40" aria-label="گروه کالا">
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
            <SelectTrigger className="w-32" aria-label="مرتب‌سازی">
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

      {/* ردیف دوم فیلترها: بازه‌ی قیمت و موجودی.
          در موبایل به‌صورت کشویی محدود نیست ولی چون فقط دو ورودی است
          (نه ۱۰ گزینه)، جای افقی کافیست؛ ورودی‌ها با کیبورد عددی باز می‌شوند. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm">
          <Switch
            id="filter-instock"
            checked={inStock}
            onCheckedChange={(v) => setParams({ inStock: v ? "true" : undefined })}
          />
          <label htmlFor="filter-instock" className="cursor-pointer select-none font-medium">
            فقط کالاهای موجود
          </label>
        </span>

        <div className="flex items-center gap-2">
          <label htmlFor="filter-min" className="text-sm text-muted-foreground">
            قیمت از
          </label>
          <Input
            id="filter-min"
            inputMode="numeric"
            className="h-9 w-28 text-center"
            placeholder="۰"
            value={minInput}
            onChange={(e) => {
              const en = faToEn(e.target.value).replace(/[^\d]/g, "");
              setMinInput(en ? toFa(Number(en).toLocaleString("en-US")) : "");
            }}
          />
          <label htmlFor="filter-max" className="text-sm text-muted-foreground">
            تا
          </label>
          <Input
            id="filter-max"
            inputMode="numeric"
            className="h-9 w-28 text-center"
            placeholder="۹۹۹,۹۹۹"
            value={maxInput}
            onChange={(e) => {
              const en = faToEn(e.target.value).replace(/[^\d]/g, "");
              setMaxInput(en ? toFa(Number(en).toLocaleString("en-US")) : "");
            }}
          />
          <span className="text-xs text-muted-foreground">تومان</span>
          <Button
            size="sm"
            onClick={() => {
              // ورودیِ کاربر فارسی و با جداکننده است — parseNum هر دو را
              // می‌پذیرد. (`.[^\d]` خالی رقم فارسی را کامل حذف می‌کرد.)
              const min = parseNum(minInput);
              const max = parseNum(maxInput);
              setParams({
                minPrice: min > 0 ? String(min) : undefined,
                maxPrice: max > 0 ? String(max) : undefined,
              });
            }}
          >
            اعمال
          </Button>
        </div>

        {(minPriceParam || maxPriceParam) && (
          <span className="text-xs text-muted-foreground">
            {numOrUndef(minPriceParam) != null ? `از ${faMoney(numOrUndef(minPriceParam)!)}` : ""}
            {numOrUndef(minPriceParam) != null && numOrUndef(maxPriceParam) != null ? " ـ " : ""}
            {numOrUndef(maxPriceParam) != null ? `تا ${faMoney(numOrUndef(maxPriceParam)!)}` : ""}
          </span>
        )}
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
          {!q && (
            <BrandStrip
              brands={facets?.brands ?? []}
              activeId={brandId}
              onSelect={(id) => setParams({ brand: id })}
            />
          )}
        </>
      ) : (
        <EmptyState
          title="کالایی یافت نشد"
          text="فیلترها را عوض کنید یا عبارتِ دیگری جستجو کنید."
          onReset={() => setParams({ q: undefined, category: undefined, brand: undefined, vehicle: undefined, inStock: undefined })}
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