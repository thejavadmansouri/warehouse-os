"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { createSupplier } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import type { Supplier, SupplierPayMethod } from "@/lib/types";
import { SUPPLIER_PAY_METHOD_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SupplierPickerDialog({
  open,
  onOpenChange,
  suppliers,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: Supplier[];
  selectedId: string;
  onSelect: (supplier: Supplier) => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [note, setNote] = React.useState("");
  const [creditDays, setCreditDays] = React.useState("0");
  const [preferredPayMethod, setPreferredPayMethod] = React.useState<
    SupplierPayMethod | ""
  >("");
  const [bankName, setBankName] = React.useState("");
  const [bankAccount, setBankAccount] = React.useState("");
  const [iban, setIban] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setCreating(false);
      setName("");
      setContactName("");
      setPhone("");
      setAddress("");
      setNote("");
      setCreditDays("0");
      setPreferredPayMethod("");
      setBankName("");
      setBankAccount("");
      setIban("");
    }
  }, [open]);

  const filtered = suppliers.filter((s) =>
    `${s.name} ${s.phone ?? ""} ${s.contactName ?? ""} ${s.address ?? ""}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  const createM = useMutation({
    mutationFn: () =>
      createSupplier({
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        note: note.trim() || undefined,
        creditDays: Number(creditDays) || 0,
        preferredPayMethod: preferredPayMethod || null,
        bankName: bankName.trim() || undefined,
        bankAccount: bankAccount.trim() || undefined,
        iban: iban.trim() || undefined,
      }),
    onSuccess: (supplier) => {
      qc.setQueryData<Supplier[]>(["suppliers"], (old) =>
        [...(old ?? []), supplier].sort((a, b) => a.name.localeCompare(b.name, "fa")),
      );
      onSelect(supplier);
      toast.success(`تأمین‌کننده «${supplier.name}» اضافه شد`);
      onOpenChange(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiException ? e.message : "افزودن تأمین‌کننده ناموفق بود"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-md border-primary/25 bg-background p-0 sm:max-w-xl">
        <DialogHeader className="border-b bg-primary px-5 py-3 text-start text-primary-foreground">
          <DialogTitle className="text-base">
            {creating ? "تأمین‌کننده جدید" : "انتخاب تأمین‌کننده"}
          </DialogTitle>
          <DialogDescription>
            {creating
              ? "آدرس، مهلت پرداخت و نحوهٔ تسویه را هم پر کن — قرینهٔ پروندهٔ مشتری."
              : "نام یا تلفن را جست‌وجو کن؛ تأمین‌کننده برای فاکتور خرید الزامی است."}
          </DialogDescription>
        </DialogHeader>

        {creating ? (
          <div className="grid gap-3 overflow-y-auto p-5">
            <div className="grid gap-1.5">
              <Label htmlFor="supplier-name">نام شرکت *</Label>
              <Input
                id="supplier-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً: ایران‌خودرو"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="supplier-contact">نام رابط</Label>
                <Input
                  id="supplier-contact"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="مسئول فروش آن‌ها"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="supplier-phone">تلفن</Label>
                <Input
                  id="supplier-phone"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="supplier-address">آدرس شرکت</Label>
              <Textarea
                id="supplier-address"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="supplier-pay">نحوه تسویه پیش‌فرض</Label>
                <select
                  id="supplier-pay"
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={preferredPayMethod}
                  onChange={(e) =>
                    setPreferredPayMethod((e.target.value || "") as SupplierPayMethod | "")
                  }
                >
                  <option value="">انتخاب…</option>
                  {(Object.keys(SUPPLIER_PAY_METHOD_LABELS) as SupplierPayMethod[]).map(
                    (m) => (
                      <option key={m} value={m}>
                        {SUPPLIER_PAY_METHOD_LABELS[m]}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="supplier-days">مهلت پرداخت (روز)</Label>
                <Input
                  id="supplier-days"
                  dir="ltr"
                  inputMode="numeric"
                  value={creditDays}
                  onChange={(e) => setCreditDays(e.target.value.replace(/\D/g, ""))}
                  placeholder="۰ = همان روز"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="supplier-bank">بانک</Label>
                <Input
                  id="supplier-bank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="supplier-account">شماره حساب</Label>
                <Input
                  id="supplier-account"
                  dir="ltr"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="supplier-iban">شبا</Label>
                <Input
                  id="supplier-iban"
                  dir="ltr"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="بدون IR"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="supplier-note">یادداشت</Label>
              <Textarea
                id="supplier-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="شرایط خاص، روزهای مراجعه، …"
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="relative">
              <Search className="absolute start-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="ps-9"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جست‌وجوی نام یا تلفن…"
              />
            </div>
            <div
              className="mt-3 min-h-0 overflow-y-auto rounded-md border"
              role="listbox"
              aria-label="فهرست تأمین‌کننده‌ها"
            >
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  تأمین‌کننده‌ای پیدا نشد.
                </div>
              ) : (
                filtered.map((s) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={s.id === selectedId}
                    key={s.id}
                    className="flex w-full items-center gap-3 border-b p-3 text-start last:border-b-0 hover:bg-accent aria-selected:bg-accent"
                    onClick={() => {
                      onSelect(s);
                      onOpenChange(false);
                    }}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Building2 className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[
                          s.phone,
                          s.preferredPayMethod
                            ? SUPPLIER_PAY_METHOD_LABELS[s.preferredPayMethod]
                            : null,
                          typeof s.creditDays === "number" && s.creditDays > 0
                            ? `${s.creditDays} روزه`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "بدون مشخصات تسویه"}
                      </span>
                    </span>
                    {s.id === selectedId ? <Check className="size-4 text-primary" /> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <DialogFooter className="border-t bg-muted/30 p-3">
          {creating ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreating(false)}
                disabled={createM.isPending}
              >
                بازگشت
              </Button>
              <Button
                type="button"
                onClick={() => createM.mutate()}
                disabled={name.trim().length < 2 || createM.isPending}
              >
                {createM.isPending ? "در حال ثبت…" : "ثبت و انتخاب"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                انصراف
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreating(true)}>
                <Plus className="me-1 size-4" />
                تأمین‌کننده جدید
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
