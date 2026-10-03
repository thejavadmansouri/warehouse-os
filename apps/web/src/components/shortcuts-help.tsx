"use client";

import * as React from "react";
import { Keyboard } from "lucide-react";

export interface ShortcutItem {
  keys: string;
  label: string;
  /** مهم‌ترین میان‌برِ گروه؛ برجسته نمایش داده می‌شود. */
  primary?: boolean;
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

export function ShortcutsHelp({
  open,
  groups,
  onClose,
}: {
  open: boolean;
  groups: ShortcutGroup[];
  onClose: () => void;
}): React.ReactElement | null {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // باز که می‌شود فوکوس روی خودِ کادر می‌نشیند تا کلیدها به آن برسند.
  React.useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => containerRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // شنونده روی window تا اگر فوکوس دزدیده شده بود، Esc/F1 هم باز کار کند.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "F1" || e.key === "Enter") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-5xl overflow-y-auto rounded-xl border bg-card p-5 text-card-foreground shadow-lg outline-none sm:p-6"
      >
        {/* سربرگ */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Keyboard className="size-5" aria-hidden />
            راهنمای کلیدها
          </h2>
          <span className="flex items-center gap-1 rounded-lg border bg-muted px-2 py-1 text-sm text-muted-foreground">
            <kbd className="inline-flex min-w-9 items-center justify-center rounded border bg-card px-1.5 py-px font-bold tabular-nums">
              Esc
            </kbd>
            بستن
          </span>
        </div>

        {/* گروه‌های میان‌بر */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <section key={g.title}>
              <h3 className="mb-3 border-b text-base font-bold sm:text-lg">
                {g.title}
              </h3>
              <div className="divide-y divide-border">
                {g.items.map((it) => (
                  <div
                    key={it.keys + it.label}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <kbd
                      className={[
                        "inline-flex w-24 shrink-0 items-center justify-center rounded-md border px-2 py-1.5 text-center text-sm font-bold tabular-nums",
                        it.primary
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      ].join(" ")}
                    >
                      {it.keys}
                    </kbd>
                    <span
                      className={[
                        "flex-1",
                        it.primary ? "text-lg font-semibold" : "text-base",
                      ].join(" ")}
                    >
                      {it.label}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* پانوشت */}
        <p className="mt-6 flex items-center justify-center gap-1 border-t pt-3 text-sm text-muted-foreground">
          این راهنما با F1 باز و بسته می‌شود.
        </p>
      </div>
    </div>
  );
}