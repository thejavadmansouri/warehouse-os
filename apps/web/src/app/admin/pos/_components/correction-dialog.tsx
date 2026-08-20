"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, PencilLine } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCorrection, getCorrectableLines } from "@/lib/api";
import { money, rial, toFa, faToEn } from "@/lib/format";
import { ApiException } from "@/lib/api-error-messages";

/**
 * اصلاحیه‌ی فاکتور — تصحیحِ قیمت/تعدادِ یک فاکتورِ نهایی با سندِ جدا.
 *
 * قفل به فاکتور: «از چه» (تعداد و قیمت فعلی هر قلم) از سرور می‌آید و خودِ
 * فاکتور دست نمی‌خورد؛ فقط ردیف‌های تغییرکرده ارسال می‌شوند و دلیل اجباری است.
 */
export function CorrectionDialog({
  invoiceId,
  onClose,
  onDone,
}: {
  invoiceId: string | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();

  // «جدیدِ» هر ردیف — کلیدِ saleLogId. خالی یعنی دست‌نخورده.
  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  const [priceById, setPriceById] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  // هر بار سند عوض شد، فرم قبلی نباید به فاکتور جدید نشت کند.
  useEffect(() => {
    setQtyById({});
    setPriceById({});
    setReason("");
    setNote("");
  }, [invoiceId]);

  const data = useQuery({
    queryKey: ["correctable", invoiceId],
    queryFn: () => getCorrectableLines(invoiceId!),
    enabled: !!invoiceId,
    staleTime: 0,
  });

  const invoice = data.data?.invoice;
  const owesMoney = (invoice?.dueAmount ?? 0) > 0;
  const lines = data.data?.lines ?? [];

  // ردیف‌های واقعاً تغییر‌کرده — تنها چیزی که ارسال می‌شود.
  const changedLines = useMemo(
    () =>
      lines.filter((l) => {
        const q = parseNew(l.saleLogId, qtyById, priceById, l);
        return q.qty !== l.oldQuantity || q.price !== l.oldUnitPrice;
      }),
    [lines, qtyById, priceById],
  );

  // جمعِ تغییرات: (تعداد×قیمت جدید) − (تعداد×قیمت فعلی).
  const adjustPreview = useMemo(
    () =>
      changedLines.reduce((sum, l) => {
        const { qty, price } = parseNew(l.saleLogId, qtyById, priceById, l);
        return sum + (qty * price - l.oldQuantity * l.oldUnitPrice);
      }, 0),
    [changedLines, qtyById, priceById],
  );

  const submit = useMutation({
    mutationFn: () =>
      createCorrection({
        idempotencyKey: crypto.randomUUID(),
        invoiceId: invoiceId!,
        reason: reason.trim(),
        note: note.trim() || undefined,
        lines: changedLines.map((l) => {
          const { qty, price } = parseNew(l.saleLogId, qtyById, priceById, l);
          return {
            saleLogId: l.saleLogId,
            newQuantity: qty,
            newUnitPrice: price,
          };
        }),
      }),
    onSuccess: (corr) => {
      toast.success(`اصلاحیه ${toFa(corr.number)} ثبت شد — اثر ${rial(corr.amountAdjust)}`);
      qc.invalidateQueries({ queryKey: ["pos-recent-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-list"] });
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["corrections"] });
      onDone?.();
      onClose();
    },
    onError: (e) => {
      toast.error(e instanceof ApiException ? e.message : "ثبت اصلاحیه ناموفق بود");
    },
  });

  const canSubmit =
    changedLines.length > 0 && reason.trim().length > 0 && !submit.isPending;

  return (
    <Dialog open={!!invoiceId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <PencilLine className="size-4" />
            اصلاحیه فاکتور {invoice ? toFa(invoice.number) : ""}
          </DialogTitle>
        </DialogHeader>

        {data.isLoading && (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> در حال بارگذاری…
          </p>
        )}

        {data.data && !data.data.correctable && (
          <div className="flex flex-col gap-2 py-6 text-center text-sm text-muted-foreground">
            <p>فاکتورِ باطل‌شده قابلِ اصلاح نیست.</p>
          </div>
        )}

        {data.data?.correctable && data.data.isOpenAccount && (
          <p className="rounded-lg border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            فاکتورِ جاریِ حساب باز — تغییرِ تعداد یا قیمت همین حالا از بدهیِ همین
            حساب کم/زیاد می‌شود، پیش از تسویه.
          </p>
        )}

        {data.data && data.data.correctable && (
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

            <p className="text-xs text-muted-foreground">
              فقط ردیف‌هایی که تغییر می‌دهید ارسال می‌شوند؛ فاکتور اصلی دست نمی‌خورد و
              دفتر و موجودی به‌اندازه‌ی همان تغییر جبران می‌شود. افزایش تعداد یعنی
              کسر بیشتر از انبار، کاهش یعنی برگشت.
            </p>

            <div className="max-h-[45vh] overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                  <tr className="text-muted-foreground">
                    <th className="p-2 text-start font-medium">کالا</th>
                    <th className="w-20 p-2 text-center font-medium">فعلی</th>
                    <th className="w-24 p-2 text-center font-medium">تعداد جدید</th>
                    <th className="w-28 p-2 text-center font-medium">قیمت جدید</th>
                    <th className="w-28 p-2 text-end font-medium">اثر</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const changed = changedLines.some((c) => c.saleLogId === l.saleLogId);
                    return (
                      <tr
                        key={l.saleLogId}
                        className={`border-t ${changed ? "bg-primary/5" : ""}`}
                      >
                        <td className="p-2">
                          <div className="font-medium">{l.product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {money(l.oldUnitPrice)} / واحد
                            {l.correctedBy !== 0 && (
                              <span className="ms-2 text-primary">
                                اصلاح شده: {toFa(l.correctedBy)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-center tabular-nums">
                          {toFa(l.oldQuantity)}
                        </td>
                        <td className="p-2">
                          <Input
                            inputMode="numeric"
                            value={qtyById[l.saleLogId] ?? ""}
                            onChange={(e) =>
                              setQtyById((m) => ({ ...m, [l.saleLogId]: e.target.value }))
                            }
                            placeholder={toFa(l.oldQuantity)}
                            className="h-9 text-center tabular-nums"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            inputMode="numeric"
                            value={priceById[l.saleLogId] ?? ""}
                            onChange={(e) =>
                              setPriceById((m) => ({
                                ...m,
                                [l.saleLogId]: e.target.value,
                              }))
                            }
                            placeholder={toFa(l.oldUnitPrice)}
                            className="h-9 text-center tabular-nums ltr"
                          />
                        </td>
                        <td className="p-2 text-end font-semibold tabular-nums">                              {changed ? money(lineEffect(l, qtyById, priceById)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  دلیل اصلاحیه (اجباری)
                </label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={200}
                  placeholder="مثلاً: قیمت پایه اشتباه ثبت شده بود"
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  توضیح (اختیاری)
                </label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                  placeholder="…"
                  className="h-10"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <div className="text-sm">
                اثر اصلاحیه:{" "}
                <span className={`font-bold tabular-nums ${adjustPreview < 0 ? "text-primary" : "text-amber-600"}`}>
                  {rial(adjustPreview > 0 ? adjustPreview : -adjustPreview)}
                </span>
                {adjustPreview > 0 && (
                  <span className="ms-2 text-xs text-amber-600">
                    (بدهیِ مشتری زیاد می‌شود)
                  </span>
                )}
                {adjustPreview < 0 && (
                  <span className="ms-2 text-xs text-primary">
                    (بدهیِ مشتری کم می‌شود)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={submit.isPending} onClick={onClose}>
                  انصراف
                </Button>
                <Button disabled={!canSubmit} onClick={() => submit.mutate()}>
                  {submit.isPending ? "در حال ثبت…" : "ثبت اصلاحیه"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** اثرِ یک ردیف: (تعداد×قیمت جدید) − (تعداد×قیمت فعلی). */
function lineEffect(
  line: { saleLogId: string; oldQuantity: number; oldUnitPrice: number },
  qtyById: Record<string, string>,
  priceById: Record<string, string>,
) {
  const { qty, price } = parseNew(line.saleLogId, qtyById, priceById, line);
  return qty * price - line.oldQuantity * line.oldUnitPrice;
}

/**
 * «جدیدِ» یک ردیف: اگر فیلد پر شده از آن بخوان، وگرنه همان فعلی.
 * ارقام فارسی/عربی اول لاتین می‌شوند و هر چیز غیرعددی حذف، تا ورودیِ ناقص
 * عددِ NaN نسازد.
 */
function parseNew(
  saleLogId: string,
  qtyById: Record<string, string>,
  priceById: Record<string, string>,
  current?: { oldQuantity: number; oldUnitPrice: number },
): { qty: number; price: number } {
  const qRaw = qtyById[saleLogId];
  const pRaw = priceById[saleLogId];
  const q =
    qRaw !== undefined && qRaw !== ""
      ? Number(faToEn(qRaw).replace(/[^\d]/g, "")) || 0
      : current?.oldQuantity ?? 0;
  const p =
    pRaw !== undefined && pRaw !== ""
      ? Number(faToEn(pRaw).replace(/[^\d]/g, "")) || 0
      : current?.oldUnitPrice ?? 0;
  return { qty: q, price: p };
}