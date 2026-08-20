"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "./auth-store";

/**
 * پورت API — همان قرارداد src/lib/api.ts. میزبان در زمان اجرا از خودِ مرورگر
 * گرفته می‌شود تا نصب روی هر سروری بدون build دوباره کار کند.
 */
const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? "3000";

function eventsSocketUrl(token: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  return `${proto}//${host}:${API_PORT}/events/ws?token=${encodeURIComponent(token)}`;
}

/**
 * نگاشتِ رویداد → پیشوندِ queryKeyهایی که باید تازه شوند.
 *
 * چرا هدفمند به‌جای invalidateِ همه: روی یک POS شلوغ، «همه» یعنی هر رویدادِ فروش،
 * هر کوئریِ فعالِ صفحه را refetch می‌کند (از جمله جستجوی زنده حین تایپ) — دقیقاً
 * همان کندی‌ای که نمی‌خواهیم. اینجا فقط کوئری‌های مرتبط را بی‌اعتبار می‌کنیم.
 *
 * React Query پیشوندی مطابقت می‌دهد: ["rep"] با ["rep","sales",...] هم می‌خورد.
 * رویدادِ ناشناس → fallbackِ امن: همه.
 */
const KEYS_BY_EVENT: Record<string, string[][]> = {
  "sale.created": [
    ["pos-recent-invoices"],
    ["invoice"],
    ["rep"],
    ["customer"],
    ["customer-today-count"],
    ["customer-today-invoices"],
    ["open-accounts"],
    ["products"],
  ],
  "sale.canceled": [
    ["pos-recent-invoices"],
    ["invoice"],
    ["rep"],
    ["customer"],
    ["open-accounts"],
    ["products"],
  ],
  "stock.changed": [["products"]],
  "receipt.created": [["receipts"], ["customer"], ["open-accounts"], ["rep"]],
  "return.created": [
    ["pos-recent-invoices"],
    ["returns"],
    ["invoice"],
    ["returnable"],
    ["customer"],
    ["open-accounts"],
    ["rep"],
    ["products"],
  ],
  // تیکِ کارگر → پنل «کارهای انبار» و چیپِ پیشرفت روی فاکتورها تازه شوند.
  "work-task.progress": [["work-tasks"], ["pos-recent-invoices"]],
};

/**
 * پلِ realtime بین سرور و React Query.
 *
 * یک‌بار (در QueryProvider) mount می‌شود، به /events/ws وصل می‌شود و روی هر
 * رویداد، کوئری‌ها را invalidate می‌کند تا React Query داده‌ی تازه را از همان
 * endpointِ guard-شده دوباره بگیرد — بدون هیچ رفرشِ دستی.
 *
 * چرا invalidateAll: رویدادها سبک و انسان‌سرعت‌اند (چند ثانیه یک‌بار)، و تنها
 * کوئری‌های «فعال/روی صفحه» واقعاً refetch می‌شوند؛ پس نگاشتِ شکننده‌ی
 * event→queryKey لازم نیست و هیچ صفحه‌ای جا نمی‌ماند. یک coalesce کوتاه هم چند
 * رویدادِ پشت‌سرهم (مثلاً فروش = sale.created + stock.changed) را یکی می‌کند.
 */
export function useLiveEvents(): void {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    if (!token || typeof window === "undefined") return;

    let ws: WebSocket | null = null;
    let closedByUs = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let coalesceTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    // کلیدهای منتظرِ invalidate تا لحظه‌ی flush جمع می‌شوند؛ چند رویدادِ پشت‌سرهم
    // (مثلاً فروش = sale.created + stock.changed) به یک دورِ invalidate تبدیل می‌شود.
    let pendingKeys = new Set<string>();
    let invalidateAll = false;

    const flush = () => {
      coalesceTimer = undefined;
      if (invalidateAll) {
        invalidateAll = false;
        pendingKeys.clear();
        void queryClient.invalidateQueries();
        return;
      }
      const keys = [...pendingKeys].map((k) => JSON.parse(k) as string[]);
      pendingKeys = new Set<string>();
      for (const queryKey of keys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };

    const enqueue = (type: string | undefined) => {
      const mapped = type ? KEYS_BY_EVENT[type] : undefined;
      if (!mapped) {
        // رویدادِ ناشناس → همه را تازه کن (امن‌ترین حالت).
        invalidateAll = true;
      } else {
        for (const key of mapped) pendingKeys.add(JSON.stringify(key));
      }
      if (!coalesceTimer) coalesceTimer = setTimeout(flush, 150);
    };

    const connect = () => {
      if (closedByUs) return;
      ws = new WebSocket(eventsSocketUrl(token));

      ws.onopen = () => {
        attempt = 0;
      };

      ws.onmessage = (ev) => {
        let type: string | undefined;
        try {
          type = (JSON.parse(ev.data as string) as { type?: string }).type;
        } catch {
          type = undefined;
        }
        enqueue(type);
      };

      ws.onclose = () => {
        if (closedByUs) return;
        // backoff نمایی با سقف ~15s تا شبکه‌ی قطع‌ووصلِ انبار سیل‌آسا reconnect نکند.
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose بعدش می‌آید و reconnect را می‌چیند؛ اینجا فقط سوکت را می‌بندیم.
        ws?.close();
      };
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (coalesceTimer) clearTimeout(coalesceTimer);
      ws?.close();
    };
  }, [token, queryClient]);
}
