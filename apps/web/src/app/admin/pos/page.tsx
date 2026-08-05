"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiException } from "@/lib/api-error-messages";
import {
  Trash2, Send, User, Percent, CreditCard, Search, FileClock, ReceiptText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createInvoice,
  createPickTasks,
  createQuotation,
  getWarehouses,
  resolveForSale,
} from "@/lib/api";
import { money, parseNum, qty, toFa, toman } from "@/lib/format";
import type {
  Customer,
  InsufficientStockError,
  LocateResult,
  PaymentInput,
  StockLocation,
} from "@/lib/types";

import { LocationPicker } from "./_components/location-picker";
import { CheckoutFlow } from "./_components/checkout-flow";
import { CustomerPicker } from "./_components/customer-picker";
import { DiscountField } from "./_components/discount-input";
import {
  LineItems,
  lineDiscount,
  lineGross,
  lineNet,
  type PosLine,
} from "./_components/line-items";
import { PaymentDialog } from "./_components/payment-dialog";
import { ProductSearch } from "./_components/product-search";
import { QuotationDialog } from "./_components/quotation-dialog";
import { RecentInvoices } from "./_components/recent-invoices";
import { WorkerPicker } from "./_components/worker-picker";
import {
  NO_DISCOUNT,
  discountToToman,
  tomanToPercent,
  type DiscountInput as DiscountValue,
} from "./_lib/discount";

/** حداقل چیزی که برای افزودن یک ردیف لازم است — هم از resolve می‌آید هم از جست‌وجو. */
type PickableProduct = {
  id: string;
  name: string;
  unit?: string | null;
  salePrice?: number | null;
};

/** ردیف سبد — تعریف و ریاضی‌اش کنار خود جدول است تا یک منبع حقیقت باشد. */
type Line = PosLine;

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
  const [invoiceDiscountInput, setInvoiceDiscountInput] =
    useState<DiscountValue>(NO_DISCOUNT);
  const [note, setNote] = useState("");
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
  /** متنی که در نوار بالا زده شده و باید به جست‌وجو منتقل شود. */
  const [searchSeed, setSearchSeed] = useState("");
  const [showQuotation, setShowQuotation] = useState(false);
  const [showWorkerPicker, setShowWorkerPicker] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  /** تعداد اقلامی که همین الان قرار است به کارگر برود (سبد کامل یا یک کالای جست‌وجو). */
  const [workerItemCount, setWorkerItemCount] = useState(0);

  const scanRef = useRef<HTMLInputElement>(null);
  /**
   * ردیف‌هایی که «ارسال به کارگر» می‌فرستد. یا کل سبد است (F9) یا یک کالای واحد
   * از نتیجه‌ی جست‌وجو. جدا از mutationFn نگه داشته می‌شود چون آن فقط id کارگر می‌گیرد.
   */
  const workerLinesRef = useRef<
    { productId: string; locationId?: string; quantity: number }[]
  >([]);

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

  /*
   * ترتیب دقیقاً مثل سرور: اول تخفیف هر ردیف، بعد تخفیف کل فاکتور روی حاصل.
   * (به `_lib/discount.ts` نگاه کن.) هر انحرافی اینجا یعنی عددِ روی صفحه با
   * عددِ ثبت‌شده فرق کند.
   */
  const grossSubtotal = useMemo(
    () => lines.reduce((s, l) => s + lineGross(l), 0),
    [lines]
  );
  /** جمع تخفیف‌های ردیفی — فقط برای نمایش. */
  const linesDiscountTotal = useMemo(
    () => lines.reduce((s, l) => s + lineDiscount(l), 0),
    [lines]
  );
  /** همان چیزی که سرور subtotal صدایش می‌کند: جمع ردیف‌ها **پس از** تخفیف ردیفی. */
  const subtotal = grossSubtotal - linesDiscountTotal;
  const invoiceDiscount = discountToToman(invoiceDiscountInput, subtotal);
  const total = Math.max(0, subtotal - invoiceDiscount);
  /** تخفیف کل (ردیفی + فاکتوری) و درصد مؤثرش نسبت به مبلغ خام. */
  const totalDiscount = linesDiscountTotal + invoiceDiscount;
  const effectivePercent = tomanToPercent(totalDiscount, grossSubtotal);

  /**
   * ردیف‌های بی‌قیمت.
   *
   * تقریباً هیچ کالایی در دیتابیس ProductPrice ندارد، پس اگر جلویش گرفته نشود
   * فروشنده به‌راحتی یک فاکتورِ صفر تومانی ثبت می‌کند و تازه بعداً می‌فهمد.
   */
  const zeroPriceCount = useMemo(
    () => lines.filter((l) => l.unitPrice <= 0).length,
    [lines]
  );
  const canCheckout = lines.length > 0 && zeroPriceCount === 0;

  /** رفتن به تسویه — از Enterِ خانه‌ی خالیِ اسکن یا F2. */
  const startCheckout = useCallback(() => {
    if (!lines.length) return;
    if (zeroPriceCount > 0) {
      toast.error(
        `${toFa(zeroPriceCount)} ردیف قیمت ندارد — قبل از ثبت قیمتشان را وارد کنید`
      );
      return;
    }
    setShowCheckout(true);
  }, [lines.length, zeroPriceCount]);

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
          // کالای ثبت‌نشده قفسه ندارد و موجودی‌اش نامعلوم است — سقف روی آن
          // بی‌معنی است، وگرنه تعداد روی صفر قفل می‌شود.
          const unregistered = !s.locationId;
          const q = unregistered
            ? next[i].quantity + 1
            : Math.min(next[i].quantity + 1, s.quantity);
          if (!unregistered && q === next[i].quantity) {
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
            discount: NO_DISCOUNT,
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
    onError: (_e, barcode) => {
      /*
       * چیزی که تایپ شده بارکد نبوده — احتمالاً اسم کالاست.
       * به‌جای خطا، همان متن را به جست‌وجو می‌بریم. فروشنده یک فیلد دارد، نه دو
       * تا: هرچه می‌داند را می‌زند و Enter.
       */
      setSearchSeed(barcode);
      setShowSearch(true);
      setScan("");
    },
  });

  /**
   * انتخاب از جست‌وجوی زنده → افزودن مستقیم به سبد.
   *
   * موجودی و مکان‌ها همراهِ نتیجه آمده‌اند (endpoint ترکیبی)، پس دیگر رفت‌وبرگشتِ
   * جدا برای گرفتن موجودی لازم نیست.
   */
  const addFromLocate = useCallback(
    (r: LocateResult) => {
      setShowSearch(false);

      /*
       * کالای بدون موجودیِ ثبت‌شده هم فروخته می‌شود.
       *
       * در دوره‌ی راه‌اندازی جنس در انبار هست ولی هنوز وارد نرم‌افزار نشده، پس
       * عددِ صفرِ سیستم غلط است نه واقعیت. ردیف بدون قفسه ثبت می‌شود و سرور آن
       * را روی مکان سیستمیِ «موجودی ثبت‌نشده» می‌نشاند.
       */
      if (r.totalStock <= 0 || r.locations.length === 0) {
        addLine(
          { id: r.id, name: r.name, unit: r.unit, salePrice: r.salePrice },
          {
            locationId: "",
            locationName: "",
            locationCode: "",
            locationBarcode: "",
            locationPath: "",
            // موجودی نامعلوم است، نه بی‌نهایت. عددِ ساختگی همان چیزی بود که
            // «موجودی ۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۱» را روی صفحه می‌آورد.
            quantity: 0,
          }
        );
        toast.warning(`«${r.name}» در سیستم ثبت نشده — بدون قفسه ثبت می‌شود`);
        return;
      }
      const product: PickableProduct = {
        id: r.id,
        name: r.name,
        unit: r.unit,
        salePrice: r.salePrice,
      };
      const stock: StockLocation[] = r.locations.map((l) => ({
        locationId: l.locationId,
        locationName: l.name,
        locationCode: l.code,
        locationBarcode: "",
        locationPath: l.path,
        quantity: l.quantity,
      }));
      if (stock.length === 1) addLine(product, stock[0]);
      else setPickerStock({ name: r.name, product, stock });
    },
    [addLine, focusScan]
  );

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
        note: note.trim() || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          // قفسه‌ی خالی یعنی «کالا هنوز ثبت نشده» — سرور خودش مکان سیستمی را
          // انتخاب می‌کند. فرستادن رشته‌ی تهی خطای اعتبارسنجی می‌دهد.
          locationId: l.locationId || undefined,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          // درصد فقط در UI زندگی می‌کند؛ سرور تومان می‌گیرد.
          discount: lineDiscount(l) || undefined,
        })),
        payments,
      });
    },
    onSuccess: (inv) => {
      toast.success(`فاکتور ${toFa(inv.number)} ثبت شد — ${toman(inv.total)}`, {
        action: {
          label: "چاپ فاکتور",
          // پنجره‌ی جدا، تا سبدِ خالی‌شده و فوکوسِ اسکن سر جایشان بمانند.
          onClick: () => window.open(`/admin/print/invoice/${inv.id}`, "_blank"),
        },
        duration: 8000,
      });
      setLines([]);
      setCustomer(null);
      setInvoiceDiscountInput(NO_DISCOUNT);
      setNote("");
      setErrorLine(null);
      setShowPayment(false);
      setShowCheckout(false);
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
        // برگرد به سبد تا فروشنده همان ردیفِ قرمز را ببیند.
        setShowCheckout(false);
        return;
      }

      if (code) {
        toast.error(err?.message ?? "ثبت فاکتور ناموفق بود");
        invalidateIdem();
        setShowPayment(false);
        setShowCheckout(false);
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
        note: note.trim() || undefined,
        validForMinutes,
        lines: lines.map((l) => ({
          productId: l.productId,
          locationId: l.locationId || undefined,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: lineDiscount(l) || undefined,
        })),
      }),
    onSuccess: (q) => {
      toast.success(`پیش‌فاکتور ${toFa(q.number)} ثبت شد — ${toman(q.total)}`);
      setLines([]);
      setCustomer(null);
      setInvoiceDiscountInput(NO_DISCOUNT);
      setNote("");
      setShowQuotation(false);
      invalidateIdem();
      focusScan();
    },
    onError: () => toast.error("ثبت پیش‌فاکتور ناموفق بود"),
  });


  /** ارسال لوکیشن ردیف‌ها به گوشی کارگر (به یک کارگر مشخص یا همه) + پیام اختیاری. */
  const sendToWorker = useMutation({
    mutationFn: (args: { assignedToId: string | null; note?: string }) =>
      createPickTasks({
        warehouseId,
        assignedToId: args.assignedToId,
        lines: workerLinesRef.current.map((l) => ({
          ...l,
          note: args.note?.trim() || undefined,
        })),
      }),
    onSuccess: (tasks) => {
      toast.success(`${toFa(tasks.length)} کالا برای کارگر فرستاده شد`);
      setShowWorkerPicker(false);
      focusScan();
    },
    onError: () => toast.error("ارسال به کارگر ناموفق بود"),
  });

  /** F9 — کل سبد را برای کارگر بفرست. */
  const openWorkerForCart = useCallback(() => {
    if (!lines.length) return;
    /*
     * اقلام ثبت‌نشده هم فرستاده می‌شوند.
     *
     * قبلاً کنار گذاشته می‌شدند چون «قفسه ندارند پس کارگر جایی برای رفتن ندارد».
     * ولی جنس فیزیکاً در انبار هست و فقط در نرم‌افزار ثبت نشده — کارگر انبار را
     * می‌شناسد و پیدایش می‌کند. کارِ برداشت بدون آدرس هم می‌گوید «این را بیاور».
     */
    workerLinesRef.current = lines.map((l) => ({
      productId: l.productId,
      locationId: l.locationId || undefined,
      quantity: l.quantity,
    }));
    setWorkerItemCount(lines.length);
    setShowWorkerPicker(true);
  }, [lines]);

  /** از نتیجه‌ی جست‌وجو → همان یک کالا را (از پرموجودی‌ترین مکان) برای کارگر بفرست. */
  const openWorkerForResult = useCallback(
    (r: LocateResult) => {
      setShowSearch(false);
      // بدون موجودی ثبت‌شده هم می‌رود: کارگر خودش در انبار پیدایش می‌کند.
      workerLinesRef.current = [
        {
          productId: r.id,
          locationId: r.locations[0]?.locationId,
          quantity: 1,
        },
      ];
      setWorkerItemCount(1);
      setShowWorkerPicker(true);
    },
    []
  );

  // ---------- میانبرها ----------

  const anyDialogOpen =
    !!pickerStock || showCustomer || showPayment || showSearch || showQuotation ||
    showWorkerPicker || showRecent || showCheckout;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPickerStock(null);
        setShowCustomer(false);
        setShowPayment(false);
        setShowSearch(false);
        setShowQuotation(false);
        setShowWorkerPicker(false);
        setShowRecent(false);
        // CheckoutFlow خودش Esc را مدیریت می‌کند (گام دوم → گام اول)، پس اینجا
        // بسته نمی‌شود؛ وگرنه یک Esc کل تسویه را می‌بندد.
        focusScan();
        return;
      }

      if (anyDialogOpen) return;

      switch (e.key) {
        case "F2":
          e.preventDefault();
          if (!submit.isPending) startCheckout();
          break;
        case "F3":
          e.preventDefault();
          setSearchSeed("");
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
          openWorkerForCart();
          break;
        case "F10":
          e.preventDefault();
          setShowRecent(true);
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
              if (e.key !== "Enter") return;
              e.preventDefault();
              // بارکد در خانه → کالا را اضافه کن و منتظر بعدی بمان.
              if (scan.trim()) {
                onScan.mutate(scan.trim());
                return;
              }
              // خانه خالی و سبد پُر → یعنی «تمام شد، برو تسویه».
              startCheckout();
            }}
            placeholder={
              lines.length
                ? "بارکد یا نام کالا… یا Enter برای تسویه"
                : "بارکد را اسکن کنید یا نام کالا را بنویسید…"
            }
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

        <Button variant="outline" className="h-11" onClick={() => setShowRecent(true)}>
          <ReceiptText className="size-4" />
          فاکتورهای امروز <Key>F10</Key>
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ردیف‌های فاکتور */}
        <div className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card">
          <LineItems
            lines={lines}
            activeRow={activeRow}
            errorLine={errorLine}
            onActivate={setActiveRow}
            onPatch={patchLine}
            onRemove={removeLine}
          />
        </div>

        {/*
          ستون مشتری و جمع.
          کارت‌ها اسکرول می‌شوند و دکمه‌ها ثابت پایین می‌مانند — قبلاً همه در یک
          ستون بودند و وقتی محتوا بلند می‌شد (هشدار قیمت، خلاصه‌ی تخفیف، توضیح)
          از پایین سرریز می‌کرد و روی نوار کلیدها می‌افتاد.
        */}
        <div className="flex min-h-0 w-80 shrink-0 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div className="shrink-0 rounded-lg border bg-card p-3">
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

          <div className="shrink-0 rounded-lg border bg-card p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">جمع اقلام</span>
              <span className="tabular-nums">{money(grossSubtotal)}</span>
            </div>

            {linesDiscountTotal > 0 && (
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-muted-foreground">تخفیف ردیف‌ها</span>
                <span className="tabular-nums text-emerald-600">
                  − {money(linesDiscountTotal)}
                </span>
              </div>
            )}

            <div className="mt-2 flex items-start justify-between gap-2">
              <span className="flex items-center gap-1 pt-2 text-sm text-muted-foreground">
                <Percent className="size-3.5" /> تخفیف فاکتور <Key>F6</Key>
              </span>
              <DiscountField
                id="invoice-discount"
                value={invoiceDiscountInput}
                base={subtotal}
                onChange={(d) => {
                  invalidateIdem();
                  setInvoiceDiscountInput(d);
                }}
              />
            </div>

            {totalDiscount > 0 && (
              <div className="mt-2 flex justify-between border-t pt-2 text-xs text-muted-foreground">
                <span>مجموع تخفیف</span>
                <span className="tabular-nums">
                  {money(totalDiscount)} ({toFa(effectivePercent)}٪)
                </span>
              </div>
            )}

            <div className="mt-3 flex items-baseline justify-between border-t pt-3">
              <span className="font-semibold">مبلغ نهایی</span>
              <span className="text-xl font-bold tabular-nums">{money(total)}</span>
            </div>
            <p className="text-end text-xs text-muted-foreground">تومان</p>

            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="توضیح روی فاکتور (اختیاری)"
              className="mt-3 h-9 text-sm"
            />
          </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <Button
              variant="outline"
              className="h-11 justify-between"
              disabled={!lines.length || sendToWorker.isPending}
              onClick={openWorkerForCart}
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

            {zeroPriceCount > 0 && (
              <p className="rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-500">
                {toFa(zeroPriceCount)} ردیف قیمت ندارد. تا قیمتشان وارد نشود فاکتور ثبت نمی‌شود.
              </p>
            )}

            <Button
              className="h-14 justify-between text-base"
              disabled={!canCheckout || submit.isPending}
              onClick={startCheckout}
            >
              <span>{submit.isPending ? "در حال ثبت…" : "تسویه و ثبت فاکتور"}</span>
              <Key>F2</Key>
            </Button>
          </div>
        </div>
      </div>

      {/*
        نوار کلیدها — در صندوق‌های فروش واقعی این نوار همیشه پایین صفحه است تا
        فروشنده‌ی تازه‌کار هم بدون آموزش با کیبورد کار کند.
      */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        {(
          [
            ["Enter", "بارکد / تسویه"],
            ["F2", "تسویه"],
            ["F3", "جست‌وجو"],
            ["F4", "مشتری"],
            ["F6", "تخفیف"],
            ["F7", "پرداخت ترکیبی"],
            ["F8", "پیش‌فاکتور"],
            ["F9", "ارسال به کارگر"],
            ["F10", "فاکتورهای امروز"],
            ["↑↓", "انتخاب ردیف"],
            ["Delete", "حذف"],
          ] as const
        ).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-sans text-[11px]">
              {k}
            </kbd>
            {label}
          </span>
        ))}
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
        initialQuery={searchSeed}
        onPick={addFromLocate}
        onSendToWorker={openWorkerForResult}
        onClose={() => { setShowSearch(false); setSearchSeed(""); focusScan(); }}
      />

      <WorkerPicker
        open={showWorkerPicker}
        itemCount={workerItemCount}
        pending={sendToWorker.isPending}
        onPick={(id, note) => sendToWorker.mutate({ assignedToId: id, note })}
        onClose={() => { setShowWorkerPicker(false); focusScan(); }}
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

      <CheckoutFlow
        open={showCheckout}
        total={total}
        lineCount={lines.length}
        customer={customer}
        pending={submit.isPending}
        onCustomerChange={(c) => { setCustomer(c); invalidateIdem(); }}
        onSubmit={(payments) => submit.mutate(payments)}
        onOpenFullPayment={() => { setShowCheckout(false); setShowPayment(true); }}
        onClose={() => { setShowCheckout(false); focusScan(); }}
      />

      <RecentInvoices
        open={showRecent}
        warehouseId={warehouseId}
        onClose={() => { setShowRecent(false); focusScan(); }}
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
