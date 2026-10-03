"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Plus, Search, UserRound } from "lucide-react";
import { toast } from "sonner";

import { createSupplier } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import type { Supplier } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SupplierPickerDialog({ open, onOpenChange, suppliers, selectedId, onSelect }: {
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
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setCreating(false);
      setName("");
      setPhone("");
      setAddress("");
    }
  }, [open]);

  const filtered = suppliers.filter((s) => `${s.name} ${s.phone ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const createM = useMutation({
    mutationFn: () => createSupplier({ name: name.trim(), phone: phone.trim() || undefined, address: address.trim() || undefined }),
    onSuccess: (supplier) => {
      qc.setQueryData<Supplier[]>(["suppliers"], (old) => [...(old ?? []), supplier].sort((a, b) => a.name.localeCompare(b.name)));
      onSelect(supplier);
      toast.success(`تأمین‌کننده «${supplier.name}» اضافه شد`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof ApiException ? e.message : "افزودن تأمین‌کننده ناموفق بود"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-md border-primary/25 bg-background p-0 sm:max-w-xl">
        <DialogHeader className="border-b bg-primary px-5 py-3 text-start text-primary-foreground">
          <DialogTitle className="text-base">{creating ? "تأمین‌کننده جدید" : "انتخاب تأمین‌کننده"}</DialogTitle>
          <DialogDescription>{creating ? "طرف حساب را یک‌بار ثبت کنید تا در خریدهای بعدی هم در دسترس باشد." : "نام یا شماره تماس را جست‌وجو کنید؛ با Enter روی گزینه‌ی انتخاب‌شده تأیید کنید."}</DialogDescription>
        </DialogHeader>
        {creating ? (
          <div className="grid gap-4 overflow-y-auto p-5">
            <div className="grid gap-1.5"><Label htmlFor="supplier-name">نام شرکت / تأمین‌کننده *</Label><Input id="supplier-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: شرکت پخش البرز" /></div>
            <div className="grid gap-1.5"><Label htmlFor="supplier-phone">تلفن</Label><Input id="supplier-phone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="اختیاری" /></div>
            <div className="grid gap-1.5"><Label htmlFor="supplier-address">آدرس</Label><Textarea id="supplier-address" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="اختیاری" /></div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="relative"><Search className="absolute start-3 top-2.5 size-4 text-muted-foreground" /><Input className="ps-9" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جست‌وجوی نام یا تلفن…" /></div>
            <div className="mt-3 min-h-0 overflow-y-auto rounded-md border" role="listbox" aria-label="فهرست تأمین‌کننده‌ها">
              {filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">تأمین‌کننده‌ای پیدا نشد.</div> : filtered.map((supplier) => <button type="button" role="option" aria-selected={supplier.id === selectedId} key={supplier.id} className="flex w-full items-center gap-3 border-b p-3 text-start last:border-b-0 hover:bg-accent aria-selected:bg-accent" onClick={() => { onSelect(supplier); onOpenChange(false); }}><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted"><Building2 className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{supplier.name}</span><span className="block text-xs text-muted-foreground">{supplier.phone || "بدون شماره تماس"}</span></span>{supplier.id === selectedId ? <Check className="size-4 text-primary" /> : null}</button>)}
            </div>
          </div>
        )}
        <DialogFooter className="border-t bg-muted/30 p-3">
          {creating ? <><Button type="button" variant="outline" onClick={() => setCreating(false)} disabled={createM.isPending}>بازگشت</Button><Button type="button" onClick={() => createM.mutate()} disabled={name.trim().length < 2 || createM.isPending}>{createM.isPending ? "در حال ثبت…" : "ثبت و انتخاب"}</Button></> : <><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button><Button type="button" variant="outline" onClick={() => setCreating(true)}><Plus className="me-1 size-4" />تأمین‌کننده جدید</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
