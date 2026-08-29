"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, FilePlus2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createPurchase, getSuppliers, getWarehouses } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { money, toFa } from "@/lib/format";
import { uuid } from "@/lib/uuid";
import { useAuthStore } from "@/lib/auth-store";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PurchaseLines, emptyRow, rowNet, type PurchaseRow } from "../_components/purchase-lines";
import { PriceWarningDialog } from "../_components/price-warning-dialog";
import type { PurchasePriceWarning, Supplier } from "@/lib/types";
import { SupplierPickerDialog } from "../_components/supplier-picker-dialog";
import { unitLabel } from "@/lib/currency";

const ALLOWED = ["ADMIN", "MANAGER"] as const;

export default function NewPurchasePage() {
  const router = useRouter();
  const canUse = useAuthStore((s) => s.hasRole)(...ALLOWED);
  const [rows, setRows] = React.useState<PurchaseRow[]>([emptyRow()]);
  const [warehouseId, setWarehouseId] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("NONE");
  const [supplierDialogOpen, setSupplierDialogOpen] = React.useState(false);
  const [supplierRef, setSupplierRef] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState("");
  const [discount, setDiscount] = React.useState(0);
  const [note, setNote] = React.useState("");
  const [priceWarnings, setPriceWarnings] = React.useState<PurchasePriceWarning[] | null>(null);
  const idem = React.useRef<string | null>(null);
  const warehousesQ = useQuery({ queryKey: ["warehouses"], queryFn: getWarehouses, enabled: canUse });
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: getSuppliers, enabled: canUse });

  React.useEffect(() => {
    const first = warehousesQ.data?.[0]?.id;
    if (first && !warehouseId) setWarehouseId(first);
  }, [warehousesQ.data, warehouseId]);

  const filled = rows.filter((r) => r.productId && r.quantity > 0);
  const subtotal = filled.reduce((s, r) => s + rowNet(r), 0);
  const total = Math.max(0, subtotal - discount);
  const blocked = !warehouseId || filled.length === 0 || discount > subtotal;
  const supplierName = suppliersQ.data?.find((s) => s.id === supplierId)?.name;

  const save = useMutation({
    mutationFn: (confirmPriceWarnings?: boolean) => {
      if (!idem.current) idem.current = uuid();
      return createPurchase({
        idempotencyKey: idem.current,
        confirmPriceWarnings,
        warehouseId,
        supplierId: supplierId === "NONE" ? null : supplierId,
        supplierRef: supplierRef.trim() || undefined,
        invoiceDate: invoiceDate || undefined,
        discount: discount || undefined,
        note: note.trim() || undefined,
        lines: filled.map((r) => ({ productId: r.productId!, quantity: r.quantity, unitPrice: r.unitPrice, discount: r.discount || undefined })),
      });
    },
    onSuccess: (p) => { setPriceWarnings(null); toast.success(`فاکتور خرید ${toFa(p.number)} ثبت شد`); router.push("/admin/purchases"); },
    onError: (e) => {
      idem.current = null;
      if (e instanceof ApiException && e.code === "PRICE_WARNINGS") {
        const list = (e.raw as { warnings?: PurchasePriceWarning[] }).warnings;
        if (list?.length) { setPriceWarnings(list); return; }
      }
      toast.error(e instanceof ApiException ? e.message : "ثبت فاکتور ناموفق بود");
    },
  });

  if (!canUse) return <Card className="p-6 text-center text-muted-foreground">ثبت فاکتور خرید فقط برای مدیر است.</Card>;

  return (
    <div className="flex min-h-full flex-col gap-3 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/purchases")} aria-label="بازگشت"><ArrowRight className="size-5" /></Button>
          <div><h1 className="text-xl font-bold">فاکتور خرید جدید</h1><p className="text-xs text-muted-foreground">ثبت ورود کالا از تأمین‌کننده</p></div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="rounded border bg-muted px-2 py-1">سند جدید</span><span>Ctrl+S ثبت</span><span>Esc انصراف</span></div>
      </header>

      <div className="flex flex-wrap items-center gap-1 border-y bg-muted/30 p-1">
        <Button size="sm" variant="ghost" onClick={() => setRows([emptyRow()])}><FilePlus2 className="me-1 size-4" />فاکتور جدید</Button>
        <Button size="sm" variant="ghost" onClick={() => setRows((current) => current.length > 1 ? current.slice(0, -1) : current)}><Trash2 className="me-1 size-4" />حذف ردیف</Button>
        <span className="ms-auto px-2 text-xs text-muted-foreground">واحد: {unitLabel()}</span>
      </div>

      <Card className="rounded-md border p-3 shadow-none">
        <div className="mb-3 grid gap-3 border-b pb-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="شماره سند" value="پس از ثبت" />
          <Field label="تاریخ" htmlFor="date"><JalaliDateInput id="date" value={invoiceDate} onChange={setInvoiceDate} /></Field>
          <Field label="انبار مقصد" htmlFor="warehouse"><Select value={warehouseId} onValueChange={setWarehouseId}><SelectTrigger id="warehouse"><SelectValue placeholder="انتخاب انبار" /></SelectTrigger><SelectContent>{(warehousesQ.data ?? []).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="تأمین‌کننده" htmlFor="supplier"><div className="flex gap-1.5"><Button type="button" variant="outline" className="h-10 min-w-0 flex-1 justify-between font-normal" onClick={() => setSupplierDialogOpen(true)}><span className={supplierName ? "truncate" : "truncate text-muted-foreground"}>{supplierName ?? "انتخاب تأمین‌کننده"}</span><span className="text-xs text-muted-foreground">جست‌وجو</span></Button><Button type="button" variant="outline" className="h-10 shrink-0 px-3" onClick={() => setSupplierDialogOpen(true)} aria-label="افزودن تأمین‌کننده جدید"><Plus className="size-4" /></Button></div>{supplierName ? <span className="text-xs text-muted-foreground">طرف حساب: {supplierName}</span> : <span className="text-xs text-warning">برای ثبت سابقه خرید، تأمین‌کننده را انتخاب کنید.</span>}</Field>
          <Field label="شماره فاکتور فروشنده" htmlFor="supplier-ref"><Input id="supplier-ref" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} placeholder="اختیاری" /></Field>
        </div>
        {!supplierName ? <div className="mb-3 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning-foreground">تأمین‌کننده انتخاب نشده؛ برای ثبت دقیق سابقه خرید، طرف حساب را انتخاب کنید.</div> : null}
        <PurchaseLines rows={rows} onChange={setRows} />
      </Card>

      <div className="grid gap-3 lg:grid-cols-[1fr_310px]">
        <Card className="rounded-md border p-3 shadow-none"><Label htmlFor="note">شرح / توضیحات</Label><Textarea id="note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="توضیح درباره بار، شرایط خرید یا شماره پیگیری…" /></Card>
        <Card className="rounded-md border p-3 shadow-none"><div className="space-y-2 text-sm"><Summary label="جمع ناخالص" value={money(subtotal + discount)} /><Summary label="تخفیف کل" value={money(discount)} /><Summary label="مبلغ قابل پرداخت" value={money(total)} strong /></div></Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur sm:inset-x-auto sm:bottom-5 sm:end-5 sm:w-96 sm:rounded-lg sm:border sm:shadow-lg"><div className="flex items-center justify-between gap-3"><div><div className="text-xs text-muted-foreground">قابل پرداخت</div><div className="text-xl font-bold">{money(total)}</div></div><Button size="lg" disabled={blocked || save.isPending} onClick={() => save.mutate(undefined)}><Save className="me-2 size-4" />{save.isPending ? "در حال ثبت…" : "ثبت نهایی"}</Button></div>{blocked ? <p className="mt-2 text-center text-xs text-muted-foreground">انبار و حداقل یک قلم معتبر لازم است.</p> : null}</div>
      <PriceWarningDialog warnings={priceWarnings} pending={save.isPending} onCancel={() => setPriceWarnings(null)} onConfirm={() => save.mutate(true)} />
      <SupplierPickerDialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen} suppliers={suppliersQ.data ?? []} selectedId={supplierId} onSelect={(supplier: Supplier) => setSupplierId(supplier.id)} />
    </div>
  );
}

function Field({ label, htmlFor, value, children }: { label: string; htmlFor?: string; value?: string; children?: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor={htmlFor}>{label}</Label>{children ?? <div className="flex h-10 items-center rounded-md border bg-muted/20 px-3 text-sm text-muted-foreground">{value}</div>}</div>;
}
function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "border-t pt-2 text-base font-semibold" : ""}`}><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}
