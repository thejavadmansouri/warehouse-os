"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useLiveEvents } from "@/lib/use-live-events";
import { setCurrencyConfig } from "@/lib/currency";
import { getShopSettings } from "@/lib/api";

/**
 * داخلِ Provider mount می‌شود تا useQueryClient از context به همان client برسد.
 * چیزی render نمی‌کند؛ فقط سوکتِ realtime را نگه می‌دارد.
 */
function LiveEventsBridge() {
  useLiveEvents();
  return null;
}

/**
 * واحدِ پولِ نمایش را یک بار از تنظیمات فروشگاه می‌خواند و در `lib/currency`
 * می‌نشاند.
 *
 * چیزی render نمی‌کند و عمداً منتظرش نمی‌مانیم: تا وقتی پاسخ نرسیده، پیش‌فرضِ
 * «تبدیل نکن» برقرار است، یعنی بدترین حالتْ همان رفتار قبلیِ برنامه است نه یک
 * عددِ ده‌برابرشده. با رسیدنِ پاسخ، `setState` رندرِ دوباره را می‌اندازد تا
 * مبلغ‌هایی که قبلِ آن کشیده شده‌اند هم با واحد درست بازنویسی شوند.
 */
function CurrencyBridge({ onConversionActive }: { onConversionActive: () => void }) {
  const settings = useQuery({
    queryKey: ["shop-settings"],
    queryFn: getShopSettings,
    staleTime: Infinity,
  });

  const applied = React.useRef(false);

  React.useEffect(() => {
    if (!settings.data || applied.current) return;
    applied.current = true;

    const stored = settings.data.storedUnit ?? "RIAL";
    const panel = settings.data.panelUnit ?? "RIAL";
    setCurrencyConfig({ stored, panel });

    /*
     * مبلغ‌هایی که پیش از رسیدنِ این پاسخ رندر شده‌اند با واحدِ پیش‌فرض کشیده
     * شده‌اند و خودشان دوباره رندر نمی‌شوند — `money()` تابع است نه hook.
     *
     * فقط وقتی تبدیل واقعاً معنا دارد درخت دوباره ساخته می‌شود. اگر واحدِ داده و
     * واحدِ نمایش یکی باشند (حالت پیش‌فرضِ امروز) هیچ عددی عوض نشده و remountِ
     * بی‌دلیل فقط یعنی یک بار fetchِ دوباره‌ی همه‌ی صفحه.
     */
    if (stored !== panel) onConversionActive();
  }, [settings.data, onConversionActive]);

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

  // با فعال‌شدنِ تبدیلِ واحد یک بار بالا می‌رود تا درختِ زیرین دوباره ساخته شود.
  const [currencyEpoch, setCurrencyEpoch] = React.useState(0);
  const bumpEpoch = React.useCallback(() => setCurrencyEpoch((n) => n + 1), []);

  return (
    <QueryClientProvider client={client}>
      <LiveEventsBridge />
      <CurrencyBridge onConversionActive={bumpEpoch} />
      <React.Fragment key={currencyEpoch}>{children}</React.Fragment>
    </QueryClientProvider>
  );
}
