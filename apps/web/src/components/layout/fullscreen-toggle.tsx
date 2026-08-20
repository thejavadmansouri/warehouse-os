"use client";

import * as React from "react";
import { Maximize, Minimize } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * تمام‌صفحه کردنِ صندوق.
 *
 * **چرا دکمه است و نه خودکار:** مرورگر اجازه نمی‌دهد صفحه بدونِ کلیکِ کاربر
 * تمام‌صفحه شود؛ `requestFullscreen` بیرون از یک رویدادِ کاربر رد می‌شود. پس
 * «وارد می‌شود و تمام‌صفحه است» در مرورگر شدنی نیست و هر تلاشی برای دورزدنش
 * فقط یک خطای بی‌صدا در کنسول می‌سازد.
 *
 * روی دستگاهِ پیشخوان، راهِ درست قابِ دسکتاپ (Tauri) است که پنجره را از همان
 * ابتدا تمام‌صفحه باز می‌کند. این دکمه برای وقتی است که در مرورگر کار می‌کند.
 */
export function FullscreenToggle() {
  const [isFull, setIsFull] = React.useState(false);

  React.useEffect(() => {
    // خروج با Esc از خودِ مرورگر می‌آید و رویدادِ کلیک ندارد، پس وضعیت باید از
    // خودِ document خوانده شود نه از حافظه‌ی داخلی.
    const sync = () => setIsFull(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        /* مرورگر اجازه نداد (مثلاً iframe بدونِ allow) — بی‌صدا رد شود. */
      });
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={toggle}
      title={isFull ? "خروج از تمام‌صفحه (Esc)" : "تمام‌صفحه"}
      aria-label={isFull ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
    >
      {isFull ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
    </Button>
  );
}
