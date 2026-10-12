"use client";

/**
 * فاکتور خرید — همان پوسته‌ی صندوق فروش.
 *
 * نوار اسکن بالا → پیشنهاد زنده → Enter انتخاب / ساخت فوری کالا → تعداد → قیمت.
 * Enter روی نوار خالی = ثبت فاکتور (مثل تسویهٔ POS).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Search, Send, X } from "lucide-react";
import { toast } from "sonner";

import {
  createProduct,
  createPurchase,
  getProductByBarcode,
  getSuppliers,
  getWarehouses,
  searchProducts,
} from "@/lib/api";
import { WorkerPicker } from "@/app/admin/pos/_components/worker-picker";
import { ApiException } from "@/lib/api-error-messages";
import { faToEn, money, toFa } from "@/lib/format";
import { uuid } from "@/lib/uuid";
import { useAuthStore } from "@/lib/auth-store";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DocumentShell,
  type CommandMap,
} from "@/components/document/document-shell";
import { PurchaseLines, rowNet, type PurchaseRow } from "../_components/purchase-lines";
import { PriceWarningDialog } from "../_components/price-warning-dialog";
import type {
  Product,
  PurchasePriceWarning,
  Supplier,
  SupplierPayMethod,
} from "@/lib/types";
import { SUPPLIER_PAY_METHOD_LABELS } from "@/lib/types";
import { SupplierPickerDialog } from "../_components/supplier-picker-dialog";

const ALLOWED = ["ADMIN", "MANAGER"] as const;

function isoTodayPlusDays(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Math.max(0, days));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function NewPurchasePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const canUse = useAuthStore((s) => s.hasRole)(...ALLOWED);

  const [rows, setRows] = React.useState<PurchaseRow[]>([]);
  const [activeRow, setActiveRow] = React.useState(0);
  const [warehouseId, setWarehouseId] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("");
  const [supplierDialogOpen, setSupplierDialogOpen] = React.useState(false);
  const [supplierRef, setSupplierRef] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [payMethod, setPayMethod] = React.useState<SupplierPayMethod | "">("");
  const [note, setNote] = React.useState("");
  /**
   * null = بعداً بفرست (ثبت فقط موجودی).
   * { anyone | ids } = همراه ثبت، کارِ چیدن برود.
   */
  const [putaway, setPutaway] = React.useState<
    null | { mode: "anyone" } | { mode: "workers"; ids: string[] }
  >(null);
  const [putawayPickerOpen, setPutawayPickerOpen] = React.useState(false);
  const [priceWarnings, setPriceWarnings] = React.useState<PurchasePriceWarning[] | null>(null);
  const [scan, setScan] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [highlight, setHighlight] = React.useState(-1);
  const [liveDismissed, setLiveDismissed] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const idem = React.useRef<string | null>(null);
  const scanRef = React.useRef<HTMLInputElement>(null);

  const warehousesQ = useQuery({ queryKey: ["warehouses"], queryFn: getWarehouses, enabled: canUse });
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: getSuppliers, enabled: canUse });

  React.useEffect(() => {
    const first = warehousesQ.data?.[0]?.id;
    if (first && !warehouseId) setWarehouseId(first);
  }, [warehousesQ.data, warehouseId]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(scan.trim()), 120);
    return () => clearTimeout(t);
  }, [scan]);

  React.useEffect(() => {
    setHighlight(-1);
    setLiveDismissed(false);
  }, [debounced]);

  const searchQ = useQuery({
    queryKey: ["products", "search", "purchase-live", debounced],
    queryFn: () => searchProducts(debounced),
    enabled: debounced.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const results = searchQ.data ?? [];
  const showLive = !liveDismissed && debounced.length >= 2;

  const filled = rows.filter((r) => r.productId && r.quantity > 0);
  const subtotal = filled.reduce((s, r) => s + rowNet(r), 0);
  const supplier = suppliersQ.data?.find((s) => s.id === supplierId);
  const supplierName = supplier?.name;
  const blocked = !warehouseId || !supplierId || filled.length === 0;

  const focusScan = React.useCallback(() => {
    requestAnimationFrame(() => {
      scanRef.current?.focus();
      scanRef.current?.select();
    });
  }, []);

  const focusQty = React.useCallback((rowIndex: number) => {
    requestAnimationFrame(() => {
      const cell = document.querySelector<HTMLInputElement>(`[data-cell="${rowIndex}:0"]`);
      cell?.focus();
      cell?.select();
    });
  }, []);

  const addProduct = React.useCallback(
    (p: Product, opts?: { unitPrice?: number }) => {
      let focusIndex = 0;
      setRows((prev) => {
        const existing = prev.findIndex((r) => r.productId === p.id);
        if (existing >= 0) {
          focusIndex = existing;
          setActiveRow(existing);
          return prev.map((r, i) =>
            i === existing ? { ...r, quantity: r.quantity + 1 } : r,
          );
        }
        focusIndex = prev.length;
        setActiveRow(prev.length);
        return [
          ...prev,
          {
            key: Math.random().toString(36).slice(2),
            productId: p.id,
            productName: p.name,
            unit: p.unit ?? "عدد",
            quantity: 1,
            unitPrice: opts?.unitPrice ?? p.purchasePrice ?? 0,
            discount: 0,
          },
        ];
      });
      setScan("");
      setLiveDismissed(true);
      setHighlight(-1);
      // بعد از افزودن → تعداد همان ردیف (مثل POS).
      requestAnimationFrame(() => focusQty(focusIndex));
    },
    [focusQty],
  );

  /** ساخت فوری کالا با همین نام و افزودن به فاکتور. */
  const createAndAdd = React.useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (trimmed.length < 2 || creating) return;
      setCreating(true);
      try {
        const p = await createProduct({
          name: trimmed,
          unit: "عدد",
          isActive: true,
        } as never);
        void qc.invalidateQueries({ queryKey: ["products"] });
        void qc.invalidateQueries({ queryKey: ["products", "search"] });
        toast.success(`کالای «${p.name}» ثبت شد`);
        addProduct(p);
      } catch (e) {
        toast.error(e instanceof ApiException ? e.message : "ساخت کالا ناموفق بود");
      } finally {
        setCreating(false);
      }
    },
    [addProduct, creating, qc],
  );

  const resolveTyped = React.useCallback(
    async (typed: string) => {
      const q = typed.trim();
      if (!q) return;

      // بارکد؟
      try {
        const byBc = await getProductByBarcode(q);
        addProduct(byBc);
        return;
      } catch {
        /* نام کالاست */
      }

      // هنوز جست‌وجو تمام نشده — صبر تا اشتباه نسازیم
      if (q.length >= 2 && searchQ.isFetching) return;

      // نام دقیق در نتایج → همان کالا
      const exact = results.find(
        (p) => p.name.trim().toLocaleLowerCase() === q.toLocaleLowerCase(),
      );
      if (exact) {
        addProduct(exact);
        return;
      }

      // در کاتالوگ با این نام نیست → همان لحظه بساز (مشابه با ↓ انتخاب می‌شود)
      await createAndAdd(q);
    },
    [addProduct, createAndAdd, results, searchQ.isFetching],
  );

  const save = useMutation({
    mutationFn: (confirmPriceWarnings?: boolean) => {
      if (!idem.current) idem.current = uuid();
      return createPurchase({
        idempotencyKey: idem.current,
        confirmPriceWarnings,
        warehouseId,
        supplierId,
        supplierRef: supplierRef.trim() || undefined,
        invoiceDate: invoiceDate || undefined,
        dueDate: dueDate || undefined,
        payMethod: payMethod || undefined,
        note: note.trim() || undefined,
        sendPutaway: putaway ? true : undefined,
        assignedToIds:
          putaway?.mode === "workers" ? putaway.ids : undefined,
        lines: filled.map((r) => ({
          productId: r.productId!,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          discount: r.discount || undefined,
        })),
      });
    },
    onSuccess: async (p) => {
      setPriceWarnings(null);
      // همان لحظه در فهرست دیده شود — بدون رفرش دستی.
      await qc.invalidateQueries({ queryKey: ["purchases"] });
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
      if (putaway) {
        void qc.invalidateQueries({ queryKey: ["work-tasks"] });
      }
      toast.success(
        putaway
          ? `فاکتور خرید ${toFa(p.number)} ثبت شد و برای چیدن به کارگر ارسال شد`
          : `فاکتور خرید ${toFa(p.number)} ثبت شد`,
      );
      router.push(`/admin/purchases/${p.id}`);
    },
    onError: (e) => {
      idem.current = null;
      if (e instanceof ApiException && e.code === "PRICE_WARNINGS") {
        const list = (e.raw as { warnings?: PurchasePriceWarning[] }).warnings;
        if (list?.length) {
          setPriceWarnings(list);
          return;
        }
      }
      toast.error(e instanceof ApiException ? e.message : "ثبت فاکتور ناموفق بود");
    },
  });

  const trySubmit = React.useCallback(() => {
    if (save.isPending) return;
    if (!warehouseId) {
      toast.error("انبار مقصد را انتخاب کنید");
      return;
    }
    if (!supplierId) {
      toast.error("تأمین‌کننده الزامی است — F4");
      setSupplierDialogOpen(true);
      return;
    }
    if (filled.length === 0) {
      toast.error("حداقل یک قلم وارد کنید");
      return;
    }
    save.mutate(undefined);
  }, [filled.length, save, supplierId, warehouseId]);

  const resetForm = React.useCallback(() => {
    setRows([]);
    setActiveRow(0);
    setScan("");
    setNote("");
    setSupplierRef("");
    setInvoiceDate("");
    idem.current = null;
    focusScan();
  }, [focusScan]);

  const removeRow = (i: number) => {
    setRows((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      setActiveRow(Math.max(0, Math.min(activeRow, next.length - 1)));
      return next;
    });
    focusScan();
  };

  const commands: CommandMap = React.useMemo(
    () => ({
      new: { run: resetForm, label: "فاکتور نو" },
      find: { run: () => router.push("/admin/purchases"), label: "فاکتورهای خرید" },
      addRow: { run: focusScan, label: "افزودن قلم" },
      delRow: rows.length
        ? { run: () => removeRow(activeRow) }
        : { run: () => {}, disabled: true },
      party: {
        run: () => setSupplierDialogOpen(true),
        label: "تأمین‌کننده",
      },
      commit: {
        run: trySubmit,
        label: "ثبت فاکتور",
        disabled: blocked,
        pending: save.isPending,
      },
      void: {
        run: () => router.push("/admin/purchases"),
        label: "انصراف",
      },
    }),
    // removeRow closes over activeRow — keep deps honest
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRow, blocked, focusScan, resetForm, router, rows.length, save.isPending, trySubmit],
  );

  React.useEffect(() => {
    focusScan();
  }, [focusScan]);

  if (!canUse) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        ثبت فاکتور خرید فقط برای مدیر است.
      </div>
    );
  }

  return (
    <div className="relative flex h-[calc(100vh-2.5rem)] flex-col">
      <DocumentShell
        title="فاکتور خرید"
        state="پیش‌نویس"
        commands={commands}
        keysEnabled={!supplierDialogOpen && !priceWarnings}
        status={
          <>
            <span>
              انبار:{" "}
              <b className="text-foreground">
                {warehousesQ.data?.find((w) => w.id === warehouseId)?.name ?? "—"}
              </b>
            </span>
            <span>
              تأمین‌کننده:{" "}
              <b className="text-foreground">{supplierName ?? "انتخاب نشده"}</b>
            </span>
            <span>
              اقلام:{" "}
              <b className="tabular-nums text-foreground">{toFa(filled.length)}</b>
            </span>
          </>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          {/* نوار اسکن — عین POS */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              {creating ? (
                <Loader2 className="absolute start-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" />
              ) : null}
              <Input
                ref={scanRef}
                id="purchase-scan"
                value={scan}
                disabled={creating}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  if (showLive && results.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                    e.preventDefault();
                    e.stopPropagation();
                    setHighlight((h) =>
                      e.key === "ArrowDown"
                        ? Math.min(h + 1, results.length) // +1 برای ردیف «ساخت»
                        : Math.max(h - 1, -1),
                    );
                    return;
                  }
                  if (e.key === "Escape" && showLive) {
                    e.preventDefault();
                    e.stopPropagation();
                    setLiveDismissed(true);
                    setHighlight(-1);
                    return;
                  }
                  if (e.key === "Tab" && rows.length && !showLive) {
                    e.preventDefault();
                    const col = e.shiftKey ? 1 : 0;
                    const cell = document.querySelector<HTMLInputElement>(
                      `[data-cell="${activeRow}:${col}"]`,
                    );
                    cell?.focus();
                    cell?.select();
                    return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();

                  // ردیف «ساخت کالای جدید» آخر لیست
                  if (highlight === results.length && scan.trim().length >= 2) {
                    void createAndAdd(scan);
                    return;
                  }
                  if (highlight >= 0 && results[highlight]) {
                    addProduct(results[highlight]!);
                    return;
                  }

                  const typed = scan.trim();
                  if (!typed) {
                    trySubmit();
                    return;
                  }

                  // عدد کوتاه = تعداد ردیف فعال (مثل POS)
                  const asQty = /^\d{1,4}$/.test(faToEn(typed)) ? Number(faToEn(typed)) : 0;
                  if (asQty > 0 && rows.length) {
                    setRows((prev) =>
                      prev.map((r, i) => (i === activeRow ? { ...r, quantity: asQty } : r)),
                    );
                    setScan("");
                    requestAnimationFrame(() => {
                      const cell = document.querySelector<HTMLInputElement>(
                        `[data-cell="${activeRow}:1"]`,
                      );
                      cell?.focus();
                      cell?.select();
                    });
                    return;
                  }

                  void resolveTyped(typed);
                }}
                placeholder={
                  rows.length
                    ? "نام یا بارکد کالا… Enter خالی = ثبت فاکتور"
                    : "نام کالا را بنویس — اگر نبود همان لحظه ساخته می‌شود…"
                }
                className="h-9 pe-10 text-sm bg-primary/5 border-primary/30 focus-visible:border-primary focus-visible:ring-primary/30"
              />

              {showLive ? (
                <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
                  {searchQ.isFetching && results.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      در حال جست‌وجو…
                    </p>
                  ) : null}

                  {results.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => addProduct(p)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm",
                        i === highlight ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted/50",
                      )}
                    >
                      <span className="min-w-0 truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground" dir="ltr">
                        {p.sku ?? ""}
                        {p.purchasePrice != null ? ` · ${money(p.purchasePrice)}` : ""}
                      </span>
                    </button>
                  ))}

                  {/* همیشه راه ساخت کالا با همین متن */}
                  {debounced.length >= 2 ? (
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(results.length)}
                      onClick={() => void createAndAdd(debounced)}
                      className={cn(
                        "mt-0.5 flex w-full items-center gap-2 rounded-md border-t px-2 py-2 text-start text-sm",
                        highlight === results.length
                          ? "bg-primary/10 ring-1 ring-primary"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <span className="font-semibold text-primary">کالای جدید:</span>
                      <span className="truncate font-medium">{debounced}</span>
                    </button>
                  ) : null}

                  {!searchQ.isFetching && results.length === 0 && debounced.length >= 2 ? (
                    <p className="px-2 pb-2 text-xs text-muted-foreground">
                      در کاتالوگ نیست — Enter بزن تا همین الان ثبت شود
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* تأمین‌کننده — جای چیپ مشتری در POS */}
            <button
              type="button"
              onClick={() => setSupplierDialogOpen(true)}
              className={cn(
                "flex h-9 max-w-[220px] items-center gap-2 rounded-md border px-2.5 text-sm",
                supplierName
                  ? "border-primary/30 bg-primary/5"
                  : "border-dashed text-muted-foreground",
              )}
            >
              <Building2 className="size-4 shrink-0" />
              <span className="min-w-0 truncate">
                {supplierName ?? "تأمین‌کننده * (F4)"}
              </span>
            </button>

            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              aria-label="انبار مقصد"
            >
              {(warehousesQ.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            <div className="w-[148px]">
              <JalaliDateInput value={invoiceDate} onChange={setInvoiceDate} />
            </div>
          </div>

          {!supplierName ? (
            <p className="text-xs font-medium text-destructive">
              تأمین‌کننده الزامی است — F4 را بزن.
            </p>
          ) : null}

          <PurchaseLines
            rows={rows}
            activeRow={activeRow}
            onActivate={setActiveRow}
            onPatch={(i, patch) =>
              setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
            }
            onRemove={removeRow}
          />

          {/* نوار پایین — خلاصه مثل POS */}
          <div className="flex shrink-0 flex-wrap items-end justify-between gap-2 border-t pt-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="rounded border bg-background px-2 py-1">
                <span className="block text-[10px] text-muted-foreground">جمع اقلام</span>
                <b className="block text-sm tabular-nums">{money(subtotal)}</b>
              </div>
              <label className="flex w-36 flex-col gap-1 text-[10px] text-muted-foreground">
                شماره فاکتور فروشنده
                <Input
                  value={supplierRef}
                  onChange={(e) => setSupplierRef(e.target.value)}
                  className="h-7 text-xs"
                  placeholder="اختیاری"
                />
              </label>
              <label className="flex w-40 flex-col gap-1 text-[10px] text-muted-foreground">
                نحوه تسویه
                <select
                  value={payMethod}
                  onChange={(e) =>
                    setPayMethod((e.target.value || "") as SupplierPayMethod | "")
                  }
                  className="h-7 rounded-md border bg-background px-2 text-xs"
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
              </label>
              <label className="flex w-36 flex-col gap-1 text-[10px] text-muted-foreground">
                سررسید پرداخت
                <JalaliDateInput value={dueDate} onChange={setDueDate} />
              </label>
              <label className="flex w-44 flex-col gap-1 text-[10px] text-muted-foreground">
                توضیح روی سند
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-7 text-xs"
                  placeholder="اختیاری"
                  maxLength={300}
                />
              </label>
              <div className="flex h-7 items-center gap-1">
                {putaway ? (
                  <span className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 text-xs font-medium">
                    <Send className="size-3" />
                    {putaway.mode === "anyone"
                      ? "چیدن: هر کارگر آزاد"
                      : `چیدن: ${toFa(putaway.ids.length)} کارگر`}
                    <button
                      type="button"
                      className="ms-1 rounded p-0.5 hover:bg-muted"
                      title="لغو ارسال همراه ثبت"
                      onClick={() => setPutaway(null)}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-xs text-muted-foreground hover:text-foreground"
                    title="همراه ثبت بفرستید؛ یا بعداً از جزئیات فاکتور"
                    onClick={() => setPutawayPickerOpen(true)}
                  >
                    <Send className="size-3" />
                    ارسال به کارگر برای چیدن
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="text-end">
                <div className="text-[10px] text-muted-foreground">قابل پرداخت</div>
                <div className="text-2xl font-bold tabular-nums">{money(subtotal)}</div>
              </div>
              <button
                type="button"
                disabled={blocked || save.isPending}
                onClick={trySubmit}
                className="h-10 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {save.isPending ? "…" : "ثبت فاکتور"}
                <kbd className="ms-2 rounded border border-primary-foreground/30 px-1.5 text-[11px] font-normal">
                  F2
                </kbd>
              </button>
            </div>
          </div>
        </div>
      </DocumentShell>

      <PriceWarningDialog
        warnings={priceWarnings}
        pending={save.isPending}
        onCancel={() => setPriceWarnings(null)}
        onConfirm={() => save.mutate(true)}
      />
      <SupplierPickerDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        suppliers={suppliersQ.data ?? []}
        selectedId={supplierId}
        onSelect={(s: Supplier) => {
          setSupplierId(s.id);
          if (s.preferredPayMethod) setPayMethod(s.preferredPayMethod);
          if (typeof s.creditDays === "number") {
            setDueDate(isoTodayPlusDays(s.creditDays));
          }
          focusScan();
        }}
      />
      <WorkerPicker
        open={putawayPickerOpen}
        itemCount={filled.length}
        pending={false}
        title="انتخاب کارگر برای چیدن"
        onPick={(ids) => {
          setPutaway(ids.length ? { mode: "workers", ids } : { mode: "anyone" });
          setPutawayPickerOpen(false);
        }}
        onClose={() => setPutawayPickerOpen(false)}
      />
    </div>
  );
}
