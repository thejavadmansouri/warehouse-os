"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLiveEvents } from "@/lib/use-live-events";

/**
 * داخلِ Provider mount می‌شود تا useQueryClient از context به همان client برسد.
 * چیزی render نمی‌کند؛ فقط سوکتِ realtime را نگه می‌دارد.
 */
function LiveEventsBridge() {
  useLiveEvents();
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
      <LiveEventsBridge />
      {children}
    </QueryClientProvider>
  );
}
