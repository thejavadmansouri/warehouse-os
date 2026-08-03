"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchProducts } from "@/lib/api";
import { toFa } from "@/lib/format";
import type { Product } from "@/lib/types";

/** جست‌وجوی کالا وقتی بارکد نداریم یا بارکد نمی‌خواند. */
export function ProductSearch({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  onPick: (p: Product) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const results = useQuery({
    queryKey: ["pos-product-search", debounced],
    queryFn: () => searchProducts(debounced),
    enabled: open && debounced.trim().length > 1,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">جست‌وجوی کالا</DialogTitle>
        </DialogHeader>

        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="نام کالا، کد یا شماره فنی…"
        />

        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
          {results.isLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              در حال جست‌وجو…
            </p>
          )}

          {!results.isLoading && debounced.trim().length > 1 &&
            (results.data?.length ?? 0) === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                کالایی پیدا نشد
              </p>
            )}

          {results.data?.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-right
                         hover:border-primary hover:bg-primary/5 focus:outline-none
                         focus:ring-2 focus:ring-primary"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  کد {toFa(p.sku ?? "—")}
                </span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
