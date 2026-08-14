"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { searchProducts } from "@/lib/api";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * انتخاب کالا با جست‌وجوی سمت سرور.
 *
 * چرا `Select` ساده جواب نمی‌دهد: کاتالوگ ۳۳ هزار کالا دارد و آن اندپوینت
 * صفحه‌بندی‌شده است. فهرستِ کشویی عملاً فقط ۵۰ کالای اول را داشت — یعنی فیلترِ
 * محصول برای تقریباً کلِ کاتالوگ کار نمی‌کرد و هیچ نشانه‌ای هم نمی‌داد.
 *
 * جست‌وجو به همان رنکرِ سرور سپرده می‌شود (همان که صندوق فروش استفاده می‌کند)،
 * پس «نت لو اید» هم به «لنت جلو پراید» می‌رسد.
 */
export function ProductPicker({
  value,
  onChange,
  placeholder = "همه محصولات",
  id,
  className,
}: {
  /** شناسه‌ی کالای انتخاب‌شده، یا null برای «همه». */
  value: string | null;
  onChange: (productId: string | null, product: Product | null) => void;
  placeholder?: string;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [picked, setPicked] = React.useState<Product | null>(null);

  // تایپِ هر حرف یک درخواست نمی‌فرستد.
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  const results = useQuery({
    queryKey: ["products", "search", debounced],
    queryFn: () => searchProducts(debounced),
    // زیر دو حرف نتیجه‌ی معناداری نمی‌دهد و فقط سرور را مشغول می‌کند.
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  /*
   * برچسب **مشتق** می‌شود، نه با effect همگام.
   *
   * `picked` فقط برای داشتنِ نام نگه داشته می‌شود؛ مرجعِ حقیقت همان `value`ِ
   * والد است. اگر والد فیلتر را از بیرون پاک کند (دکمه‌ی «حذف فیلترها») یا
   * چیز دیگری بنشاند، این تطبیقِ شناسه خودش کهنه‌بودن را می‌گیرد — بدون effect
   * و بدون رندرِ آبشاری.
   */
  const selected = picked && picked.id === value ? picked : null;

  const label = selected
    ? `${selected.name}${selected.sku ? ` — ${selected.sku}` : ""}`
    : placeholder;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {label}
            </span>
            <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          {/* فیلترِ داخلیِ cmdk خاموش است: رتبه‌بندی کار سرور است. */}
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="نام یا کد کالا…"
              value={term}
              onValueChange={setTerm}
            />
            <CommandList>
              {debounced.length < 2 ? (
                <CommandEmpty>برای جست‌وجو حداقل دو حرف بنویسید</CommandEmpty>
              ) : results.isLoading ? (
                <CommandEmpty>در حال جست‌وجو…</CommandEmpty>
              ) : results.isError ? (
                <CommandEmpty>جست‌وجو ناموفق بود</CommandEmpty>
              ) : (results.data ?? []).length === 0 ? (
                <CommandEmpty>کالایی پیدا نشد</CommandEmpty>
              ) : (
                <CommandGroup>
                  {(results.data ?? []).map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      onSelect={() => {
                        setPicked(p);
                        onChange(p.id, p);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "me-2 h-4 w-4",
                          value === p.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">
                        {p.name}
                        {p.sku ? (
                          <span className="text-muted-foreground"> — {p.sku}</span>
                        ) : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="پاک کردن فیلتر محصول"
          onClick={() => {
            setPicked(null);
            onChange(null, null);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
