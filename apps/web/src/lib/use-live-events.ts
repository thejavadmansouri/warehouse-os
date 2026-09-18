"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "./auth-store";
import { useRealtimeStore } from "./realtime-store";

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
// ───────── تعاملِ جانبی با رویدادها (توست، زنگ، …) ─────────
//
// `useLiveEvents` خودش فقط invalidate می‌کند؛ هر کسی هم که می‌خواهد روی یک
// رویداد *_work کند (مثلاً زنگِ سفارشِ آنلاین) با `subscribeLiveEvent` ثبت‌نام
// می‌کند و در همان `onmessage` صدا زده می‌شود. معطلِ invalidate نیست و با آن
// تداخل ندارد.
type LiveEventHandler = (payload: unknown) => void;
const EVENT_HANDLERS: { type: string; fn: LiveEventHandler }[] = [];

/** ثبت‌نامِ موقت روی یک نوعِ رویداد؛ unsub را برمی‌گرداند. */
export function subscribeLiveEvent(
  type: string,
  fn: LiveEventHandler,
): () => void {
  const h = { type, fn };
  EVENT_HANDLERS.push(h);
  return () => {
    const i = EVENT_HANDLERS.indexOf(h);
    if (i >= 0) EVENT_HANDLERS.splice(i, 1);
  };
}

function dispatchLiveEvent(type: string | undefined, payload: unknown) {
  if (!type) return;
  for (const h of EVENT_HANDLERS) {
    if (h.type !== type) continue;
    try {
      h.fn(payload);
    } catch {
      // یک هندلرِ خراب نباید بقیه را و خودِ realtime را زمین بزند.
    }
  }
}

/**
 * اکسپورت برای تستِ «همه‌ی رویدادهای بک‌اند نگاشت‌شده‌اند» — افزودنِ نوعِ
 * جدید در بک‌اند باید یا اینجا ثبت شود یا آگاهانه به fallbackِ سنگین واگذار.
 */
export const KEYS_BY_EVENT: Record<string, string[][]> = {
  "sale.created": [
    ["pos-recent-invoices"],
    ["invoice"],
    ["rep"],
    ["customer"],
    ["customer-purchases"],
    ["customer-today-count"],
    ["customer-today-invoices"],
    ["open-accounts"],
    ["pos-customer-balances"],
    ["products"],
  ],
  "sale.canceled": [
    ["pos-recent-invoices"],
    ["invoice"],
    ["rep"],
    ["customer"],
    ["customer-purchases"],
    ["open-accounts"],
    ["pos-customer-balances"],
    ["products"],
  ],
  "stock.changed": [["products"]],
  /*
   * رسید ثبت شد → مانده‌ی فاکتورها و خلاصه‌ی مشتری عوض شد. جدول‌های ریزگردش
   * (پنل مشتری F4 و پرونده‌ی دفتری F3) و چیپِ «مانده کل» همان لحظه تازه می‌شوند
   * — پنل باز می‌ماند و اعداد عوض می‌شوند، بدون هیچ رفرشِ دستی.
   */
  "receipt.created": [
    ["receipts"],
    ["customer"],
    ["open-accounts"],
    ["rep"],
    ["pos-customer-invoices"],
    ["pos-customer-balances"],
    ["open-plain-invoices"],
    ["open-plain-customer"],
    ["open-account-customer"],
  ],
  /*
   * پرداخت به مشتری بستانکار — مانده‌اش عوض شد؛ فهرستِ حساب‌بازها (F3) که
   * طلبکارها را هم نشان می‌دهد همان لحظه تازه می‌شود، بدون بستن پنل.
   */
  /*
   * برگشتِ پرداخت (کارتخوان برگشت زد / بانک رد کرد) — مانده‌ی فاکتور و دفترِ
   * مشتری عوض شد؛ همان تازه‌سازی‌های رسید، چون اثرش روی همین‌هاست.
   */
  "payment.reversed": [
    ["receipts"],
    ["invoice"],
    ["customer"],
    ["open-accounts"],
    ["rep"],
    ["pos-customer-invoices"],
    ["pos-customer-balances"],
    ["open-plain-invoices"],
    ["open-plain-customer"],
    ["open-account-customer"],
  ],
  /*
   * اصلاح نحوهٔ پرداخت — تقسیمِ پرداختِ فاکتور عوض شد، پس هم خودِ فاکتور و هم
   * مانده‌ی مشتری و هم گزارش‌ها تازه می‌شوند؛ دقیقاً همان مجموعهٔ برگشتِ پرداخت.
   */
  "payment.recomposed": [
    ["receipts"],
    ["invoice"],
    ["customer"],
    ["open-accounts"],
    ["rep"],
    ["pos-customer-invoices"],
    ["pos-customer-balances"],
    ["open-plain-invoices"],
    ["open-plain-customer"],
    ["open-account-customer"],
  ],
  "payout.created": [
    ["payouts"],
    ["customer"],
    ["open-accounts"],
    ["rep"],
    ["pos-customer-balances"],
    ["open-plain-customer"],
    ["open-account-customer"],
  ],
  "return.created": [
    ["pos-recent-invoices"],
    ["returns"],
    ["invoice"],
    ["returnable"],
    ["customer"],
    ["customer-purchases"],
    ["open-accounts"],
    ["rep"],
    ["products"],
    // مانده‌ی فاکتورها و اثر روی ردیف‌های حسابِ کلی هم عوض می‌شود.
    ["pos-customer-invoices"],
    ["pos-customer-balances"],
    ["open-plain-invoices"],
    ["open-account"],
  ],
  /*
   * اصلاحیه — قراردادِ همان برگشت: جمع و مانده و ردیف‌های حسابِ کلی.
   * قبلاً به fallbackِ «همه را تازه کن» می‌افتاد؛ حالا هدفمند است.
   */
  "correction.created": [
    ["corrections"],
    ["correction"],
    ["invoice"],
    ["customer"],
    ["customer-purchases"],
    ["open-accounts"],
    ["rep"],
    ["products"],
    ["pos-customer-invoices"],
    ["pos-customer-balances"],
    ["open-plain-invoices"],
    ["open-account"],
  ],
  // حسابِ کلی ساخته شد → فهرستِ حساب‌بازها و رجیستری تازه شوند.
  "open-account.created": [["open-accounts"], ["open-accounts-registry"]],
  /*
   * تسویه — نوبت‌ها CONFIRMED می‌شوند و در ریزگردش‌ها (F4 و F3) ظاهر می‌شوند؛
   * سطل‌های بدهیِ مشتری هم عوض می‌شود.
   */
  "open-account.settled": [
    ["open-accounts"],
    ["open-accounts-registry"],
    ["customer"],
    ["rep"],
    ["invoice"],
    ["pos-customer-invoices"],
    ["pos-customer-balances"],
    ["open-plain-invoices"],
    ["open-plain-customer"],
    ["open-account-customer"],
  ],
  /* وصول/برگشتِ چک — مانده‌ی مشتری و فهرستِ حساب‌بازها عوض می‌شود. */
  "cheque.updated": [
    ["cheques"],
    ["customer"],
    ["rep"],
    ["open-accounts"],
    ["pos-customer-balances"],
    ["open-plain-customer"],
    ["open-account-customer"],
  ],
  "shortage.created": [["shortages"]],
  "shortage.updated": [["shortages"]],
  // تیکِ کارگر → پنل «کارهای انبار» و چیپِ پیشرفت روی فاکتورها تازه شوند.
  "work-task.progress": [["work-tasks"], ["pos-recent-invoices"]],
  // سفارشِ جدیدِ سایت آمد، یا وضعیتش تغییر کرد → صفِ تحویل، جزئیات و شمارِ
  // زنگوله (سفارش‌های منتظرِ برداشت) تازه شوند.
  "online-order.created": [["online-orders"], ["online-order-pending"]],
  "online-order.decided": [
    ["online-orders"],
    ["online-order"],
    ["online-order-pending"],
  ],
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
      useRealtimeStore.getState().setStatus("connecting");
      ws = new WebSocket(eventsSocketUrl(token));

      ws.onopen = () => {
        /*
         * بازگشتِ اتصال یعنی رویدادهایِ وسطِ قطعی گم شده‌اند — دفترِ رسیدها،
         * فهرستِ حساب‌بازها و… ممکن است کهنه باشند. یک invalidateِ کامل همان
         * لحظه همه را از سرور تازه می‌کند؛ فقط روی reconnect، نه اولین اتصال.
         */
        if (attempt > 0) void queryClient.invalidateQueries();
        attempt = 0;
        useRealtimeStore.getState().setStatus("up");
      };

      ws.onmessage = (ev) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data as string) as unknown;
        } catch {
          parsed = null;
        }
        const type =
          parsed && typeof parsed === "object" && "type" in parsed
            ? String((parsed as { type?: unknown }).type ?? "")
            : undefined;
        enqueue(type);
        dispatchLiveEvent(type, parsed);
      };

      ws.onclose = () => {
        if (closedByUs) return;
        useRealtimeStore.getState().setStatus("down");
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
