"use client";

// سکشن‌های صفحه‌ی اول به سبک فروشگاه‌های قطعه (اتوموبی/ترب):
// «خودروت را انتخاب کن»، «دسته‌بندی‌ها» و «برندهای محبوب» — هر سه از همان
// facets ای می‌آیند که API می‌دهد و تا امروز در UI استفاده نمی‌شدند.
import { BatteryCharging, Car, Cog, Disc3, Package, Wrench } from "lucide-react";

import { toFa } from "@/lib/format";
import type { ShopFacetItem, ShopVehicleFacet } from "@/lib/shop-types";

/* ---------------- انتخاب خودرو ---------------- */

export function VehicleStrip({
  vehicles,
  activeId,
  onSelect,
}: {
  vehicles: ShopVehicleFacet[];
  activeId?: string;
  onSelect: (id: string | undefined) => void;
}) {
  if (!vehicles.length) return null;
  return (
    <section aria-label="انتخاب خودرو" className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">خودروت را انتخاب کن</h2>
        {activeId && (
          <button
            type="button"
            onClick={() => onSelect(undefined)}
            className="text-xs text-muted-foreground hover:text-primary"
          >
            حذف فیلتر خودرو
          </button>
        )}
      </div>
      <div className="scroll-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {vehicles.map((v) => {
          const active = v.id === activeId;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(active ? undefined : v.id)}
              aria-pressed={active}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                active
                  ? "border-primary bg-primary font-bold text-primary-foreground"
                  : "bg-card hover:border-primary/50"
              }`}
            >
              <Car className="size-5" aria-hidden />
              <span className="text-sm font-medium">{v.name}</span>
              <span
                className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                  active ? "bg-white/20" : "bg-muted text-muted-foreground"
                }`}
              >
                {toFa(v.count)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- دسته‌بندی‌ها ---------------- */

/** آیکونِ هر دسته از روی نامش؛ ناشناخته‌ها بسته‌ی عمومی می‌گیرند. */
function categoryIcon(name: string) {
  if (name.includes("ترمز")) return Disc3;
  if (name.includes("موتور")) return Cog;
  if (name.includes("بدنه") || name.includes("کابین")) return Car;
  if (name.includes("برق") || name.includes("باتری") || name.includes("الکترونیک"))
    return BatteryCharging;
  if (name.includes("روغن") || name.includes("فیلتر")) return Wrench;
  if (name.includes("لاستیک") || name.includes("رینگ")) return Disc3;
  return Package;
}

export function CategoryTiles({
  categories,
  activeId,
  onSelect,
}: {
  categories: ShopFacetItem[];
  activeId?: string;
  onSelect: (id: string | undefined) => void;
}) {
  if (!categories.length) return null;
  return (
    <section aria-label="دسته‌بندی‌ها" className="mb-6">
      <h2 className="mb-3 text-base font-bold">دسته‌بندی‌ها</h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {categories.map((c) => {
          const Icon = categoryIcon(c.name);
          const active = c.id === activeId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(active ? undefined : c.id)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "bg-card hover:border-primary/30"
              }`}
            >
              <span
                className={`flex size-11 items-center justify-center rounded-full ${
                  active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                }`}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="text-xs font-bold leading-tight">{c.name}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {toFa(c.count)} کالا
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- برندهای محبوب ---------------- */

export function BrandStrip({
  brands,
  activeId,
  onSelect,
}: {
  brands: ShopFacetItem[];
  activeId?: string;
  onSelect: (id: string | undefined) => void;
}) {
  if (!brands.length) return null;
  return (
    <section aria-label="برندها" className="mt-8">
      <h2 className="mb-3 text-base font-bold">برندها</h2>
      <div className="scroll-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {brands.map((b) => {
          const active = b.id === activeId;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelect(active ? undefined : b.id)}
              aria-pressed={active}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-primary bg-primary font-bold text-primary-foreground"
                  : "bg-card hover:border-primary/50"
              }`}
            >
              {b.name} ({toFa(b.count)})
            </button>
          );
        })}
      </div>
    </section>
  );
}
