"use client";

// تنظیمات فروشگاه اینترنتی برای کل بخشِ سایت — یک بار بالا می‌آید و همه‌ی
// صفحات (نوار، پاورقی، قیمت‌ها) از همین منبع استفاده می‌کنند، نه اینکه هر بار
// جدا GET بزنند.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { getShopSettings } from "@/lib/shop-api";
import type { ShopSettings } from "@/lib/shop-types";

interface Ctx {
  settings: ShopSettings | null;
  loading: boolean;
}

const SettingsContext = React.createContext<Ctx>({
  settings: null,
  loading: true,
});

export function ShopSettingsProvider({ children }: { children: React.ReactNode }) {
  const query = useQuery({
    queryKey: ["shop", "settings"],
    queryFn: getShopSettings,
    staleTime: 5 * 60 * 1000,
  });

  const value = React.useMemo<Ctx>(
    () => ({ settings: query.data ?? null, loading: query.isLoading }),
    [query.data, query.isLoading]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useShopSettings(): Ctx {
  return React.useContext(SettingsContext);
}