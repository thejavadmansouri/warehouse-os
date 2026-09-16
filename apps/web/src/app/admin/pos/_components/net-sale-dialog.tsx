"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, Banknote, CreditCard, Loader2, Plus, Trash2, Undo2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { createNetSale, getInvoices, getReturnableLines, searchProducts } from "@/lib/api";
import { amount, money, parseNum, toFa } from "@/lib/format";
import { ApiException } from "@/lib/api-error-messages";
import type { Customer, ReturnableInvoice } from "@/lib/types";

import {
  buildNetPayload,
  clampReturnQty,
  type NetReturnRow,
  type NetSaleRow,
} from "../_lib/net-sale";

/** دلیل‌های آماده‌ی مرجوعی — فروشنده تایپ نمی‌کند، یکی را می‌زند. */
const QUICK_REASONS = ["تعویض جنس", "جنس معیوب", "اشتباه در فروش"];

const keyOf = (invoiceId: string, saleLogId: string) => `${invoiceId}::${saleLogId}`;

/**
 * تعویض — «جنسِ قبلی پس داده می‌شود + جنسِ نو برده می‌شود» در یک ثبتِ اتمیک.
 *
 * همان یک سبد: ردیف‌هایِ برگشتی (قرمز؛ قیمت از فاکتورِ مبدأ می‌آید و فقط تعداد
 * انتخاب می‌شود) کنارِ ردیف‌هایِ فروشِ نو (سفید؛ قیمت دستِ فروشنده) با جمعِ
 * زنده — و یک دکمه‌ی ثبت که همه را از `POST /sales/net` می‌فرستد.
 *
 * مدلِ پولِ این نسخه دو سند است: فروشِ نو با پرداختِ کاملش + برگشتِ نقدیِ
 * مرجوعی‌ها. در دستِ صندوق‌دار، خالص می‌ماند: «جمعِ نو − جمعِ برگشت». خالصِ
 * منفی (برگشت بیشتر از خریدِ نو) اینجا ثبت نمی‌شود — آن حالت مسیرِ مستقلِ
 * مرجوعی دارد.
 */
export function NetSwapDialog({
  customer,
  warehouseId,
  onClose,
}: {
  customer: Customer | null;
  warehouseId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  /* ---------- فاکتورهایِ قابلِ برگشتِ همین مشتری ---------- */
  const invoicesQ = useQuery({
    queryKey: ["net-swap-invoices", customer?.id],
    queryFn: () => getInvoices({ customerId: customer!.id, pageSize: 200 }),
    enabled: !!customer,
    staleTime: 15_000,
  });

  const eligible = useMemo(() => {
    return (invoicesQ.data?.data ?? [])
      .filter((i) => i.status === "CONFIRMED" && i.paidAmount > 0)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [invoicesQ.data]);

  /* ---------- برگشتی‌ها ---------- */
  /** ردیف‌هایِ قابلِ‌برگشتِ هر فاکتورِ بازشده — کشِ جلسه، به‌کلید invoiceId. */
  const [invData, setInvData] = useState<Record<string, ReturnableInvoice>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [restockById, setRestockById] = useState<Record<string, boolean>>({});

  /* ---------- جنسِ نو ---------- */
  const [saleRows, setSaleRows] = useState<NetSaleRow[]>([]);
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const [method, setMethod] = useState<"CASH" | "CARD">("CASH");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  // ورودیِ جست‌وجو با تأخیرِ کوتاه روی کوئری می‌نشیند — هر کلید یک درخواست نه.
  useEffect(() => {
    const t = setTimeout(() => setSearch(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  const searchQ = useQuery({
    queryKey: ["net-swap-search", search],
    queryFn: () => searchProducts(search),
    enabled: search.length >= 1,
    staleTime: 30_000,
  });

  /** بازکردنِ یک فاکتور برای انتخابِ اقلامِ برگشتی‌اش. */
  async function openInvoice(invoiceId: string) {
    if (selectedIds.includes(invoiceId) || busyId) return;
    setBusyId(invoiceId);
    try {
      const data = await getReturnableLines(invoiceId);
      const usable = data.returnable && data.lines.some((l) => l.returnable > 0);
      if (!usable) {
        toast.error("همه‌ی اقلامِ این فاکتور قبلاً برگشت خورده‌اند");
        return;
      }
      setInvData((m) => ({ ...m, [invoiceId]: data }));
      setSelectedIds((ids) => [...ids, invoiceId]);
    } catch {
      toast.error("باز کردن فاکتور برای برگشت ناموفق بود");
    } finally {
      setBusyId(null);
    }
  }

  function closeInvoice(invoiceId: string) {
    setSelectedIds((ids) => ids.filter((id) => id !== invoiceId));
    setInvData((m) => {
      const next = { ...m };
      delete next[invoiceId];
      return next;
    });
    // تعدادهای ثبت‌شده‌ی همین فاکتور هم پاک می‌شوند — دوباره که باز شود از صفر.
    setQtyById((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) if (k.startsWith(`${invoiceId}::`)) delete next[k];
      return next;
    });
    setRestockById((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) if (k.startsWith(`${invoiceId}::`)) delete next[k];
      return next;
    });
  }

  const returnRows: NetReturnRow[] = useMemo(() => {
    const rows: NetReturnRow[] = [];
    for (const id of selectedIds) {
      const d = invData[id];
      if (!d || !d.returnable) continue;
      for (const l of d.lines) {
        if (l.returnable <= 0) continue;
        const key = keyOf(id, l.saleLogId);
        rows.push({
          key,
          invoiceId: id,
          invoiceNumber: d.invoice.number,
          saleLogId: l.saleLogId,
          productId: l.product.id,
          productName: l.product.name,
          unit: l.product.unit ?? "عدد",
          qty: qtyById[key] ?? 0,
          max: l.returnable,
          unitPrice: l.effectiveUnitPrice,
          restock: restockById[key] !== false,
        });
      }
    }
    return rows;
  }, [selectedIds, invData, qtyById, restockById]);

  function setReturnQty(key: string, raw: string, max: number) {
    const n = clampReturnQty(parseNum(raw), max);
    setQtyById((m) => ({ ...m, [key]: n }));
  }

  function addSaleRow(p: {
    id: string;
    name: string;
    unit?: string | null;
    salePrice?: number | null;
    prices?: { salePrice?: number | null }[] | null;
  }) {
    const price =
      p.salePrice ??
      p.prices?.find((x) => x.salePrice)?.salePrice ??
      0;
    setSaleRows((rows) => [
      ...rows,
      {
        key: crypto.randomUUID(),
        productId: p.id,
        productName: p.name,
        unit: p.unit ?? "عدد",
        qty: 1,
        unitPrice: price ?? 0,
      },
    ]);
    setTerm("");
    setSearch("");
    searchRef.current?.focus();
  }

  function pickFirstResult() {
    const first = searchQ.data?.[0];
    if (first) addSaleRow(first);
  }

  const payload = useMemo(
    () => buildNetPayload(returnRows, saleRows),
    [returnRows, saleRows],
  );

  const activeReturns = returnRows.filter((r) => r.qty > 0);

  const submit = useMutation({
    mutationFn: () => {
      if (payload.net < 0) {
        throw new Error(
          "برگشتی از خریدِ نو بیشتر است — خالصِ منفی اینجا ثبت نمی‌شود (مسیرِ مرجوعیِ مستقل)",
        );
      }
      return createNetSale({
        idempotencyKey: crypto.randomUUID(),
        warehouseId,
        customerId: customer!.id,
        refundMethod: method,
        reason: reason.trim(),
        note: note.trim() || undefined,
        returns: payload.returns,
        lines: saleRows.map((l) => ({
          productId: l.productId,
          quantity: l.qty,
          unitPrice: l.unitPrice,
        })),
        payments: [{ method, amount: payload.saleTotal }],
      });
    },
    onSuccess: (res) => {
      toast.success(
        `تعویض ثبت شد — فاکتور ${toFa(res.invoice.number)} با ${toFa(res.returns.length)} سندِ مرجوعی`,
      );
      qc.invalidateQueries({ queryKey: ["pos-recent-invoices"] });
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["net-swap-invoices"] });
      onClose();
    },
    onError: (e) => {
      toast.error(
        e instanceof ApiException ? e.message : (e as Error).message || "ثبت تعویض ناموفق بود",
      );
    },
  });

  /* دلیلِ برگشت اختیاری است — تعویض نباید به تایپِ دلیل گره بخورد. */
  const canSubmit =
    activeReturns.length > 0 &&
    saleRows.length > 0 &&
    payload.net >= 0 &&
    !submit.isPending;

  if (!customer) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && !submit.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRight className="size-4" />
            تعویض — برگشتِ جنسِ قبلی + فروشِ نو
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            مشتری: <span className="font-medium text-foreground">{customer.fullName}</span>
            {" — "}یک ثبتِ اتمیک: یا همهٔ سندها، یا هیچ‌کدام.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* ---------- جنسِ نو ---------- */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Plus className="size-4 text-emerald-600" />
              جنسِ نو — با بارکد یا اسم پیدا کن و Enter بزن
            </h3>
            <div className="relative">
              <Input
                ref={searchRef}
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    pickFirstResult();
                  }
                }}
                placeholder="اسکن بارکد یا جست‌وجوی نام کالا…"
                className="max-w-md"
              />
              {searchQ.data && searchQ.data.length > 0 && search && (
                <ul className="absolute top-11 z-10 max-h-56 w-full max-w-md overflow-y-auto rounded-lg border bg-background shadow-lg">
                  {searchQ.data.slice(0, 8).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addSaleRow(p)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm hover:bg-accent"
                      >
                        <span>
                          {p.name}
                          <span className="mr-2 text-xs text-muted-foreground">{p.sku}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {p.salePrice ? money(p.salePrice) : "بدون قیمت"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {saleRows.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-xs text-muted-foreground">
                    <th className="pb-1 font-normal">کالا</th>
                    <th className="w-24 pb-1 font-normal">تعداد</th>
                    <th className="w-32 pb-1 font-normal">قیمت واحد</th>
                    <th className="w-32 pb-1 font-normal">جمع</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {saleRows.map((row) => (
                    <tr key={row.key}>
                      <td className="py-1.5">{row.productName}</td>
                      <td>
                        <Input
                          inputMode="numeric"
                          className="h-8"
                          value={row.qty > 0 ? toFa(row.qty) : ""}
                          placeholder="۰"
                          onChange={(e) => {
                            const q = Math.max(0, parseNum(e.target.value));
                            setSaleRows((rows) =>
                              rows.map((r) => (r.key === row.key ? { ...r, qty: q } : r)),
                            );
                          }}
                        />
                      </td>
                      <td>
                        <Input
                          inputMode="numeric"
                          className="h-8"
                          value={row.unitPrice > 0 ? toFa(row.unitPrice) : ""}
                          placeholder="۰"
                          onChange={(e) => {
                            const v = parseNum(e.target.value);
                            setSaleRows((rows) =>
                              rows.map((r) => (r.key === row.key ? { ...r, unitPrice: v } : r)),
                            );
                          }}
                        />
                      </td>
                      <td className="py-1.5 pl-2 text-left tabular-nums">
                        {money(row.qty * row.unitPrice)}
                      </td>
                      <td>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          onClick={() =>
                            setSaleRows((rows) => rows.filter((r) => r.key !== row.key))
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ---------- برگشت از فاکتورهایِ قبلی ---------- */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Undo2 className="size-4 text-rose-600" />
              برگشت از فاکتورهایِ قبلیِ همین مشتری
            </h3>

            {invoicesQ.isLoading && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> در حال بارگذاری فاکتورها…
              </p>
            )}

            {!invoicesQ.isLoading && eligible.length === 0 && (
              <p className="rounded-lg border border-rose-600/30 bg-rose-600/5 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
                این مشتری فاکتورِ پرداخت‌شده‌ای برای برگشت ندارد — تعویض یعنی جنسِ
                خریده‌شده برمی‌گردد.
              </p>
            )}

            {eligible.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {eligible.map((inv) => {
                  const open = selectedIds.includes(inv.id);
                  return (
                    <button
                      key={inv.id}
                      type="button"
                      disabled={!!busyId}
                      onClick={() => (open ? closeInvoice(inv.id) : openInvoice(inv.id))}
                      className={
                        "rounded-lg border px-2.5 py-1.5 text-xs transition-colors " +
                        (open
                          ? "border-rose-600/60 bg-rose-600/10 text-rose-700 dark:text-rose-400"
                          : "border-input hover:bg-accent")
                      }
                    >
                      {busyId === inv.id ? (
                        <Loader2 className="inline size-3 animate-spin" />
                      ) : open ? (
                        <>بستن برگشتِ فاکتور {toFa(inv.number)}</>
                      ) : (
                        <>برگشت از فاکتور {toFa(inv.number)}</>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ردیف‌هایِ برگشتیِ هر فاکتورِ باز — انتخاب‌شده‌ها در جمعِ قرمزِ پایین می‌نشینند */}
            {selectedIds.map((id) => {
              const d = invData[id];
              if (!d) return null;
              return (
                <div key={id} className="rounded-lg border border-rose-600/30 bg-rose-600/[0.03] p-2">
                  <p className="mb-1.5 text-xs font-medium text-rose-700 dark:text-rose-400">
                    برگشت از فاکتور {toFa(d.invoice.number)} — برای هر قلم بنویس چندتایش برمی‌گردد
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-xs text-muted-foreground">
                        <th className="pb-1 font-normal">کالا</th>
                        <th className="w-28 pb-1 font-normal">تعداد برگشتی</th>
                        <th className="w-32 pb-1 font-normal">مبلغ برگشت</th>
                        <th className="w-36 pb-1 font-normal">سالم؟</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {d.lines
                        .filter((l) => l.returnable > 0)
                        .map((l) => {
                          const key = keyOf(id, l.saleLogId);
                          const q = qtyById[key] ?? 0;
                          return (
                            <tr key={l.saleLogId} className={q > 0 ? "bg-rose-600/5" : undefined}>
                              <td className="py-1.5">
                                {l.product.name}
                                <span className="mr-1 text-xs text-muted-foreground">
                                  (تا {toFa(l.returnable)} عدد)
                                </span>
                              </td>
                              <td>
                                <Input
                                  inputMode="numeric"
                                  className="h-8"
                                  placeholder="۰"
                                  value={q > 0 ? toFa(q) : ""}
                                  onChange={(e) => setReturnQty(key, e.target.value, l.returnable)}
                                />
                              </td>
                              <td className="py-1.5 pl-2 text-left tabular-nums text-rose-700 dark:text-rose-400">
                                {q > 0 ? money(q * l.effectiveUnitPrice) : "—"}
                              </td>
                              <td>
                                <label className="flex items-center gap-1.5 text-xs">
                                  <Checkbox
                                    checked={restockById[key] !== false}
                                    onCheckedChange={(v) =>
                                      setRestockById((m) => ({ ...m, [key]: v !== false }))
                                    }
                                  />
                                  به انبار برمی‌گردد
                                </label>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </section>

          {/* ---------- دلیل (اختیاری) ---------- */}
          <section className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">دلیل برگشت (اختیاری):</span>
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={
                  "rounded-full border px-3 py-1 text-xs " +
                  (reason === r
                    ? "border-rose-600/60 bg-rose-600/10 text-rose-700 dark:text-rose-400"
                    : "border-input hover:bg-accent")
                }
              >
                {r}
              </button>
            ))}
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reason ? "" : "یا دلیل را خودت بنویس…"}
              className="h-8 max-w-xs"
            />
          </section>
        </div>

        {/* ---------- جمعِ زنده و ثبت ---------- */}
        <div className="mt-2 rounded-xl border bg-muted/40 p-3">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">جمعِ جنسِ نو</p>
              <p className="text-base font-bold tabular-nums">{amount(payload.saleTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                برگشت ({toFa(activeReturns.length)} قلم)
              </p>
              <p className="text-base font-bold tabular-nums text-rose-600 dark:text-rose-400">
                − {amount(payload.refundTotal)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">قابل دریافت از مشتری</p>
              <p
                className={
                  "text-lg font-extrabold tabular-nums " +
                  (payload.net < 0 ? "text-rose-600 dark:text-rose-400" : "")
                }
              >
                {amount(payload.net)}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">پرداختِ جنسِ نو:</span>
              <div className="flex gap-1">
                {(["CASH", "CARD"] as const).map((m) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={method === m ? "default" : "outline"}
                    onClick={() => setMethod(m)}
                  >
                    {m === "CASH" ? (
                      <Banknote className="size-4" />
                    ) : (
                      <CreditCard className="size-4" />
                    )}
                    {m === "CASH" ? "نقد" : "کارت"}
                  </Button>
                ))}
              </div>
              <p className="max-w-md text-xs leading-5 text-muted-foreground">
                فروشِ نو با پرداختِ کامل ثبت می‌شود و برگشتِ {money(payload.refundTotal)} هم{" "}
                {method === "CASH" ? "نقد از صندوق" : "به کارتِ مشتری"} برمی‌گردد — در دستِ شما{" "}
                <span className="font-medium text-foreground">
                  {amount(Math.max(0, payload.net))}
                </span>{" "}
                می‌ماند.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {payload.net < 0 && (
                <p className="max-w-xs text-xs text-rose-600">
                  برگشتی از خریدِ نو بیشتر است — این حالت مسیرِ مستقلِ «مرجوعی» دارد.
                </p>
              )}
              <Button type="button" disabled={!canSubmit} onClick={() => submit.mutate()}>
                {submit.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowLeftRight className="size-4" />
                )}
                ثبت تعویض
              </Button>
            </div>
          </div>

          {!canSubmit && (
            <p className="mt-2 text-xs text-muted-foreground">
              {saleRows.length === 0
                ? "یک کالای نو هم به سبد اضافه کن."
                : activeReturns.length === 0
                  ? "حداقل یک قلم برای برگشت انتخاب کن."
                  : payload.net < 0
                    ? "برگشتی از خریدِ نو بیشتر است."
                    : ""}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
