"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * نوارِ آیکنِ یک صفحه — همان شکلِ نوارِ فرمانِ سند، ولی برای صفحه‌هایی که
 * سند نیستند.
 *
 * چرا جدا از `DocumentShell`: آنجا جای دکمه‌ها **ثابت** است چون فروشنده بین
 * چند نوع سند جابه‌جا می‌شود و حافظه‌ی دستش نباید خراب شود. صفحه‌ی مشتری یک
 * نوع بیشتر ندارد، پس آن قید لازم نیست و فهرستِ آزادِ اکشن کافی است — ولی
 * ظاهر و اندازه عمداً یکی است تا برنامه یک‌دست بماند.
 */
export interface IconAction {
  id: string;
  icon: LucideIcon;
  label: string;
  /** آنچه در tooltip بعد از نام می‌آید. خالی یعنی این اکشن کلید ندارد. */
  keyLabel?: string;
  run: () => void;
  disabled?: boolean;
  /** پررنگ — عملِ اصلیِ صفحه. */
  primary?: boolean;
  destructive?: boolean;
  /** پنلِ همین اکشن الان باز است. */
  active?: boolean;
  /** یک خطِ جداکننده پیش از این اکشن. */
  separated?: boolean;
}

export function IconBar({
  actions,
  children,
}: {
  actions: IconAction[];
  /** متنِ سمتِ دیگرِ نوار — معمولاً وضعیت یا عددِ مهمِ صفحه. */
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b bg-card px-2 py-1"
      role="toolbar"
    >
      {actions.map((a) => (
        <React.Fragment key={a.id}>
          {a.separated && <span className="mx-1.5 h-5 w-px bg-border" aria-hidden />}
          <button
            type="button"
            disabled={a.disabled}
            onClick={a.run}
            title={a.keyLabel ? `${a.label} — ${a.keyLabel}` : a.label}
            aria-label={a.label}
            aria-pressed={a.active}
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded",
              "transition-colors disabled:cursor-not-allowed disabled:opacity-30",
              a.primary
                ? "bg-primary text-primary-foreground enabled:hover:brightness-95"
                : a.active
                  ? "bg-accent/20 text-foreground"
                  : "text-muted-foreground enabled:hover:bg-accent/15 enabled:hover:text-foreground",
              a.destructive && !a.primary && "enabled:hover:text-destructive",
            )}
          >
            <a.icon className="size-4" />
          </button>
        </React.Fragment>
      ))}

      {children && <div className="ms-auto flex items-center gap-4 ps-3">{children}</div>}
    </div>
  );
}

/**
 * پنلی که روی بدنه‌ی صفحه باز می‌شود — نه پنجره.
 *
 * همان قاعده‌ی صندوق: زنجیره‌ی کار نباید با یک لایه‌ی مودال قطع شود. Esc
 * می‌بندد و فوکوس داخلِ خودِ پنل می‌ماند.
 */
export function OverlayPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-background outline-none"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <h2 className="font-bold">{title}</h2>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[11px]">Esc بستن</kbd>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </div>
  );
}
