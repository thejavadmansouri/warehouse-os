"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { setCurrencyConfig } from "@/lib/currency";
import { getShopSettings } from "@/lib/shop-api";

/**
 * واحدِ پولِ نمایش را از تنظیماتِ عمومیِ فروشگاه (`/shop/settings`) می‌خواند.
 *
 * پنلِ انبار این کار را با endpointِ کارکنانِ `/shop-settings` انجام می‌دهد که
 * روی سرورِ انبار است؛ این اپ فقط به APIِ سایت وصل است و همان endpointِ عمومی
 * را صدا می‌زند. تا وقتی پاسخ نرسیده، پیش‌فرضِ «تبدیل نکن» برقرار است.
 */
function CurrencyBridge() {
  const settings = useQuery({
    queryKey: ["shop", "settings", "currency"],
    queryFn: getShopSettings,
    staleTime: Infinity,
  });

  const applied = React.useRef(false);

  React.useEffect(() => {
    if (!settings.data || applied.current) return;
    applied.current = true;
    const stored = settings.data.storedUnit ?? "RIAL";
    setCurrencyConfig({ stored, panel: stored });
  }, [settings.data]);

  return null;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <CurrencyBridge />
      {children}
    </QueryClientProvider>
  );
}
