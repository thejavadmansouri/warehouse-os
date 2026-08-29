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
  const highContrast = useUiScale((s) => s.highContrast);
  const toggleContrast = useUiScale((s) => s.toggleContrast);

  // تا وقتی localStorage خوانده نشده، مقدارِ سرور و کلاینت یکی نیست.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="size-7" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" title="اندازه و خوانایی">
          <Type className="h-[18px] w-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>اندازه‌ی رابط</span>
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] font-normal">Ctrl+Alt+↑↓</kbd>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={String(scale)} onValueChange={(v) => setScale(Number(v))}>
          {UI_SCALES.map((s) => (
            <DropdownMenuRadioItem key={s} value={String(s)}>
              {SCALE_LABELS[s]}
            </DropdownMenuRadioItem>
          ))}
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
