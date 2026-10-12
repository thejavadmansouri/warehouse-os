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

/*
 * ───────── گروه‌های دامنه ─────────
 *
 * هر صفحه‌ای که عددِ پولی (مانده، جمع فاکتور، رسید…) نشان می‌دهد کلیدش در
 * MONEY است، و هر صفحه‌ای که موجودی/قفسه نشان می‌دهد در STOCK. رویدادها به
 * گروه نگاشت می‌شوند نه به تک‌کلید — تا صفحه‌ی تازه فقط با افزودنِ کلیدش به
 * یک گروه، در همه‌ی رویدادهای مربوط زنده شود.
 *
 * هزینه: invalidate فقط کوئری‌های «فعال» (روی صفحه) را refetch می‌کند؛ بقیه
 * فقط stale علامت می‌خورند و تا باز نشوند هیچ درخواستی نمی‌زنند. پس گروهِ
 * بزرگ = هزینه‌ی صفر برای صفحه‌های بسته.
 *
 * عمداً بیرون: کلیدهای جست‌وجوی زنده (pos-locate, pos-inline, *-search) — تا
 * هر فروش وسطِ تایپ نتیجه‌ها را پرش ندهد.
 */
const k = (...roots: string[]): string[][] => roots.map((r) => [r]);

export const MONEY_KEYS = k(
  // فاکتورها
  "invoice",
  "invoices-list",
  "invoice-story",
  "invoice-settlement",
  "pos-recent-invoices",
  "pos-invoices-panel",
  "pos-customer-invoices",
  "net-swap-invoices",
  "returnable",
  "correctable",
  "returns",
  "corrections",
  "correction",
  // مشتری و مانده
  "customer",
  "customers",
  "debtors",
  "customer-purchases",
  "customer-today-count",
  "customer-today-invoices",
  "pos-customer-balances",
  "pos-customer-lookup",
  "checkout-customers",
  "credit-check",
  // حساب‌ها و پرداخت‌ها
  "open-accounts",
  "open-accounts-pick",
  "open-accounts-registry",
  "open-account",
  "open-plain-invoices",
  "open-plain-customer",
  "open-account-customer",
  "receipts",
  "payouts",
  "cheques",
  // گزارش و حسابداری
  "rep",
  "statement",
  "vouchers",
  "alerts",
);

export const STOCK_KEYS = k(
  "products",
  "product",
  "pos-stock-batch",
  "inventory",
  "kardex",
  "label-coverage",
  "labels-at",
  "subtree-stats",
  "pricing-products",
  "site-ready-products",
);

const CATALOG_KEYS = k(
  "products",
  "product",
  "pos-stock-batch",
  "pricing-products",
  "site-ready-products",
  "part-catalog",
  "pending-labels",
  "pending-labels-count",
  "label-coverage",
  "labels-at",
);

const PURCHASE_KEYS = k("purchases", "suppliers", "supplier");

const QUOTATION_KEYS = k("pos-open-quotations", "quotations", "quotation");

/** ادغامِ چند گروه بدون کلیدِ تکراری. */
function merge(...groups: string[][][]): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const g of groups) {
    for (const key of g) {
      const id = JSON.stringify(key);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(key);
    }
  }
  return out;
}

/**
 * نگاشتِ رویداد → پیشوندِ queryKeyهایی که باید تازه شوند.
 *
 * React Query پیشوندی مطابقت می‌دهد: ["rep"] با ["rep","sales",...] هم می‌خورد.
 * رویدادِ ناشناس → fallbackِ امن: همه.
 *
 * اکسپورت برای تستِ «همه‌ی رویدادهای بک‌اند نگاشت‌شده‌اند».
 */
export const KEYS_BY_EVENT: Record<string, string[][]> = {
  "sale.created": merge(MONEY_KEYS, STOCK_KEYS, QUOTATION_KEYS),
  "sale.canceled": merge(MONEY_KEYS, STOCK_KEYS),
  "stock.changed": STOCK_KEYS,
  /*
   * رسید / پرداخت / برگشت و اصلاحِ پرداخت / چک / تسویه — همه فقط پول را
   * جابه‌جا می‌کنند: مانده‌ی مشتری، باقیِ فاکتورها، گزارش‌ها و اسناد. یک
   * گروه، تا «دریافت از فلانی» در هر صفحه‌ای که باز است همان لحظه دیده شود.
   */
  "receipt.created": MONEY_KEYS,
  "payout.created": MONEY_KEYS,
  "payment.reversed": MONEY_KEYS,
  "payment.recomposed": MONEY_KEYS,
  "cheque.updated": MONEY_KEYS,
  "open-account.created": MONEY_KEYS,
  "open-account.settled": MONEY_KEYS,
  "return.created": merge(MONEY_KEYS, STOCK_KEYS),
  "correction.created": merge(MONEY_KEYS, STOCK_KEYS),
  "shortage.created": k("shortages"),
  "shortage.updated": k("shortages"),
  // تیکِ کارگر → پنل «کارهای انبار»، چیپِ پیشرفت روی فاکتورها و سند خرید.
  "work-task.progress": k("work-tasks", "pos-recent-invoices", "purchases"),
  "online-order.created": k("online-orders", "online-order-pending"),
  "online-order.decided": merge(
    k("online-orders", "online-order", "online-order-pending"),
    STOCK_KEYS,
  ),
  // خرید: موجودی، بدهی تأمین‌کننده، قیمت خرید (حاشیه‌ی سود) و اسناد.
  "purchase.changed": merge(
    PURCHASE_KEYS,
    STOCK_KEYS,
    CATALOG_KEYS,
    k("rep", "statement", "vouchers", "work-tasks"),
  ),
  "supplier.changed": PURCHASE_KEYS,
  "customer.changed": k(
    "customer",
    "customers",
    "debtors",
    "checkout-customers",
    "credit-check",
    "pos-customer-lookup",
    "pos-customer-balances",
    "open-accounts",
  ),
  "product.changed": CATALOG_KEYS,
};

/**
 * فاصله‌ی polling که فقط وقتی کانال زنده قطع است فعال می‌شود.
 *
 * وقتی سوکت وصل است رویدادها خودشان صفحه را تازه می‌کنند و polling فقط CPU و
 * شبکه را می‌سوزاند؛ وقتی قطع است، همان polling تنها راهِ تازه‌ماندن است.
 */
export function useFallbackPoll(ms: number): number | false {
  const status = useRealtimeStore((s) => s.status);
  return status === "up" ? false : ms;
}

/**
 * پلِ realtime بین سرور و React Query.
 *
 * یک‌بار (در QueryProvider) mount می‌شود، به /events/ws وصل می‌شود و روی هر
 * رویداد، کوئری‌های گروهِ مربوط را invalidate می‌کند تا React Query داده‌ی تازه
 * را از همان endpointِ guard-شده دوباره بگیرد — بدون هیچ رفرشِ دستی.
 *
 * سه چیز که مصرف را پایین نگه می‌دارد:
 *  - coalesce ۱۵۰ms: چند رویدادِ پشت‌سرهم (فروش = sale.created + stock.changed)
 *    یک دورِ refetch می‌شود.
 *  - فقط کوئری‌های روی صفحه refetch می‌شوند (رفتارِ خودِ React Query).
 *  - تبِ پنهان (پشتِ تب دیگر / مینیمایز) هیچ refetchی نمی‌زند؛ کلیدها جمع
 *    می‌شوند و با برگشتن به تب یک‌جا تازه می‌شوند.
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

    let pendingKeys = new Set<string>();
    let invalidateAll = false;

    const flush = () => {
      coalesceTimer = undefined;
      // تب پنهان: صبر تا برگشتن کاربر — همان لحظه یک‌جا تازه می‌شود.
      if (document.hidden) return;
      if (invalidateAll) {
        invalidateAll = false;
        pendingKeys.clear();
        void queryClient.invalidateQueries();
        return;
      }
      const keys = [...pendingKeys].map((key) => JSON.parse(key) as string[]);
      pendingKeys = new Set<string>();
      for (const queryKey of keys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };

    const schedule = () => {
      if (!coalesceTimer) coalesceTimer = setTimeout(flush, 150);
    };

    const enqueue = (type: string | undefined) => {
      const mapped = type ? KEYS_BY_EVENT[type] : undefined;
      if (!mapped) {
        // رویدادِ ناشناس → همه را تازه کن (امن‌ترین حالت).
        invalidateAll = true;
      } else {
        for (const key of mapped) pendingKeys.add(JSON.stringify(key));
      }
      schedule();
    };

    const onVisible = () => {
      if (!document.hidden && (invalidateAll || pendingKeys.size > 0)) schedule();
    };
    document.addEventListener("visibilitychange", onVisible);

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
        if (attempt > 0) {
          invalidateAll = true;
          schedule();
        }
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
      document.removeEventListener("visibilitychange", onVisible);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (coalesceTimer) clearTimeout(coalesceTimer);
      ws?.close();
    };
  }, [token, queryClient]);
}
