"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiException } from "@/lib/api-error-messages";
import {
  Search, FileClock, PencilLine, Undo2, X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCorrection,
  createInvoice,
  createQuotation,
  createWorkTask,
  ensureOpenAccount,
  createReceipt,
  createReturn,
  updateInvoiceLineNotes,
  getCorrectableLines,
  getCustomer,
  getInvoice,
  getReturnableLines,
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
  PaymentMethod,
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
import { InlineResults, type SearchResultRow } from "./_components/inline-results";
import { OpenAccounts } from "./_components/open-accounts";
import { CustomerInvoicesPanel } from "./_components/customer-invoices";
import { OpenQuotations } from "./_components/open-quotations";
import { OpenInvoices } from "./_components/open-invoices";
import { ShortcutsHelp, type ShortcutGroup } from "@/components/shortcuts-help";
import { DocumentShell, type CommandMap } from "@/components/document/document-shell";
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
import { QUOTE_DOC, SALE_DOC, type Cart } from "./_lib/carts";
import { diffEdit, diffNotes, editingStateOf, invoiceToLines } from "./_lib/invoice-edit";
import { invoiceToReturnLines, returnDraft, returningStateOf } from "./_lib/invoice-return";
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

  /*
   * سندِ این تب، یک بار باریک‌شده.
   *
   * بقیه‌ی صفحه با همین سه متغیر کار می‌کند نه با `cart.doc.type === "..."` در
   * بیست جا — هم خواناتر است، هم اگر فردا نوعِ سندِ تازه‌ای اضافه شود کامپایلر
   * همین‌جا جلویمان را می‌گیرد.
   */
  const editing = cart.doc.type === "correction" ? cart.doc : null;
  const returning = cart.doc.type === "return" ? cart.doc : null;
  const quoting = cart.doc.type === "quote" ? cart.doc : null;
  /** سندی که به یک فاکتورِ ثبت‌شده قفل است — ویرایش یا مرجوعی. */
  const lockedToInvoice = editing ?? returning;
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
  /**
   * پنلِ «مشتری و فاکتورهایش» — همان چیزی که جای پنجره‌ی انتخاب مشتری نشست.
   * از F4، از کلیک روی نامِ مشتری، و از دکمه‌ی انتخاب مشتری باز می‌شود.
   */
  /**
   * پنل مشتری — و اینکه برای چه باز شده.
   *
   * null یعنی بسته. «pick» از F4 می‌آید (انتخاب مشتری برای سبد)، «ledger» از
   * کلیک روی نامِ مشتری (دیدن فاکتورهایش).
   */
  const [customerPanel, setCustomerPanel] = useState<"pick" | "ledger" | null>(null);
  const showCustomer = customerPanel !== null;
  const setShowCustomer = useCallback(
    (v: boolean) => setCustomerPanel(v ? "pick" : null),
    [],
  );
  /** راهنمای کلیدها (F1) — تنها جایی که همه‌ی میان‌برها با هم دیده می‌شوند. */
  const [showHelp, setShowHelp] = useState(false);
  /** فهرست پیش‌فاکتورهای باز (Alt+Q) — بارگذاری یکی از آن‌ها در همین سبد. */
  const [showQuotes, setShowQuotes] = useState(false);
  /** فهرست فاکتورها (Ctrl+F) — جایگزینِ پنجره‌ی «فاکتورهای امروز». */
  const [showInvoices, setShowInvoices] = useState(false);
  /*
   * دو خانه‌ای که فقط سندِ مرجوعی دارد. روی صفحه‌اند نه روی سبد، چون با ثبت
   * تمام می‌شوند و هیچ‌وقت باید بین دو تبِ مرجوعی سفر کنند.
   */
  /**
   * تسویه‌ی همان لحظه‌ی یک اصلاح.
   *
   * ویرایشِ فاکتور تقریباً همیشه مبلغ را عوض می‌کند و مشتری همان‌جا جلوی
   * پیشخوان ایستاده. بدون این، فروشنده باید سند را ثبت کند، برود پرونده‌ی
   * مشتری، دریافت وجه بزند و مبلغ را دستی پیدا کند.
   */
  const [settle, setSettle] = useState<
    {
      amount: number
      /** null = فروشِ نقدیِ گذری؛ جایی برای ثبتِ پول نیست. */
      customerId: string | null
      customerName: string
      invoiceNumber: number
    } | null
  >(null);

  const [refundMethod, setRefundMethod] = useState<PaymentMethod | "">("");
  const [returnReason, setReturnReason] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  /** متنی که در نوار بالا زده شده و باید به جست‌وجو منتقل شود. */
  const [searchSeed, setSearchSeed] = useState("");
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


  const customerDetail = useQuery({
    queryKey: ["customer", customer?.id],
    queryFn: () => getCustomer(customer!.id),
    enabled: !!customer?.id,
  });

  /*
   * فاکتورهای امروزِ همین مشتری — یک کوئری واحد با `pageSize: 5` که هم عددِ
   * چیپ (meta.total) و هم فهرستِ ۵ فاکتورِ پنل مشتری را سیر می‌کند. قبلاً دو
   * کوئریِ جدا با pageSize متفاوت و کلیدِ یکسان می‌رفت که هیچ dedupe‌ای
   * نمی‌شد؛ حالا داده‌اش به چیپِ مشتری هم پاس داده می‌شود.
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
      /*
       * رزرو **هشدار است، نه سد**.
       *
       * جنسی که روی قفسه هست نباید به‌خاطر پیش‌فاکتورِ هفته‌ی پیش نفروخته
       * بماند — مشتری جلوی پیشخوان ایستاده. ولی فروشنده باید بداند که این
       * تعداد به کسِ دیگری قول داده شده و خودش تصمیم بگیرد.
       */
      if (res.reserved && res.reserved > 0) {
        toast.warning(
          `${toFa(res.reserved)} عدد از «${res.product.name}» رزرو شده`,
          { description: `قابل فروش: ${toFa(res.available ?? 0)} عدد` },
        );
      } else if (res.belowMinStock) {
        // حد سفارش فقط وقتی گفته می‌شود که رزرویی در کار نباشد؛ دو هشدار
        // پشت‌سرهم روی هم می‌افتند و هیچ‌کدام خوانده نمی‌شوند.
        toast.warning(`«${res.product.name}» به حد سفارش رسیده`);
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

  /**
   * یک پیش‌فاکتور را در سبد بنشان.
   *
   * هم از `?quotation=` صدا زده می‌شود هم از پنلِ Alt+Q — یک منطق، تا دو
   * مسیر با هم اختلاف پیدا نکنند.
   */
  const loadQuotation = useCallback(
    (id: string) =>
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
        setShowQuotes(false);
        focusScan();
      })
      .catch(() => toast.error("بارگذاری پیش‌فاکتور ناموفق بود")),
    [setLines, setCustomer, focusScan],
  );

  useEffect(() => {
    const id = searchParams.get("quotation");
    if (!id || seededQuotation.current) return;
    seededQuotation.current = true;
    void loadQuotation(id);
  }, [searchParams, loadQuotation]);

  // ---------- آوردنِ یک فاکتورِ ثبت‌شده برای ویرایش ----------

  /*
   * سبدِ در حال کار قربانیِ ویرایش نمی‌شود.
   *
   * اگر تبِ فعلی خالی باشد فاکتور همان‌جا باز می‌شود؛ وگرنه یک تب تازه.
   * ولی `addCart` تبِ فعال را در رندرِ بعد عوض می‌کند، پس نمی‌شود بلافاصله
   * `patchCart` زد — می‌رفت روی تبِ قبلی. محموله اینجا می‌ماند تا تب عوض شود.
   */
  const pendingEdit = useRef<Partial<Cart> | null>(null);

  useEffect(() => {
    if (!pendingEdit.current) return;
    const payload = pendingEdit.current;
    pendingEdit.current = null;
    patchCart(payload);
    focusScan();
  }, [activeId, patchCart, focusScan]);

  const loadInvoice = useMutation({
    /*
     * مشتری اختیاری است: از پنلِ مشتری از قبل می‌آید، ولی از فهرستِ فاکتورها
     * نه — آنجا خودِ فاکتور می‌گوید مالِ کیست. `null` واقعاً یعنی «نقدیِ
     * گذری» و باید همان‌طور بماند.
     */
    mutationFn: async (v: { invoiceId: string; customer: Customer | null }) => {
      const data = await getCorrectableLines(v.invoiceId);
      const customer =
        v.customer ??
        (data.invoice.customer ? await getCustomer(data.invoice.customer.id) : null);
      return { data, customer };
    },
    onSuccess: ({ data, customer: c }) => {
      if (!data.correctable) {
        toast.error("این فاکتور ویرایش نمی‌شود — باطل شده است");
        return;
      }
      if (!data.lines.length) {
        toast.error("این فاکتور ردیفی برای ویرایش ندارد");
        return;
      }

      const payload: Partial<Cart> = {
        lines: invoiceToLines(data),
        customer: c,
        customerLocked: !!c,
        openAccountId: null,
        discount: NO_DISCOUNT,
        note: "",
        activeRow: 0,
        errorLine: null,
        doc: editingStateOf(data),
      };

      setShowCustomer(false);
      invalidateIdem();

      if (!cart.lines.length && !editing) {
        patchCart(payload);
        focusScan();
        return;
      }
      if (!canAdd) {
        toast.error("همه‌ی تب‌ها پُرند — یکی را ببندید");
        return;
      }
      pendingEdit.current = payload;
      addCart();
    },
    onError: () => toast.error("باز کردن فاکتور ناموفق بود"),
  });

  /**
   * آوردنِ یک فاکتور به‌عنوانِ سندِ «برگشت از فروش».
   *
   * دقیقاً همان مسیرِ ویرایش است — همان تب، همان جدول، همان کلیدها — فقط
   * معنیِ ستونِ تعداد عوض می‌شود. چراییِ قفل‌بودنش به فاکتور، بالای
   * `_lib/invoice-return.ts` نوشته شده.
   */
  const loadReturn = useMutation({
    mutationFn: async (v: { invoiceId: string; customer: Customer | null }) => {
      const data = await getReturnableLines(v.invoiceId);
      const customer =
        v.customer ??
        (data.invoice.customer ? await getCustomer(data.invoice.customer.id) : null);
      return { data, customer };
    },
    onSuccess: ({ data, customer: c }) => {
      if (!data.returnable) {
        toast.error("این فاکتور مرجوعی نمی‌خورد — باطل شده است");
        return;
      }
      const rows = invoiceToReturnLines(data);
      if (!rows.length) {
        toast.error("همه‌ی اقلامِ این فاکتور قبلاً برگشت خورده‌اند");
        return;
      }

      const payload: Partial<Cart> = {
        lines: rows,
        customer: c,
        customerLocked: !!c,
        openAccountId: null,
        discount: NO_DISCOUNT,
        note: "",
        activeRow: 0,
        errorLine: null,
        doc: returningStateOf(data),
      };

      // روی حساب باز پولی پرداخت نشده؛ تنها راهِ برگشت، کسر از حساب است.
      setRefundMethod(data.isOpenAccount ? "CREDIT" : "");
      setReturnReason("");
      setShowCustomer(false);
      invalidateIdem();

      if (!cart.lines.length && cart.doc.type === "sale") {
        patchCart(payload);
        focusScan();
        return;
      }
      if (!canAdd) {
        toast.error("همه‌ی تب‌ها پُرند — یکی را ببندید");
        return;
      }
      pendingEdit.current = payload;
      addCart();
    },
    onError: () => toast.error("باز کردن فاکتور برای مرجوعی ناموفق بود"),
  });

  const saveReturn = useMutation({
    mutationFn: async () => {
      const doc = returning!;
      const draft = returnDraft(doc, lines);

      if (!draft.lines.length) throw new Error("هیچ قلمی برای برگشت انتخاب نشده");
      if (!returnReason.trim()) throw new Error("دلیلِ مرجوعی اجباری است");
      if (!refundMethod) throw new Error("روش برگشت وجه را انتخاب کنید");

      return createReturn({
        idempotencyKey: ensureIdem(),
        invoiceId: doc.invoiceId,
        refundMethod: refundMethod as PaymentMethod,
        reason: returnReason.trim(),
        note: note.trim() || undefined,
        lines: draft.lines,
      });
    },
    onSuccess: (r) => {
      toast.success(`مرجوعی ${toFa(r.number)} ثبت شد — ${rial(r.refundAmount)}`);
      const cid = customer?.id;
      resetCurrent();
      setRefundMethod("");
      setReturnReason("");
      qc.invalidateQueries({ queryKey: ["pos-customer-invoices"] });
      qc.invalidateQueries({ queryKey: ["pos-recent-invoices"] });
      if (cid) qc.invalidateQueries({ queryKey: ["customer", cid] });
      focusScan();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "ثبت مرجوعی ناموفق بود");
      invalidateIdem();
    },
  });

  /** دریافتِ همان مبلغِ اصلاح، بدون ترکِ صندوق. */
  const takeSettlement = useMutation({
    mutationFn: (payments: PaymentInput[]) =>
      createReceipt({
        customerId: settle!.customerId!,
        note: `تسویه‌ی اصلاح فاکتور ${toFa(settle!.invoiceNumber)}`,
        payments: payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          cheque: p.cheque,
        })),
      }),
    onSuccess: (r) => {
      toast.success(`رسید ${toFa(r.number)} ثبت شد — ${rial(r.amount)}`);
      const cid = settle?.customerId;
      setSettle(null);
      qc.invalidateQueries({ queryKey: ["pos-customer-invoices"] });
      if (cid) qc.invalidateQueries({ queryKey: ["customer", cid] });
      focusScan();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "ثبت دریافت ناموفق بود"),
  });

  /** F8 — همین سبد را به پیش‌فاکتور تبدیل کن (و برعکس). */
  const toggleQuote = useCallback(() => {
    patchCart((c) => ({ doc: c.doc.type === "quote" ? SALE_DOC : QUOTE_DOC }));
    invalidateIdem();
    focusScan();
  }, [patchCart, invalidateIdem, focusScan]);

  /*
   * آوردنِ یک فاکتورِ ثبت‌شده برای ویرایش (`/admin/pos?edit=...`).
   *
   * از کلیک روی هر ردیفِ فاکتور در پرونده‌ی مشتری می‌آید. یک بار بیشتر اجرا
   * نمی‌شود، وگرنه لغوِ ویرایش دوباره همان فاکتور را برمی‌گرداند.
   */
  const seededEdit = useRef(false);

  useEffect(() => {
    const invoiceId = searchParams.get("edit");
    if (!invoiceId || seededEdit.current) return;
    seededEdit.current = true;
    getInvoice(invoiceId)
    /*
     * مشتری را خودِ loadInvoice پیدا می‌کند؛ اینجا فقط وجودِ فاکتور بررسی
     * می‌شود تا لینکِ خراب پیامِ روشن بدهد نه یک صفحه‌ی خالی.
     *
     * فروشِ نقدیِ گذری هم ویرایش می‌شود: سرور اصلاحیه‌ی بدونِ مشتری را قبول
     * می‌کند و فقط سطرِ دفتر را رد می‌کند.
     */
    getInvoice(invoiceId)
      .then(() => loadInvoice.mutate({ invoiceId, customer: null }))
      .catch(() => toast.error("فاکتور پیدا نشد"));
    // loadInvoice عمداً در وابستگی‌ها نیست: هویتش با هر رندر عوض می‌شود و
    // این اثر باید دقیقاً یک بار اجرا شود.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /** بستنِ ویرایش بدون ثبت — سبد پاک می‌شود و تب به فروشِ عادی برمی‌گردد. */
  const cancelEdit = useCallback(() => {
    setRefundMethod("");
    setReturnReason("");
    patchCart({
      lines: [],
      doc: SALE_DOC,
      customerLocked: false,
      activeRow: 0,
      errorLine: null,
      discount: NO_DISCOUNT,
      note: "",
    });
    invalidateIdem();
    focusScan();
  }, [patchCart, invalidateIdem, focusScan]);

  /**
   * ثبتِ ویرایش = ثبتِ یک اصلاحیه با تفاوتِ سبد و وضعیتِ سرور.
   * چراییِ اصلاحیه‌بودن، بالای `_lib/invoice-edit.ts` نوشته شده.
   */
  /**
   * روشِ ردوبدلِ اختلاف برای فاکتورِ بدونِ مشتری.
   *
   * دفتری در کار نیست، پس اختلاف همان لحظه سرِ پیشخوان داده یا گرفته می‌شود
   * و سرور آن را روی خودِ فاکتور ثبت می‌کند.
   */
  const [cashSettleMethod, setCashSettleMethod] = useState<"CASH" | "CARD">("CASH");

  const saveEdit = useMutation({
    mutationFn: async () => {
      const doc = editing!;
      const { changed, added } = diffEdit(doc, lines);
      const notes = diffNotes(doc, lines);

      if (!changed.length && !added.length && !notes.length) {
        throw new Error("چیزی تغییر نکرده");
      }

      /*
       * توضیح‌ها اول و جدا می‌روند: سندِ مالی نمی‌سازند و نباید به تغییرِ
       * عدد گره بخورند. اگر فقط توضیح عوض شده باشد، همین‌جا تمام است.
       */
      if (notes.length) {
        await updateInvoiceLineNotes(doc.invoiceId, notes);
      }
      // فقط توضیح عوض شده ⇒ سندی ساخته نشد و چیزی برای تسویه نیست.
      if (!changed.length && !added.length) return null;

      return createCorrection({
        idempotencyKey: ensureIdem(),
        invoiceId: doc.invoiceId,
        reason: "ویرایش از صندوق",
        note: note.trim() || undefined,
        lines: changed,
        // فاکتورِ بدونِ مشتری: سرور اختلاف را به‌عنوان پرداختِ همین روش ثبت می‌کند.
        settlementMethod: customer ? undefined : cashSettleMethod,
        // اسکنِ یک بارکد سرِ ویرایش = «این را هم به همین فاکتور اضافه کن».
        addedLines: added.length
          ? added.map((l) => ({
              productId: l.productId,
              locationId: l.locationId || undefined,
              quantity: l.quantity,
              // تخفیفِ ردیف در قیمتِ واحد تا می‌شود — همان قاعده‌ی diffEdit.
              unitPrice: Math.round(lineNet(l) / l.quantity),
            }))
          : undefined,
      });
    },
    onSuccess: (corr) => {
      toast.success(`فاکتور ${toFa(editing?.invoiceNumber ?? 0)} اصلاح شد`);

      /*
       * مثبت یعنی مشتری بدهکارتر شد ⇒ پول بگیر. منفی یعنی به نفعش شد و
       * همان لحظه در دفترش نشسته — کاری برای گرفتن نیست.
       * null یعنی فقط توضیح عوض شده و اصلاً سندی در کار نبوده.
       */
      if (corr && corr.amountAdjust !== 0) {
        setSettle({
          amount: corr.amountAdjust,
          customerId: customer?.id ?? null,
          customerName: customer?.fullName ?? "نقدی گذری",
          invoiceNumber: editing?.invoiceNumber ?? 0,
        });
      }
      const cid = customer?.id;
      resetCurrent();
      patchCart({ doc: SALE_DOC, customerLocked: false });
      qc.invalidateQueries({ queryKey: ["pos-customer-invoices"] });
      qc.invalidateQueries({ queryKey: ["pos-recent-invoices"] });
      if (cid) qc.invalidateQueries({ queryKey: ["customer", cid] });
      focusScan();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "ثبت اصلاحیه ناموفق بود");
      invalidateIdem();
    },
  });

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
          lineNote: l.note?.trim() || undefined,
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

  /** رفتن به تسویه — از Enterِ خانه‌ی خالیِ اسکن یا F2. */
  const startCheckout = useCallback(() => {
    /*
     * یک کلید برای «تمام شد»، در هر سندی.
     *
     * F2 روی فروش تسویه است، روی ویرایش اصلاحیه، روی مرجوعی برگشتی، روی
     * پیش‌فاکتور ثبتِ پیش‌فاکتور. فروشنده یک کلید یاد می‌گیرد نه چهار تا.
     */
    if (editing) {
      if (!saveEdit.isPending) saveEdit.mutate();
      return;
    }
    if (returning) {
      if (!saveReturn.isPending) saveReturn.mutate();
      return;
    }
    if (quoting) {
      if (!activeLines.length) return;
      if (!saveQuotation.isPending) {
        saveQuotation.mutate({ validForMinutes: quoting.validForMinutes, print: false });
      }
      return;
    }
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
  }, [
    activeLines.length, noWarehouse, zeroPriceCount, cart.openAccountId,
    editing, returning, quoting, submit, saveEdit, saveReturn, saveQuotation,
  ]);

  /**
   * F8 — همین سبد را به‌عنوان پیش‌فاکتور ثبت کن.
   * موجودی دست نمی‌خورد؛ فقط قیمت برای مدت مشخصی نگه داشته می‌شود.
   */
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

  /** رفتن به تبِ قبلی/بعدی، حلقه‌وار — «سند قبلی/بعدی» در زبانِ صندوق. */
  const stepCart = useCallback(
    (dir: 1 | -1) => {
      const i = carts.findIndex((c) => c.id === activeId);
      if (i < 0) return;
      setActiveId(carts[(i + dir + carts.length) % carts.length].id);
      focusScan();
    },
    [carts, activeId, setActiveId, focusScan],
  );

  /** مبلغی که در سندِ مرجوعی به مشتری برمی‌گردد — صفر یعنی هنوز چیزی انتخاب نشده. */
  const returnTotal = useMemo(
    () => (returning ? returnDraft(returning, lines).refundAmount : 0),
    [returning, lines],
  );

  // ---------- فرمان‌های سند ----------

  /**
   * وصل‌کردن صندوق به نوار فرمانِ مشترک.
   *
   * فرمانی که اینجا نیاید، روی نوار خاموش می‌ماند — و همین «خاموش» خودش یک
   * پیام است: «اکسل» و «پیامک» برای فاکتورِ نیمه‌کاره معنی ندارند و جایشان
   * هم معلوم است برای وقتی که بیایند. جدولِ کلیدها در components/document/
   * commands.ts است؛ هیچ کلیدی اینجا تعریف نمی‌شود.
   */
  const commands: CommandMap = useMemo(() => {
    return {
      new: { run: () => { addCart(); focusScan(); }, label: "فاکتور نو" },

      // سندِ قبلی/بعدی در صندوق یعنی تبِ قبلی/بعدی — همان مفهوم، همان کلید.
      prev: carts.length > 1 ? { run: () => stepCart(-1), label: "تب قبلی" } : undefined,
      next: carts.length > 1 ? { run: () => stepCart(1), label: "تب بعدی" } : undefined,

      find: { run: () => setShowInvoices(true) },
      quotes: { run: () => setShowQuotes(true) },

      // مرجوعی قفل به فاکتور است: نه قلمی اضافه می‌شود نه حذف.
      addRow: returning ? undefined : { run: focusScan, label: "افزودن قلم" },
      delRow: returning
        ? undefined
        : lines.length
          ? { run: () => removeLine(activeRow) }
          : { run: () => {}, disabled: true },
      discount: returning
        ? undefined
        : { run: () => document.getElementById("invoice-discount")?.focus() },

      // توضیحِ قلمِ فعال — خانه‌اش زیرِ نامِ کالا در همان ردیف است.
      lineNote: !returning && lines[activeRow]
        ? {
            run: () => {
              const el = document.querySelector<HTMLInputElement>(
                `[data-line-note="${activeRow}"]`,
              );
              el?.focus();
              el?.select();
            },
          }
        : undefined,

      party: { run: () => setShowCustomer(true), label: "مشتری" },
      ledger: { run: () => setShowOpenAccounts(true), label: "حساب باز" },
      kardex: lines[activeRow]
        ? { run: () => window.open(`/admin/products/${lines[activeRow].productId}`, "_blank") }
        : { run: () => {}, disabled: true },

      /*
       * چاپ فقط وقتی سندی برای چاپ وجود دارد. روی فاکتورِ قفل‌شده همان فاکتور
       * چاپ می‌شود؛ روی سبدِ ثبت‌نشده هنوز چیزی چاپ‌کردنی نیست.
       */
      print: lockedToInvoice
        ? {
            run: () =>
              window.open(`/admin/print/invoice/${lockedToInvoice.invoiceId}`, "_blank"),
          }
        : undefined,

      help: { run: () => setShowHelp(true) },

      workTasks: { run: () => setShowWorkTasks(true) },
      addProduct: { run: () => setShowAddProduct(true) },
      shortage: { run: () => setShowShortage(true) },

      dispatch: !editing && !returning && lines.length
        ? { run: openWorkerForCart, pending: sendToWorker.isPending }
        : undefined,

      quote: !editing && !returning
        ? {
            run: toggleQuote,
            label: quoting ? "برگشت به فروش" : "پیش‌فاکتور",
            disabled: !lines.length,
          }
        : undefined,

      /*
       * «پرداخت» فقط سرِ فروش. پیش‌فاکتور پولی نمی‌گیرد، ویرایش از راه دفتر
       * جبران می‌شود، و مرجوعی روشِ برگشتِ وجهش را در پای فرم می‌پرسد.
       */
      pay: !editing && !returning && !quoting && lines.length
        ? { run: () => setShowPayment(true) }
        : undefined,

      commit: editing
        ? {
            run: () => saveEdit.mutate(),
            label: `ثبت اصلاح ${toFa(editing.invoiceNumber)}`,
            pending: saveEdit.isPending,
          }
        : returning
          ? {
              run: () => saveReturn.mutate(),
              label: "ثبت مرجوعی",
              disabled: !returnTotal,
              pending: saveReturn.isPending,
            }
          : quoting
            ? {
                run: startCheckout,
                label: "ثبت پیش‌فاکتور",
                disabled: !activeLines.length,
                pending: saveQuotation.isPending,
              }
            : {
                run: startCheckout,
                label: "تسویه و ثبت",
                disabled: !canCheckout,
                pending: submit.isPending,
              },

      // روی سندی که به فاکتور قفل است، «ابطال» یعنی رهاکردنِ همین سند.
      void: lockedToInvoice
        ? { run: cancelEdit, label: editing ? "لغو ویرایش" : "لغو مرجوعی" }
        : quoting
          ? { run: toggleQuote, label: "برگشت به فروش" }
          : undefined,
    };
  }, [
    editing, returning, quoting, lockedToInvoice, carts.length, lines, activeRow,
    canCheckout, activeLines.length, returnTotal,
    saveEdit, saveReturn, saveQuotation.isPending, submit.isPending,
    startCheckout, cancelEdit, toggleQuote,
    openWorkerForCart, sendToWorker.isPending,
    addCart, focusScan, removeLine, stepCart,
    setShowRecent, setShowCustomer, setShowOpenAccounts, loadQuotation,
    setShowWorkTasks, setShowAddProduct, setShowShortage,
  ]);

  /*
   * همان فرمانِ ثبت که آیکنِ نوار بالا هم می‌زند — دو منبع نداریم.
   * تکه‌تکه بیرون کشیده می‌شود تا داخلِ JSX دنبالِ زنجیره‌ی `?.` نگردیم.
   */
  const commitRun = commands.commit?.run;
  const commitLabel = commands.commit?.label ?? "ثبت";
  const commitBusy = !!commands.commit?.pending;
  const commitOff = !!commands.commit?.disabled || commitBusy;

  // ---------- میانبرها ----------

  /**
   * فهرستِ کلیدها یک‌جا — خوراکِ راهنمای F1.
   *
   * نوارِ همیشگیِ پایینِ صفحه حذف شد؛ یک خط که بعد از روز اول خوانده نمی‌شد
   * ولی هر روز یک ردیف از ارتفاعِ جدول می‌گرفت. حالا همان فهرست پشتِ آیکنِ
   * راهنماست و تا وقتی لازم نشود جا نمی‌گیرد.
   */
  const shortcutGroups: ShortcutGroup[] = useMemo(
    () => [
      {
        title: "فروش",
        items: [
          { keys: "Enter", label: "افزودن بارکد / رفتن به تسویه", primary: true },
          { keys: "F2", label: editing ? "ثبت اصلاح فاکتور" : "تسویه و ثبت فاکتور", primary: true },
          { keys: "Tab", label: "از بارکد به تعداد، بعد قیمت" },
          { keys: "F7", label: "پرداخت ترکیبی" },
          { keys: "Insert", label: "افزودن قلم" },
          { keys: "Delete", label: "حذف ردیف فعال" },
          { keys: "F8", label: "پیش‌فاکتور ↔ فروش" },
          { keys: "Alt+Q", label: "پیش‌فاکتورهای باز — بارگذاری در سبد" },
          { keys: "F6", label: "تخفیف فاکتور" },
          { keys: "Alt+T", label: "توضیح قلم فعال" },
          { keys: "F9", label: "ارسال به کارگر" },
          { keys: "Alt+W", label: "کارهای انبار" },
          { keys: "Alt+A", label: "افزودن کالا" },
          { keys: "Alt+S", label: "کسری کالا" },
        ],
      },
      {
        title: "مشتری و فاکتورها",
        items: [
          { keys: "F4", label: "مشتری و فاکتورهایش", primary: true },
          { keys: "Ctrl+Enter", label: "آوردنِ آخرین فاکتور مشتری برای ویرایش" },
          { keys: "Alt+Enter", label: "برگشت از فروشِ فاکتورِ انتخاب‌شده" },
          { keys: "F3", label: "حساب باز" },
          { keys: "Ctrl+F", label: "یافتن فاکتور" },
          { keys: "Alt+N", label: "فاکتور نو" },
          { keys: "Alt+PgUp/PgDn", label: "تب قبلی / بعدی" },
          { keys: "Ctrl+F", label: "فاکتورها — ویرایش در همین صفحه" },
          { keys: "F10", label: "فاکتورهای امروز (پنجره‌ی قدیمی)" },
          { keys: "Ctrl+Shift+X", label: "جدا کردن مشتری از این تب" },
          { keys: "Ctrl+Del", label: "لغو ویرایش فاکتور" },
          { keys: "Ctrl+P", label: "چاپ فاکتورِ در حال ویرایش" },
          { keys: "Alt+K", label: "کاردکس کالای ردیف فعال" },
          { keys: "Ctrl+Del", label: "لغو ویرایش / لغو مرجوعی" },
        ],
      },
      {
        title: "حرکت و خوانایی",
        items: [
          { keys: "↑↓", label: "انتخاب ردیف در سبد و در لیست‌ها" },
          { keys: "←→", label: "جابه‌جایی بین ستون‌های پنل مشتری" },
          { keys: "Ctrl+Alt+↑↓", label: "بزرگ‌نمایی رابط", primary: true },
          { keys: "Ctrl+Alt+C", label: "کنتراست بالا" },
          { keys: "F1", label: "همین راهنما — آخرین آیکنِ نوار بالا" },
        ],
      },
    ],
    [editing],
  );

  const anyDialogOpen =
    !!pickerStock || showCustomer || showPayment || showSearch || showQuotes || showInvoices ||
    showWorkerPicker || showWorkTasks || showRecent || showCheckout || showOpenAccounts || !!receipt ||
    showTodayPurchases;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPickerStock(null);
        // پنل مشتری/فاکتورها خودش Esc را می‌گیرد؛ اینجا فقط پناهِ آخر است.
        setShowCustomer(false);
        setShowPayment(false);
        setShowSearch(false);
          setShowWorkerPicker(false);
        setShowWorkTasks(false);
        setShowRecent(false);
        setShowOpenAccounts(false);
        // CheckoutFlow خودش Esc را مدیریت می‌کند (گام دوم → گام اول)، پس اینجا
        // بسته نمی‌شود؛ وگرنه یک Esc کل تسویه را می‌بندد.
        /*
         * Esc روی سبدِ باز = لغو ویرایش. فقط وقتی هیچ پنجره‌ای باز نبوده،
         * وگرنه Escِ بستنِ یک پنجره ویرایش را هم می‌سوزاند.
         */
        if (editing && !anyDialogOpen) cancelEdit();
        focusScan();
        return;
      }

      if (anyDialogOpen) return;

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

      /*
       * F2/F3/F4/F6/F7 و Delete اینجا نیستند — نوار فرمانِ مشترک صاحبشان است
       * (components/document/commands.ts). اینجا فقط کلیدهایی می‌مانند که
       * مخصوصِ خودِ صندوق‌اند و در سندهای دیگر معنی ندارند.
       */
      switch (e.key) {
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
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lines, activeRow, anyDialogOpen, submit.isPending, sendToWorker.isPending, addCart, focusScan, customer, setCustomer, invalidateIdem, editing, cancelEdit, startCheckout, openWorkerForCart]);

  useEffect(() => { focusScan(); }, [focusScan]);

  // ---------- نما ----------

  return (
    /* ۲.۵rem = ارتفاعِ نوار بالا (h-10). با ۴rem قبلی، صفحه از پایین سرریز می‌کرد. */
    <div className="relative flex h-[calc(100vh-2.5rem)] flex-col">
      {/*
        نوار فرمانِ مشترک بالای سر هر سند. صندوق اولین مصرف‌کننده‌اش است؛
        پیش‌فاکتور، برگشتی و خرید بعداً همین را می‌گیرند و کلیدهایشان
        خود‌به‌خود یکی می‌شود.
      */}
      <DocumentShell
        title={
          editing ? "ویرایش فاکتور فروش"
            : returning ? "برگشت از فروش"
              : quoting ? "پیش‌فاکتور"
                : "فاکتور فروش"
        }
        number={lockedToInvoice ? toFa(lockedToInvoice.invoiceNumber) : null}
        state={
          editing ? "اصلاحیه ثبت می‌شود، فاکتور دست نمی‌خورد"
            : returning ? "قفل به فاکتور — کالا و قیمت از خودِ فاکتور می‌آید"
              : quoting ? "موجودی دست نمی‌خورد؛ فقط قیمت نگه داشته می‌شود"
                : "پیش‌نویس"
        }
        tone={lockedToInvoice || quoting ? "warning" : "normal"}
        commands={commands}
        keysEnabled={!anyDialogOpen && !showHelp}
        status={
          <>
            <span>انبار: <b className="text-foreground">
              {warehouses.data?.find((w) => w.id === warehouseId)?.name ?? "—"}
            </b></span>
            <span>تب‌های باز: <b className="text-foreground tabular-nums">{toFa(carts.length)}</b></span>
          </>
        }
      >
    {/*
      هر پیکسلِ عمودی اینجا یعنی یک ردیفِ کالای بیشتر یا کمتر. p-4/gap-3
      قبلی روی هم ۴۰ پیکسل می‌خورد — تقریباً یک ردیفِ کامل.
    */}
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      {/*
        نوارِ تب‌ها فقط وقتی معنی دارد که بیش از یک فاکتور باز باشد. با یک
        سبد، آن نوار ۳۴ پیکسل می‌گیرد تا یک تبِ تنها را نشان دهد.
      */}
      {carts.length > 1 && (
      <CartTabs
        carts={carts}
        activeId={activeId}
        canAdd={canAdd}
        totalOf={cartTotal}
        onSelect={(id) => { setActiveId(id); focusScan(); }}
        onAdd={() => { addCart(); focusScan(); }}
        onClose={closeCart}
      />
      )}

      {/*
        نوارِ «در حال ویرایش».
        بدونِ آن، صفحه‌ی فروش با سبدِ پُر دقیقاً شبیهِ فروشِ عادی است و یک F2
        اشتباه یعنی یک فاکتورِ دومِ ناخواسته. رنگ و متن هر دو باید از دور
        بگویند اینجا خبرِ دیگری است.
      */}
      {/*
        کادرِ هشدارِ «در حال ویرایش» حذف شد — سه سطر ارتفاع می‌گرفت و وسطِ
        صفحه می‌نشست. همان پیام حالا روی نوارِ وضعیتِ خودِ پوسته است، کهربایی،
        در یک خط. «لغو» هم آیکنِ ابطال در نوار فرمان است.
      */}
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
      <div className="flex flex-wrap items-center gap-2">
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
            /* مهم‌ترین فیلدِ کلِ سیستم است؛ باید در یک نگاه از بقیه جدا باشد:
               تهِ‌رنگِ ملایمِ primary + حلقه‌ی فوکوسِ پررنگ‌تر. */
            className="h-9 pe-10 text-sm bg-primary/5 border-primary/30 focus-visible:border-primary focus-visible:ring-primary/30"
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
            // کلیک روی نام = فاکتورهای همین مشتری، همین‌جا. رفتن به پرونده‌ی
            // کامل هنوز ممکن است، ولی کارِ روزمره این است نه آن.
            onOpen={() => setCustomerPanel("ledger")}
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

      {/*
        جدول، تمامِ فضای باقی‌مانده.

        ستونِ کناری حذف شد: مشتری در چیپِ بالای نوار اسکن است، تخفیف و توضیح و
        مبلغ در نوارِ یک‌خطیِ پایین. آن ستون ۳۲۰ پیکسل از عرضِ جدول می‌گرفت تا
        چیزهایی را نشان دهد که هرکدام یک خط بیشتر نبودند.
      */}
      <div className="flex min-h-0 flex-1 flex-col border-y">
        <LineItems
          lines={lines}
          activeRow={activeRow}
          errorLine={errorLine}
          mode={returning ? "return" : "sale"}
          onActivate={setActiveRow}
          onPatch={patchLine}
          onRemove={removeLine}
        />
      </div>

      {/*
        نوارِ جمع — یک خط، تمامِ عرض.

        چهار دکمه‌ی پایین حذف شدند: هر چهارتا حالا آیکنِ نوار بالا هستند و
        داشتنشان در دو جا یعنی فروشنده باید هر بار انتخاب کند کدام را بزند.
        تنها دکمه‌ی برچسب‌دارِ صفحه همین «ثبت» است، چون کنارِ مبلغ می‌نشیند و
        عملِ نهایی است.
      */}
      <div className="flex shrink-0 items-center gap-4 border-t bg-card px-3 py-2">
        <span className="text-sm text-muted-foreground">
          جمع اقلام <b className="ms-1 tabular-nums text-foreground">{money(grossSubtotal)}</b>
        </span>

        {linesDiscountTotal > 0 && (
          <span className="text-sm text-muted-foreground">
            تخفیف ردیف‌ها
            <b className="ms-1 tabular-nums text-success">− {money(linesDiscountTotal)}</b>
          </span>
        )}

        {!returning && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            تخفیف
            <DiscountField
              id="invoice-discount"
              value={invoiceDiscountInput}
              base={subtotal}
              onChange={(d) => {
                invalidateIdem();
                setInvoiceDiscountInput(d);
              }}
            />
          </span>
        )}

        {/*
          خانه‌های مخصوصِ هر سند، در همین نوار.

          قبلاً در ستونِ کناری بودند و با حذفِ آن ستون گم شدند — یعنی مرجوعی
          اصلاً ثبت نمی‌شد، چون دلیل و روشِ برگشتِ وجه هر دو اجباری‌اند و
          هیچ جایی برای واردکردنشان نمانده بود.
        */}
        {returning && (
          <>
            <select
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
              disabled={returning.isOpenAccount}
              title="روش برگشت وجه"
              className="h-8 rounded-md border bg-background px-2 text-sm disabled:opacity-60"
            >
              <option value="">روش برگشت…</option>
              <option value="CASH">نقدی از صندوق</option>
              <option value="CARD">کارت‌خوان</option>
              {returning.hasCustomer && <option value="CREDIT">کسر از حساب</option>}
            </select>

            <Input
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              maxLength={200}
              placeholder="دلیل مرجوعی (اجباری)"
              className="h-8 max-w-56 text-sm"
            />
          </>
        )}

        {/*
          فاکتورِ بدونِ مشتری: اختلافِ اصلاح همان لحظه ردوبدل می‌شود، پس روشش
          باید پیش از ثبت معلوم باشد — بعدش دیگر جایی برای پرسیدن نیست.
        */}
        {editing && !customer && (
          <select
            value={cashSettleMethod}
            onChange={(e) => setCashSettleMethod(e.target.value as "CASH" | "CARD")}
            title="اختلافِ این اصلاح چطور ردوبدل می‌شود"
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            <option value="CASH">اختلاف نقدی</option>
            <option value="CARD">اختلاف کارت‌خوان</option>
          </select>
        )}

        {quoting && (
          <select
            value={quoting.validForMinutes}
            onChange={(e) =>
              patchCart({ doc: { type: "quote", validForMinutes: Number(e.target.value) } })
            }
            title="تا کی این قیمت معتبر است"
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            <option value={60}>اعتبار ۱ ساعت</option>
            <option value={6 * 60}>اعتبار ۶ ساعت</option>
            <option value={24 * 60}>اعتبار ۲۴ ساعت</option>
            <option value={3 * 24 * 60}>اعتبار ۳ روز</option>
            <option value={7 * 24 * 60}>اعتبار ۷ روز</option>
          </select>
        )}

        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="توضیح روی سند"
          className="h-8 max-w-56 text-sm"
        />

        {zeroPriceCount > 0 && (
          <span className="text-xs font-semibold text-warning">
            {toFa(zeroPriceCount)} ردیف بدون قیمت
          </span>
        )}

        <div className="ms-auto flex items-center gap-4">
          <div className="text-end">
            <div className="text-[11px] leading-none text-muted-foreground">
              {returning ? "بازپرداخت به مشتری" : quoting ? "جمع پیش‌فاکتور" : "مبلغ نهایی"}
            </div>
            <div className="text-3xl font-bold leading-tight tabular-nums">
              {money(returning ? returnTotal : total)}
              <span className="ms-1 text-xs font-normal text-muted-foreground">ریال</span>
            </div>
          </div>

          <Button
            className="h-12 gap-2 px-6 text-base font-bold"
            disabled={commitOff}
            onClick={() => commitRun?.()}
          >
            {commitBusy ? "در حال ثبت…" : commitLabel}
            <Key>F2</Key>
          </Button>
        </div>
      </div>
    </div>
      </DocumentShell>

      {/*
        تسویه‌ی اصلاح — با همان فرمِ پرداختِ خودِ فروش، نه یک نوارِ دو دکمه‌ای.
        نقد و کارت و چک و ترکیبشان، همان‌جا که فروشنده بلد است.
      */}
      <PaymentDialog
        open={!!settle && settle.amount > 0 && !!settle.customerId}
        total={settle?.amount ?? 0}
        hasCustomer
        customerCreditDays={customerDetail.data?.creditDays}
        customerChequeRateBp={customerDetail.data?.chequeRateBp}
        customerChequeRateMode={customerDetail.data?.chequeRateMode ?? undefined}
        onConfirm={(payments) => takeSettlement.mutate(payments)}
        onClose={() => { setSettle(null); focusScan(); }}
      />

      {/*
        دو حالتی که فرمِ پرداخت جوابشان نیست، و باید صریح گفته شوند نه اینکه
        بی‌صدا رد شوند:
          • مبلغ به نفعِ مشتری شد ⇒ پولی گرفته نمی‌شود؛ در دفترش بستانکار شد.
          • فاکتور مشتری ندارد    ⇒ اصلاً دفتری نیست که پول رویش بنشیند.
      */}
      {settle && (settle.amount < 0 || !settle.customerId) && (
        <div className="absolute inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-3
                        border-t border-primary bg-primary/10 px-4 py-3">
          <span className="font-bold">
            اصلاح فاکتور {toFa(settle.invoiceNumber)} —{" "}
            {settle.amount < 0 ? (
              <>
                <span className="text-success">{money(-settle.amount)}</span> ریال به نفع مشتری.
                {settle.customerId
                  ? " در حسابش بستانکار شد."
                  : " روی خودِ فاکتور برگشت خورد — پول را از صندوق به مشتری بدهید."}
              </>
            ) : (
              <>
                <span className="text-warning">{money(settle.amount)}</span> ریال بیشتر شد و
                روی خودِ فاکتور به‌عنوان دریافت ثبت شد.
              </>
            )}
          </span>
          <Button
            variant="outline"
            className="ms-auto h-10"
            onClick={() => { setSettle(null); focusScan(); }}
          >
            متوجه شدم
          </Button>
        </div>
      )}

      <OpenInvoices
        open={showInvoices}
        warehouseId={warehouseId}
        onPick={(id) => {
          setShowInvoices(false);
          loadInvoice.mutate({ invoiceId: id, customer: null });
        }}
        onReturn={(id) => {
          setShowInvoices(false);
          loadReturn.mutate({ invoiceId: id, customer: null });
        }}
        onClose={() => { setShowInvoices(false); focusScan(); }}
      />

      <OpenQuotations
        open={showQuotes}
        onPick={(id) => void loadQuotation(id)}
        onClose={() => { setShowQuotes(false); focusScan(); }}
      />

      <ShortcutsHelp
        open={showHelp}
        groups={shortcutGroups}
        onClose={() => { setShowHelp(false); focusScan(); }}
      />

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

      <CustomerInvoicesPanel
        open={showCustomer}
        mode={customerPanel ?? "pick"}
        initialCustomer={customer}
        onPickCustomer={(c) => {
          setCustomer(c);
          setShowCustomer(false);
          invalidateIdem();
          focusScan();
        }}
        onOpenInvoice={(invoiceId, c) => loadInvoice.mutate({ invoiceId, customer: c })}
        onReturnInvoice={(invoiceId, c) => loadReturn.mutate({ invoiceId, customer: c })}
        onClose={() => { setCustomerPanel(null); focusScan(); }}
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
