"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiException } from "@/lib/api-error-messages";
import {
  Trash2, Send, User, Percent, CreditCard, Search, FileClock, ReceiptText, Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createInvoice,
  createPickTasks,
  createQuotation,
  getCustomer,
  getInvoices,
  getQuotation,
  getWarehouses,
  locateProducts,
  resolveForSale,
} from "@/lib/api";
import { faToEn, money, parseNum, qty, toFa, rial } from "@/lib/format";
import { uuid } from "@/lib/uuid";
import type {
  Customer,
  InsufficientStockError,
  Invoice,
  LocateResult,
  PaymentInput,
  StockLocation,
} from "@/lib/types";

import { LocationPicker } from "./_components/location-picker";
import { CartTabs } from "./_components/cart-tabs";
import { CheckoutFlow } from "./_components/checkout-flow";
import { CurrentCustomerChip } from "./_components/current-customer-chip";
import { CustomerSummary } from "./_components/customer-summary";
import { InlineResults } from "./_components/inline-results";
import { OpenAccounts } from "./_components/open-accounts";
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
import { SaleReceiptDialog } from "./_components/sale-receipt-dialog";
import { TodayPurchasesDialog } from "./_components/today-purchases-dialog";
import { WorkerPicker } from "./_components/worker-picker";
import {
  NO_DISCOUNT,
  discountToRial,
  tomanToPercent,
  type DiscountInput as DiscountValue,
} from "./_lib/discount";
import { type Cart } from "./_lib/carts";
import { useCartsContext } from "./_lib/carts-context";

/** ابتدای امروز به‌صورت ISO — برای شمارش «فاکتورهای امروز» مشتریِ جاری. */
function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** حداقل چیزی که برای افزودن یک ردیف لازم است — هم از resolve می‌آید هم از جست‌وجو. */
type PickableProduct = {
  id: string;
  name: string;
  unit?: string | null;
  salePrice?: number | null;
};

/** ردیف سبد — تعریف و ریاضی‌اش کنار خود جدول است تا یک منبع حقیقت باشد. */
type Line = PosLine;

/**
 * ورودی ثبت فاکتور.
 *
 * آبجکت است نه دو آرگومان، چون `mutate` فقط یک متغیر می‌گیرد و سررسید باید
 * کنار پرداخت‌ها سفر کند.
 */
type SubmitArgs = { payments?: PaymentInput[]; dueDate?: string };

/** برچسب میانبر روی خود دکمه — این چیزی است که سرعت را می‌سازد. */
function Key({ children }: { children: string }) {
  return (
    <kbd className="ms-2 rounded border bg-background/20 px-1.5 py-0.5 text-[11px] font-normal">
      {children}
    </kbd>
  );
}

export default function PosPage() {
  /*
   * چند فاکتور هم‌زمان.
   *
   * سبد، مشتری، تخفیف و یادداشت همه داخل تبِ فعال زندگی می‌کنند. اسم setterها
   * عمداً همان قبلی‌هاست تا بقیه‌ی صفحه دست نخورد و این تغییر یک بازنویسیِ
   * سراسری نشود.
   */
  const {
    carts, cart, activeId, setActiveId, addCart, closeCart,
    patch: patchCart, resetCurrent, ensureIdem, invalidateIdem, canAdd,
  } = useCartsContext();

  const { lines, customer, note, activeRow, errorLine } = cart;
  const invoiceDiscountInput = cart.discount;

  const setLines = useCallback(
    (u: Line[] | ((prev: Line[]) => Line[])) =>
      patchCart((c) => ({ lines: typeof u === "function" ? u(c.lines) : u })),
    [patchCart]
  );
  const setCustomer = useCallback(
    // جدا کردنِ مشتری، قفل را هم باز می‌کند — قفلِ بی‌مشتری بی‌معناست.
    (c: Customer | null) =>
      patchCart(c ? { customer: c } : { customer: null, customerLocked: false }),
    [patchCart]
  );
  const toggleCustomerLock = useCallback(
    () => patchCart((c) => ({ customerLocked: !c.customerLocked })),
    [patchCart]
  );
  const setNote = useCallback((n: string) => patchCart({ note: n }), [patchCart]);
  const setInvoiceDiscountInput = useCallback(
    (d: DiscountValue) => patchCart({ discount: d }),
    [patchCart]
  );
  const setActiveRow = useCallback(
    (u: number | ((prev: number) => number)) =>
      patchCart((c) => ({
        activeRow: typeof u === "function" ? u(c.activeRow) : u,
      })),
    [patchCart]
  );
  const setErrorLine = useCallback(
    (n: number | null) => patchCart({ errorLine: n }),
    [patchCart]
  );

  // انبار بین همه‌ی تب‌ها مشترک است — فروشنده پشت یک پیشخوان نشسته.
  const [warehouseId, setWarehouseId] = useState("");
  const [scan, setScan] = useState("");

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
  const [showOpenAccounts, setShowOpenAccounts] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  /** فاکتورِ تازه‌ثبت‌شده — تا وقتی خودش بسته نشود، رسیدش روی صفحه می‌ماند. */
  const [receipt, setReceipt] = useState<Invoice | null>(null);
  /** دیالوگ «خریدهای امروزِ مشتریِ جاری» — از دکمه‌ی چیپ. */
  const [showTodayPurchases, setShowTodayPurchases] = useState(false);
  /** تعداد اقلامی که همین الان قرار است به کارگر برود (سبد کامل یا یک کالای جست‌وجو). */
  const [workerItemCount, setWorkerItemCount] = useState(0);

  /**
   * جست‌وجوی زنده‌ی همان نوار اسکن.
   *
   * `liveHighlight === -1` یعنی هیچ ردیفی انتخاب نشده و Enter باید مسیر بارکد
   * را برود — نگهبانِ اصلی در برابر اینکه Enterِ بارکدخوان کالای اشتباه را
   * اضافه کند. `liveDismissed` هم برای Esc است: لیست بسته شود ولی متن بماند.
   */
  const [liveHighlight, setLiveHighlight] = useState(-1);
  const [liveDismissed, setLiveDismissed] = useState(false);
  const [liveQuery, setLiveQuery] = useState("");

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

  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: getWarehouses });

  /**
   * هیچ انباری تعریف نشده.
   *
   * تا امروز این حالت بی‌صدا بود: کشویی انبار خالی می‌ماند، `warehouseId` رشته‌ی
   * تهی می‌رفت، و فروشنده *بعد* از زدنِ کل سبد یک «انبار پیدا نشد» می‌گرفت که
   * نمی‌گفت مشکل چیست. حالا قبل از اولین اسکن معلوم است.
   */
  const noWarehouse = !warehouses.isLoading && !warehouses.data?.length;


  /*
   * پرونده‌ی کامل مشتریِ انتخاب‌شده.
   *
   * نتیجه‌ی جست‌وجوی مشتری فقط نام و شماره دارد؛ سقف اعتبار و بدهی از این
   * کوئری می‌آید. بدون آن، فروشنده وضعیت اعتبار را تازه سرِ تسویه می‌فهمید —
   * یعنی بعد از اینکه کل سبد را زده.
   */
  /*
   * ورود با مشتریِ از پیش انتخاب‌شده (`/admin/pos?customer=...`).
   *
   * از پرونده‌ی مشتری «فروش به این مشتری» می‌آید اینجا. فقط یک بار اجرا
   * می‌شود، وگرنه عوض‌کردن مشتری در صندوق دوباره به همان برمی‌گشت.
   */
  const seededCustomer = useRef(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const id = searchParams.get("customer");
    if (!id || seededCustomer.current) return;
    seededCustomer.current = true;
    getCustomer(id)
      .then((c) => setCustomer(c))
      .catch(() => toast.error("مشتری پیدا نشد"));
  }, [searchParams, setCustomer]);

  /*
   * بارگذاری پیش‌فاکتور در سبد (?quotation=...).
   *
   * از «ادامه در صندوق» در صفحه‌ی پیش‌فاکتورها می‌آید: سبد از همان اقلام و
   * قیمت‌ها پر می‌شود (مشتری هم اگر داشته باشد) و فروشنده قیمت/تعداد را
   * بررسی یا اصلاح می‌کند و ادامه می‌دهد — بدون اینکه مجبور باشد دوباره
   * اسکن کند.
   */
  const seededQuotation = useRef(false);

  useEffect(() => {
    const id = searchParams.get("quotation");
    if (!id || seededQuotation.current) return;
    seededQuotation.current = true;
    getQuotation(id)
      .then((q) => {
        setLines(
          (q.lines ?? []).map((l) => ({
            key: uuid(),
            productId: l.product.id,
            productName: l.product.name,
            unit: l.product.unit ?? "عدد",
            locationId: l.locationId ?? "",
            locationPath: "",
            available: 0,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            // تخفیف ردیف ریالی است — همین شکل را سرور می‌گیرد.
            discount: { value: l.discount, mode: "amount" },
            included: true,
          }))
        );
        if (q.customerId) {
          getCustomer(q.customerId)
            .then((c) => setCustomer(c))
            .catch(() => toast.error("مشتری پیش‌فاکتور پیدا نشد"));
        }
        toast.success(
          `پیش‌فاکتور ${toFa(q.number)} در صندوق بارگذاری شد — قیمت‌ها را بررسی کنید`
        );
      })
      .catch(() => toast.error("بارگذاری پیش‌فاکتور ناموفق بود"));
  }, [searchParams, setLines, setCustomer]);

  const customerDetail = useQuery({
    queryKey: ["customer", customer?.id],
    queryFn: () => getCustomer(customer!.id),
    enabled: !!customer?.id,
  });

  /*
   * شمارشِ فاکتورهای امروزِ همین مشتری — فقط تعداد لازم است، پس صفحه‌ی ۱ با
   * `pageSize: 1` کافی است و meta.total عدد واقعی را می‌دهد.
   */
  const customerTodayInvoices = useQuery({
    queryKey: ["customer-today-count", customer?.id],
    queryFn: () =>
      getInvoices({ customerId: customer!.id, from: startOfToday(), pageSize: 1 }),
    enabled: !!customer?.id,
    staleTime: 30_000,
  });

  // تأخیر کوتاه: آن‌قدر که هر ضربه‌ی کلید یک درخواست نزند، ولی «زنده» حس شود.
  useEffect(() => {
    const t = setTimeout(() => setLiveQuery(scan), 150);
    return () => clearTimeout(t);
  }, [scan]);

  /*
   * حداقل سه حرف: با دو حرف نتیجه آن‌قدر زیاد است که کمکی نمی‌کند، و مهم‌تر
   * اینکه بارکدخوان در حال تایپِ یک بارکد بلند نباید هر چند حرف یک کوئری بزند.
   */
  const liveEnabled = !liveDismissed && liveQuery.trim().length >= 3;

  const liveResults = useQuery({
    queryKey: ["pos-inline", liveQuery],
    queryFn: () => locateProducts(liveQuery.trim()),
    enabled: liveEnabled,
    placeholderData: keepPreviousData,
  });

  const liveList = useMemo(
    () => (liveEnabled ? (liveResults.data ?? []) : []),
    [liveEnabled, liveResults.data]
  );

  // با عوض‌شدن متن، انتخاب باید از نو شروع شود.
  useEffect(() => {
    setLiveHighlight(-1);
  }, [liveQuery]);

  /** بستن لیست بعد از افزودن — وگرنه روی سبدِ تازه باز می‌ماند. */
  const closeLive = useCallback(() => {
    setScan("");
    setLiveQuery("");
    setLiveHighlight(-1);
    setLiveDismissed(false);
  }, []);

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
  /**
   * فقط ردیف‌های تیک‌خورده.
   *
   * تیک‌برداشتن یعنی «فعلاً این را نمی‌خواهد» — نه در جمع می‌آید، نه ثبت
   * می‌شود، ولی روی صفحه می‌ماند تا اگر نظرش عوض شد دوباره اسکن لازم نباشد.
   * همه‌ی ریاضیِ فاکتور از همین‌جا رد می‌شود.
   */
  const activeLines = useMemo(() => lines.filter((l) => l.included), [lines]);

  /**
   * جمعِ یک تبِ دلخواه — برای برچسبِ روی نوار تب.
   *
   * ریاضیِ کامل فاکتور (با تخفیف کل) عمداً اینجا تکرار نمی‌شود: روی تب فقط یک
   * عددِ تقریبی برای شناختن لازم است، و دوباره‌نویسیِ فرمول یعنی دو جا که
   * می‌توانند از هم جدا بیفتند.
   */
  const cartTotal = useCallback(
    (c: Cart) =>
      c.lines.filter((l) => l.included).reduce((s, l) => s + lineNet(l), 0),
    []
  );

  const grossSubtotal = useMemo(
    () => activeLines.reduce((s, l) => s + lineGross(l), 0),
    [activeLines]
  );
  /** جمع تخفیف‌های ردیفی — فقط برای نمایش. */
  const linesDiscountTotal = useMemo(
    () => activeLines.reduce((s, l) => s + lineDiscount(l), 0),
    [activeLines]
  );
  /** همان چیزی که سرور subtotal صدایش می‌کند: جمع ردیف‌ها **پس از** تخفیف ردیفی. */
  const subtotal = grossSubtotal - linesDiscountTotal;
  const invoiceDiscount = discountToRial(invoiceDiscountInput, subtotal);
  const total = Math.max(0, subtotal - invoiceDiscount);
  /** تخفیف کل (ردیفی + فاکتوری) و درصد مؤثرش نسبت به مبلغ خام. */
  const totalDiscount = linesDiscountTotal + invoiceDiscount;
  const effectivePercent = tomanToPercent(totalDiscount, grossSubtotal);

  /**
   * ردیف‌های بی‌قیمت.
   *
   * تقریباً هیچ کالایی در دیتابیس ProductPrice ندارد، پس اگر جلویش گرفته نشود
   * فروشنده به‌راحتی یک فاکتورِ صفر ریالی ثبت می‌کند و تازه بعداً می‌فهمد.
   */
  const zeroPriceCount = useMemo(
    () => activeLines.filter((l) => l.unitPrice <= 0).length,
    [activeLines]
  );
  const canCheckout =
    activeLines.length > 0 && zeroPriceCount === 0 && !noWarehouse;

  /** رفتن به تسویه — از Enterِ خانه‌ی خالیِ اسکن یا F2. */
  const startCheckout = useCallback(() => {
    if (!activeLines.length) return;
    if (noWarehouse) {
      toast.error("هیچ انباری تعریف نشده — اول یک انبار بسازید");
      return;
    }
    if (zeroPriceCount > 0) {
      toast.error(
        `${toFa(zeroPriceCount)} ردیف قیمت ندارد — قبل از ثبت قیمتشان را وارد کنید`
      );
      return;
    }
    setShowCheckout(true);
  }, [lines.length, zeroPriceCount, noWarehouse]);

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
            key: uuid(),
            productId: p.id,
            productName: p.name,
            unit: p.unit ?? "عدد",
            locationId: s.locationId,
            locationPath: s.locationPath || s.locationName,
            available: s.quantity,
            stranded: s.stranded,
            quantity: 1,
            unitPrice: p.salePrice ?? 0,
            discount: NO_DISCOUNT,
            included: true,
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
        stranded: l.stranded,
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
    mutationFn: ({ payments, dueDate }: SubmitArgs = {}) => {
      return createInvoice({
        idempotencyKey: ensureIdem(),
        warehouseId,
        customerId: customer?.id ?? null,
        discount: invoiceDiscount || undefined,
        note: note.trim() || undefined,
        // فقط برای حساب‌باز پر است؛ در بقیه‌ی روش‌ها سررسیدی وجود ندارد.
        dueDate,
        lines: activeLines.map((l) => ({
          productId: l.productId,
          // قفسه‌ی خالی یعنی «کالا هنوز ثبت نشده» — سرور خودش مکان سیستمی را
          // انتخاب می‌کند. فرستادن رشته‌ی تهی خطای اعتبارسنجی می‌دهد.
          locationId: l.locationId || undefined,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          // درصد فقط در UI زندگی می‌کند؛ سرور ریال می‌گیرد.
          discount: lineDiscount(l) || undefined,
        })),
        payments,
      });
    },
    onSuccess: (inv) => {
      /*
       * رسیدِ ماندگار به‌جای toast.
       *
       * toast شش ثانیه بعد محو می‌شد؛ نگاهِ فروشنده در آن لحظه روی مشتری
       * بعدی است، نه صفحه. رسید تا وقتی خودش ببندد می‌ماند، شماره و مبلغ را
       * بزرگ نشان می‌دهد و «چاپ مجدد» دارد — و با یک Enter بسته می‌شود تا
       * چرخه‌ی اسکنِ مشتری بعدی کند نشود.
       */
      setReceipt(inv);
      /*
       * قفلِ مشتری فقط برای حساب‌باز: اگر بخشی از پرداختِ این فاکتور نسیه بوده
       * (حتی ترکیبی)، مشتری روی تب می‌ماند برای خریدِ بعدی؛ فروشِ نقدی/کارت/چک
       * برمی‌گردد به «نقدی گذری».
       */
      resetCurrent();
      setShowPayment(false);
      setShowCheckout(false);
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
    mutationFn: ({ validForMinutes }: { validForMinutes: number; print: boolean }) =>
      createQuotation({
        warehouseId,
        customerId: customer?.id ?? null,
        discount: invoiceDiscount || undefined,
        note: note.trim() || undefined,
        validForMinutes,
        lines: activeLines.map((l) => ({
          productId: l.productId,
          locationId: l.locationId || undefined,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: lineDiscount(l) || undefined,
        })),
      }),
    onSuccess: (q, vars) => {
      // چاپ همان لحظه، تا برگه پیش از رفتنِ مشتری دستش باشد.
      if (vars.print) window.open(`/admin/print/quotation/${q.id}`, "_blank");

      toast.success(`پیش‌فاکتور ${toFa(q.number)} ثبت شد — ${rial(q.total)}`, {
        action: {
          label: "چاپ",
          onClick: () => window.open(`/admin/print/quotation/${q.id}`, "_blank"),
        },
        duration: 6000,
      });
      // پیش‌فاکتور فروش نیست — مشتری مثل فروشِ نقدی ریست می‌شود.
      resetCurrent();
      setShowQuotation(false);
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
    if (!activeLines.length) return;
    /*
     * اقلام ثبت‌نشده هم فرستاده می‌شوند.
     *
     * قبلاً کنار گذاشته می‌شدند چون «قفسه ندارند پس کارگر جایی برای رفتن ندارد».
     * ولی جنس فیزیکاً در انبار هست و فقط در نرم‌افزار ثبت نشده — کارگر انبار را
     * می‌شناسد و پیدایش می‌کند. کارِ برداشت بدون آدرس هم می‌گوید «این را بیاور».
     */
    workerLinesRef.current = activeLines.map((l) => ({
      productId: l.productId,
      locationId: l.locationId || undefined,
      quantity: l.quantity,
    }));
    setWorkerItemCount(activeLines.length);
    setShowWorkerPicker(true);
  }, [activeLines]);

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
    showWorkerPicker || showRecent || showCheckout || showOpenAccounts || !!receipt ||
    showTodayPurchases;

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
        setShowOpenAccounts(false);
        // CheckoutFlow خودش Esc را مدیریت می‌کند (گام دوم → گام اول)، پس اینجا
        // بسته نمی‌شود؛ وگرنه یک Esc کل تسویه را می‌بندد.
        focusScan();
        return;
      }

      if (anyDialogOpen) return;

      // Ctrl+T — فاکتور جدید، همان میانبری که در مرورگر عادت شده.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        addCart();
        focusScan();
        return;
      }

      // Ctrl+Shift+X — جدا کردن مشتریِ قفل‌شده (همان دکمه‌ی × چیپ).
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "x") {
        e.preventDefault();
        if (customer) {
          setCustomer(null);
          invalidateIdem();
          toast.info("مشتری جدا شد — فروش نقدی گذری");
        }
        return;
      }

      switch (e.key) {
        case "F2":
          e.preventDefault();
          if (!submit.isPending) startCheckout();
          break;
        case "F3":
          e.preventDefault();
          setShowOpenAccounts(true);
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
        /*
         * جهت‌ها فقط وقتی ردیفِ فعال را عوض می‌کنند که فوکوس روی نوار اسکن باشد.
         *
         * داخل خانه‌های جدول، خودِ جدول جابه‌جایی را مدیریت می‌کند (تعداد ↔ قیمت).
         * بدون این شرط، یک فلش هر دو کار را می‌کرد و مکان‌نما می‌پرید.
         */
        case "ArrowDown":
          if (lines.length && document.activeElement === scanRef.current) {
            e.preventDefault();
            setActiveRow((r) => Math.min(r + 1, lines.length - 1));
          }
          break;
        case "ArrowUp":
          if (lines.length && document.activeElement === scanRef.current) {
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
  }, [lines, activeRow, anyDialogOpen, submit.isPending, sendToWorker.isPending, addCart, focusScan, customer, setCustomer, invalidateIdem]);

  useEffect(() => { focusScan(); }, [focusScan]);

  // ---------- نما ----------

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-3 p-4">
      <CartTabs
        carts={carts}
        activeId={activeId}
        canAdd={canAdd}
        totalOf={cartTotal}
        onSelect={(id) => { setActiveId(id); focusScan(); }}
        onAdd={() => { addCart(); focusScan(); }}
        onClose={closeCart}
      />

      {noWarehouse && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive
                        bg-destructive/10 px-4 py-3">
          <div>
            <p className="font-semibold text-destructive">هیچ انباری تعریف نشده</p>
            <p className="text-sm text-muted-foreground">
              تا وقتی یک انبار ساخته نشود، فاکتور ثبت نمی‌شود.
            </p>
          </div>
          <Button asChild variant="destructive">
            <Link href="/admin/locations">ساخت انبار</Link>
          </Button>
        </div>
      )}

      {/* نوار اسکن — همیشه فوکوس دارد */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={scanRef}
            id="pos-scan"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              // ↑↓ در لیست زنده. تا اولین ↓، هیچ ردیفی انتخاب نیست.
              if (liveList.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault();
                // وگرنه همین فلش به هندلر سراسری هم می‌رسد و هم‌زمان ردیفِ
                // فعالِ جدول را جابه‌جا می‌کند.
                e.stopPropagation();
                setLiveHighlight((h) =>
                  e.key === "ArrowDown"
                    ? Math.min(h + 1, liveList.length - 1)
                    : Math.max(h - 1, -1)
                );
                return;
              }

              // Esc لیست را می‌بندد ولی متن را نگه می‌دارد — شاید بخواهد ادامه بدهد.
              if (e.key === "Escape" && liveList.length) {
                e.preventDefault();
                // Esc اینجا فقط لیست را می‌بندد، نه همه‌ی دیالوگ‌های صفحه.
                e.stopPropagation();
                setLiveDismissed(true);
                setLiveHighlight(-1);
                return;
              }

              /*
               * زنجیره‌ی کیبوردی: اسکن →Tab→ تعداد →Tab→ قیمت →Enter→ برگشت به
               * بارکد (و اگر بارکدی زده نشود و باز Enter، می‌رود تسویه). این Tab
               * اولْ ردیف را روی تعداد می‌گذارد؛ Shift+Tab میان‌بر مستقیم به قیمت
               * است (وقتی تعداد همان ۱ است). بارکدخوان Tab نمی‌فرستد، پس اسکنِ
               * پیاپی دست‌نخورده می‌ماند. فقط وقتی لیست زنده باز نیست.
               */
              if (e.key === "Tab" && lines.length && !liveList.length) {
                e.preventDefault();
                const col = e.shiftKey ? 1 : 0;
                const cell = document.querySelector<HTMLInputElement>(
                  `[data-cell="${activeRow}:${col}"]`
                );
                cell?.focus();
                cell?.select();
                return;
              }

              if (e.key !== "Enter") return;
              e.preventDefault();

              // ردیفی با ↓ انتخاب شده → همان را بردار.
              if (liveHighlight >= 0 && liveList[liveHighlight]) {
                addFromLocate(liveList[liveHighlight]);
                closeLive();
                return;
              }

              const typed = scan.trim();

              /*
               * عددِ کوتاه = تعدادِ ردیفِ فعال، نه بارکد.
               *
               * بعد از افزودن کالا، کارِ بعدیِ فروشنده تقریباً همیشه گفتن تعداد
               * است. تا حالا باید دست از کیبورد برمی‌داشت و روی خانه‌ی تعداد
               * کلیک می‌کرد.
               *
               * مرزش طولِ عدد است: بارکد هیچ‌وقت کوتاه‌تر از ۵ رقم نیست و تعداد
               * تقریباً هیچ‌وقت بلندتر. بدون این مرز، اسکنِ یک بارکد به‌جای
               * افزودن کالا تعداد را عوض می‌کرد.
               */
              const asQty = /^\d{1,4}$/.test(faToEn(typed)) ? Number(faToEn(typed)) : 0;
              if (asQty > 0 && lines.length) {
                patchLine(activeRow, { quantity: asQty });
                setScan("");
                // بعد از تعداد، خانه‌ی قیمتِ همان ردیف؛ ترتیب طبیعیِ کار.
                requestAnimationFrame(() => {
                  const cell = document.querySelector<HTMLInputElement>(
                    `[data-cell="${activeRow}:1"]`
                  );
                  cell?.focus();
                  cell?.select();
                });
                return;
              }

              // بارکد در خانه → کالا را اضافه کن و منتظر بعدی بمان.
              if (typed) {
                onScan.mutate(typed);
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

          <InlineResults
            results={liveList}
            highlight={liveHighlight}
            loading={liveResults.isFetching}
            onHover={setLiveHighlight}
            onPick={(r) => { addFromLocate(r); closeLive(); }}
            onSendToWorker={(r) => { openWorkerForResult(r); closeLive(); }}
          />
        </div>

        {customer && (
          <CurrentCustomerChip
            name={customer.fullName}
            primaryPhone={
              customer.phones?.find((p) => p.isPrimary)?.phone ??
              customer.phones?.[0]?.phone ??
              null
            }
            category={customer.category ?? null}
            totalDue={customerDetail.data?.summary?.totalDue ?? 0}
            todayCount={customerTodayInvoices.data?.meta?.total ?? 0}
            loading={customerTodayInvoices.isFetching}
            locked={cart.customerLocked}
            onToggleLock={toggleCustomerLock}
            onOpen={() => window.open(`/admin/customers/${customer.id}`, "_blank")}
            onShowToday={() => setShowTodayPurchases(true)}
            onClear={() => { setCustomer(null); invalidateIdem(); }}
          />
        )}

        <select
          value={warehouseId}
          onChange={(e) => { setWarehouseId(e.target.value); invalidateIdem(); }}
          className="h-11 rounded-md border bg-background px-3 text-sm"
        >
          {warehouses.data?.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>

        <Button
          variant="outline"
          className="h-11 border-amber-400 text-amber-700 hover:bg-amber-50 hover:text-amber-800
                     dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
          onClick={() => setShowOpenAccounts(true)}
        >
          <Wallet className="size-4" />
          حساب باز <Key>F3</Key>
        </Button>

        {/* سبز عمدی است: تنها دکمه‌ی «نگاه به گذشته» بین ابزارهای فروش، و
            فروشنده باید بدون خواندن متن پیدایش کند. */}
        <Button
          className="h-11 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700
                     dark:bg-emerald-600 dark:hover:bg-emerald-500"
          onClick={() => setShowRecent(true)}
        >
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
          {/*
            کارت مشتری بیرون از ناحیه‌ی اسکرول است: همیشه کامل دیده می‌شود و
            اسکرول‌بار نمی‌گیرد. فقط «جمع اقلام» در فضای باقی‌مانده اسکرول می‌شود.
          */}
          <CustomerSummary
            customer={customer}
            onOpenFullProfile={() => window.open(`/admin/customers/${customer?.id}`, "_blank")}
            onShowTodayPurchases={() => setShowTodayPurchases(true)}
          />

          {/* دکمه انتخاب مشتری وقتی مشتری انتخاب نشده */}
          {!customer && (
            <Button
              variant="outline"
              className="h-11 w-full justify-center gap-2"
              onClick={() => setShowCustomer(true)}
            >
              <User className="size-4" /> انتخاب مشتری <Key>F4</Key>
            </Button>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div className="shrink-0 rounded-lg border bg-card p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">جمع اقلام</span>
              <span className="tabular-nums">{money(grossSubtotal)}</span>
            </div>

            {linesDiscountTotal > 0 && (
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-muted-foreground">تخفیف ردیف‌ها</span>
                <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
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

            {/* مبلغ نهایی تنها عددی است که فروشنده بلند می‌خواند — باید از
                فاصله‌ی یک متری هم خوانده شود. */}
            <div className="mt-3 rounded-lg bg-blue-600 px-3 py-2.5 text-white dark:bg-blue-700">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-blue-100">مبلغ نهایی</span>
                <span className="text-2xl font-bold tabular-nums">{money(total)}</span>
              </div>
              <p className="text-end text-[11px] text-blue-200">ریال</p>
            </div>

            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="توضیح روی فاکتور (اختیاری)"
              className="mt-3 h-9 text-sm"
            />
          </div>
          </div>

        </div>
      </div>

      {zeroPriceCount > 0 && (
        <p className="shrink-0 rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-500">
          {toFa(zeroPriceCount)} ردیف قیمت ندارد. تا قیمتشان وارد نشود فاکتور ثبت نمی‌شود.
        </p>
      )}

      {/*
        نوارِ عملیاتِ اصلی — پایینِ صفحه، ۴ باکسِ هم‌اندازه در یک ردیف. «تسویه»
        تنها دکمه‌ی توپُرِ آبی است (عملِ نهایی)؛ سه‌تای دیگر outlineِ کم‌رنگ‌ترند
        تا سلسله‌مراتب روشن باشد. همه h-14 و flex-1 تا عرض برابر بگیرند.
      */}
      <div className="flex shrink-0 items-stretch gap-2">
        <Button
          variant="outline"
          className="h-14 flex-1 gap-2"
          disabled={!lines.length || sendToWorker.isPending}
          onClick={openWorkerForCart}
        >
          <Send className="size-4" />
          {sendToWorker.isPending ? "در حال ارسال…" : "ارسال به کارگر"}
          <Key>F9</Key>
        </Button>

        <Button
          variant="outline"
          className="h-14 flex-1 gap-2"
          disabled={!lines.length || saveQuotation.isPending}
          onClick={() => setShowQuotation(true)}
        >
          <FileClock className="size-4" /> پیش‌فاکتور <Key>F8</Key>
        </Button>

        <Button
          variant="outline"
          className="h-14 flex-1 gap-2"
          disabled={!lines.length}
          onClick={() => setShowPayment(true)}
        >
          <CreditCard className="size-4" /> پرداخت <Key>F7</Key>
        </Button>

        <Button
          className="h-14 flex-1 gap-2 text-base"
          disabled={!canCheckout || submit.isPending}
          onClick={startCheckout}
        >
          {submit.isPending ? "در حال ثبت…" : "تسویه و ثبت فاکتور"}
          <Key>F2</Key>
        </Button>
      </div>

      {/*
        نوار کلیدها — در صندوق‌های فروش واقعی این نوار همیشه پایین صفحه است تا
        فروشنده‌ی تازه‌کار هم بدون آموزش با کیبورد کار کند.
      */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        {(
          [
            ["Enter", "بارکد / تسویه"],
            ["Tab", "تعداد ← قیمت"],
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
            ["Ctrl+Shift+X", "جدا کردن مشتری"],
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
        onConfirm={(validForMinutes, print) =>
          saveQuotation.mutate({ validForMinutes, print })
        }
        onClose={() => { setShowQuotation(false); focusScan(); }}
      />

      <CheckoutFlow
        open={showCheckout}
        total={total}
        lineCount={lines.length}
        customer={customer}
        pending={submit.isPending}
        onCustomerChange={(c) => { setCustomer(c); invalidateIdem(); }}
        onSubmit={(payments, dueDate) => submit.mutate({ payments, dueDate })}
        onOpenFullPayment={() => { setShowCheckout(false); setShowPayment(true); }}
        onClose={() => { setShowCheckout(false); focusScan(); }}
      />

      <OpenAccounts
        open={showOpenAccounts}
        onClose={() => { setShowOpenAccounts(false); focusScan(); }}
        onPick={(d) => {
          /*
             فهرست بدهکاران فقط خلاصه دارد، نه پرونده‌ی کامل مشتری. همین حداقل
             کافی است تا سبد به نامش بسته شود؛ سقف اعتبار و بقیه را کوئریِ
             `customerDetail` بلافاصله می‌آورد.
          */
          setCustomer({
            id: d.id,
            firstName: d.fullName,
            lastName: null,
            fullName: d.fullName,
            phones: [],
          });
          invalidateIdem();
          setShowOpenAccounts(false);
          focusScan();
        }}
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
        customerCreditDays={customer?.creditDays}
        onConfirm={(payments, dueDate) => submit.mutate({ payments, dueDate })}
        onClose={() => { setShowPayment(false); focusScan(); }}
      />

      <SaleReceiptDialog
        invoice={receipt}
        onClose={() => { setReceipt(null); focusScan(); }}
      />

      <TodayPurchasesDialog
        open={showTodayPurchases}
        customer={customer}
        onClose={() => { setShowTodayPurchases(false); focusScan(); }}
      />
    </div>
  );
}
