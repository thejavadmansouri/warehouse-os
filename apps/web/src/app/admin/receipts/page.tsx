"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandCoins, User } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { createReceipt, getCustomer, getReceipts } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { faDate, money, parseNum, toFa, PAYMENT_LABELS } from "@/lib/format";
import type { Customer, PaymentMethod } from "@/lib/types";

import { CustomerPicker } from "../pos/_components/customer-picker";

/** روش‌های دریافت. نسیه اینجا نیست — «پول ندادم» روش دریافت نیست. */
const METHODS: PaymentMethod[] = ["CASH", "CARD", "CHEQUE"];

export default function ReceiptsPage() {
  const qc = useQueryClient();

  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [showPicker, setShowPicker] = React.useState(false);
  const [amount, setAmount] = React.useState(0);
  const [method, setMethod] = React.useState<PaymentMethod>("CASH");
  const [note, setNote] = React.useState("");
  const [chequeNumber, setChequeNumber] = React.useState("");
  const [chequeBank, setChequeBank] = React.useState("");
  const [chequeDue, setChequeDue] = React.useState("");

  /**
   * کلید یکتا هنگام ثبت ساخته می‌شود و تا موفق شدن نگه داشته می‌شود، تا اگر
   * شبکه قطع شد و کاربر دوباره زد، بدهی دو بار کم نشود.
   */
  const idemRef = React.useRef<string | null>(null);
  const resetIdem = () => { idemRef.current = null; };

  // پروفایل کامل مشتری را می‌گیریم چون خلاصه‌ی بدهی فقط آنجاست.
  const profile = useQuery({
    queryKey: ["customer", customer?.id],
    queryFn: () => getCustomer(customer!.id),
    enabled: !!customer?.id,
  });

  const list = useQuery({
    queryKey: ["receipts", customer?.id],
    queryFn: () => getReceipts({ customerId: customer?.id, limit: 20 }),
  });

  const totalDue = profile.data?.summary?.totalDue ?? 0;

  const submit = useMutation({
    mutationFn: () => {
      if (!idemRef.current) idemRef.current = crypto.randomUUID();
      return createReceipt({
        idempotencyKey: idemRef.current,
        customerId: customer!.id,
        amount,
        method,
        note: note.trim() || undefined,
        cheque:
          method === "CHEQUE"
            ? { number: chequeNumber.trim(), bankName: chequeBank.trim() || undefined, dueDate: chequeDue }
            : undefined,
      });
    },
    onSuccess: (r) => {
      toast.success(`رسید ${toFa(r.number)} ثبت شد — ${money(r.amount)} تومان`);
      setAmount(0);
      setNote("");
      setChequeNumber("");
      setChequeBank("");
      setChequeDue("");
      idemRef.current = null;
      qc.invalidateQueries({ queryKey: ["customer"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
    },
    onError: (e: unknown) => {
      const err = e instanceof ApiException ? e : null;

      if (err?.code === "AMOUNT_EXCEEDS_DEBT") {
        const debt = Number(err.raw.totalDebt ?? 0);
        toast.error(`مبلغ از بدهی مشتری بیشتر است — بدهی: ${money(debt)} تومان`);
      } else {
        toast.error(err?.message ?? "ثبت رسید ناموفق بود");
      }

      // خطای اعتبارسنجی یعنی کاربر باید مبلغ را عوض کند → رسید دیگری است.
      resetIdem();
    },
  });

  const chequeIncomplete =
    method === "CHEQUE" && (!chequeNumber.trim() || !chequeDue);

  const canSubmit =
    !!customer && amount > 0 && amount <= totalDue && !chequeIncomplete && !submit.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="دریافت وجه از بدهکار"
        description="ثبت پرداخت مشتری بابت فاکتورهای نسیه"
        icon={HandCoins}
      />

      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        {/* فرم ثبت */}
        <Card className="h-fit p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">مشتری</span>
            <Button variant="ghost" size="sm" onClick={() => setShowPicker(true)}>
              <User className="size-4" /> انتخاب
            </Button>
          </div>

          {customer ? (
            <div className="rounded-lg border p-3">
              <p className="font-medium">{customer.fullName}</p>
              <p className="text-xs text-muted-foreground" dir="ltr">
                {customer.phones?.[0]?.phone ? toFa(customer.phones[0].phone) : "بدون شماره"}
              </p>
              <p className="mt-2 text-sm">
                بدهی فعلی:{" "}
                <b className={totalDue > 0 ? "text-amber-600 tabular-nums" : "tabular-nums"}>
                  {money(totalDue)} تومان
                </b>
              </p>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              برای شروع، مشتری را انتخاب کنید
            </p>
          )}

          {customer && totalDue === 0 && (
            <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              این مشتری بدهی ندارد. دریافت وجه فقط بابت بدهی ثبت‌شده ممکن است.
            </p>
          )}

          {customer && totalDue > 0 && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">مبلغ دریافتی</label>
                <Input
                  dir="ltr"
                  className="h-11 text-left text-base tabular-nums"
                  value={amount ? money(amount) : ""}
                  onChange={(e) => { setAmount(parseNum(e.target.value)); resetIdem(); }}
                  placeholder="۰"
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setAmount(totalDue); resetIdem(); }}
                  >
                    تسویه‌ی کامل
                  </Button>
                  {amount > totalDue && (
                    <span className="self-center text-xs text-destructive">
                      بیشتر از بدهی است
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">روش دریافت</label>
                <div className="flex gap-1">
                  {METHODS.map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMethod(m); resetIdem(); }}
                      className={`h-10 flex-1 rounded-md text-sm font-medium transition-colors ${
                        method === m
                          ? "bg-primary text-primary-foreground"
                          : "border bg-background hover:bg-primary/5"
                      }`}
                    >
                      {PAYMENT_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>

              {method === "CHEQUE" && (
                <div className="space-y-2 rounded-lg border p-3">
                  <Input
                    placeholder="شماره چک"
                    value={chequeNumber}
                    onChange={(e) => { setChequeNumber(e.target.value); resetIdem(); }}
                  />
                  <Input
                    placeholder="بانک (اختیاری)"
                    value={chequeBank}
                    onChange={(e) => setChequeBank(e.target.value)}
                  />
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      تاریخ سررسید
                    </label>
                    <Input
                      type="date"
                      dir="ltr"
                      value={chequeDue}
                      onChange={(e) => { setChequeDue(e.target.value); resetIdem(); }}
                    />
                  </div>
                </div>
              )}

              <Input
                placeholder="توضیح (اختیاری)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              <Button
                className="h-12 w-full text-base"
                disabled={!canSubmit}
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? "در حال ثبت…" : "ثبت دریافت"}
              </Button>

              <p className="text-xs leading-6 text-muted-foreground">
                مبلغ به‌طور خودکار به <b>قدیمی‌ترین فاکتور بدهکار</b> تخصیص داده می‌شود
                و تا جایی که برسد جلو می‌رود.
              </p>
            </div>
          )}
        </Card>

        {/* تاریخچه */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">
            {customer ? `رسیدهای ${customer.fullName}` : "آخرین رسیدها"}
          </h2>

          {list.isLoading ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState onRetry={() => list.refetch()} />
          ) : !list.data?.data.length ? (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              هنوز رسیدی ثبت نشده است
            </p>
          ) : (
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شماره</TableHead>
                    <TableHead>مشتری</TableHead>
                    <TableHead>روش</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead className="text-start">مبلغ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums">{toFa(r.number)}</TableCell>
                      <TableCell className="font-medium">{r.customerName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{PAYMENT_LABELS[r.method] ?? r.method}</Badge>
                        {r.cheque && (
                          <span className="ms-2 text-xs text-muted-foreground tabular-nums">
                            چک {toFa(r.cheque.number)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {faDate(r.createdAt)}
                      </TableCell>
                      <TableCell className="font-bold tabular-nums text-emerald-600">
                        {money(r.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      </div>

      <CustomerPicker
        open={showPicker}
        onPick={(c) => { setCustomer(c); setShowPicker(false); setAmount(0); resetIdem(); }}
        onClose={() => setShowPicker(false)}
      />
    </div>
  );
}
