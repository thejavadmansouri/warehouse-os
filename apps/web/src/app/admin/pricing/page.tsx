"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeDollarSign, Check, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getBrands, getProductsPaged, setProductPrice } from "@/lib/api";
import { money, parseNum, toFa } from "@/lib/format";
import type { Product } from "@/lib/types";

import { BulkPriceDialog } from "./_components/bulk-price-dialog";

const PAGE_SIZE = 50;

/** آخرین قیمت فروش کالا، یا null اگر هیچ‌وقت قیمت نخورده. */
function currentSale(p: Product): number | null {
  return p.prices?.[0]?.salePrice ?? null;
}
function currentPurchase(p: Product): number | null {
  return p.prices?.[0]?.purchasePrice ?? null;
}

/**
 * قیمت‌گذاری کالاها — تکی، گروهی و برندی.
 *
 * کاتالوگ ۳۳ هزار کالا دارد و تقریباً هیچ‌کدام قیمت ندارند، پس این صفحه باید
 * هر سه مقیاس را پوشش بدهد: یک کالا، چند کالای انتخاب‌شده، و یک برند کامل.
 * قیمت‌گذاری تک‌تک از این حجم عملی نیست.
 */
export default function PricingPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [brandId, setBrandId] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkScope, setBulkScope] = useState<"selection" | "brand" | null>(null);
  /** ویرایش درجای قیمت فروش: id کالا → مقداری که تایپ شده. */
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const brands = useQuery({ queryKey: ["brands"], queryFn: getBrands });

  const list = useQuery({
    queryKey: ["pricing-products", page, debounced, brandId],
    queryFn: () => getProductsPaged(page, PAGE_SIZE, debounced || undefined, brandId || undefined),
  });

  const rows = useMemo(() => list.data?.data ?? [], [list.data]);

  // با عوض‌شدن صفحه یا فیلتر، انتخاب و پیش‌نویس‌ها معنا ندارند.
  useEffect(() => { setSelected(new Set()); setDrafts({}); }, [page, debounced, brandId]);

  const savePrice = useMutation({
    mutationFn: (v: { id: string; salePrice: number }) =>
      setProductPrice(v.id, { salePrice: v.salePrice }),
    onSuccess: (_r, v) => {
      toast.success("قیمت ثبت شد");
      setDrafts((d) => { const n = { ...d }; delete n[v.id]; return n; });
      qc.invalidateQueries({ queryKey: ["pricing-products"] });
    },
    onError: () => toast.error("ثبت قیمت ناموفق بود"),
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const brandName = brands.data?.find((b) => b.id === brandId)?.name ?? "";
  const missingCount = rows.filter((r) => currentSale(r) === null).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="قیمت‌گذاری"
        description="قیمت فروش و خرید کالاها — تکی، گروهی یا برای یک برند کامل"
        icon={BadgeDollarSign}
      />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جست‌وجوی نام، کد یا شماره فنی…"
          className="h-10 min-w-64 flex-1"
        />

        <select
          value={brandId}
          onChange={(e) => { setBrandId(e.target.value); setPage(1); }}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">همه‌ی برندها</option>
          {brands.data?.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <Button
          variant="outline"
          disabled={selected.size === 0}
          onClick={() => setBulkScope("selection")}
        >
          قیمت‌گذاری {toFa(selected.size)} کالای انتخاب‌شده
        </Button>

        <Button
          variant="outline"
          disabled={!brandId}
          onClick={() => setBulkScope("brand")}
          title={brandId ? "" : "اول یک برند انتخاب کنید"}
        >
          کل برند {brandName && `«${brandName}»`}
        </Button>
      </Card>

      {list.isLoading ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          کالایی پیدا نشد.
        </p>
      ) : (
        <Card className="overflow-hidden p-0">
          {missingCount > 0 && (
            <p className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-500">
              {toFa(missingCount)} کالا در این صفحه هنوز قیمت فروش ندارد.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed text-sm">
              <thead className="bg-muted/60">
                <tr className="text-muted-foreground">
                  <th className="w-12 p-2">
                    <input
                      type="checkbox"
                      aria-label="انتخاب همه‌ی این صفحه"
                      checked={allOnPageSelected}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                      }
                    />
                  </th>
                  <th className="p-2 text-start font-medium">کالا</th>
                  <th className="w-32 p-2 text-start font-medium">برند</th>
                  <th className="w-32 p-2 text-start font-medium">خرید</th>
                  <th className="w-48 p-2 text-start font-medium">
                    قیمت فروش <span className="font-normal opacity-70">(تومان)</span>
                  </th>
                  <th className="w-24 p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const sale = currentSale(p);
                  const draft = drafts[p.id];
                  const dirty = draft !== undefined && draft !== (sale ?? 0);
                  const saving = savePrice.isPending && savePrice.variables?.id === p.id;
                  return (
                    <tr key={p.id} className="border-t align-middle">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          aria-label={`انتخاب ${p.name}`}
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                        />
                      </td>
                      <td className="p-2">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          کد {toFa(p.sku ?? "—")}
                        </div>
                      </td>
                      <td className="truncate p-2 text-xs text-muted-foreground">
                        {p.brand?.name ?? "—"}
                      </td>
                      <td className="p-2 tabular-nums text-muted-foreground">
                        {currentPurchase(p) !== null ? money(currentPurchase(p)) : "—"}
                      </td>
                      <td className="p-2">
                        <Input
                          dir="ltr"
                          inputMode="numeric"
                          placeholder="قیمت را وارد کنید"
                          className={`h-10 text-left text-base font-semibold tabular-nums ${
                            sale === null && draft === undefined
                              ? "border-amber-500 bg-amber-50 placeholder:text-xs placeholder:font-normal placeholder:text-amber-600 dark:bg-amber-950/30"
                              : ""
                          }`}
                          value={
                            draft !== undefined
                              ? draft ? money(draft) : ""
                              : sale !== null ? money(sale) : ""
                          }
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [p.id]: parseNum(e.target.value) }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && dirty) {
                              savePrice.mutate({ id: p.id, salePrice: draft });
                            }
                          }}
                        />
                      </td>
                      <td className="p-2">
                        {dirty && (
                          <Button
                            size="sm"
                            disabled={saving}
                            onClick={() => savePrice.mutate({ id: p.id, salePrice: draft })}
                          >
                            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                            ثبت
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              صفحه {toFa(page)} از {toFa(list.data?.meta.lastPage ?? 1)} ·{" "}
              {toFa(list.data?.meta.total ?? 0)} کالا
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                قبلی
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= (list.data?.meta.lastPage ?? 1)}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی
              </Button>
            </div>
          </div>
        </Card>
      )}

      <BulkPriceDialog
        open={bulkScope !== null}
        select={
          bulkScope === "brand"
            ? { brandId }
            : { productIds: [...selected] }
        }
        scopeLabel={
          bulkScope === "brand"
            ? `همه‌ی کالاهای برند «${brandName}»`
            : `${toFa(selected.size)} کالای انتخاب‌شده`
        }
        onDone={() => {
          setBulkScope(null);
          setSelected(new Set());
          qc.invalidateQueries({ queryKey: ["pricing-products"] });
        }}
        onClose={() => setBulkScope(null)}
      />
    </div>
  );
}
