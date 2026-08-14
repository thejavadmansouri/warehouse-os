"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Search, TrendingUp, X } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { searchProducts, getProductPerformance } from "@/lib/api";
import { money, qty, toFa } from "@/lib/format";
import { presetDates } from "../../reports/_components/shared";
import { ProductKardex } from "../../products/_components/product-kardex";

/** یک ردیفِ کالا در فهرست — با کلیک، کاردکسش باز می‌شود. */
function ProductRow({
  name,
  sku,
  meta,
  active,
  onClick,
}: {
  name: string;
  sku: string;
  meta?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors ${
        active ? "border-primary bg-primary/5" : "hover:bg-muted/50"
      }`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="text-xs tabular-nums text-muted-foreground">{toFa(sku)}</div>
      </div>
      {meta ? <div className="shrink-0 text-xs tabular-nums">{meta}</div> : null}
    </button>
  );
}

export default function KardexIndexPage() {
  const [selected, setSelected] = React.useState<{ id: string; name: string; sku: string } | null>(null);

  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const searchQ = useQuery({
    queryKey: ["kardex-search", debouncedQ],
    queryFn: () => searchProducts(debouncedQ),
    enabled: debouncedQ.length >= 2,
  });

  // پرفروش‌ترین‌های این ماه — فهرستِ پیش‌فرضِ «کالاهایی که به فروش می‌رسند».
  const topQ = useQuery({
    queryKey: ["kardex-top-sellers"],
    queryFn: () =>
      getProductPerformance({
        ...presetDates("this_month"),
        type: "TOP_SELLING",
        page: 1,
        limit: 20,
      }),
  });

  const searching = debouncedQ.length >= 2;

  return (
    <div className="space-y-6">
      <PageHeader
        title="کاردکس کالا"
        description="گردشِ ورود و خروج هر کالا با مانده‌ی متحرک — از پرفروش‌ها یا جستجو یک کالا را انتخاب کنید."
        icon={ScrollText}
      />

      {/* کاردکسِ کالای انتخاب‌شده */}
      {selected && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">{selected.name}</h2>
              <p className="text-xs tabular-nums text-muted-foreground">{toFa(selected.sku)}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              <X className="size-4" />
              بستن
            </Button>
          </div>
          <ProductKardex productId={selected.id} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* جستجوی کالا */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">جستجوی کالا</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="نام یا کد کالا…"
                className="h-10 pe-10"
              />
            </div>

            {searching && (
              searchQ.isLoading ? (
                <LoadingState />
              ) : searchQ.isError ? (
                <ErrorState onRetry={() => searchQ.refetch()} />
              ) : !searchQ.data?.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  کالایی با این جستجو پیدا نشد.
                </p>
              ) : (
                <div className="flex max-h-[420px] flex-col gap-2 overflow-auto">
                  {searchQ.data.map((p) => (
                    <ProductRow
                      key={p.id}
                      name={p.name}
                      sku={p.sku}
                      active={selected?.id === p.id}
                      onClick={() => setSelected({ id: p.id, name: p.name, sku: p.sku })}
                    />
                  ))}
                </div>
              )
            )}

            {!searching && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                برای جستجو حداقل دو حرف تایپ کنید.
              </p>
            )}
          </CardContent>
        </Card>

        {/* پرفروش‌ترین‌های این ماه */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-emerald-600" />
              پرفروش‌ترین‌های این ماه
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topQ.isLoading ? (
              <LoadingState />
            ) : topQ.isError ? (
              <ErrorState onRetry={() => topQ.refetch()} />
            ) : !topQ.data?.products.data.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                فروشی در این ماه ثبت نشده است.
              </p>
            ) : (
              <div className="flex max-h-[420px] flex-col gap-2 overflow-auto">
                {topQ.data.products.data.map((p) => (
                  <ProductRow
                    key={p.productId}
                    name={p.productName}
                    sku={p.sku}
                    active={selected?.id === p.productId}
                    meta={
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Badge variant="secondary" className="tabular-nums">
                          {qty(p.quantitySold)} فروش
                        </Badge>
                        <span>{money(p.totalSalesAmount)}</span>
                      </div>
                    }
                    onClick={() =>
                      setSelected({ id: p.productId, name: p.productName, sku: p.sku })
                    }
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
