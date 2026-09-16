"use client";

import * as React from "react";
import { Contrast, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SCALE_LABELS, UI_SCALES, useUiScale } from "@/lib/ui-scale";

/**
 * کلیدِ خوانایی در نوار بالا.
 *
 * میان‌برها (Ctrl+Alt+↑/↓) سریع‌ترند، ولی کسی که نمی‌داندشان باید بتواند
 * پیدایشان کند — این منو هم تنظیم را انجام می‌دهد و هم میان‌بر را یاد می‌دهد.
 */
export function ReadabilityToggle() {
  const scale = useUiScale((s) => s.scale);
  const setScale = useUiScale((s) => s.setScale);
  const bigger = useUiScale((s) => s.bigger);
  const smaller = useUiScale((s) => s.smaller);
  const highContrast = useUiScale((s) => s.highContrast);
  const toggleContrast = useUiScale((s) => s.toggleContrast);
  const posDensity = useUiScale((s) => s.posDensity);
  const setPosDensity = useUiScale((s) => s.setPosDensity);

  // تا وقتی localStorage خوانده نشده، مقدارِ سرور و کلاینت یکی نیست.
  // useSyncExternalStore: هم قاعدهٔ افکتِ رندر را دارد، هم با پایانِ هیدریشنِ
  // persist دوباره رندر می‌شود.
  const mounted = React.useSyncExternalStore(
    useUiScale.subscribe,
    () => useUiScale.persist.hasHydrated(),
    () => false,
  );
  if (!mounted) return <div className="size-7" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" title="اندازه و خوانایی">
          <Type className="h-[18px] w-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {/*
          اندازهٔ صفحه — دو دکمهٔ سریع بالا برای هر کسی که نمی‌خواهد با پله‌ها
          کلنجار برود؛ لیستِ پله‌ها زیرش برای انتخابِ دقیق. کوچک/بزرگ‌کردن منو
          را نمی‌بندد تا بتوان پشت‌سرهم کلیک کرد.
        */}
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>اندازهٔ صفحه</span>
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] font-normal">Ctrl+Alt+↑↓</kbd>
        </DropdownMenuLabel>
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex-1"
            onClick={() => smaller()}
            disabled={scale <= UI_SCALES[0]}
          >
            − کوچک‌تر
          </Button>
          <span className="min-w-12 text-center text-sm font-bold tabular-nums">
            {SCALE_LABELS[scale] ?? "۱۰۰٪"}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex-1"
            onClick={() => bigger()}
            disabled={scale >= UI_SCALES[UI_SCALES.length - 1]}
          >
            + بزرگ‌تر
          </Button>
        </div>
        <DropdownMenuRadioGroup value={String(scale)} onValueChange={(v) => setScale(Number(v))}>
          {UI_SCALES.map((s) => (
            <DropdownMenuRadioItem key={s} value={String(s)}>
              {SCALE_LABELS[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        {/*
          تراکم جدول صندوق — فشرده یعنی ۲۰+ قلم در یک صفحه جا شود؛ برای
          فاکتورهای بلندِ لوازم یدکی که فروشنده مدام اسکرول می‌کرد.
          فقط جدولِ اقلامِ صندوق کوچک می‌شود، نه بقیهٔ برنامه.
        */}
        <DropdownMenuLabel>ردیف‌های جدول صندوق</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={posDensity}
          onValueChange={(v) => setPosDensity(v as "normal" | "compact" | "ultra")}
        >
          <DropdownMenuRadioItem value="normal">عادی — حدود ۱۳ قلم</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">فشرده — حدود ۲۰ قلم</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="ultra">خیلی فشرده — حدود ۲۵ قلم</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuCheckboxItem checked={highContrast} onCheckedChange={() => toggleContrast()}>
          <Contrast className="me-2 size-4" />
          کنتراست بالا
          <kbd className="ms-auto rounded border px-1.5 py-0.5 text-[10px] font-normal">
            Ctrl+Alt+C
          </kbd>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
