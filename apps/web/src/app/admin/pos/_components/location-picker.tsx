"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { qty } from "@/lib/format";
import type { StockLocation } from "@/lib/types";

/**
 * وقتی یک کالا در چند مکان موجودی دارد، فروشنده باید بگوید از کدام مکان بفروشد.
 * اگر فقط یک مکان باشد این پنجره اصلاً باز نمی‌شود (صداکننده خودش انتخاب می‌کند).
 */
export function LocationPicker({
  open,
  productName,
  stock,
  onPick,
  onClose,
}: {
  open: boolean;
  productName: string;
  stock: StockLocation[];
  onPick: (s: StockLocation) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            این کالا در چند مکان موجود است
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-2">{productName}</p>

        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {stock.map((s, i) => (
            <button
              key={s.locationId}
              autoFocus={i === 0}
              onClick={() => onPick(s)}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-right
                         hover:border-primary hover:bg-primary/5 focus:outline-none
                         focus:ring-2 focus:ring-primary"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.locationPath}</span>
                <span className="block text-xs text-muted-foreground">{s.locationCode}</span>
              </span>
              <span className="shrink-0 tabular-nums text-sm">
                موجودی {qty(s.quantity)}
              </span>
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          برای انتخاب، کلید بالا و پایین و سپس Enter — یا کلیک.
        </p>
      </DialogContent>
    </Dialog>
  );
}
