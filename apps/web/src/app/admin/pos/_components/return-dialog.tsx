"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Minus,
  PackageCheck,
  Plus,
  Undo2,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { createReturn, getReturnableLines } from "@/lib/api";
import { amount, faToEn, money, toFa } from "@/lib/format";
import { ApiException } from "@/lib/api-error-messages";
import type { PaymentMethod } from "@/lib/types";
import { SummaryChip } from "./summary-chip";

/**
 * ثبت مرجوعی برای یک فاکتور.
 *
 * قفل به فاکتور: کالا و قیمت از خودِ فاکتور می‌آیند؛ فروشنده فقط تعداد و
 * سالم/معیوب و روش برگشتِ وجه را تعیین می‌کند. سقفِ هر ردیف «قابل‌برگشت» است
 * (= فروخته − مرجوعیِ قبلی)، پس دو بار برگرداندنِ یک قلم ممکن نیست.
 *
 * سه تصمیمِ طراحی که عمدی‌اند:
 *
 * ۱. «همهٔ اقلام» داخلِ همین پنجره است، نه یک دکمه‌ی دومِ «مرجوعیِ کامل» در
 *    فهرست. دو دکمه یعنی دو مسیرِ ذهنی برای یک کار؛ حالا یک مسیر هست و
 *    برگرداندنِ کلِ فاکتور یک کلیک داخلِ آن است.
 * ۲. شمارنده‌ی «− / +» جای تایپِ عدد گذاشته شده: مرجوعی در پیشخوان یا «۱»
 *    است یا «همه»؛ تایپ کردنِ عدد برای هر قلم کندتر از دو کلیک است. ورودیِ
 *    دستی هم سرِ جایش مانده.
 * ۳. جمعِ برگشتی و تعداد در نوارِ پایین زنده‌اند، تا قبل از ثبت معلوم باشد
 *    چه چیزی دارد از حساب/صندوق کم می‌شود.
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
  /*
   * مشتریِ حساب‌دار (مانده‌ی کلِ مثبت) که چیزی پس می‌دهد، پیش‌فرضش «کسر از
   * حساب» است — حتی اگر فاکتورِ خودش نقدی تسویه شده باشد. پولِ نقدِ فاکتورِ
   * قبلی به صندوق رفته؛ طلبکار کردنِ مشتریِ بدهکار فقط اعتبارِ معلقِ گیج‌کننده
   * می‌سازد (همان اشتباهِ مرجوعیِ ۳۲ که ۱۵۰٬۰۰۰ روی حسابِ تبای معلق ماند).
   * مانده‌ی کل از سرور می‌آید، نه فقط مانده‌ی همین فاکتور.
   */
  const customerOwes = (data.data?.customerBalance ?? 0) > 0;
  /*
   * فاکتورِ جاریِ یک حساب باز: مشتری جنس را برده و هنوز یک ریال هم نداده. پس
   * «برگشت وجه از صندوق» یعنی پول دادن بابت جنسی که پولش گرفته نشده — سرور هم
   * ردش می‌کند. روش روی «کسر از حساب» قفل می‌شود.
   */
  const isOpenAccount = data.data?.isOpenAccount ?? false;

  // پیش‌فرضِ روشِ برگشت: مشتریِ بدهکار → کسر از حساب؛ وگرنه نقد. بدونِ مشتری
  // اصلاً «کسر از حساب» معنا ندارد.
  const defaultMethod: PaymentMethod =
    hasCustomer && customerOwes ? "CREDIT" : "CASH";
  const effectiveMethod: PaymentMethod = isOpenAccount
    ? "CREDIT"
    : ((method || defaultMethod) as PaymentMethod);

  const lines = data.data?.lines ?? [];
  const returnableLines = useMemo(
    () => lines.filter((l) => l.returnable > 0),
    [lines],
  );

  const setQty = (saleLogId: string, next: number, max: number) =>
    setQtyById((m) => ({
      ...m,
      [saleLogId]: Math.max(0, Math.min(max, next)),
    }));

  const selectAll = () =>
    setQtyById(
      Object.fromEntries(
        returnableLines.map((l) => [l.saleLogId, l.returnable]),
      ),
    );
  const clearAll = () => setQtyById({});

  const refundPreview = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (qtyById[l.saleLogId] ?? 0) * l.effectiveUnitPrice,
        0,
      ),
    [lines, qtyById],
  );

  const selectedLineCount = useMemo(
    () => lines.reduce((n, l) => n + (qtyById[l.saleLogId] ? 1 : 0), 0),
    [lines, qtyById],
  );
  const selectedPieces = useMemo(
    () => lines.reduce((n, l) => n + (qtyById[l.saleLogId] ?? 0), 0),
    [lines, qtyById],
  );

  /*
   * سقفِ نقد/کارت — همان قاعده‌ای که سرور هنگام ثبت اجرا می‌کند (پولی که
   * واقعاً گرفته شده). نمایشِ آن قبل از «ثبت»، یعنی فروشنده به‌جای دیدنِ
   * خطای قرمز بعد از کلیک، همان‌جا روش را عوض می‌کند.
   */
  const cashRefundable = data.data?.cashRefundable ?? 0;
  const isCashMethod = effectiveMethod === "CASH" || effectiveMethod === "CARD";
  const cashOverCap = isCashMethod && refundPreview > cashRefundable;

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
        `مرجوعی شماره ${toFa(ret.number)} ثبت شد — برگشتی ${amount(ret.refundAmount)}`,
      );
      qc.invalidateQueries({ queryKey: ["pos-recent-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["returns"] });
      onDone?.();
      onClose();
    },
    onError: (e) => {
      toast.error(
        e instanceof ApiException ? e.message : "ثبت مرجوعی ناموفق بود",
      );
    },
  });

  const nothingReturnable =
    !data.isLoading && lines.every((l) => l.returnable <= 0);
  /* دلیل اختیاری است — مرجوعی نباید به تایپِ دلیل گره بخورد. */
  const canSubmit =
    selectedLineCount > 0 && !submit.isPending && !cashOverCap;

  /** ارقام فارسی/عربی → لاتین، سپس عددِ امن. */
  function setQtyFromInput(saleLogId: string, raw: string, max: number) {
    const n = Number(faToEn(raw).replace(/[^\d]/g, "")) || 0;
    setQty(saleLogId, n, max);
  }

  return (
    <Dialog open={!!invoiceId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <Undo2 className="size-4 text-amber-600" />
            مرجوعی فاکتور {invoice ? toFa(invoice.number) : ""}
            {invoice && (
              <span className="text-xs font-normal text-muted-foreground">
                {invoice.customer?.fullName ?? "نقدی گذری"} · مبلغ{" "}
                {amount(invoice.total)}
              </span>
            )}
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
            {invoice ? (
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                  <div>
                    <div className="text-muted-foreground">مبلغ فاکتور</div>
                    <div className="font-semibold tabular-nums">
                      {amount(invoice.total)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">مانده‌ی فاکتور</div>
                    <div
                      className={cn(
                        "font-semibold tabular-nums",
                        invoice.dueAmount > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground",
                      )}
                    >
                      {invoice.dueAmount > 0
                        ? amount(invoice.dueAmount)
                        : "تسویه‌شده"}
                    </div>
                  </div>
                  {hasCustomer && (
                    <div>
                      <div className="text-muted-foreground">
                        مانده‌ی کل مشتری
                      </div>
                      <div
                        className={cn(
                          "font-semibold tabular-nums",
                          customerOwes
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {amount(data.data.customerBalance)}
                      </div>
                    </div>
                  )}
                </div>
                {isOpenAccount && (
                  <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                    فاکتورِ جاریِ حساب باز — هنوز پولی پرداخت نشده، پس برگشت از
                    بدهیِ همین حساب کم می‌شود.
                  </p>
                )}
              </div>
            ) : null}

            {nothingReturnable ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                همه‌ی اقلام این فاکتور قبلاً مرجوعی شده‌اند.
              </p>
            ) : (
              <>
                {/* نوارِ انتخاب — یک مسیر برای «همه» و «هیچ» */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={selectAll}
                  >
                    <PackageCheck className="size-4 text-amber-600" />
                    همهٔ اقلام
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={clearAll}
                    disabled={selectedLineCount === 0}
                  >
                    هیچ‌کدام
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {selectedLineCount === 0
                      ? `${toFa(returnableLines.length)} قلم قابلِ برگشت`
                      : `${toFa(selectedLineCount)} قلم · ${toFa(selectedPieces)} عدد`}
                  </span>
                </div>

                <div className="max-h-[42vh] overflow-y-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                      <tr className="text-xs text-muted-foreground">
                        <th className="p-2 text-start font-medium">کالا</th>
                        <th className="w-14 p-2 text-center font-medium">فروش</th>
                        <th className="w-16 p-2 text-center font-medium">
                          قابلِ برگشت
                        </th>
                        <th className="w-36 p-2 text-center font-medium">
                          تعداد برگشت
                        </th>
                        <th
                          className="w-20 p-2 text-center font-medium"
                          title="تیک یعنی کالا به موجودی برمی‌گردد؛ برای کالای معیوب تیک را بردارید"
                        >
                          به انبار
                        </th>
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
                            className={cn(
                              "border-t",
                              disabled && "opacity-40",
                              q > 0 && "bg-amber-600/5",
                            )}
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
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-7 shrink-0"
                                  disabled={disabled || q === 0}
                                  aria-label="یک عدد کمتر"
                                  onClick={() =>
                                    setQty(l.saleLogId, q - 1, l.returnable)
                                  }
                                >
                                  <Minus className="size-3.5" />
                                </Button>
                                <Input
                                  inputMode="numeric"
                                  disabled={disabled}
                                  value={q ? toFa(q) : ""}
                                  onChange={(e) =>
                                    setQtyFromInput(
                                      l.saleLogId,
                                      e.target.value,
                                      l.returnable,
                                    )
                                  }
                                  placeholder="۰"
                                  aria-label={`تعداد برگشت ${l.product.name}`}
                                  className="h-7 w-12 px-1 text-center text-xs tabular-nums"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-7 shrink-0"
                                  disabled={disabled || q >= l.returnable}
                                  aria-label="یک عدد بیشتر"
                                  onClick={() =>
                                    setQty(l.saleLogId, q + 1, l.returnable)
                                  }
                                >
                                  <Plus className="size-3.5" />
                                </Button>
                                {l.returnable > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setQty(l.saleLogId, l.returnable, l.returnable)
                                    }
                                    disabled={disabled || q === l.returnable}
                                    className="rounded px-1 text-[10px] font-semibold text-primary underline-offset-2 hover:underline disabled:text-muted-foreground disabled:no-underline"
                                    title={`همهٔ ${toFa(l.returnable)} عدد`}
                                  >
                                    همه
                                  </button>
                                )}
                              </div>
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
                                aria-label="برگشت به موجودی انبار"
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

                <p className="text-xs text-muted-foreground">
                  «به انبار» یعنی کالا به موجودی برمی‌گردد. برای کالای معیوب تیک
                  را بردارید — فقط وجهش برمی‌گردد و چیزی به انبار اضافه نمی‌شود.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">
                      روش برگشت وجه
                    </label>
                    <Select
                      value={effectiveMethod}
                      onValueChange={(v) => setMethod(v as PaymentMethod)}
                      disabled={isOpenAccount}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASH" disabled={isOpenAccount}>
                          نقد (از صندوق)
                        </SelectItem>
                        <SelectItem value="CARD" disabled={isOpenAccount}>
                          کارتخوان
                        </SelectItem>
                        <SelectItem value="CREDIT" disabled={!hasCustomer}>
                          کسر از حساب مشتری
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-[11px] text-muted-foreground">
                      {effectiveMethod === "CREDIT"
                        ? "از بدهیِ مشتری کم می‌شود؛ اگر بیشتر از بدهی باشد، بستانکار می‌شود."
                        : effectiveMethod === "CARD"
                          ? "مبلغ روی کارتخوان به مشتری برمی‌گردد."
                          : "پول نقد از صندوق به مشتری داده می‌شود."}
                    </span>
                    {isCashMethod && (
                      <span
                        className={cn(
                          "text-[11px]",
                          cashOverCap
                            ? "font-medium text-red-600 dark:text-red-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {cashOverCap
                          ? `بیش از سقفِ نقدیِ این فاکتور (${amount(cashRefundable)}) — باقیمانده فقط با «کسر از حساب» برگشت می‌خورد.`
                          : `سقفِ برگشت نقد/کارت: ${amount(cashRefundable)}`}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">
                      دلیل مرجوعی (اختیاری)
                    </label>
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={200}
                      placeholder="مثلاً: کالا معیوب بود"
                      className="h-9 text-sm"
                    />
                    <div className="flex flex-wrap gap-1">
                      {REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setReason(reason === r ? "" : r)}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                            reason === r
                              ? "border-primary bg-primary/10 text-primary"
                              : "text-muted-foreground hover:border-primary/50 hover:text-foreground",
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                  placeholder="توضیح (اختیاری)"
                  className="min-h-[52px] text-sm"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <SummaryChip
                      label="اقلام انتخابی"
                      className="w-28 shrink-0"
                    >
                      {toFa(selectedLineCount)} قلم
                    </SummaryChip>
                    <SummaryChip
                      label="جمع برگشتی"
                      tone="warning"
                      className="w-44 shrink-0"
                    >
                      {amount(refundPreview)}
                    </SummaryChip>
                    {selectedLineCount === 0 && (
                      <span className="text-xs text-muted-foreground">
                        برای ثبت، حداقل یک قلم انتخاب کنید
                      </span>
                    )}
                    {cashOverCap && (
                      <span className="text-xs font-medium text-red-600 dark:text-red-400">
                        روشِ برگشت را عوض کنید یا از تعداد کم کنید — نقدِ بیش از
                        سقف از صندوق برنمی‌گردد
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
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

/** دلیل‌های رایجِ پیشخوان — کلیک، نه تایپ. */
const REASONS = [
  "کالا معیوب بود",
  "مشتری منصرف شد",
  "اشتباه در فروش",
  "ارسال اشتباه",
];
