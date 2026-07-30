"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { searchProducts } from "@/lib/api";
import type { Product } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";

// انتخاب محصول با جستجوی زنده — از /products/search?q= استفاده می‌کند (طبق بخش ۶.۳)
export function ProductSearchSelect({
  value,
  onChange,
  placeholder = "انتخاب محصول...",
  disabled,
  className,
}: {
  value?: string;
  onChange: (product: Product | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");

  // طبق بخش ۶.۳ — GET /products/search?q=
  const searchQ = useQuery({
    queryKey: ["products", "search", q],
    queryFn: () => searchProducts(q),
    enabled: open && q.trim().length >= 1,
    staleTime: 30_000,
  });

  // برای نگه‌داشتن نام محصول انتخاب‌شده وقتی نتیجه جستجو عوض می‌شود
  const [selected, setSelected] = React.useState<Product | null>(null);
  React.useEffect(() => {
    if (value && !selected) {
      // وقتی فرم ریست می‌شود مقدار value خالی می‌شود
    }
    if (!value) setSelected(null);
  }, [value, selected]);

  const items = searchQ.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{selected.name}</span>
              {selected.sku ? (
                <span className="text-xs text-muted-foreground">
                  ({selected.sku})
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="جستجوی نام، SKU یا بارکد..."
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            {q.trim().length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-xs text-muted-foreground">
                <Search className="h-4 w-4 opacity-50" />
                برای جستجوی محصول عبارتی وارد کنید.
              </div>
            ) : searchQ.isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : searchQ.isError ? (
              <CommandEmpty>خطا در جستجو — دوباره تلاش کنید.</CommandEmpty>
            ) : items.length === 0 ? (
              <CommandEmpty>محصولی یافت نشد.</CommandEmpty>
            ) : (
              <CommandGroup>
                {items.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      setSelected(p);
                      onChange(p);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === p.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      {p.sku ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {p.sku}
                        </span>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
