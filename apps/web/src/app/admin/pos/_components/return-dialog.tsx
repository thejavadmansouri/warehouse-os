"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Undo2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createReturn, getReturnableLines } from "@/lib/api";
import { money, rial, toFa, faToEn } from "@/lib/format";
import { ApiException } from "@/lib/api-error-messages";
import type { PaymentMethod } from "@/lib/types";

/**
 * ثبت مرجوعی برای یک فاکتور.
 *
 * قفل به فاکتور: کالا و قیمت از خودِ فاکتور می‌آیند؛ فروشنده فقط تعداد و
 * سالم/معیوب و روش برگشتِ وجه را تعیین می‌کند. سقفِ هر ردیف «قابل‌برگشت» است
 * (= فروخته − مرجوعیِ قبلی)، پس دو بار برگرداندنِ یک قلم ممکن نیست.
 */
export function ReturnDialog({
  invoiceId,
  onClose,
  onDone,
}: {
  invoiceId: string | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();

  // تعدادِ در حال برگشت و «سالم؟» برای هر ردیف، به‌کلید saleLogId.
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [restockById, setRestockById] = useState<Record<string, boolean>>({});
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const data = useQuery({
    queryKey: ["returnable", invoiceId],
    queryFn: () => getReturnableLines(invoiceId!),
    enabled: !!invoiceId,
    staleTime: 0,
  });

  const invoice = data.data?.invoice;
  const hasCustomer = !!invoice?.customer;
  const owesMoney = (invoice?.dueAmount ?? 0) > 0;

  // پیش‌فرضِ روشِ برگشت: اگر مشتری بدهکار است → کسر از حساب؛ وگرنه نقد. بدون
  // مشتری اصلاً «کسر از حساب» معنا ندارد.
  const defaultMethod: PaymentMethod =
    hasCustomer && owesMoney ? "CREDIT" : "CASH";
  const effectiveMethod: PaymentMethod = (method || defaultMethod) as PaymentMethod;

  const lines = data.data?.lines ?? [];

  const refundPreview = useMemo(() => {
    return lines.reduce((sum, l) => {
      const q = qtyById[l.saleLogId] ?? 0;
      return sum + q * l.effectiveUnitPrice;
    }, 0);
  }, [lines, qtyById]);

  const selectedCount = useMemo(
    () => lines.reduce((n, l) => n + (qtyById[l.saleLogId] ? 1 : 0), 0),
    [lines, qtyById],
  );

  const submit = useMutation({
    mutationFn: () => {
      const payload = lines
        .map((l) => ({
          saleLogId: l.saleLogId,
          quantity: qtyById[l.saleLogId] ?? 0,
          restock: restockById[l.saleLogId] ?? true,
        }))
        .filter((l) => l.quantity > 0);

      return createReturn({
        idempotencyKey: crypto.randomUUID(),
        invoiceId: invoiceId!,
        refundMethod: effectiveMethod,
        reason: reason.trim(),
        note: note.trim() || undefined,
        lines: payload,
      });
    },
    onSuccess: (ret) => {
      toast.success(
        `مرجوعی ${toFa(ret.number)} ثبت شد — برگشتی ${rial(ret.refundAmount)}`,
      );
      qc.invalidateQueries({ queryKey: ["pos-recent-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["returns"] });
      onDone?.();
      onClose();
    },
    onError: (e) => {
      toast.error(e instanceof ApiException ? e.message : "ثبت مرجوعی ناموفق بود");
    },
  });

  const nothingReturnable =
    !data.isLoading && lines.every((l) => l.returnable <= 0);
  const canSubmit =
    selectedCount > 0 && reason.trim().length > 0 && !submit.isPending;

  function setQty(saleLogId: string, raw: string, max: number) {
    // ارقام فارسی/عربی اول به لاتین تبدیل شوند؛ وگرنه `\d` (که فقط 0-9 لاتین است)
    // آن‌ها را حذف می‌کرد و ورودیِ فارسی همیشه صفر می‌شد.
    const n = Math.max(0, Math.min(max, Number(faToEn(raw).replace(/[^\d]/g, "")) || 0));
    setQtyById((m) => ({ ...m, [saleLogId]: n }));
  }

  return (
    <Dialog open={!!invoiceId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Undo2 className="size-4" />
            مرجوعی فاکتور {invoice ? toFa(invoice.number) : ""}
          </DialogTitle>
        </DialogHeader>

        {data.isLoading && (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> در حال بارگذاری…
          </p>
        )}

        {data.data && !data.data.returnable && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            این فاکتور باطل شده و قابلِ مرجوعی نیست.
          </p>
        )}

        {data.data && data.data.returnable && (
          <div className="flex flex-col gap-3">
            {invoice && (
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                مشتری:{" "}
                <span className="font-medium">
                  {invoice.customer?.fullName ?? "نقدی گذری"}
                </span>
                {owesMoney && (
                  <span className="ms-3 text-amber-600">
                    مانده‌ی فاکتور: {money(invoice.dueAmount)}
                  </span>
                )}
              </div>
            )}

            {nothingReturnable ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                همه‌ی اقلام این فاکتور قبلاً مرجوعی شده‌اند.
              </p>
            ) : (
              <div className="max-h-[45vh] overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                    <tr className="text-muted-foreground">
                      <th className="p-2 text-start font-medium">کالا</th>
                      <th className="w-20 p-2 text-center font-medium">فروخته</th>
                      <th className="w-24 p-2 text-center font-medium">قابل‌برگشت</th>
                      <th className="w-28 p-2 text-center font-medium">تعداد برگشت</th>
                      <th className="w-24 p-2 text-center font-medium">سالم؟</th>
                      <th className="w-28 p-2 text-end font-medium">برگشتی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const disabled = l.returnable <= 0;
                      const q = qtyById[l.saleLogId] ?? 0;
                      const restock = restockById[l.saleLogId] ?? true;
                      return (
                        <tr
                          key={l.saleLogId}
                          className={`border-t ${disabled ? "opacity-40" : ""}`}
                        >
                          <td className="p-2">
                            <div className="font-medium">{l.product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {money(l.effectiveUnitPrice)} / واحد
                              {l.alreadyReturned > 0 && (
                                <span className="ms-2 text-amber-600">
                                  قبلاً برگشتی: {toFa(l.alreadyReturned)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-center tabular-nums">
                            {toFa(l.sold)}
                          </td>
                          <td className="p-2 text-center tabular-nums">
                            {toFa(l.returnable)}
                          </td>
                          <td className="p-2">
                            <Input
                              inputMode="numeric"
                              disabled={disabled}
                              value={q ? toFa(q) : ""}
                              onChange={(e) =>
                                setQty(l.saleLogId, e.target.value, l.returnable)
                              }
                              placeholder="۰"
                              className="h-9 text-center tabular-nums"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <Checkbox
                              checked={restock}
                              disabled={disabled || q === 0}
                              onCheckedChange={(v) =>
                                setRestockById((m) => ({
                                  ...m,
                                  [l.saleLogId]: v === true,
                                }))
                              }
                              aria-label="برگشت به موجودی"
                            />
                          </td>
                          <td className="p-2 text-end font-semibold tabular-nums">
                            {q > 0 ? money(q * l.effectiveUnitPrice) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!nothingReturnable && (
              <>
                <p className="text-xs text-muted-foreground">
                  «سالم» یعنی کالا به موجودی برمی‌گردد. اگر معیوب است تیک را
                  بردارید — فقط وجهش برمی‌گردد و چیزی به انبار اضافه نمی‌شود.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">
                      روش برگشت وجه
                    </label>
                    <Select
                      value={effectiveMethod}
                      onValueChange={(v) => setMethod(v as PaymentMethod)}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASH">نقد (از صندوق)</SelectItem>
                        <SelectItem value="CARD">کارتخوان</SelectItem>
                        <SelectItem value="CREDIT" disabled={!hasCustomer}>
                          کسر از حساب مشتری
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {effectiveMethod === "CREDIT" && (
                      <span className="text-xs text-muted-foreground">
                        از بدهیِ مشتری کم می‌شود؛ اگر بیشتر از بدهی باشد، بستانکار
                        می‌شود.
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">
                      دلیل مرجوعی (اجباری)
                    </label>
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={200}
                      placeholder="مثلاً: کالا معیوب بود"
                      className="h-10"
                    />
                  </div>
                </div>

                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                  placeholder="توضیح (اختیاری)"
                  className="min-h-[60px]"
                />

                <div className="flex items-center justify-between border-t pt-3">
                  <div className="text-sm">
                    جمع برگشتی:{" "}
                    <span className="font-bold tabular-nums">
                      {rial(refundPreview)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={submit.isPending}
                      onClick={onClose}
                    >
                      انصراف
                    </Button>
                    <Button
                      disabled={!canSubmit}
                      onClick={() => submit.mutate()}
                    >
                      {submit.isPending ? "در حال ثبت…" : "ثبت مرجوعی"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
