"use client";

/**
 * تأمین‌کنندگان — طرف‌حساب‌های خرید با مشخصات تسویه.
 */

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { createSupplier, getPurchases, getSuppliers } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { money, toFa } from "@/lib/format";
import { useAuthStore } from "@/lib/auth-store";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { ActiveFilters, ListToolbar } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Supplier, SupplierPayMethod } from "@/lib/types";
import { SUPPLIER_PAY_METHOD_LABELS } from "@/lib/types";

const ALLOWED = ["ADMIN", "MANAGER"] as const;

export default function SuppliersPage() {
  const canUse = useAuthStore((s) => s.hasRole)(...ALLOWED);
  const qc = useQueryClient();
  const [term, setTerm] = React.useState("");
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

  const suppliersQ = useQuery({
    queryKey: ["suppliers"],
    queryFn: getSuppliers,
    enabled: canUse,
  });

  const purchasesQ = useQuery({
    queryKey: ["purchases", "supplier-summary"],
    queryFn: () => getPurchases({ limit: 200, page: 1 }),
    enabled: canUse,
  });

  const resetForm = () => {
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
  };

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
    onSuccess: (s) => {
      toast.success(`تأمین‌کننده «${s.name}» اضافه شد`);
      qc.setQueryData<Supplier[]>(["suppliers"], (old) =>
        [...(old ?? []), s].sort((a, b) => a.name.localeCompare(b.name, "fa")),
      );
      setCreating(false);
      resetForm();
    },
    onError: (e) =>
      toast.error(e instanceof ApiException ? e.message : "افزودن تأمین‌کننده ناموفق بود"),
  });

  /*
   * آمار خرید هر تأمین‌کننده — باید پیش از هر returnِ شرطی محاسبه شود؛ هوک
   * نمی‌تواند بعد از `if (!canUse) return` بیاید (ترتیب هوک‌ها ثابت است).
   */
  const stats = React.useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const p of purchasesQ.data?.data ?? []) {
      if (!p.supplier?.id || p.status === "CANCELLED") continue;
      const cur = map.get(p.supplier.id) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += p.total ?? 0;
      map.set(p.supplier.id, cur);
    }
    return map;
  }, [purchasesQ.data]);

  if (!canUse) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        این بخش فقط برای مدیر است.
      </Card>
    );
  }

  const q = term.trim().toLocaleLowerCase();
  const rows = (suppliersQ.data ?? []).filter((s) => {
    if (!q) return true;
    return `${s.name} ${s.phone ?? ""} ${s.address ?? ""} ${s.contactName ?? ""}`
      .toLocaleLowerCase()
      .includes(q);
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="تأمین‌کنندگان"
        description="شرکت‌هایی که از آن‌ها خرید می‌کنید — آدرس، مهلت و نحوهٔ تسویه"
        icon={Building2}
      />

      <div className="flex flex-col gap-2">
        <ListToolbar
          actions={
            <>
              {suppliersQ.data ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {toFa(rows.length)} تأمین‌کننده
                </span>
              ) : null}
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                تأمین‌کننده جدید
              </Button>
            </>
          }
        >
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-9"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="جست‌وجوی نام، تلفن یا آدرس…"
              aria-label="جست‌وجوی تأمین‌کننده"
            />
          </div>
        </ListToolbar>
        <ActiveFilters
          filters={
            term.trim()
              ? [{ key: "q", label: `جست‌وجو: ${term.trim()}`, onRemove: () => setTerm("") }]
              : []
          }
        />
      </div>

      <Card className="overflow-hidden p-0">
        {suppliersQ.isLoading ? (
          <LoadingState />
        ) : suppliersQ.isError ? (
          <ErrorState onRetry={() => suppliersQ.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={q ? "تأمین‌کننده‌ای با این جست‌وجو نیست" : "هنوز تأمین‌کننده‌ای ثبت نشده"}
            description={
              q
                ? "عبارت را عوض کنید یا تأمین‌کنندهٔ جدید بسازید."
                : "اولین طرف‌حساب خرید را اضافه کنید."
            }
            icon={q ? Search : Building2}
            action={
              q ? (
                <Button variant="outline" size="sm" onClick={() => setTerm("")}>
                  پاک کردن جست‌وجو
                </Button>
              ) : (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  تأمین‌کننده جدید
                </Button>
              )
            }
          />
        ) : (
            <Table containerClassName="max-h-[calc(100vh-16rem)] overflow-y-auto">
              <TableHeader sticky>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead className="text-end tabular-nums">تلفن</TableHead>
                  <TableHead>تسویه</TableHead>
                  <TableHead className="text-end tabular-nums">فاکتورها</TableHead>
                  <TableHead className="text-end tabular-nums">جمع خرید</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const st = stats.get(s.id);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="min-w-[180px] whitespace-normal font-medium">
                        <Link
                          className="text-primary underline-offset-4 hover:underline"
                          href={`/admin/suppliers/${s.id}`}
                        >
                          {s.name}
                        </Link>
                        {s.address ? (
                          <div className="mt-0.5 text-xs text-muted-foreground truncate max-w-[240px]">
                            {s.address}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell
                        dir="ltr"
                        className="text-end tabular-nums text-muted-foreground"
                      >
                        {s.phone ? toFa(s.phone) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[
                          s.preferredPayMethod
                            ? SUPPLIER_PAY_METHOD_LABELS[s.preferredPayMethod]
                            : null,
                          typeof s.creditDays === "number" && s.creditDays > 0
                            ? `${toFa(s.creditDays)} روز`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {toFa(st?.count ?? 0)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {st ? money(st.total) : money(0)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        )}
      </Card>

      <Dialog
        open={creating}
        onOpenChange={(v) => {
          if (!createM.isPending) {
            setCreating(v);
            if (!v) resetForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تأمین‌کننده جدید</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="sup-name">نام شرکت *</Label>
              <Input
                id="sup-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً: ایران‌خودرو"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sup-contact">نام رابط</Label>
                <Input
                  id="sup-contact"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sup-phone">تلفن</Label>
                <Input
                  id="sup-phone"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sup-address">آدرس شرکت</Label>
              <Textarea
                id="sup-address"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sup-pay">نحوه تسویه پیش‌فرض</Label>
                <select
                  id="sup-pay"
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
                <Label htmlFor="sup-days">مهلت پرداخت (روز)</Label>
                <Input
                  id="sup-days"
                  dir="ltr"
                  inputMode="numeric"
                  value={creditDays}
                  onChange={(e) => setCreditDays(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sup-bank">بانک</Label>
                <Input id="sup-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sup-acc">شماره حساب</Label>
                <Input
                  id="sup-acc"
                  dir="ltr"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sup-iban">شبا</Label>
                <Input
                  id="sup-iban"
                  dir="ltr"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sup-note">یادداشت</Label>
              <Textarea
                id="sup-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreating(false)}
              disabled={createM.isPending}
            >
              انصراف
            </Button>
            <Button
              type="button"
              disabled={name.trim().length < 2 || createM.isPending}
              onClick={() => createM.mutate()}
            >
              {createM.isPending ? "در حال ثبت…" : "ثبت"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
