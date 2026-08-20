"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  createCustomer,
  getActiveCustomerCategories,
  searchCustomers,
} from "@/lib/api";
import { rial, toFa } from "@/lib/format";
import type { Customer } from "@/lib/types";

/**
 * انتخاب یا ساخت مشتری.
 * جست‌وجو با نام، فامیل یا شماره‌ی ناقص کار می‌کند (سرور هر سه را پوشش می‌دهد).
 * ساخت مشتری فقط با نام ممکن است — شماره اختیاری است.
 */
export function CustomerPicker({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  onPick: (c: Customer | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  // دسته‌ی مشتری — همان لیستِ دسته‌های فعالِ تعریف‌شده توسط مدیر.
  const [categoryId, setCategoryId] = useState("");
  // ردیفِ هایلایت‌شده برای ناوبری با کیبورد (↑/↓/Enter).
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setCreating(false);
      setFirstName("");
      setLastName("");
      setPhone("");
      setCategoryId("");
    }
  }, [open]);

  /** دسته‌های فعال برای فرم «مشتری جدید». */
  const categories = useQuery({
    queryKey: ["customer-categories", "active"],
    queryFn: getActiveCustomerCategories,
    enabled: open && creating,
  });

  const results = useQuery({
    queryKey: ["customers", debounced],
    queryFn: () => searchCustomers(debounced),
    enabled: open,
  });

  // با تغییرِ نتایج، هایلایت به بالای لیست برگردد تا روی ردیفِ ناموجود نماند.
  useEffect(() => setActive(0), [debounced, results.data]);

  const create = useMutation({
    mutationFn: () =>
      createCustomer({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phones: phone.trim() ? [{ phone: phone.trim(), isPrimary: true }] : undefined,
        categoryId: categoryId || undefined,
      }),
    onSuccess: (c) => {
      toast.success("مشتری ثبت شد");
      onPick(c);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "ثبت مشتری ناموفق بود");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {creating ? "مشتری جدید" : "انتخاب مشتری"}
          </DialogTitle>
        </DialogHeader>

        {creating ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">نام</label>
                <Input
                  autoFocus
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="الزامی"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">نام خانوادگی</label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                شماره تماس <span className="text-muted-foreground">(اختیاری)</span>
              </label>
              <Input
                dir="ltr"
                className="text-right"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="۰۹۱۲…"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                ثبت مشتری بدون شماره هم ممکن است.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                دسته مشتری <span className="text-muted-foreground">(اختیاری)</span>
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                aria-label="دسته مشتری"
              >
                <option value="">بدون دسته</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {categories.isLoading && (
                <p className="mt-1 text-xs text-muted-foreground">در حال بارگذاری دسته‌ها…</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!firstName.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? "در حال ثبت…" : "ثبت و انتخاب"}
              </Button>
              <Button variant="outline" onClick={() => setCreating(false)}>
                بازگشت
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                const list = results.data ?? [];
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, list.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (list[active]) onPick(list[active]);
                }
              }}
              placeholder="نام، نام خانوادگی یا شماره تماس…"
            />

            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {results.isLoading && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  در حال جست‌وجو…
                </p>
              )}

              {!results.isLoading && (results.data?.length ?? 0) === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {debounced ? "مشتری‌ای پیدا نشد" : "برای جست‌وجو تایپ کنید"}
                </p>
              )}

              {results.data?.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => onPick(c)}
                  onMouseEnter={() => setActive(i)}
                  ref={(el) => {
                    if (i === active) el?.scrollIntoView({ block: "nearest" });
                  }}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-right
                             hover:border-primary hover:bg-primary/5 focus:outline-none
                             focus:ring-2 focus:ring-primary ${
                               i === active ? "border-primary bg-primary/5" : ""
                             }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.fullName}</span>
                    <span className="block text-xs text-muted-foreground" dir="ltr">
                      {c.phones?.[0]?.phone ? toFa(c.phones[0].phone) : "بدون شماره"}
                    </span>
                  </span>
                  {!!c.summary?.totalDue && (
                    <span className="shrink-0 text-xs text-amber-600 tabular-nums">
                      بدهی {rial(c.summary.totalDue)}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" variant="outline" onClick={() => setCreating(true)}>
                مشتری جدید
              </Button>
              <Button variant="ghost" onClick={() => onPick(null)}>
                بدون مشتری
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
