"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiException } from "@/lib/api-error-messages";
import { Trash2, Send, User, Percent, CreditCard, Search, FileClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createInvoice,
  createPickTasks,
  createQuotation,
  getProductStock,
  getWarehouses,
  resolveForSale,
} from "@/lib/api";
import { money, parseNum, qty, toFa, toman } from "@/lib/format";
import type {
  Customer,
  InsufficientStockError,
  PaymentInput,
  Product,
  StockLocation,
} from "@/lib/types";

import { LocationPicker } from "./_components/location-picker";
import { CustomerPicker } from "./_components/customer-picker";
import { PaymentDialog } from "./_components/payment-dialog";
import { ProductSearch } from "./_components/product-search";
import { QuotationDialog } from "./_components/quotation-dialog";

/** حداقل چیزی که برای افزودن یک ردیف لازم است — هم از resolve می‌آید هم از جست‌وجو. */
type PickableProduct = {
  id: string;
  name: string;
  unit?: string | null;
  salePrice?: number | null;
};

interface Line {
  key: string;
  productId: string;
  productName: string;
  unit: string;
  locationId: string;
  locationPath: string;
  available: number;
  quantity: number;
  unitPrice: number;
}

/** برچسب میانبر روی خود دکمه — این چیزی است که سرعت را می‌سازد. */
function Key({ children }: { children: string }) {
  return (
    <kbd className="ms-2 rounded border bg-background/20 px-1.5 py-0.5 text-[11px] font-normal">
      {children}
    </kbd>
  );
}

export default function PosPage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [warehouseId, setWarehouseId] = useState("");
  const [scan, setScan] = useState("");
  const [activeRow, setActiveRow] = useState(0);
  const [errorLine, setErrorLine] = useState<number | null>(null);

  /** کالایی که منتظر انتخاب مکان است — خود کالا هم نگه داشته می‌شود، نه فقط نامش. */
  const [pickerStock, setPickerStock] = useState<{
    name: string;
    product: PickableProduct;
    stock: StockLocation[];
  } | null>(null);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showQuotation, setShowQuotation] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);

  /**
   * کلید یکتای ثبت.
   *
   * وقتی تولید می‌شود که کاربر «ثبت» بزند، و **تا موفق شدن عوض نمی‌شود**.
   * اگر شبکه قطع شود و کاربر دوباره بزند، همان کلید می‌رود و سرور فاکتور
   * تکراری نمی‌سازد. اما اگر محتوای سبد عوض شود، دیگر همان فاکتور نیست،
   * پس کلید باطل می‌شود.
   */
  const idemRef = useRef<string | null>(null);
  const invalidateIdem = () => { idemRef.current = null; };

  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: getWarehouses });

  useEffect(() => {
    if (!warehouseId && warehouses.data?.length) setWarehouseId(warehouses.data[0].id);
  }, [warehouses.data, warehouseId]);

  const focusScan = useCallback(() => {
    // با تأخیر یک فریم، تا بعد از بسته‌شدن دیالوگ اجرا شود.
    requestAnimationFrame(() => scanRef.current?.focus());
  }, []);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    [lines]
  );
  const total = Math.max(0, subtotal - invoiceDiscount);

  // ---------- افزودن ردیف ----------

  const addLine = useCallback(
    (p: PickableProduct, s: StockLocation) => {
      invalidateIdem();
      setErrorLine(null);

      setLines((prev) => {
        // یک کالا از یک مکان نباید دو ردیف جدا بگیرد — سرور هم ردش می‌کند.
        const i = prev.findIndex(
          (l) => l.productId === p.id && l.locationId === s.locationId
        );

        if (i >= 0) {
          const next = [...prev];
          const q = Math.min(next[i].quantity + 1, s.quantity);
          if (q === next[i].quantity) {
            toast.warning(`بیش از موجودی این مکان نمی‌شود (${qty(s.quantity)})`);
          }
          next[i] = { ...next[i], quantity: q };
          setActiveRow(i);
          return next;
        }

        setActiveRow(prev.length);
        return [
          ...prev,
          {
            key: crypto.randomUUID(),
            productId: p.id,
            productName: p.name,
            unit: p.unit ?? "عدد",
            locationId: s.locationId,
            locationPath: s.locationPath || s.locationName,
            available: s.quantity,
            quantity: 1,
            unitPrice: p.salePrice ?? 0,
          },
        ];
      });

      focusScan();
    },
    [focusScan]
  );

  /** بارکد → کالا + مکان‌ها در یک درخواست. */
  const onScan = useMutation({
    mutationFn: (barcode: string) => resolveForSale(barcode),
    onSuccess: (res) => {
      setScan("");
      if (!res.stock?.length) {
        toast.error(`«${res.product.name}» در هیچ مکانی موجودی ندارد`);
        focusScan();
        return;
      }
      if (res.stock.length === 1) addLine(res.product, res.stock[0]);
      else setPickerStock({ name: res.product.name, product: res.product, stock: res.stock });
    },
    onError: () => {
      toast.error("کالایی با این بارکد پیدا نشد");
      setScan("");
      focusScan();
    },
  });

  /** انتخاب از جست‌وجو → گرفتن مکان‌های موجودی‌دار. */
  const pickProduct = useMutation({
    mutationFn: async (p: Product) => ({ p, stock: await getProductStock(p.id) }),
    onSuccess: ({ p, stock }) => {
      setShowSearch(false);
      if (!stock.length) {
        toast.error(`«${p.name}» در هیچ مکانی موجودی ندارد`);
        focusScan();
        return;
      }
      if (stock.length === 1) addLine(p, stock[0]);
      else setPickerStock({ name: p.name, product: p, stock });
    },
  });

  // ---------- ویرایش ردیف ----------

  const patchLine = (i: number, p: Partial<Line>) => {
    invalidateIdem();
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...p } : l)));
  };

  const removeLine = (i: number) => {
    invalidateIdem();
    setErrorLine(null);
    setLines((prev) => prev.filter((_, j) => j !== i));
    setActiveRow((r) => Math.max(0, Math.min(r, lines.length - 2)));
  };

  // ---------- ثبت ----------

  const submit = useMutation({
    mutationFn: (payments?: PaymentInput[]) => {
      if (!idemRef.current) idemRef.current = crypto.randomUUID();
      return createInvoice({
        idempotencyKey: idemRef.current,
        warehouseId,
        customerId: customer?.id ?? null,
        discount: invoiceDiscount || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          locationId: l.locationId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        payments,
      });
    },
    onSuccess: (inv) => {
      toast.success(`فاکتور ${toFa(inv.number)} ثبت شد — ${toman(inv.total)}`);
      setLines([]);
      setCustomer(null);
      setInvoiceDiscount(0);
      setErrorLine(null);
      setShowPayment(false);
      idemRef.current = null;
      focusScan();
    },
    onError: (e: unknown) => {
      // ApiException فیلد raw دارد، نه body — خواندن اشتباه یعنی این شاخه
      // هیچ‌وقت اجرا نمی‌شود و ردیف خطادار قرمز نمی‌شود.
      const err = e instanceof ApiException ? e : null;
      const code = err?.code;

      if (code === "INSUFFICIENT_STOCK") {
        const d = err!.raw as unknown as InsufficientStockError;
        setErrorLine(d.lineIndex);
        setLines((prev) =>
          prev.map((l, j) => (j === d.lineIndex ? { ...l, available: d.available } : l))
        );
        toast.error(
          `ردیف ${toFa(d.lineIndex + 1)}: موجودی کافی نیست — فقط ${qty(d.available)} موجود است`
        );
        // سبد باید عوض شود، پس این دیگر همان فاکتور نیست.
        invalidateIdem();
        setShowPayment(false);
        return;
      }

      if (code) {
        toast.error(err?.message ?? "ثبت فاکتور ناموفق بود");
        invalidateIdem();
        setShowPayment(false);
        return;
      }

      // خطای شبکه/سرور — کلید نگه داشته می‌شود تا تلاش دوباره تکراری نسازد.
      toast.error("ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
    },
  });

  /**
   * F8 — همین سبد را به‌عنوان پیش‌فاکتور ثبت کن.
   * موجودی دست نمی‌خورد؛ فقط قیمت برای مدت مشخصی نگه داشته می‌شود.
   */
  const saveQuotation = useMutation({
    mutationFn: (validForMinutes: number) =>
      createQuotation({
        warehouseId,
        customerId: customer?.id ?? null,
        discount: invoiceDiscount || undefined,
        validForMinutes,
        lines: lines.map((l) => ({
          productId: l.productId,
          locationId: l.locationId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      }),
    onSuccess: (q) => {
      toast.success(`پیش‌فاکتور ${toFa(q.number)} ثبت شد — ${toman(q.total)}`);
      setLines([]);
      setCustomer(null);
      setInvoiceDiscount(0);
      setShowQuotation(false);
      invalidateIdem();
      focusScan();
    },
    onError: () => toast.error("ثبت پیش‌فاکتور ناموفق بود"),
  });


  /** F9 — ارسال لوکیشن ردیف‌ها به گوشی کارگر. */
  const sendToWorker = useMutation({
    mutationFn: () =>
      createPickTasks({
        warehouseId,
        lines: lines.map((l) => ({
          productId: l.productId,
          locationId: l.locationId,
          quantity: l.quantity,
        })),
      }),
    onSuccess: (tasks) => {
      toast.success(`${toFa(tasks.length)} کالا برای کارگر انبار فرستاده شد`);
      focusScan();
    },
    onError: () => toast.error("ارسال به کارگر ناموفق بود"),
  });

  // ---------- میانبرها ----------

  const anyDialogOpen =
    !!pickerStock || showCustomer || showPayment || showSearch || showQuotation;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPickerStock(null);
        setShowCustomer(false);
        setShowPayment(false);
        setShowSearch(false);
        setShowQuotation(false);
        focusScan();
        return;
      }

      if (anyDialogOpen) return;

      switch (e.key) {
        case "F2":
          e.preventDefault();
          if (lines.length && !submit.isPending) submit.mutate(undefined);
          break;
        case "F3":
          e.preventDefault();
          setShowSearch(true);
          break;
        case "F4":
          e.preventDefault();
          setShowCustomer(true);
          break;
        case "F6":
          e.preventDefault();
          document.getElementById("invoice-discount")?.focus();
          break;
        case "F7":
          e.preventDefault();
          if (lines.length) setShowPayment(true);
          break;
        case "F8":
          e.preventDefault();
          if (lines.length) setShowQuotation(true);
          break;
        case "F9":
          e.preventDefault();
          if (lines.length && !sendToWorker.isPending) sendToWorker.mutate();
          break;
        case "ArrowDown":
          if (lines.length) {
            e.preventDefault();
            setActiveRow((r) => Math.min(r + 1, lines.length - 1));
          }
          break;
        case "ArrowUp":
          if (lines.length) {
            e.preventDefault();
            setActiveRow((r) => Math.max(r - 1, 0));
          }
          break;
        case "Delete":
          if (lines.length && document.activeElement === scanRef.current) {
            e.preventDefault();
            removeLine(activeRow);
          }
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, activeRow, anyDialogOpen, submit.isPending, sendToWorker.isPending]);

  useEffect(() => { focusScan(); }, [focusScan]);

  // ---------- نما ----------

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-3 p-4">
      {/* نوار اسکن — همیشه فوکوس دارد */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={scanRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && scan.trim()) {
                e.preventDefault();
                onScan.mutate(scan.trim());
              }
            }}
            placeholder="بارکد کالا را اسکن کنید…"
            className="h-11 pe-10 text-base"
          />
        </div>

        <select
          value={warehouseId}
          onChange={(e) => { setWarehouseId(e.target.value); invalidateIdem(); }}
          className="h-11 rounded-md border bg-background px-3 text-sm"
        >
          {warehouses.data?.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>

        <Button variant="outline" className="h-11" onClick={() => setShowSearch(true)}>
          جست‌وجوی کالا <Key>F3</Key>
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ردیف‌های فاکتور */}
        <div className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card">
          {lines.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <p className="text-muted-foreground">
                برای شروع، بارکد کالا را اسکن کنید
              </p>
              <p className="text-sm text-muted-foreground">
                یا با <kbd className="rounded border px-1.5 py-0.5 text-xs">F3</kbd> جست‌وجو کنید
              </p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                  <tr className="text-muted-foreground">
                    <th className="p-2 text-start font-medium">کالا</th>
                    <th className="w-28 p-2 text-start font-medium">تعداد</th>
                    <th className="w-36 p-2 text-start font-medium">قیمت واحد</th>
                    <th className="w-32 p-2 text-start font-medium">جمع</th>
                    <th className="w-10 p-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr
                      key={l.key}
                      onClick={() => setActiveRow(i)}
                      className={`border-t border-e-2 transition-colors ${
                        errorLine === i
                          ? "border-e-destructive bg-destructive/10"
                          : activeRow === i
                            ? "border-e-primary bg-primary/5"
                            : "border-e-transparent"
                      }`}
                    >
                      <td className="p-2">
                        <div className="truncate font-medium">{l.productName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {l.locationPath} · موجودی {qty(l.available)}
                          {errorLine === i && (
                            <span className="ms-2 text-destructive">موجودی کافی نیست</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <Input
                          dir="ltr"
                          className="h-9 text-left tabular-nums"
                          value={toFa(l.quantity)}
                          onChange={(e) => {
                            const v = Math.max(1, parseNum(e.target.value));
                            patchLine(i, { quantity: v });
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          dir="ltr"
                          className="h-9 text-left tabular-nums"
                          value={l.unitPrice ? money(l.unitPrice) : ""}
                          onChange={(e) => patchLine(i, { unitPrice: parseNum(e.target.value) })}
                        />
                      </td>
                      <td className="p-2 tabular-nums">{money(l.quantity * l.unitPrice)}</td>
                      <td className="p-2">
                        <Button variant="ghost" size="icon" onClick={() => removeLine(i)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ستون مشتری و جمع */}
        <div className="flex w-80 shrink-0 flex-col gap-3">
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">مشتری</span>
              <Button variant="ghost" size="sm" onClick={() => setShowCustomer(true)}>
                <User className="size-4" /> <Key>F4</Key>
              </Button>
            </div>

            {customer ? (
              <div>
                <p className="font-medium">{customer.fullName}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {customer.phones?.[0]?.phone ? toFa(customer.phones[0].phone) : "بدون شماره"}
                </p>
                {!!customer.summary?.totalDue && (
                  <p className="mt-1 text-xs text-amber-600">
                    بدهی قبلی: {toman(customer.summary.totalDue)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">فروش نقدی گذری</p>
            )}
          </div>

          <div className="rounded-lg border bg-card p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">جمع اقلام</span>
              <span className="tabular-nums">{money(subtotal)}</span>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Percent className="size-3.5" /> تخفیف <Key>F6</Key>
              </span>
              <Input
                id="invoice-discount"
                dir="ltr"
                className="h-9 w-32 text-left tabular-nums"
                value={invoiceDiscount ? money(invoiceDiscount) : ""}
                onChange={(e) => {
                  invalidateIdem();
                  setInvoiceDiscount(Math.min(parseNum(e.target.value), subtotal));
                }}
              />
            </div>

            <div className="mt-3 flex items-baseline justify-between border-t pt-3">
              <span className="font-semibold">مبلغ نهایی</span>
              <span className="text-xl font-bold tabular-nums">{money(total)}</span>
            </div>
            <p className="text-end text-xs text-muted-foreground">تومان</p>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <Button
              variant="outline"
              className="h-11 justify-between"
              disabled={!lines.length || sendToWorker.isPending}
              onClick={() => sendToWorker.mutate()}
            >
              <span className="flex items-center gap-2">
                <Send className="size-4" />
                {sendToWorker.isPending ? "در حال ارسال…" : "ارسال به کارگر"}
              </span>
              <Key>F9</Key>
            </Button>

            <Button
              variant="outline"
              className="h-11 justify-between"
              disabled={!lines.length || saveQuotation.isPending}
              onClick={() => setShowQuotation(true)}
            >
              <span className="flex items-center gap-2">
                <FileClock className="size-4" /> پیش‌فاکتور
              </span>
              <Key>F8</Key>
            </Button>

            <Button
              variant="outline"
              className="h-11 justify-between"
              disabled={!lines.length}
              onClick={() => setShowPayment(true)}
            >
              <span className="flex items-center gap-2">
                <CreditCard className="size-4" /> پرداخت
              </span>
              <Key>F7</Key>
            </Button>

            <Button
              className="h-14 justify-between text-base"
              disabled={!lines.length || submit.isPending}
              onClick={() => submit.mutate(undefined)}
            >
              <span>{submit.isPending ? "در حال ثبت…" : "ثبت فاکتور نقدی"}</span>
              <Key>F2</Key>
            </Button>
          </div>
        </div>
      </div>

      {/* دیالوگ‌ها */}
      <LocationPicker
        open={!!pickerStock}
        productName={pickerStock?.name ?? ""}
        stock={pickerStock?.stock ?? []}
        onPick={(s) => {
          const p = pickerStock?.product;
          setPickerStock(null);
          if (p) addLine(p, s);
        }}
        onClose={() => { setPickerStock(null); focusScan(); }}
      />

      <CustomerPicker
        open={showCustomer}
        onPick={(c) => { setCustomer(c); setShowCustomer(false); invalidateIdem(); focusScan(); }}
        onClose={() => { setShowCustomer(false); focusScan(); }}
      />

      <ProductSearch
        open={showSearch}
        onPick={(p) => pickProduct.mutate(p)}
        onClose={() => { setShowSearch(false); focusScan(); }}
      />

      <QuotationDialog
        open={showQuotation}
        total={total}
        lineCount={lines.length}
        customerName={customer?.fullName ?? null}
        pending={saveQuotation.isPending}
        onConfirm={(m) => saveQuotation.mutate(m)}
        onClose={() => { setShowQuotation(false); focusScan(); }}
      />

      <PaymentDialog
        open={showPayment}
        total={total}
        hasCustomer={!!customer}
        onConfirm={(payments) => submit.mutate(payments)}
        onClose={() => { setShowPayment(false); focusScan(); }}
      />
    </div>
  );
}
