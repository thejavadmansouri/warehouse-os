"use client";

import { Plus, X } from "lucide-react";

import { money, toFa } from "@/lib/format";
import type { Cart } from "../_lib/carts";

/**
 * نوار تب فاکتورها — مثل تب مرورگر.
 *
 * روی هر تب تعداد اقلام و جمعش نوشته می‌شود، تا فروشنده بدون باز کردن بداند
 * کدام تب مالِ کیست. تبِ خالی عمداً عددی نشان نمی‌دهد؛ صفرِ تکراری روی نوار
 * فقط نویز است.
 */
export function CartTabs({
  carts,
  activeId,
  canAdd,
  totalOf,
  onSelect,
  onAdd,
  onClose,
}: {
  carts: Cart[];
  activeId: string;
  canAdd: boolean;
  totalOf: (c: Cart) => number;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {/*
        min-w-0 حیاتی است: بدون آن، min-widthِ پیش‌فرضِ این flex-item برابرِ
        عرضِ محتوا می‌شود و به‌جای اسکرول، کل ردیف صفحه را پهن می‌کند و از کادر
        می‌زند بیرون — با ۱۰ تبِ نام‌دار دقیقاً همین می‌شد.
      */}
      {carts.map((c) => {
        const active = c.id === activeId;
        const count = c.lines.filter((l) => l.included).length;

        return (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`group flex shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 transition-colors ${
              active
                ? "border-b-primary bg-primary/10"
                : "border-b-transparent hover:bg-muted"
            }`}
          >
            <span
              className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted-foreground/20 text-muted-foreground"
              }`}
            >
              {toFa(c.label)}
            </span>

            <span className="text-sm">
              {c.customer ? (
                // نامِ بلند تب را پهن نکند: سقفِ عرض + truncate تا ۸ تا ۱۰ تب
                // مرتب کنارِ هم جا شوند. نامِ کامل روی hover.
                <span
                  title={c.customer.fullName}
                  className={`block max-w-[8.5rem] truncate ${active ? "font-semibold" : ""}`}
                >
                  {c.customer.fullName}
                </span>
              ) : count ? (
                <span className="whitespace-nowrap text-muted-foreground">
                  {toFa(count)} قلم ·{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {money(totalOf(c))}
                  </span>
                </span>
              ) : (
                <span className="whitespace-nowrap text-muted-foreground">خالی</span>
              )}
              {c.openAccountId && (
                <span
                  className={`ms-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                    active
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "border-amber-500/40 text-amber-600/80 dark:text-amber-400/80"
                  }`}
                >
                  حساب باز
                </span>
              )}
            </span>

            {/*
              بستن فقط وقتی تب فعال است یا موس رویش است — وگرنه یک ضربدرِ همیشه
              روشن کنار هر تب، خودش یک دکمه‌ی خطای آماده است.
            */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(c.id);
              }}
              title="بستن فاکتور"
              className={`rounded p-0.5 text-muted-foreground transition-opacity hover:bg-destructive/10
                          hover:text-destructive ${
                            active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}

      {canAdd && (
        <button
          type="button"
          onClick={onAdd}
          title="فاکتور جدید (Ctrl+T)"
          className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-2 text-sm text-muted-foreground
                     hover:bg-primary/10 hover:text-primary"
        >
          <Plus className="size-4" />
          فاکتور جدید
        </button>
      )}
    </div>
  );
}
