"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Phone, Plus, Trash2, Check, Star, Tag } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addCustomerPhone,
  getActiveCustomerCategories,
  removeCustomerPhone,
  setPrimaryCustomerPhone,
  updateCustomer,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { useAuthStore } from "@/lib/auth-store";
import { faToEn, toFa } from "@/lib/format";
import type { Customer } from "@/lib/types";
import { CustomerCategoriesDialog } from "@/components/customer-categories-dialog";

/** برچسب شماره — همان چیزی که مدل CustomerPhone.label می‌پذیرد. */
const PHONE_LABELS = ["موبایل", "ثابت", "محل کار"] as const;

/**
 * ویرایشِ مشخصاتِ مشتری (نام، نام خانوادگی، آدرس، شماره ملی، دسته، یادداشت)
 * و مدیریتِ بانک شماره‌ها (افزودن/حذف).
 *
 * دسته از لیستِ دسته‌های فعال انتخاب می‌شود (نه متن آزاد) — همان چیزی که مدیر
 * در «مدیریت دسته‌ها» تعریف کرده است.
 */
export function EditCustomerDialog({
  customer,
  onDone,
}: {
  customer: Customer;
  onDone: () => void;
}) {
  const role = useAuthStore((s) => s.user?.role);
  /** مدیریت دسته‌ها فقط برای مدیر — همان گاردِ سمت سرور. */
  const isManager = role === "ADMIN" || role === "MANAGER";

  const [open, setOpen] = React.useState(false);
  const [showCategories, setShowCategories] = React.useState(false);
  const [firstName, setFirstName] = React.useState(customer.firstName);
  const [lastName, setLastName] = React.useState(customer.lastName ?? "");
  const [address, setAddress] = React.useState(customer.address ?? "");
  const [nationalId, setNationalId] = React.useState(customer.nationalId ?? "");
  const [categoryId, setCategoryId] = React.useState(customer.categoryId ?? "");
  const [note, setNote] = React.useState(customer.note ?? "");

  // شماره‌ی جدید — با هر بار بازشدن پاک می‌شود.
  const [newPhone, setNewPhone] = React.useState("");
  const [newPhoneLabel, setNewPhoneLabel] = React.useState<string>("موبایل");

  /** دسته‌های فعال برای dropdown. */
  const categories = useQuery({
    queryKey: ["customer-categories", "active"],
    queryFn: getActiveCustomerCategories,
    enabled: open,
  });

  // با هر بار بازشدن، از مقادیرِ فعلیِ مشتری تازه شود (اگر بین‌بار عوض شده باشد).
  React.useEffect(() => {
    if (open) {
      setFirstName(customer.firstName);
      setLastName(customer.lastName ?? "");
      setAddress(customer.address ?? "");
      setNationalId(customer.nationalId ?? "");
      setCategoryId(customer.categoryId ?? "");
      setNote(customer.note ?? "");
      setNewPhone("");
      setNewPhoneLabel("موبایل");
    }
  }, [open, customer.firstName, customer.lastName, customer.address, customer.nationalId, customer.categoryId, customer.note]);

  const save = useMutation({
    mutationFn: () =>
      updateCustomer(customer.id, {
        firstName: firstName.trim(),
        // lastName خالی یعنی «حذفِ فامیل» — رشته‌ی خالی می‌فرستیم تا سرور پاکش کند.
        lastName: lastName.trim(),
        address: address.trim(),
        // شماره ملی فقط ارقام — باقی کاراکترها حذف می‌شود تا جست‌وجو و یکتایی تمیز بماند.
        nationalId: faToEn(nationalId).replace(/\D/g, ""),
        // دسته فقط از لیستِ فعال انتخاب می‌شود — رشته‌ی خالی یعنی «بدون دسته».
        categoryId: categoryId || undefined,
        note: note.trim(),
      }),
    onSuccess: () => {
      toast.success("مشخصات مشتری ذخیره شد");
      setOpen(false);
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "ذخیره ناموفق بود"),
  });

  const addPhone = useMutation({
    mutationFn: () =>
      addCustomerPhone(customer.id, {
        // نرمال‌سازی سمت سرور انجام می‌شود؛ این‌جا فقط ارقام نگه داشته می‌شود
        // تا ورودیِ خراب از اول نرود.
        phone: faToEn(newPhone).replace(/[^\d+]/g, ""),
        label: newPhoneLabel,
        // اولین شماره‌ی مشتری، اصلی می‌شود.
        isPrimary: customer.phones.length === 0,
      }),
    onSuccess: () => {
      toast.success("شماره اضافه شد");
      setNewPhone("");
      setNewPhoneLabel("موبایل");
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "افزودن شماره ناموفق بود"),
  });

  const removePhone = useMutation({
    mutationFn: (phoneId: string) => removeCustomerPhone(customer.id, phoneId),
    onSuccess: () => {
      toast.success("شماره حذف شد");
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "حذف شماره ناموفق بود"),
  });

  const setPrimary = useMutation({
    mutationFn: (phoneId: string) => setPrimaryCustomerPhone(customer.id, phoneId),
    onSuccess: () => {
      toast.success("شماره‌ی اصلی تغییر کرد");
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "تغییر شماره‌ی اصلی ناموفق بود"),
  });

  const dirty =
    firstName.trim() !== customer.firstName ||
    lastName.trim() !== (customer.lastName ?? "") ||
    address.trim() !== (customer.address ?? "") ||
    faToEn(nationalId).replace(/\D/g, "") !== (customer.nationalId ?? "") ||
    categoryId !== (customer.categoryId ?? "") ||
    note.trim() !== (customer.note ?? "");

  const phoneInputValid = faToEn(newPhone).replace(/[^\d+]/g, "").length >= 10;
  const catList = categories.data ?? [];

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="size-4" /> ویرایش مشخصات
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">ویرایش مشخصات مشتری</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* شماره‌های تماس */}
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Phone className="size-4" /> شماره‌های تماس
              </div>

              <div className="flex flex-col gap-1.5">
                {customer.phones.length === 0 ? (
                  <p className="py-1 text-xs text-muted-foreground">
                    هنوز شماره‌ای ثبت نشده.
                  </p>
                ) : (
                  customer.phones.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium tabular-nums" dir="ltr">
                          {toFa(p.phone)}
                        </span>
                        {p.label && (
                          <span className="text-[11px] text-muted-foreground">
                            {p.label}
                          </span>
                        )}
                      </span>
                      {p.isPrimary ? (
                        <span className="flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          <Check className="size-3" /> اصلی
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-[11px]"
                          disabled={setPrimary.isPending}
                          onClick={() => setPrimary.mutate(p.id)}
                          aria-label={`اصلی کردن شماره ${p.phone}`}
                        >
                          <Star className="size-3" /> اصلی کن
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={removePhone.isPending}
                        onClick={() => removePhone.mutate(p.id)}
                        aria-label={`حذف شماره ${p.phone}`}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {/* افزودن شماره جدید */}
              <div className="mt-2 flex items-center gap-2">
                <Input
                  dir="ltr"
                  inputMode="tel"
                  className="h-9 flex-1 text-left tabular-nums"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                />
                <select
                  value={newPhoneLabel}
                  onChange={(e) => setNewPhoneLabel(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  aria-label="برچسب شماره"
                >
                  {PHONE_LABELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  className="h-9 gap-1"
                  disabled={!phoneInputValid || addPhone.isPending}
                  onClick={() => addPhone.mutate()}
                >
                  <Plus className="size-3.5" />
                  {addPhone.isPending ? "در حال افزودن…" : "افزودن"}
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                شماره‌ها نرمال ذخیره می‌شوند (۰۹۱۲...). شماره‌ی تکراری در سیستم رد می‌شود.
              </p>
            </div>

            {/* هویت */}
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
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">شماره ملی</label>
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  className="text-left tabular-nums"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder="۱۰ رقمی — اختیاری"
                  maxLength={20}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">دسته</label>
                <div className="flex items-center gap-2">
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="h-10 flex-1 rounded-md border bg-background px-2 text-sm"
                    aria-label="دسته مشتری"
                  >
                    <option value="">بدون دسته</option>
                    {catList.map((c) => (
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
                {catList.length === 0 && !categories.isLoading && (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    هنوز دسته‌ای تعریف نشده — با دکمه کناری بسازید.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">آدرس</label>
              <Textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="اختیاری"
                rows={2}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">یادداشت</label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="اختیاری"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button
              disabled={!firstName.trim() || !dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "در حال ذخیره…" : "ذخیره"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* مدیریت دسته‌ها — از همین‌جا قابل دسترسی است (فقط مدیر). */}
      <CustomerCategoriesDialog
        open={showCategories}
        onClose={() => setShowCategories(false)}
        onChanged={() => categories.refetch()}
      />
    </>
  );
}
