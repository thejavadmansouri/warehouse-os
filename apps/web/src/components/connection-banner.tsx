"use client";

import * as React from "react";
import { WifiOff, Loader2 } from "lucide-react";

import { apiUrl } from "@/lib/api";
import { useConnectionStore } from "@/lib/connection-store";
import { toFa } from "@/lib/format";

/** فاصله‌ی تلاش دوباره وقتی ارتباط قطع است. */
const RETRY_MS = 5000;

/**
 * نوار هشدارِ قطع ارتباط با سرور.
 *
 * چرا وجود دارد: پنل همه‌ی داده‌اش را از API می‌گیرد. وقتی سرور خاموش باشد،
 * هر لیستی خالی می‌شود و صفحه شبیه «همه‌چیز پاک شد» به نظر می‌رسد. بدون این
 * نوار، تنها راه فهمیدنِ حقیقت باز کردن ترمینال است.
 *
 * خودش هم تلاش می‌کند وصل شود، پس به‌محض بالا آمدن سرور نوار می‌رود و کاربر
 * لازم نیست کاری بکند.
 */
export function ConnectionBanner() {
  const online = useConnectionStore((s) => s.online);
  const since = useConnectionStore((s) => s.since);
  const setOnline = useConnectionStore((s) => s.setOnline);
  const [checking, setChecking] = React.useState(false);

  const check = React.useCallback(async () => {
    setChecking(true);
    try {
      /*
       * هر پاسخی یعنی سرور بالاست — حتی ۴۰۱.
       * `no-store` لازم است وگرنه مرورگر می‌تواند پاسخ کهنه بدهد و نوار
       * وقتی سرور واقعاً خاموش است هم برود.
       */
      await fetch(`${apiUrl()}/shop-settings`, { cache: "no-store" });
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setChecking(false);
    }
  }, [setOnline]);

  // تلاش خودکار فقط وقتی قطع است؛ در حالت عادی هیچ ترافیک اضافه‌ای نمی‌سازد.
  React.useEffect(() => {
    if (online) return;
    const t = setInterval(check, RETRY_MS);
    return () => clearInterval(t);
  }, [online, check]);

  if (online) return null;

  const minutes = since ? Math.floor((Date.now() - since) / 60000) : 0;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex items-center gap-3 bg-destructive px-4 py-2 text-sm
                 font-medium text-white shadow"
    >
      <WifiOff className="size-4 shrink-0" />

      <span className="flex-1">
        ارتباط با سرور قطع است — اطلاعات نمایش‌داده‌شده کامل نیست.
        <span className="ms-2 font-normal opacity-90">
          هیچ داده‌ای پاک نشده؛ فقط سرور در دسترس نیست.
        </span>
      </span>

      {minutes > 0 && (
        <span className="shrink-0 text-xs opacity-90">
          {toFa(minutes)} دقیقه
        </span>
      )}

      <button
        type="button"
        onClick={check}
        disabled={checking}
        className="shrink-0 rounded-md bg-white/20 px-3 py-1 text-xs hover:bg-white/30
                   disabled:opacity-60"
      >
        {checking ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          "تلاش دوباره"
        )}
      </button>
    </div>
  );
}
