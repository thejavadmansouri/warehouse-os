"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag } from "lucide-react";
import { createCustomer, getActiveCustomerCategories } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { CustomerCategoriesDialog } from "@/components/customer-categories-dialog";

/**
 * ساخت مشتری جدید از صفحه‌ی فهرست مشتریان.
 * همان فیلدهای فرمِ POS — نام، نام خانوادگی، شماره و دسته (از دسته‌های فعال).
 */
export function CreateCustomerDialog({
  open,
  onDone,
}: {
  open: boolean;
  onDone: (created: boolean) => void;
}) {
  const role = useAuthStore((s) => s.user?.role);
  /** مدیریت دسته‌ها فقط برای مدیر — همان گاردِ سمت سرور. */
  const isManager = role === "ADMIN" || role === "MANAGER";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [showCategories, setShowCategories] = useState(false);

  useEffect(() => {
    if (!open) {
      setFirstName("");
      setLastName("");
      setPhone("");
      setCategoryId("");
    }
  }, [open]);

  /** دسته‌های فعال برای dropdown. */
  const categories = useQuery({
    queryKey: ["customer-categories", "active"],
    queryFn: getActiveCustomerCategories,
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      createCustomer({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phones: phone.trim() ? [{ phone: phone.trim(), isPrimary: true }] : undefined,
        categoryId: categoryId || undefined,
      }),
    onSuccess: () => {
      toast.success("مشتری ثبت شد");
      onDone(true);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "ثبت مشتری ناموفق بود");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onDone(false)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">مشتری جدید</DialogTitle>
        </DialogHeader>

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
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              دسته مشتری <span className="text-muted-foreground">(اختیاری)</span>
            </label>
            <div className="flex items-center gap-2">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-10 flex-1 rounded-md border bg-background px-2 text-sm"
                aria-label="دسته مشتری"
              >
                <option value="">بدون دسته</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {isManager && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0"
                  title="مدیریت دسته‌ها"
                  onClick={() => setShowCategories(true)}
                >
                  <Tag className="size-4" />
                </Button>
              )}
            </div>
            {isManager && categories.data?.length === 0 && !categories.isLoading && (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                هنوز دسته‌ای تعریف نشده — با دکمه کناری بسازید.
              </p>
            )}
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          <Button
            className="flex-1"
            disabled={!firstName.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "در حال ثبت…" : "ثبت مشتری"}
          </Button>
          <Button variant="outline" onClick={() => onDone(false)}>
            انصراف
          </Button>
        </div>
      </DialogContent>

      {/* مدیریت دسته‌ها — از همین‌جا قابل دسترسی است (فقط مدیر). */}
      <CustomerCategoriesDialog
        open={showCategories}
        onClose={() => setShowCategories(false)}
        onChanged={() => categories.refetch()}
      />
    </Dialog>
  );
}
