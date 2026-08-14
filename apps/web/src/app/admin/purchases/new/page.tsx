"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import { toast } from "sonner";

import { createPurchase, getSuppliers, getWarehouses } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { money } from "@/lib/format";
import { uuid } from "@/lib/uuid";
import { useAuthStore } from "@/lib/auth-store";
import { PageHeader } from "@/components/page-header";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  PurchaseLines,
  emptyRow,
  rowNet,
  type PurchaseRow,
} from "../_components/purchase-lines";

const ALLOWED = ["ADMIN", "MANAGER"] as const;

export default function NewPurchasePage() {
  const router = useRouter();
  const canUse = useAuthStore((s) => s.hasRole)(...ALLOWED);

  const [rows, setRows] = React.useState<PurchaseRow[]>([emptyRow()]);
  const [warehouseId, setWarehouseId] = React.useState<string>("");
  const [supplierId, setSupplierId] = React.useState<string>("NONE");
  const [supplierRef, setSupplierRef] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState("");
  const [discount, setDiscount] = React.useState(0);
  const [note, setNote] = React.useState("");

  /*
   * کلید یکتا در ref می‌ماند نه state: باید همان لحظه‌ی داخلِ mutationFn خوانده
   * شود. اگر state بود، تلاش دوباره پس از قطعی شبکه یک سندِ تکراری می‌ساخت —
   * یعنی موجودی دو بار وارد می‌شد. همان الگوی صندوق فروش.
   */
  const idem = React.useRef<string | null>(null);

  const warehousesQ = useQuery({ queryKey: ["warehouses"], queryFn: getWarehouses });
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: getSuppliers });

  // اولین انبار به‌صورت پیش‌فرض انتخاب می‌شود تا یک کلیک کمتر شود.
  React.useEffect(() => {
    const first = warehousesQ.data?.[0]?.id;
    if (first && !warehouseId) setWarehouseId(first);
  }, [warehousesQ.data, warehouseId]);

  const filled = rows.filter((r) => r.productId && r.quantity > 0);
  const subtotal = filled.reduce((s, r) => s + rowNet(r), 0);
  const total = Math.max(0, subtotal - discount);

  const save = useMutation({
    mutationFn: () => {
      if (!idem.current) idem.current = uuid();
      return createPurchase({
        idempotencyKey: idem.current,
        warehouseId,
        supplierId: supplierId === "NONE" ? null : supplierId,
        supplierRef: supplierRef.trim() || undefined,
        invoiceDate: invoiceDate || undefined,
        discount: discount || undefined,
        note: note.trim() || undefined,
        lines: filled.map((r) => ({
          productId: r.productId!,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          discount: r.discount || undefined,
        })),
      });
    },
    onSuccess: (p) => {
      toast.success(`فاکتور خرید ${p.number} ثبت شد`, {
        description: "کالاها روی «انبار موقت» نشستند — با انتقال سر جایشان ببرید.",
      });
      router.push("/admin/purchases");
    },
    onError: (e) => {
      // سند ثبت نشد ⇒ کلید باید تازه شود، وگرنه تلاش بعدی همان خطا را می‌گیرد.
      idem.current = null;
      toast.error(e instanceof ApiException ? e.message : "ثبت فاکتور ناموفق بود");
    },
  });

  if (!canUse) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        ثبت فاکتور خرید فقط برای مدیر است.
      </Card>
    );
  }

  const blocked = !warehouseId || filled.length === 0 || discount > subtotal;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="ثبت فاکتور خرید"
        description="کالاها را از روی برگه‌ی فروشنده وارد کنید — قیمت خرید همین‌جا ثبت می‌شود و گزارش سود از آن می‌خواند."
        icon={PackagePlus}
      />

      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wh">انبار</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger id="wh"><SelectValue placeholder="انتخاب انبار" /></SelectTrigger>
            <SelectContent>
              {(warehousesQ.data ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sup">تأمین‌کننده</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger id="sup"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">— مشخص نشده —</SelectItem>
              {(suppliersQ.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ref">شماره فاکتور فروشنده</Label>
          <Input
            id="ref"
            value={supplierRef}
            onChange={(e) => setSupplierRef(e.target.value)}
            placeholder="روی برگه نوشته شده"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">تاریخ فاکتور</Label>
          <JalaliDateInput id="date" value={invoiceDate} onChange={setInvoiceDate} />
        </div>
      </Card>

      <Card className="p-4">
        <PurchaseLines rows={rows} onChange={setRows} />
      </Card>

      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="disc">تخفیف کل فاکتور (ریال)</Label>
            <MoneyInput id="disc" value={discount} onChange={setDiscount} placeholder="۰" />
            {discount > subtotal ? (
              <span className="text-xs text-destructive">
                تخفیف از جمع اقلام بیشتر است
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">یادداشت</Label>
            <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">جمع اقلام</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">تخفیف</span>
              <span>{money(discount)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 text-base font-semibold">
              <span>مبلغ نهایی</span>
              <span>{money(total)}</span>
            </div>
          </div>

          <Button
            size="lg"
            disabled={blocked || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "در حال ثبت…" : "ثبت فاکتور خرید"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
