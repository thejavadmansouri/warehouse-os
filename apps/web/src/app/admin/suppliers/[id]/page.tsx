"use client";

/**
 * پروندهٔ یک تأمین‌کننده — مشخصات تسویه + فاکتورهای خرید.
 */

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { getPurchases, getSupplier, updateSupplier } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { PURCHASE_STATUS_LABELS, SUPPLIER_PAY_METHOD_LABELS } from "@/lib/types";
import type { SupplierPayMethod } from "@/lib/types";
import { money, qty as faQty, toFa } from "@/lib/format";
import { formatJalali } from "@/lib/jalali";
import { useAuthStore } from "@/lib/auth-store";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ALLOWED = ["ADMIN", "MANAGER"] as const;

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const canUse = useAuthStore((s) => s.hasRole)(...ALLOWED);
  const qc = useQueryClient();
  const supplierId = params.id;

  const supplierQ = useQuery({
    queryKey: ["supplier", supplierId],
    queryFn: () => getSupplier(supplierId),
    enabled: canUse && !!supplierId,
  });

  const purchasesQ = useQuery({
    queryKey: ["purchases", "by-supplier", supplierId],
    queryFn: () => getPurchases({ supplierId, limit: 100, page: 1 }),
    enabled: canUse && !!supplierId,
  });

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
    const s = supplierQ.data;
    if (!s) return;
    setName(s.name);
    setContactName(s.contactName ?? "");
    setPhone(s.phone ?? "");
    setAddress(s.address ?? "");
    setNote(s.note ?? "");
    setCreditDays(String(s.creditDays ?? 0));
    setPreferredPayMethod(s.preferredPayMethod ?? "");
    setBankName(s.bankName ?? "");
    setBankAccount(s.bankAccount ?? "");
    setIban(s.iban ?? "");
  }, [supplierQ.data]);

  const saveM = useMutation({
    mutationFn: () =>
      updateSupplier(supplierId, {
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
      toast.success("مشخصات تأمین‌کننده ذخیره شد");
      qc.setQueryData(["supplier", supplierId], s);
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiException ? e.message : "ذخیره ناموفق بود"),
  });

  if (!canUse) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        این بخش فقط برای مدیر است.
      </Card>
    );
  }

  if (supplierQ.isLoading) return <LoadingState />;
  if (supplierQ.isError || !supplierQ.data) {
    return (
      <EmptyState
        title="تأمین‌کننده پیدا نشد"
        description="شاید حذف شده یا شناسه اشتباه است."
      />
    );
  }

  const rows = purchasesQ.data?.data ?? [];
  const confirmed = rows.filter((p) => p.status !== "CANCELLED");
  const sumTotal = confirmed.reduce((s, p) => s + (p.total ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={supplierQ.data.name}
        description="مشخصات شرکت، نحوهٔ تسویه، و فاکتورهای خرید"
        icon={Building2}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/admin/suppliers">
                <ArrowRight className="me-2 size-4" />
                همه تأمین‌کننده‌ها
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/purchases/new">
                <Plus className="me-2 size-4" />
                فاکتور خرید جدید
              </Link>
            </Button>
          </div>
        }
      />

      <Card className="grid gap-3 p-4 sm:grid-cols-3">
        <Stat label="تعداد فاکتور" value={toFa(confirmed.length)} />
        <Stat label="جمع خرید" value={money(sumTotal)} />
        <Stat
          label="تسویه پیش‌فرض"
          value={
            [
              preferredPayMethod
                ? SUPPLIER_PAY_METHOD_LABELS[preferredPayMethod]
                : null,
              Number(creditDays) > 0 ? `${toFa(Number(creditDays))} روز` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"
          }
        />
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">مشخصات و تسویه</h2>
          <Button
            size="sm"
            disabled={name.trim().length < 2 || saveM.isPending}
            onClick={() => saveM.mutate()}
          >
            <Save className="me-1.5 size-3.5" />
            {saveM.isPending ? "…" : "ذخیره"}
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نام شرکت *">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="نام رابط">
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </Field>
          <Field label="تلفن">
            <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="مهلت پرداخت (روز)">
            <Input
              dir="ltr"
              inputMode="numeric"
              value={creditDays}
              onChange={(e) => setCreditDays(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="نحوه تسویه پیش‌فرض">
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={preferredPayMethod}
              onChange={(e) =>
                setPreferredPayMethod((e.target.value || "") as SupplierPayMethod | "")
              }
            >
              <option value="">انتخاب…</option>
              {(Object.keys(SUPPLIER_PAY_METHOD_LABELS) as SupplierPayMethod[]).map((m) => (
                <option key={m} value={m}>
                  {SUPPLIER_PAY_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="بانک">
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </Field>
          <Field label="شماره حساب">
            <Input
              dir="ltr"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
            />
          </Field>
          <Field label="شبا">
            <Input dir="ltr" value={iban} onChange={(e) => setIban(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="آدرس شرکت">
              <Textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="یادداشت">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {purchasesQ.isLoading ? (
          <LoadingState />
        ) : purchasesQ.isError ? (
          <ErrorState onRetry={() => purchasesQ.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="هنوز فاکتوری از این تأمین‌کننده نیست"
            description="اولین ورود کالا را با فاکتور خرید جدید ثبت کنید."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>شماره</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>سررسید</TableHead>
                  <TableHead>تسویه</TableHead>
                  <TableHead>اقلام</TableHead>
                  <TableHead>مبلغ</TableHead>
                  <TableHead>وضعیت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        className="text-primary underline-offset-4 hover:underline"
                        href={`/admin/purchases/${p.id}`}
                      >
                        {toFa(p.number)}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatJalali(new Date(p.invoiceDate ?? p.createdAt))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.dueDate ? formatJalali(new Date(p.dueDate)) : "—"}
                    </TableCell>
                    <TableCell>
                      {p.payMethod ? SUPPLIER_PAY_METHOD_LABELS[p.payMethod] : "—"}
                    </TableCell>
                    <TableCell>{faQty(p._count?.lines ?? 0)}</TableCell>
                    <TableCell className="whitespace-nowrap">{money(p.total)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={p.status === "CANCELLED" ? "destructive" : "secondary"}
                      >
                        {PURCHASE_STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
