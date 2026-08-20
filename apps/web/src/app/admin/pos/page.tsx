"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiException } from "@/lib/api-error-messages";
import {
  Trash2, Send, User, Percent, CreditCard, Search, FileClock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createInvoice,
  createQuotation,
  createWorkTask,
  ensureOpenAccount,
  getCustomer,
  getInvoices,
  getPosStock,
  getQuotation,
  getWarehouses,
  getWorkTasks,
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
  WorkTask,
} from "@/lib/types";
import { highlightMatches } from "@/lib/pos-search/highlight";
import { tokenizeQuery } from "@/lib/pos-search/normalize";
import { usePosCatalog } from "@/lib/pos-search/use-pos-catalog";

import { LocationPicker } from "./_components/location-picker";
import { CartTabs } from "./_components/cart-tabs";
import { CheckoutFlow } from "./_components/checkout-flow";
import { CurrentCustomerChip } from "./_components/current-customer-chip";
import { CustomerSummary } from "./_components/customer-summary";
import { InlineResults, type SearchResultRow } from "./_components/inline-results";
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
import { WorkTasksPanel } from "./_components/work-tasks-panel";
import { ShortageDialog } from "./_components/shortage-dialog";
import { ProductFormDialog } from "../products/_components/product-form-dialog";
import {
  NO_DISCOUNT,
  discountToRial,
  tomanToPercent,
  type DiscountInput as DiscountValue,
} from "./_lib/discount";
import { type Cart } from "./_lib/carts";
import { useCartsContext } from "./_lib/carts-context";
import { usePosUiStore } from "./_lib/pos-ui-store";

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

  const qc = useQueryClient();

  const { lines, customer, note, activeRow, errorLine } = cart;
  const invoiceDiscountInput = cart.discount;

  const setLines = useCallback(
    (u: Line[] | ((prev: Line[]) => Line[])) =>
      patchCart((c) => ({ lines: typeof u === "function" ? u(c.lines) : u })),
    [patchCart]
  );
  const setCustomer = useCallback(
    // جدا کردنِ مشتری، قفل را هم باز می‌کند — قفلِ بی‌مشتری بی‌معناست.
    // حساب باز هم جدا می‌شود: ادامهی فاکتورِ یک حساب بدونِ همان مشتری بی‌معناست.
    (c: Customer | null) =>
      patchCart(
        c
          ? { customer: c }
          : { customer: null, customerLocked: false, openAccountId: null }
      ),
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
  /*
   * «حساب باز»، «کارهای انبار» و «فاکتورهای امروز» دکمه‌های‌شان را در نوار
   * بالای مشترک (AdminTopbar) کنار ساعت دارند؛ خودِ دیالوگ‌ها همچنان اینجا
   * رندر می‌شوند. باز/بسته‌بودنشان در pos-ui-store زندگی می‌کند تا topbar
   * بتواند بازشان کند بدون اینکه منطق‌شان از این صفحه بیرون برود. میان‌برهای
   * F3 و F10 هم همین setterها را می‌زنند — دست‌نخورده.
   */
  const showWorkTasks = usePosUiStore((s) => s.workTasksOpen);
  const setShowWorkTasks = usePosUiStore((s) => s.workTasks);
  const showRecent = usePosUiStore((s) => s.recentOpen);
  const setShowRecent = usePosUiStore((s) => s.recent);
  const showOpenAccounts = usePosUiStore((s) => s.openAccountsOpen);
  const setShowOpenAccounts = usePosUiStore((s) => s.openAccounts);
  const showShortage = usePosUiStore((s) => s.shortageOpen);
  const setShowShortage = usePosUiStore((s) => s.shortage);
  const showAddProduct = usePosUiStore((s) => s.addProductOpen);
  const setShowAddProduct = usePosUiStore((s) => s.addProduct);
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

  /*
   * کارهایِ ارسال‌شده به کارگر + پیشرفت زنده.
   *
   * رویدادِ work-task.progress (use-live-events) همین کلید را invalidate می‌کند،
   * پس با هر تیکِ کارگر، نوارِ سبز در پنل و چیپِ روی فاکتور جلو می‌رود. نگاشتِ
   * invoiceId → کارها برای چیپِ پیشرفتِ داخل «فاکتورهای امروز» ساخته می‌شود.
   */
  const workTasks = useQuery({
    queryKey: ["work-tasks", warehouseId],
    queryFn: () => getWorkTasks({ warehouseId }),
    enabled: !!warehouseId,
    staleTime: 10_000,
  });
  const tasksByInvoice = useMemo(() => {
    const map: Record<string, WorkTask[]> = {};
    for (const t of workTasks.data ?? []) {
      if (t.invoiceId) (map[t.invoiceId] ??= []).push(t);
    }
    return map;
  }, [workTasks.data]);

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
   * فاکتورهای امروزِ همین مشتری — یک کوئری واحد با `pageSize: 5` که هم عددِ
   * چیپ (meta.total) و هم فهرستِ ۵ فاکتورِ پنل مشتری را سیر می‌کند. قبلاً دو
   * کوئریِ جدا با pageSize متفاوت و کلیدِ یکسان می‌رفت که هیچ dedupe‌ای
   * نمی‌شد؛ حالا داده‌اش به CustomerSummary هم پاس داده می‌شود.
   */
  const customerTodayInvoices = useQuery({
    queryKey: ["customer-today-count", customer?.id],
    queryFn: () =>
      getInvoices({ customerId: customer!.id, from: startOfToday(), pageSize: 5 }),
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

  /**
   * جست‌وجوی زنده: محلی وقتی کاتالوگ آماده است، وگرنه سرور.
   *
   * کاتالوگِ لوکال (IndexedDB-در-حافظه) یک‌بار موقعِ باز شدنِ صندوق بارگذاری
   * می‌شود؛ تا آن لحظه از همان سرچِ سرورِ قدیمی استفاده می‌شود تا جعبه‌ی سرچ
   * هرگز «مرده» نباشد. بعد از آماده‌شدن، سرچ بدون هیچ رفت‌وبرگشتِ شبکه و
   * بدونِ مشکلِ کهنگیِ کش انجام می‌شود — دلیلِ اصلیِ کندیِ قبلی.
   *
   * موجودی/قفسه عمداً در کاتالوگِ لوکال نیست: آن دو فقط لحظه‌ی انتخاب، تازه از
   * سرور گرفته می‌شوند (`onPickRow`) تا فروش هرگز روی عددِ کهنه انجام نشود.
   */
  const posCatalog = usePosCatalog();
  const useLocalSearch = posCatalog.ready;

  const liveResults = useQuery({
    queryKey: ["pos-inline", liveQuery],
    queryFn: () => locateProducts(liveQuery.trim()),
    enabled: liveEnabled && !useLocalSearch,
    placeholderData: keepPreviousData,
  });

  const localHits = useMemo(
    () => (useLocalSearch && liveEnabled ? posCatalog.search(liveQuery) : []),
    [useLocalSearch, liveEnabled, posCatalog, liveQuery]
  );

  const queryTokens = useMemo(() => tokenizeQuery(liveQuery), [liveQuery]);

  const liveList = useMemo((): SearchResultRow[] => {
    if (!liveEnabled) return [];
    if (useLocalSearch) {
      return localHits.map((item) => ({
        kind: "unknown" as const,
        id: item.id,
        nameSegments: highlightMatches(item.name, queryTokens),
        name: item.name,
        sku: item.sku,
        salePrice: item.salePrice ?? null,
      }));
    }
    return (liveResults.data ?? []).map((r) => ({
      kind: "known" as const,
      id: r.id,
      nameSegments: highlightMatches(r.name, queryTokens),
      result: r,
    }));
  }, [liveEnabled, useLocalSearch, localHits, liveResults.data, queryTokens]);

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

  /** id ردیفی که در حال دریافت موجودیِ تازه است (برای اسپینر روی همان ردیف). */
  const [pickingId, setPickingId] = useState<string | null>(null);

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

  /**
   * انتخاب یک ردیف از لیستِ زنده.
   *
   * ردیفِ «known» (سرچِ سرور، حالتِ گذرا تا کاتالوگ بارگذاری شود) از قبل
   * موجودی دارد — مستقیم به سبد اضافه می‌شود. ردیفِ «unknown» (سرچِ لوکال)
   * موجودی ندارد؛ قبل از افزودن، یک بار موجودیِ تازه از سرور گرفته می‌شود تا
   * فروش هرگز روی عددِ کهنه انجام نشود.
   */
  const onPickRow = useCallback(
    async (row: SearchResultRow) => {
      if (row.kind === "known") {
        addFromLocate(row.result);
        closeLive();
        return;
      }
      if (pickingId) return; // یک انتخاب در حال پردازش — از دوبار زدن جلوگیری کن.
      setPickingId(row.id);
      try {
        const fresh = await getPosStock(row.id);
        addFromLocate(fresh);
        closeLive();
      } catch (e) {
        toast.error(e instanceof ApiException ? e.message : "دریافت موجودی ناموفق بود");
      } finally {
        setPickingId(null);
      }
    },
    [addFromLocate, closeLive, pickingId]
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
    mutationFn: async ({ payments, dueDate }: SubmitArgs = {}) => {
      /*
       * قاعده‌ی واحدِ «برد و پول نداد» — یک مکانیزم، نه دو.
       *
       * تا حالا دکمه‌ی «حساب باز» در تسویه فقط روشِ پرداخت CREDIT می‌فرستاد و
       * فاکتور CONFIRMED (نسیه) می‌شد، در حالی که همان نام از مسیر F3 فاکتورِ
       * OPEN روی تبِ مشتری می‌ساخت — یک اسم، دو رفتار، و فاکتوری که در
       * پرونده‌ی حساب دیده نمی‌شد.
       *
       * حالا مرز روی «پول» است، نه روی مسیر:
       *   هیچ پولی گرفته نشد → می‌رود روی تبِ مشتری (فاکتور OPEN).
       *   بخشی گرفته شد      → فاکتور نهایی، باقی‌مانده با سررسید.
       *
       * چون اینجا اعمال می‌شود نه داخل دیالوگ‌ها، هم دکمه‌ی سریع و هم فرمِ
       * پرداختِ ترکیبی (F7) یک رفتار دارند.
       */
      const paidNow = (payments ?? [])
        .filter((p) => p.method !== "CREDIT")
        .reduce((sum, p) => sum + p.amount, 0);

      const allOnAccount =
        !!payments?.length && paidNow === 0 && total > 0 && !!customer;

      let accountId = cart.openAccountId ?? undefined;
      if (!accountId && allOnAccount) {
        accountId = (await ensureOpenAccount(customer!.id)).id;
      }

      return createInvoice({
        idempotencyKey: ensureIdem(),
        warehouseId,
        customerId: customer?.id ?? null,
        discount: invoiceDiscount || undefined,
        note: note.trim() || undefined,
        // روی حساب باز سررسید در تسویه ساخته می‌شود، نه حالا.
        dueDate: accountId ? undefined : dueDate,
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
        // روی حساب باز هیچ پرداختی ثبت نمی‌شود — مشتری جنس را می‌برد و پول در
        // تسویه می‌آید. فاکتور OPEN می‌شود و به همان حساب وصل می‌شود.
        accountId,
        payments: accountId ? undefined : payments,
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
       * کشِ مشتریِ این فاکتور فوراً تازه شود: بدهی، مانده‌ی اعتبار و «امروز: n
       * فاکتور» نباید تا staleTime (۳۰ ثانیه) قدیمی بمانند — فروشنده با همین
       * عدد درباره‌ی سقفِ اعتبارِ خریدِ بعدی تصمیم می‌گیرد. id قبل از
       * resetCurrent گرفته می‌شود چون فروشِ نقدیِ بدونِ قفل، مشتری را از سبد
       * پاک می‌کند. (رویدادِ زنده‌ی sale.created هم همین کلیدها را تازه
       * می‌کند، ولی این ضمانتِ محلی برای وقتی است که کانال قطع باشد.)
       */
      const soldCustomerId = customer?.id;
      // وضعیتِ خودِ فاکتور می‌گوید روی حساب نشسته یا نه — چه از F3 آمده باشد،
      // چه همین حالا حسابش باز شده باشد.
      if (inv.status === "OPEN") {
        qc.invalidateQueries({ queryKey: ["open-accounts"] });
        if (cart.openAccountId) {
          qc.invalidateQueries({ queryKey: ["open-account", cart.openAccountId] });
        }
      }
      /*
       * قفلِ مشتری فقط برای حساب‌باز: اگر بخشی از پرداختِ این فاکتور نسیه بوده
       * (حتی ترکیبی)، مشتری روی تب می‌ماند برای خریدِ بعدی؛ فروشِ نقدی/کارت/چک
       * برمی‌گردد به «نقدی گذری».
       */
      resetCurrent();
      if (soldCustomerId) {
        qc.invalidateQueries({ queryKey: ["customer", soldCustomerId] });
        qc.invalidateQueries({ queryKey: ["customer-today-count", soldCustomerId] });
      }
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
    /*
     * فروش روی حساب باز گام پرداخت ندارد — پول در تسویه می‌آید. Enter یعنی
     * همین‌جا ثبتِ فاکتورِ جاری (OPEN) روی همان حساب.
     */
    if (cart.openAccountId) {
      submit.mutate({});
      return;
    }
    setShowCheckout(true);
  }, [activeLines.length, noWarehouse, zeroPriceCount, cart.openAccountId, submit]);

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


  /**
   * ارسال سبد/کالا به گوشی کارگر به‌عنوان یک کارِ چندقلمی (به یک کارگر یا همه)
   * + پیام اختیاری. `idempotencyKey` تازه یعنی هر دکمه‌ی «ارسال» یک کارِ مستقل
   * می‌سازد؛ دوباره‌زدنِ همان دکمه (double-click/retry شبکه) تکراری نمی‌سازد.
   */
  const sendToWorker = useMutation({
    mutationFn: (args: { assignedToId: string | null; note?: string }) =>
      createWorkTask({
        warehouseId,
        assignedToId: args.assignedToId,
        note: args.note?.trim() || undefined,
        idempotencyKey: uuid(),
        lines: workerLinesRef.current,
      }),
    onSuccess: (task) => {
      toast.success(`${toFa(task.totalItems)} کالا برای کارگر فرستاده شد`);
      qc.invalidateQueries({ queryKey: ["work-tasks"] });
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
    showWorkerPicker || showWorkTasks || showRecent || showCheckout || showOpenAccounts || !!receipt ||
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
        setShowWorkTasks(false);
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

      {/* نوار اسکن — همیشه فوکوس دارد. min-w-0 روی جستجو و سقفِ عرضِ چیپِ مشتری
          کنار هم تضمین می‌کنند اسمِ بلندِ مشتری هرگز اسکن‌بار را له نکند؛
          flex-wrap هم پناهِ آخر برای پنجره‌های خیلی باریک است. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
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
                onPickRow(liveList[liveHighlight]);
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
            className="h-9 pe-10 text-sm"
          />

          <InlineResults
            rows={liveList}
            highlight={liveHighlight}
            loading={useLocalSearch ? false : liveResults.isFetching}
            pickingId={pickingId}
            onHover={setLiveHighlight}
            onPick={onPickRow}
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
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          {warehouses.data?.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        {/* سه دکمه‌ی «حساب باز / کارهای انبار / فاکتورهای امروز» به نوار بالای
            مشترک (کنار ساعت) منتقل شدند؛ اینجا فقط اسکن، چیپ مشتری و انبار
            می‌مانند تا فضای نوار اسکن بازتر شود. میان‌برهای F3 و F10 همان‌جا
            که بودند، دست‌نخورده. */}
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
        </div>        {/* ستون مشتری و جمع.
          فقط «خلاصه اقلام» اسکرول می‌شود؛ مبلغ نهایی بیرون از ناحیه‌ی اسکرول و
          ثابت پایین ستون است — تنها عددی که فروشنده بلند می‌خواند نباید با
          اسکرول از دید برود. قبلاً همه در یک ستون بودند و وقتی محتوا بلند می‌شد
          (هشدار قیمت، خلاصه‌ی تخفیف، توضیح) از پایین سرریز می‌کرد و روی نوار
          کلیدها می‌افتاد.
        */}
        <div className="flex min-h-0 w-80 shrink-0 flex-col gap-3">
          {/*
            کارت مشتری بیرون از ناحیه‌ی اسکرول است: همیشه کامل دیده می‌شود و
            اسکرول‌بار نمی‌گیرد. فقط «جمع اقلام» در فضای باقی‌مانده اسکرول می‌شود.
          */}
          <CustomerSummary
            customer={customer}
            todayCount={customerTodayInvoices.data?.meta?.total ?? 0}
            recentInvoices={customerTodayInvoices.data?.data ?? []}
            onOpenFullProfile={() => window.open(`/admin/customers/${customer?.id}`, "_blank")}
            onShowTodayPurchases={() => setShowTodayPurchases(true)}
          />

          {/* دکمه انتخاب مشتری وقتی مشتری انتخاب نشده */}
          {!customer && (
            <Button
              variant="outline"
              className="h-9 w-full justify-center gap-2"
              onClick={() => setShowCustomer(true)}
            >
              <User className="size-4" /> انتخاب مشتری <Key>F4</Key>
            </Button>
          )}

          {/* ناحیه‌ی اسکرول — فقط خلاصه اقلام (جمع، تخفیف‌ها، توضیح) */}
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

              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder="توضیح روی فاکتور (اختیاری)"
                className="mt-3 h-9 text-sm"
              />
            </div>
          </div>

          {/* مبلغ نهایی — بیرون از ناحیه‌ی اسکرول، ثابت پایین ستون. تنها عددی
              که فروشنده بلند می‌خواند باید از فاصله‌ی یک متری هم خوانده شود. */}
          <div className="shrink-0 rounded-lg bg-primary px-3 py-2.5 text-primary-foreground">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-primary-foreground/80">مبلغ نهایی</span>
              <span className="text-2xl font-bold tabular-nums">{money(total)}</span>
            </div>
            <p className="text-end text-[11px] text-primary-foreground/70">ریال</p>
          </div>

        </div>
      </div>

      {zeroPriceCount > 0 && (
        <p className="shrink-0 rounded-md border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-xs text-amber-600 dark:border-amber-600/40 dark:bg-amber-600/10 dark:text-amber-400">
          {toFa(zeroPriceCount)} ردیف قیمت ندارد. تا قیمتشان وارد نشود فاکتور ثبت نمی‌شود.
        </p>
      )}

      {/*
        نوارِ عملیاتِ اصلی — پایینِ صفحه، ۴ باکسِ هم‌اندازه در یک ردیف. «تسویه»
        تنها دکمه‌ی توپُرِ آبی است (عملِ نهایی)؛ سه‌تای دیگر outlineِ کم‌رنگ‌ترند
        تا سلسله‌مراتب روشن باشد. همه h-11 و flex-1 تا عرض برابر بگیرند.
      */}
      <div className="flex shrink-0 items-stretch gap-2">
        <Button
          variant="outline"
          className="h-11 flex-1 gap-2"
          disabled={!lines.length || sendToWorker.isPending}
          onClick={openWorkerForCart}
        >
          <Send className="size-4" />
          {sendToWorker.isPending ? "در حال ارسال…" : "ارسال به کارگر"}
          <Key>F9</Key>
        </Button>

        <Button
          variant="outline"
          className="h-11 flex-1 gap-2"
          disabled={!lines.length || saveQuotation.isPending}
          onClick={() => setShowQuotation(true)}
        >
          <FileClock className="size-4" /> پیش‌فاکتور <Key>F8</Key>
        </Button>

        <Button
          variant="outline"
          className="h-11 flex-1 gap-2"
          disabled={!lines.length}
          onClick={() => setShowPayment(true)}
        >
          <CreditCard className="size-4" /> پرداخت <Key>F7</Key>
        </Button>

        <Button
          className="h-11 flex-1 gap-2 text-sm font-semibold"
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
      {/*
        یک خط، همیشه.

        با flex-wrap این نوار روی پنجره‌ی باریک به دو-سه خط می‌شکست و هر خطش
        مستقیماً از ارتفاعِ سبد کم می‌کرد — یعنی دو ردیف کالای کم‌تر. حالا اگر جا
        نشد افقی اسکرول می‌شود و ارتفاعش ثابت می‌ماند.
      */}
      <div className="flex shrink-0 items-center gap-x-4 overflow-x-auto whitespace-nowrap rounded-lg border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        {(
          [
            ["Enter", "بارکد / تسویه"],
            ["Tab", "تعداد ← قیمت"],
            ["F2", "تسویه"],
            ["F3", "حساب باز"],
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
        onSubmit={(payments) => submit.mutate({ payments })}
        onOpenFullPayment={() => { setShowCheckout(false); setShowPayment(true); }}
        onClose={() => { setShowCheckout(false); focusScan(); }}
      />

      <OpenAccounts
        open={showOpenAccounts}
        onClose={() => { setShowOpenAccounts(false); focusScan(); }}
        onContinue={(account) => {
          /*
             «ادامهی فاکتور» — صندوق را روی همان حساب باز میگذارد: مشتریِ حساب
             روی سبد مینشیند، قفل میشود، و این تب به همان حساب وصل میشود تا
             فاکتورِ این نوبت OPEN ثبت شود و داخل همان حساب بیاید.
          */
          getCustomer(account.customerId)
            .then((c) => {
              setCustomer(c);
              patchCart({ openAccountId: account.id, customerLocked: true });
              invalidateIdem();
              toast.success(`فروش به «${account.customerName}» روی حساب باز — جنسها را اسکن کنید`);
            })
            .catch(() => toast.error("بارگذاری مشتری حساب ناموفق بود"));
        }}
      />

      <RecentInvoices
        open={showRecent}
        warehouseId={warehouseId}
        tasksByInvoice={tasksByInvoice}
        onClose={() => { setShowRecent(false); focusScan(); }}
      />

      <WorkTasksPanel
        open={showWorkTasks}
        warehouseId={warehouseId}
        onClose={() => { setShowWorkTasks(false); focusScan(); }}
      />

      {/* کسری: مشتریِ فعلیِ سبد همراهش می‌رود تا بعداً بشود خبرش کرد. */}
      <ShortageDialog
        open={showShortage}
        onOpenChange={(v) => { setShowShortage(v); if (!v) focusScan(); }}
        warehouseId={warehouseId}
        customerId={customer?.id ?? null}
      />

      <ProductFormDialog
        open={showAddProduct}
        onOpenChange={(v) => { setShowAddProduct(v); if (!v) focusScan(); }}
        mode="create"
      />

      <PaymentDialog
        open={showPayment}
        total={total}
        hasCustomer={!!customer}
        customerCreditDays={customer?.creditDays}
        customerChequeRateBp={customerDetail.data?.chequeRateBp}
        customerChequeRateMode={customerDetail.data?.chequeRateMode}
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
