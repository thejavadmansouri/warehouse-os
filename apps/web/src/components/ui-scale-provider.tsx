"use client";

import * as React from "react";
import { toast } from "sonner";

import { SCALE_LABELS, useUiScale } from "@/lib/ui-scale";

/**
 * تنظیمِ خوانایی را روی <html> می‌نشاند و میان‌برهایش را می‌گیرد.
 *
 * چیزی رندر نمی‌کند. جایش ریشه‌ی برنامه است تا در هر صفحه‌ای — صندوق، انبار،
 * گزارش — همان دو کلید کار کند.
 *
 * چرا Ctrl+Alt و نه Ctrl+ + : کروم روی ویندوز Ctrl+ + را برای زوم خودش
 * برمی‌دارد و preventDefault هم جلویش را نمی‌گیرد. Ctrl+Alt+↑/↓ آزاد است.
 */
export function UiScaleProvider() {
  const scale = useUiScale((s) => s.scale);
  const highContrast = useUiScale((s) => s.highContrast);
  const posDensity = useUiScale((s) => s.posDensity);
  const bigger = useUiScale((s) => s.bigger);
  const smaller = useUiScale((s) => s.smaller);
  const reset = useUiScale((s) => s.reset);
  const toggleContrast = useUiScale((s) => s.toggleContrast);

  React.useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(scale));
  }, [scale]);

  React.useEffect(() => {
    if (highContrast) document.documentElement.setAttribute("data-contrast", "high");
    else document.documentElement.removeAttribute("data-contrast");
  }, [highContrast]);

  /* تراکم جدول صندوق — CSS در globals.css از روی همین نشانه می‌خواند.
     حالتِ خیلی فشرده هم خاصیتِ فشرده را دارد (ترتیبِ قواعد در CSS). */
  React.useEffect(() => {
    document.documentElement.setAttribute("data-pos-density", posDensity);
  }, [posDensity]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.altKey) return;

      /*
       * پیام کوتاه بعد از هر تغییر: بدون آن، کسی که تصادفی کلید را زده
       * نمی‌فهمد چه شد و فکر می‌کند صفحه خراب شده.
       */
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          bigger();
          toast.info(`بزرگ‌نمایی: ${SCALE_LABELS[useUiScale.getState().scale] ?? ""}`);
          break;
        case "ArrowDown":
          e.preventDefault();
          smaller();
          toast.info(`بزرگ‌نمایی: ${SCALE_LABELS[useUiScale.getState().scale] ?? ""}`);
          break;
        case "0":
          e.preventDefault();
          reset();
          toast.info("بزرگ‌نمایی: ۱۰۰٪");
          break;
        case "c":
        case "C":
        case "ش": // همان کلید روی چیدمان فارسی
          e.preventDefault();
          toggleContrast();
          toast.info(
            useUiScale.getState().highContrast ? "کنتراست بالا: روشن" : "کنتراست بالا: خاموش",
          );
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bigger, smaller, reset, toggleContrast]);

  return null;
}

/**
 * قبل از اولین رنگ‌آمیزی، اندازه را از localStorage بخوان.
 *
 * zustand/persist بعد از hydrate مقدار را می‌گذارد و آن یعنی یک پرشِ محسوس
 * از ۱۰۰٪ به ۱۶۰٪ جلوی چشم فروشنده. این اسکریپت هم‌زمان با پارس‌شدنِ صفحه
 * اجرا می‌شود و همان کاری را می‌کند که پرووایدر بعداً می‌کند.
 */
export const uiScaleBootScript = `
try {
  var raw = localStorage.getItem("kardo-ui-scale");
  if (raw) {
    var st = (JSON.parse(raw) || {}).state || {};
    if (st.scale) document.documentElement.style.setProperty("--ui-scale", String(st.scale));
    if (st.highContrast) document.documentElement.setAttribute("data-contrast", "high");
  }
} catch (e) {}
`;
