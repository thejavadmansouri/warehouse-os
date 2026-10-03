"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiException } from "@/lib/api-error-messages";
import {
  Search,
  FileClock,
  PencilLine,
  Undo2,
  X,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  isScanSoundMuted,
  playScanSound,
  toggleScanSoundMuted,
} from "./_lib/scan-sound";
import { useRealtimeStore } from "@/lib/realtime-store";
import { useAuthStore } from "@/lib/auth-store";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createAdjust,
  createInvoice,
  createQuotation,
  createWorkTask,
  ensureOpenAccount,
  createReceipt,
  createReturn,
  updateInvoiceLineNotes,
  setProductPrice,
  getAdjustableLines,
  getCustomer,
  getBlankQuotation,
  convertBlankQuotation,
  saveBlankPrices,
  getInvoice,
  getInvoiceSettlement,
  getReturnableLines,
  getInvoices,
  getPosStock,
  getPosStockBatch,
  getQuotation,
  getWarehouses,
  getWorkTasks,
  locateProducts,
  resolveForSale,
} from "@/lib/api";
import { faToEn, money, parseNum, qty, toFa, rial } from "@/lib/format";
import { uuid } from "@/lib/uuid";
import type {
  CreateAdjustDto,
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
import {
  InlineResults,
  type SearchResultRow,
} from "./_components/inline-results";
import { OpenAccounts } from "./_components/open-accounts";
import { CustomerInvoicesPanel } from "./_components/customer-invoices";
import { OpenQuotations } from "./_components/open-quotations";
import { OpenInvoices } from "./_components/open-invoices";
import { BlankQuotationsPanel } from "../quotations/_components/blank-quotations";
import { ShortcutsHelp, type ShortcutGroup } from "@/components/shortcuts-help";
import {
  DocumentShell,
  type CommandMap,
} from "@/components/document/document-shell";
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
import {
  invoiceToReturnLines,
  returnDraft,
  returningStateOf,
} from "./_lib/invoice-return";
import { NetSwapDialog } from "./_components/net-sale-dialog";
import {
  adjustDraft,
  adjustingStateOf,
  invoiceToAdjustLines,
  changedNotes,
  offQtyToReturnQty,
  adjustNetQty,
} from "./_lib/invoice-adjust";
import { applyUndoAdd } from "./_lib/line-undo";
import { AdjustSettlementDialog } from "./_components/adjust-settlement-dialog";
import { PaymentRecomposeDialog } from "./_components/payment-recompose-dialog";
import { CustomerBalanceStrip } from "./_components/customer-balance-strip";
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
    carts,
    cart,
    activeId,
    setActiveId,
    addCart,
    closeCart,
    endLockedDoc,
    runInNewTab,
    patch: patchCart,
    resetCurrent,
    ensureIdem,
    invalidateIdem,
    canAdd,
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
  const returning = cart.doc.type === "return" ? cart.doc : null;
  const adjusting = cart.doc.type === "adjust" ? cart.doc : null;
  const quoting = cart.doc.type === "quote" ? cart.doc : null;
  /** سندی که به یک فاکتورِ ثبت‌شده قفل است — ویرایش یا مرجوعی. */
  const lockedToInvoice = returning ?? adjusting;

  /*
   * تیکِ «دیدن حافظه» — فقط در ویرایشِ فاکتور معنا دارد.
   * خاموش (پیش‌فرض): جدول مثل فاکتورِ عادی؛ روشن: سابقه با برچسب و کم‌رنگی.
   */
  const memory = !!cart.memory;
  const invoiceDiscountInput = cart.discount;

  const setLines = useCallback(
    (u: Line[] | ((prev: Line[]) => Line[])) =>
      patchCart((c) => ({ lines: typeof u === "function" ? u(c.lines) : u })),
    [patchCart],
  );
  const setCustomer = useCallback(
    // جدا کردنِ مشتری، قفل را هم باز می‌کند — قفلِ بی‌مشتری بی‌معناست.
    // حساب باز هم جدا می‌شود: ادامهی فاکتورِ یک حساب بدونِ همان مشتری بی‌معناست.
    (c: Customer | null) =>
      patchCart(
        c
          ? { customer: c }
          : { customer: null, customerLocked: false, openAccountId: null },
      ),
    [patchCart],
  );
  const toggleCustomerLock = useCallback(
    () => patchCart((c) => ({ customerLocked: !c.customerLocked })),
    [patchCart],
  );
  const setNote = useCallback(
    (n: string) => patchCart({ note: n }),
    [patchCart],
  );
  const setInvoiceDiscountInput = useCallback(
    (d: DiscountValue) => patchCart({ discount: d }),
    [patchCart],
  );
  const setActiveRow = useCallback(
    (u: number | ((prev: number) => number)) =>
      patchCart((c) => ({
        activeRow: typeof u === "function" ? u(c.activeRow) : u,
      })),
    [patchCart],
  );
  const setErrorLine = useCallback(
    (n: number | null) => patchCart({ errorLine: n }),
    [patchCart],
  );

  // انبار بین همه‌ی تب‌ها مشترک است — فروشنده پشت یک پیشخوان نشسته.
  const [warehouseId, setWarehouseId] = useState("");
  const [scan, setScan] = useState("");
  /** صدای اسکن — خاموشِ انتخاب‌شده در localStorage می‌ماند. */
  const [scanSoundOff, setScanSoundOff] = useState(isScanSoundMuted());
  /** وضعیتِ کانالِ realtime — نقطه‌ی کنار نوارِ اسکن. */
  const realtime = useRealtimeStore();
  /** نقشِ کاربرِ جاری — ویرایشِ قیمتِ فروش فقط برای مدیر. */
  const role = useAuthStore((s) => s.user?.role);
  const canManagePrice = role === "ADMIN" || role === "MANAGER";
  /** تعویض وجه نقد/کارت دارد و باید با مجوز مسیرِ POST /sales/net هم‌خوان باشد. */
  const canUseNetSwap = role === "ADMIN" || role === "MANAGER";

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
  const [customerPanel, setCustomerPanel] = useState<"pick" | "ledger" | null>(
    null,
  );
  const showCustomer = customerPanel !== null;
  const setShowCustomer = useCallback(
    (v: boolean) => setCustomerPanel(v ? "pick" : null),
    [],
  );
  /** راهنمای کلیدها (F1) — تنها جایی که همه‌ی میان‌برها با هم دیده می‌شوند. */
  const [showHelp, setShowHelp] = useState(false);
  /** فهرست پیش‌فاکتورهای باز (Alt+Q) — بارگذاری یکی از آن‌ها در همین سبد. */
  const [showQuotes, setShowQuotes] = useState(false);
  /** فهرست و workspace پیش‌فاکتورهای سفید — داخل صندوق و با Alt+B. */
  const [showBlankQuotes, setShowBlankQuotes] = useState(false);
  /** فهرست فاکتورها (Ctrl+F) — جایگزینِ پنجره‌ی «فاکتورهای امروز». */
  const [showInvoices, setShowInvoices] = useState(false);
  /** تعویض (سبدِ خالص) — برگشت از فاکتورهایِ قبلیِ مشتریِ همین تب + فروشِ نو. */
  const [showNetSwap, setShowNetSwap] = useState(false);
  /*
   * پنلِ «اصلاح نحوهٔ پرداخت» — برای فاکتوری که **قلم‌هایش** دست نمی‌خورد ولی
   * نحوهٔ پرداختش اشتباه ثبت شده.
   *
   * تا پیش از این، ویرایشِ فاکتورِ بی‌تغییر به بن‌بست می‌خورد: نه قلمی عوض شده
   * که اصلاحیه بسازد، نه اختلافی هست که پنلِ تسویه باز شود. حالا همین مسیر،
   * تقسیمِ پرداخت را بازنویسی می‌کند («همه‌اش کارت زده شد، در حالی که ۳۰ نقد
   * بود و ۷۰ نسیه»).
   */
  const [fixPayment, setFixPayment] = useState<{
    invoiceId: string;
    customer: Customer | null;
  } | null>(null);
  /** بازگشت به همین پنل بعد از انتخابِ مشتری از پنلِ صندوق. */
  const pendingFixPick = useRef<{ invoiceId: string } | null>(null);
  /*
   * وضعیتِ تسویهٔ فاکتوری که ممکن است اصلاح شود — هم فاکتورِ در حال ویرایش،
   * هم فاکتوری که از پنل مشتری/حساب‌بازها با کلید P انتخاب شده.
   *
   * کدِ همین کوئری، کلیدِ کوئریِ پنلِ اصلاح است؛ پس هیچ درخواستِ تکراری‌ای
   * زده نمی‌شود. کاربردش این است که F2 از قبل بداند «اصلاحِ پرداخت» در دسترس
   * است یا نه — و اگر نیست، چرا (`blockedReason`) را نشان دهد.
   *
   * جای این بلوک بعد از `fixPayment` است، نه قبلش: خودِ شناسهٔ فاکتور از
   * `adjusting ?? fixPayment` می‌آید.
   */
  const settlementInvoiceId =
    adjusting?.invoiceId ?? fixPayment?.invoiceId ?? null;
  const settleQ = useQuery({
    queryKey: ["invoice-settlement", settlementInvoiceId],
    queryFn: () => getInvoiceSettlement(settlementInvoiceId!),
    enabled: !!settlementInvoiceId,
  });
  /** آیا می‌شود نحوهٔ پرداختِ این فاکتور را اصلاح کرد؟ */
  const canFixPayment = !!settleQ.data?.canRecompose;
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
  const [settle, setSettle] = useState<{
    amount: number;
    /** null = فروشِ نقدیِ گذری؛ جایی برای ثبتِ پول نیست. */
    customerId: string | null;
    customerName: string;
    invoiceNumber: number;
  } | null>(null);

  const [refundMethod, setRefundMethod] = useState<PaymentMethod | "">("");
  const [returnReason, setReturnReason] = useState("");
  /** دلیلِ عملیاتِ یکپارچه — اختیاری؛ اگر نوشته شود روی هر دو سندِ حاصل می‌نشیند. */
  const [adjustReason, setAdjustReason] = useState("");
  /**
   * پنلِ تسویه‌ی اختلافِ عملیاتِ یکپارچه.
   *
   * باز یعنی اختلافِ نهایی غیرصفر است و فروشنده باید روشش را انتخاب کند
   * (نقد/کارت/چک/روی حساب) — برای هر نوعِ فاکتور، از جمله حسابِ باز. اختلافِ
   * صفر اصلاً این پنل را باز نمی‌کند.
   */
  const [adjustSettle, setAdjustSettle] = useState<{
    direction: "COLLECT" | "PAY";
    amount: number;
    /** اختلافِ محاسبه‌شده (علامت‌دار) — مبنایِ تعدیلِ دستی. */
    computedNet: number;
    /** مبلغِ کلِ فاکتور پیش از این عملیات. */
    beforeTotal: number;
    /** مبلغِ کلِ فاکتور پس از این عملیات (تقریبیِ سمتِ کلاینت). */
    afterTotal: number;
    /** آنچه مشتری تاکنون بابت همین فاکتور پرداخت کرده. */
    paidAmount: number;
    /**
     * مشتریِ حساب‌باز یا بدهکار — پیش‌فرضِ روشِ PAY روی «روی حساب» می‌رود.
     */
    preferCredit?: boolean;
  } | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  /** متنی که در نوار بالا زده شده و باید به جست‌وجو منتقل شود. */
  const [searchSeed, setSearchSeed] = useState("");
  const [showWorkerPicker, setShowWorkerPicker] = useState(false);
  /*
   * «حساب باز»، «کارهای انبار» و «فاکتورهای امروز» دکمه‌های‌شان را در نوار
   * بالای مشترک (AdminTopbar) کنار ساعت دارند؛ خودِ دیالوگ‌ها همچنان اینجا
   * رندر می‌شوند. باز/بسته‌بودنشان در pos-ui-store زندگی می‌کند تا topbar
   * بتواند بازشان کند بدون اینکه منطق‌شان از این صفحه بیرون برود. میان‌برِ F3
   * هم همین setter را می‌زند — دست‌نخورده.
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
   * یادداشتِ خودکارِ «همه‌ی قفسه‌ها» — وقتی یک کالا در چند مکان موجودی دارد و
   * از جست‌وجو برای کارگر فرستاده می‌شود، آدرسِ کاملِ همه‌ی قفسه‌ها همراهِ
   * پیام می‌رود تا کارگر همه‌ی جاها را بداند، نه فقط پرموجودی‌ترین مکان.
   */
  const workerNoteRef = useRef<string | null>(null);

  /**
   * کلید یکتای ثبت.
   *
   * وقتی تولید می‌شود که کاربر «ثبت» بزند، و **تا موفق شدن عوض نمی‌شود**.
   * اگر شبکه قطع شود و کاربر دوباره بزند، همان کلید می‌رود و سرور فاکتور
   * تکراری نمی‌سازد. اما اگر محتوای سبد عوض شود، دیگر همان فاکتور نیست،
   * پس کلید باطل می‌شود.
   */

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: getWarehouses,
  });

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
      .then((c) => {
        setCustomer(c);
        // «فروش به این مشتری» از پرونده — فروشنده پشتِ همین مشتری ایستاده؛
        // بعد از ثبت باید بماند (مثل جریانِ حساب باز)، نه برگردد به گذری.
        patchCart({ customerLocked: true });
      })
      .catch(() => toast.error("مشتری پیدا نشد"));
  }, [searchParams, setCustomer, patchCart]);

  /*
   * بارگذاری پیش‌فاکتور در سبد (?quotation=...).
   *
   * از «ادامه در صندوق» در صفحه‌ی پیش‌فاکتورها می‌آید: سبد از همان اقلام و
   * قیمت‌ها پر می‌شود (مشتری هم اگر داشته باشد) و فروشنده قیمت/تعداد را
   * بررسی یا اصلاح می‌کند و ادامه می‌دهد — بدون اینکه مجبور باشد دوباره
   * اسکن کند.
   */
  const seededQuotation = useRef(false);
  const seededBlankQuotation = useRef(false);
  const [blankQuotationId, setBlankQuotationId] = useState<string | null>(null);

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
      getInvoices({
        customerId: customer!.id,
        from: startOfToday(),
        pageSize: 5,
      }),
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
    [useLocalSearch, liveEnabled, posCatalog, liveQuery],
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
        purchasePrice: item.purchasePrice ?? null,
        suggestedPrice: item.suggestedPrice ?? null,
        managerPrice: item.managerPrice ?? null,
      }));
    }
    return (liveResults.data ?? []).map((r) => ({
      kind: "known" as const,
      id: r.id,
      nameSegments: highlightMatches(r.name, queryTokens),
      result: r,
    }));
  }, [liveEnabled, useLocalSearch, localHits, liveResults.data, queryTokens]);

  /*
   * اصلاحِ زنده‌ی موجودی نتایجِ سرچِ لوکال.
   *
   * کاتالوگِ لوکال فوری جواب می‌دهد ولی عمداً موجودی ندارد؛ این کوئریِ کوچک
   * (فقط نتایجِ روی صفحه، حداکثر ۳۰) چندصد میلی‌ثانیه بعد می‌آید و همان
   * ردیف‌های `unknown` را به `known` تبدیل می‌کند — با عددِ تازه از سرور،
   * بدونِ کش. فروش همچنان در لحظه‌ی pick یک fetch تازه می‌گیرد (`onPickRow`).
   */
  const visibleIds = useMemo(
    () =>
      liveList
        .slice(0, 30)
        .map((r) => r.id)
        .join(","),
    [liveList],
  );
  const stockBatch = useQuery({
    queryKey: ["pos-stock-batch", visibleIds, canManagePrice],
    queryFn: () => getPosStockBatch(visibleIds.split(",").filter(Boolean)),
    enabled: !!visibleIds,
    staleTime: 0,
    gcTime: 0,
    placeholderData: keepPreviousData,
  });
  const stockById = useMemo(() => {
    const m = new Map<string, LocateResult>();
    for (const r of stockBatch.data ?? []) m.set(r.id, r);
    return m;
  }, [stockBatch.data]);

  const liveListWithStock = useMemo((): SearchResultRow[] => {
    if (stockById.size === 0) return liveList;
    return liveList.map((row) => {
      const fresh = stockById.get(row.id);
      if (row.kind !== "unknown" || !fresh) return row;
      return {
        kind: "known" as const,
        id: row.id,
        nameSegments: row.nameSegments,
        result: fresh,
      };
    });
  }, [liveList, stockById]);

  /*
   * با عوض‌شدنِ متن، انتخاب باید از نو شروع شود — تطبیقِ state در رندر، نه
   * effect (اگر effect بود، رندرِ اولِ متنِ تازه هنوز انتخابِ کهنه را می‌دید).
   */
  const [prevLiveQuery, setPrevLiveQuery] = useState(liveQuery);
  if (liveQuery !== prevLiveQuery) {
    setPrevLiveQuery(liveQuery);
    setLiveHighlight(-1);
    // تایپِ ادامه‌ی متن یعنی «سرچ می‌خواهم» — بعد از Esc هم لیست دوباره زنده
    // می‌شود؛ «سرچ همیشه زنده» است و Enter برای دیدنِ نتیجه لازم نیست.
    setLiveDismissed(false);
  }

  /** بستن لیست بعد از افزودن — وگرنه روی سبدِ تازه باز می‌ماند. */
  const closeLive = useCallback(() => {
    setScan("");
    setLiveQuery("");
    setLiveHighlight(-1);
    setLiveDismissed(false);
  }, []);

  /** id ردیفی که در حال دریافت موجودیِ تازه است (برای اسپینر روی همان ردیف). */
  const [pickingId, setPickingId] = useState<string | null>(null);

  /* اولین انبارِ تعریف‌شده، پیش‌فرضِ صندوق — تا فروشنده خودش انتخاب کند.
     شرط، همگراست (بعد از ست‌شدنِ warehouseId دیگر اجرا نمی‌شود)، پس این
     تطبیقِ state در رندر بی‌خطر است. */
  if (!warehouseId && warehouses.data?.length) {
    setWarehouseId(warehouses.data[0].id);
  }

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
    [],
  );

  const grossSubtotal = useMemo(
    () => activeLines.reduce((s, l) => s + lineGross(l), 0),
    [activeLines],
  );
  /** جمع تخفیف‌های ردیفی — فقط برای نمایش. */
  const linesDiscountTotal = useMemo(
    () => activeLines.reduce((s, l) => s + lineDiscount(l), 0),
    [activeLines],
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
    [activeLines],
  );
  const canCheckout =
    activeLines.length > 0 && zeroPriceCount === 0 && !noWarehouse;

  // ---------- افزودن ردیف ----------

  const addLine = useCallback(
    (p: PickableProduct, s: StockLocation) => {
      invalidateIdem();
      setErrorLine(null);

      /*
       * یک به‌روزرسانی، دو برآمد: خطِ سبد و نشانه‌ی undo.
       *
       * قبلاً فقط setLines بود؛ Ctrl+Z باید بداند آخرین کار «ردیفِ نو» بود یا
       * «افزودن به ردیفِ موجود» — پس همین updater هر دو را با هم برمی‌گرداند
       * تا خط و نشانه‌اش هیچ‌وقت از هم جدا نیفتند. (setActiveRow داخلِ updater
       * همان الگوی قبلی است — عمداً حفظ شد.)
       */
      patchCart((c) => {
        const prev = c.lines;
        // یک کالا از یک مکان نباید دو ردیف جدا بگیرد — سرور هم ردش می‌کند.
        const i = prev.findIndex(
          (l) => l.productId === p.id && l.locationId === s.locationId,
        );

        if (i >= 0) {
          const next = [...prev];
          // کالای ثبت‌نشده قفسه ندارد و موجودی‌اش نامعلوم است — سقف روی آن
          // بی‌معنی است، وگرنه تعداد روی صفر قفل می‌شود.
          const unregistered = !s.locationId;
          const prevQty = next[i].quantity;
          const q = unregistered
            ? prevQty + 1
            : Math.min(prevQty + 1, s.quantity);
          if (!unregistered && q === prevQty) {
            toast.warning(
              `بیش از موجودی این مکان نمی‌شود (${qty(s.quantity)})`,
            );
          }
          next[i] = { ...next[i], quantity: q };
          setActiveRow(i);
          return {
            lines: next,
            lastAdd: { lineKey: next[i].key, prevQuantity: prevQty },
          };
        }

        const row = {
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
        };
        setActiveRow(prev.length);
        return {
          lines: [...prev, row],
          lastAdd: { lineKey: row.key, prevQuantity: 0 },
        };
      });

      // یک قلم اضافه شد = بیپِ موفق. همه‌ی مسیرهای افزودن (اسکن، پیکر،
      // جست‌وجوی زنده) از همین‌جا می‌گذرند — یک نقطه، یک صدا.
      playScanSound("ok");
      focusScan();
    },
    [focusScan, patchCart],
  );

  /** بارکد → کالا + مکان‌ها در یک درخواست. */
  const onScan = useMutation({
    mutationFn: (barcode: string) => resolveForSale(barcode),
    onSuccess: (res) => {
      setScan("");
      if (!res.stock?.length) {
        playScanSound("error");
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
      else {
        // کالا پیدا شد ولی چند مکان دارد — پیکرِ مکان می‌آید؛ خودش بیپِ
        // موفق را می‌زند بعد از انتخاب. همین‌جا فقط اعلامِ «پیدا شد» کافی است.
        playScanSound("ok");
        setPickerStock({
          name: res.product.name,
          product: res.product,
          stock: res.stock,
        });
      }
    },
    onError: (_e, barcode) => {
      /*
       * چیزی که تایپ شده بارکد نبوده — احتمالاً اسم کالاست.
       * به‌جای خطا، همان متن را به جست‌وجو می‌بریم. فروشنده یک فیلد دارد، نه دو
       * تا: هرچه می‌داند را می‌زند و Enter. دوبیپِ بم فقط می‌گوید «این کد
       * در سیستم نیست» — بارکدخوانِ کالای ناشناس هم همین‌جا می‌افتد.
       */
      playScanSound("error");
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
          },
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
    [addLine, focusScan],
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
        toast.error(
          e instanceof ApiException ? e.message : "دریافت موجودی ناموفق بود",
        );
      } finally {
        setPickingId(null);
      }
    },
    [addFromLocate, closeLive, pickingId],
  );

  // ---------- ویرایش ردیف ----------

  const patchLine = (i: number, p: Partial<Line>) => {
    invalidateIdem();
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...p } : l)));
  };

  /*
   * حالتِ عادی (تیکِ حافظه خاموش): قلمِ کاملاً برگشتی از جدول بیرون می‌ماند.
   * فهرستِ واقعی دست‌نخورده می‌ماند — سابقه کامل است — فقط «چه چیزی نمایش
   * داده شود» فیلتر می‌شود و اندیس‌ها با همین نگاشت بینِ دید و سبد ترجمه می‌شوند.
   */
  const adjustView = useMemo(() => {
    if (!adjusting || memory) return null;
    const map: number[] = [];
    const visible: Line[] = [];
    lines.forEach((l, i) => {
      if (l.sold !== undefined && adjustNetQty(l) <= 0) return;
      visible.push(l);
      map.push(i);
    });
    return { lines: visible, map };
  }, [adjusting, memory, lines]);
  const realIndexOf = useCallback(
    (vi: number) => (adjustView ? (adjustView.map[vi] ?? vi) : vi),
    [adjustView],
  );
  const viewIndexOf = useCallback(
    (ri: number) => (adjustView ? adjustView.map.indexOf(ri) : ri),
    [adjustView],
  );
  /*
   * ردیفِ فعال و فهرستِ دیده‌شده — «اندیسِ دید» همان چیزی است که در صفاتِ
   * خانه‌های جدول (data-cell) نشسته. هر جایی که با querySelector به خانه‌ی
   * ردیفِ فعال می‌رود، باید اندیسِ دید را بگیرد نه اندیسِ سبد.
   */
  const viewLines = adjustView ? adjustView.lines : lines;
  const viewActiveRow = viewIndexOf(activeRow);

  /**
   * زیادکردنِ تعدادِ یک قلمِ موجود فراتر از مانده‌اش — در حالتِ عادی.
   * مابه‌التفاوت به‌صورت قلمِ تازه با همان کالا اضافه می‌شود (مثل اسکنِ دوباره)
   * و برگشتِ همان ردیف، اگر بود، برمی‌گردد تا جمعِ نهایی دقیقاً همان عددی
   * باشد که فروشنده زده.
   */
  const handleQtyOverflow = useCallback(
    (viewIdx: number, overflow: number) => {
      if (overflow <= 0) return;
      const i = realIndexOf(viewIdx);
      const l = lines[i];
      if (!l || l.sold === undefined) return;
      setLines((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], quantity: 0, restock: true };
        next.splice(i + 1, 0, {
          key: uuid(),
          productId: l.productId,
          productName: l.productName,
          unit: l.unit,
          locationId: l.locationId,
          locationPath: l.locationPath,
          available: 0,
          quantity: overflow,
          unitPrice: l.unitPrice,
          discount: NO_DISCOUNT,
          included: true,
        });
        return next;
      });
      // این کار دو ردیف را با هم عوض می‌کند — یک undoِ تکی نمی‌تواند درستش
      // برگرداند؛ نشانه را پاک می‌کنیم تا Ctrl+Z صادقانه «چیزی نیست» بگوید.
      patchCart({ lastAdd: null });
      invalidateIdem();
    },
    [lines, realIndexOf, setLines, patchCart, invalidateIdem],
  );

  /**
   * ورودیِ تعداد روی ردیفِ فعال — از نوارِ اسکن (عددِ کوتاه) یا خانه‌ی جدول.
   * در ویرایشِ فاکتور، معنیِ عدد با حالتِ نمایش عوض می‌شود:
   *   حافظه روشن ⇒ عدد = مقدارِ برگشتی (سقفِ قابل‌برگشت)
   *   حافظه خاموش ⇒ عدد = تعدادِ خالصِ قلم؛ بیشتر از مانده ⇒ قلمِ تازه
   */
  const applyQtyInput = useCallback(
    (i: number, n: number) => {
      const l = lines[i];
      if (!l) return;
      if (adjusting && l.sold !== undefined) {
        if (memory) {
          patchLine(i, { quantity: Math.min(Math.max(0, n), l.available) });
          return;
        }
        const { returnQty, overflow } = offQtyToReturnQty(
          l.outstanding ?? 0,
          n,
        );
        if (overflow > 0) {
          handleQtyOverflow(i, overflow);
          return;
        }
        patchLine(i, { quantity: returnQty });
        return;
      }
      patchLine(i, { quantity: Math.max(1, n) });
    },
    [adjusting, memory, lines, patchLine, handleQtyOverflow],
  );

  const removeLine = (i: number) => {
    /*
     * در ویرایشِ فاکتور:
     *   • حالتِ حافظه: ردیفِ موجود حذف نمی‌شود — برای برگشتِ کامل، مقدارِ
     *     برگشتی را برابرِ مانده کنید (همان قاعده‌ی قبلی).
     *   • حالتِ عادی: حذف = برگشتِ کاملِ همان قلم — ردیف از جدولِ عادی پنهان
     *     می‌شود ولی در حالتِ حافظه دوباره دیده می‌شود و قابلِ برگرداندن است.
     * قلمِ تازه (اضافه‌شده) در هر دو حالت واقعاً حذف می‌شود.
     */
    if (adjusting && lines[i]?.sold !== undefined) {
      if (memory) {
        toast.error(
          "قلمِ فاکتور حذف نمی‌شود — برای برگشتِ کامل، مقدارِ برگشتی را برابرِ مانده کنید",
        );
        return;
      }
      const active = lines[i];
      const target = Math.max(0, active.outstanding ?? 0);
      // ردیف از دیدِ عادی می‌رود؛ فوکوس به همسایه‌ی دیدنی برود، نه به ردیفِ پنهان.
      const visBefore = adjustView ? adjustView.map : lines.map((_, j) => j);
      const pos = visBefore.indexOf(i);
      patchLine(i, { quantity: target });
      setActiveRow(visBefore[Math.max(0, pos - 1)] ?? 0);
      return;
    }
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
        .then(async (q) => {
          const rows = (q.lines ?? []).map((l) => ({
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
            discount: { value: l.discount, mode: "amount" } as DiscountValue,
            included: true,
          }));
          // مشتری پیش از ساختنِ محموله می‌آید تا با همان یک payload روی تبِ درست بنشیند.
          const customer = q.customerId
            ? await getCustomer(q.customerId).catch(() => {
                toast.error("مشتری پیش‌فاکتور پیدا نشد");
                return null;
              })
            : null;

          const payload: Partial<Cart> = {
            lines: rows,
            customer,
            customerLocked: false,
            openAccountId: null,
            discount: NO_DISCOUNT,
            note: "",
            activeRow: 0,
            errorLine: null,
            memory: false,
            lastAdd: null,
            doc: SALE_DOC,
          };
          invalidateIdem();

          // همان قراردادِ بقیهٔ مسیرها: تبِ خالیِ واقعی همان‌جا، وگرنه تبِ تازه.
          if (
            !cart.lines.length &&
            !cart.customer &&
            !cart.openAccountId &&
            cart.doc.type === "sale"
          ) {
            patchCart(payload);
          } else if (canAdd) {
            pendingEdit.current = payload;
            addCart();
          } else {
            toast.error("همه‌ی تب‌ها پُرند — یکی را ببندید");
            return;
          }

          toast.success(
            `پیش‌فاکتور ${toFa(q.number)} در صندوق بارگذاری شد — قیمت‌ها را بررسی کنید`,
          );
          setShowQuotes(false);
          focusScan();
        })
        .catch(() => toast.error("بارگذاری پیش‌فاکتور ناموفق بود")),
    [cart, patchCart, addCart, canAdd, invalidateIdem, focusScan],
  );

  const loadBlankQuotation = useCallback(
    (id: string) =>
      getBlankQuotation(id)
        .then((q) => {
          if (q.unpricedCount > 0 || q.unlinkedCount > 0 || !q.lines.length) {
            toast.error("این پیش‌فاکتور سفید هنوز کامل نیست");
            return;
          }
          const rows = q.lines.map((l) => ({
            blankLineId: l.id,
            key: uuid(),
            productId: l.product!.id,
            productName: l.product!.name,
            unit: l.product!.unit ?? "عدد",
            locationId: l.locationId ?? "",
            locationPath: l.locationPath ?? "",
            available: 0,
            quantity: l.quantity,
            unitPrice: l.finalPrice ?? 0,
            discount: NO_DISCOUNT,
            included: true,
          }));
          patchCart({
            lines: rows,
            customer: null,
            customerLocked: false,
            openAccountId: null,
            discount: NO_DISCOUNT,
            note: q.note ?? "",
            activeRow: 0,
            errorLine: null,
            memory: false,
            lastAdd: null,
            doc: SALE_DOC,
          });
          setBlankQuotationId(q.id);
          invalidateIdem();
          toast.success(
            `پیش‌فاکتور سفید ${toFa(q.number)} آماده‌ی انتخاب مشتری و پرداخت است`,
          );
          focusScan();
        })
        .catch(() => toast.error("بارگذاری پیش‌فاکتور سفید ناموفق بود")),
    [patchCart, invalidateIdem, focusScan],
  );

  useEffect(() => {
    const id = searchParams.get("quotation");
    if (!id || seededQuotation.current) return;
    seededQuotation.current = true;
    void loadQuotation(id);
  }, [searchParams, loadQuotation]);

  useEffect(() => {
    const id = searchParams.get("blankQuotation");
    if (!id || seededBlankQuotation.current) return;
    seededBlankQuotation.current = true;
    void loadBlankQuotation(id);
  }, [searchParams, loadBlankQuotation]);

  /**
   * «کپیِ خرید قبلی» — اقلامِ یک فاکتور را در سبدِ فروشِ تازه بنشان.
   *
   * پرتکرارترین خریدِ مغازه لوازم: مشتری همان اقلامِ دفعه‌ی قبل را می‌برد.
   * تا حالا تنها راهش بازکردنِ فاکتور برای ویرایش بود — سند قفل می‌شد و
   * فروشنده وسطِ سندِ مرجوعی/اصلاحیه گم می‌شد. اینجا همان اقلام به یک سبدِ
   * فروشِ عادی می‌آید: تعداد و قیمت آزاد، ثبت مثل هر فروشِ عادی.
   *
   * چه چیزی کپی می‌شود: اقلامِ **خالصِ در دستِ مشتری** (فروخته − برگشتی)،
   * نه اقلامِ اولیه — مشتریِ ۵ لنت‌گرفته/۳‌برگشتی باید ۲ لنت ببیند نه ۵.
   * موجودیِ مکان عمداً صفر می‌ماند: سرِ ثبت سرور واقعاً می‌شمارد و اگر کم
   * بود همان ردیف قرمز می‌شود — فروش روی عددِ کهنه هرگز انجام نمی‌شود.
   *
   * مشتری از خودِ فاکتور می‌آید و **قفل نمی‌شود** — این یک راحتی است نه
   * یک سندِ مقید؛ Ctrl+Shift+X هر لحظه جدا می‌کند.
   */
  const loadCopy = useMutation({
    mutationFn: async (v: { invoiceId: string; customer: Customer | null }) =>
      getInvoice(v.invoiceId),
    onSuccess: (inv, v) => {
      if (inv.status === "CANCELLED") {
        toast.error("فاکتور باطل شده — چیزی برای کپی ندارد");
        return;
      }
      const rows = inv.lines
        .filter((l) => !!l.product?.id && (l.netQuantity ?? l.quantity) > 0)
        .map((l) => ({
          key: uuid(),
          productId: l.product.id,
          productName: l.product.name,
          unit: l.product.unit ?? "عدد",
          locationId: l.location?.id ?? "",
          locationPath: l.location?.path || l.location?.name || "",
          available: 0,
          quantity: l.netQuantity ?? l.quantity,
          unitPrice: l.currentUnitPrice ?? l.unitPrice ?? 0,
          discount: {
            value: l.netLineDiscount ?? l.lineDiscount ?? 0,
            mode: "amount",
          } as DiscountValue,
          included: true,
        }));
      if (!rows.length) {
        toast.error("این فاکتور ردیفی ندارد");
        return;
      }

      const payload: Partial<Cart> = {
        lines: rows,
        customer: v.customer ?? inv.customer ?? null,
        customerLocked: false,
        openAccountId: null,
        discount: NO_DISCOUNT,
        note: "",
        activeRow: 0,
        errorLine: null,
        memory: false,
        lastAdd: null,
        doc: SALE_DOC,
      };

      invalidateIdem();

      /*
       * تبِ «خالی» یعنی واقعاً خالی: بدون سطر، بدون مشتری، بدون حسابِ باز.
       * مشتریِ انتخاب‌شده روی سبدِ خالی هم «مشغول» است — فاکتورِ مشتریِ دیگر
       * نباید مشتریِ صندوق را عوض کند؛ تبِ تازه باز می‌شود.
       */
      if (
        !cart.lines.length &&
        !cart.customer &&
        !cart.openAccountId &&
        cart.doc.type === "sale"
      ) {
        patchCart(payload);
        focusScan();
      } else if (canAdd) {
        // eslint-disable-next-line react-hooks/immutability -- محموله تا تغییرِ تب در ref می‌ماند؛ الگویِ موجودِ صفحه
        pendingEdit.current = payload;
        addCart();
      } else {
        toast.error("همه‌ی تب‌ها پُرند — یکی را ببندید");
        return;
      }
      toast.success(
        `اقلام فاکتور ${toFa(inv.number)} در سبد کپی شد — تعداد و قیمت را چک کنید`,
      );
    },
    onError: () => toast.error("کپی اقلام فاکتور ناموفق بود"),
  });

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
    // eslint-disable-next-line react-hooks/immutability -- مصرفِ یک‌باره‌ی محموله بعد از تغییرِ تب؛ ref یعنی همین
    pendingEdit.current = null;
    patchCart(payload);
    focusScan();
  }, [activeId, patchCart, focusScan]);

  /*
   * همه‌ی مسیرهای ویرایش (پنل مشتری، فهرست فاکتورها، ?edit=) به یک عملیاتِ
   * یکپارچه می‌رسند. تفکیکِ «ویرایشِ عادی» و «ویرایش با حافظه» دیگر سندِ
   * جداگانه نیست — همان یک عملیات است با دو نمایش؛ تیکِ «دیدن حافظه» فقط
   * می‌گوید چه چیزی دیده شود. پیش‌فرضِ هر بازکردن: حافظه خاموش.
   */

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
        (data.invoice.customer
          ? await getCustomer(data.invoice.customer.id)
          : null);
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
        lastAdd: null,
        doc: returningStateOf(data),
      };

      // حساب باز: پولی پرداخت نشده — تنها راهِ برگشت، کسر از حساب. مشتریِ
      // بدهکار (مانده‌ی کلِ مثبت) هم پیش‌فرضش کسر از حساب است، حتی اگر خودِ
      // فاکتور نقدی تسویه شده باشد؛ پولش به صندوق رفته و طلبکار کردنش فقط
      // اعتبارِ معلقِ گیج‌کننده می‌سازد.
      setRefundMethod(
        data.isOpenAccount || (data.customerBalance ?? 0) > 0 ? "CREDIT" : "",
      );
      setReturnReason("");
      setShowCustomer(false);
      invalidateIdem();

      /*
       * تبِ «خالی» یعنی واقعاً خالی: بدون سطر، بدون مشتری، بدون حسابِ باز.
       * مشتریِ انتخاب‌شده روی سبدِ خالی هم «مشغول» است — فاکتورِ مشتریِ دیگر
       * نباید مشتریِ صندوق را عوض کند؛ تبِ تازه باز می‌شود.
       */
      if (
        !cart.lines.length &&
        !cart.customer &&
        !cart.openAccountId &&
        cart.doc.type === "sale"
      ) {
        patchCart(payload);
        focusScan();
        return;
      }
      if (!canAdd) {
        toast.error("همه‌ی تب‌ها پُرند — یکی را ببندید");
        return;
      }
      // eslint-disable-next-line react-hooks/immutability -- محموله تا تغییرِ تب در ref می‌ماند؛ الگویِ موجودِ صفحه
      pendingEdit.current = payload;
      // تبی که خودمان برای این سند باز می‌کنیم، بعد از پایانش هم خودمان می‌بندیم.
      addCart({ ephemeral: true });
    },
    onError: () => toast.error("باز کردن فاکتور برای مرجوعی ناموفق بود"),
  });

  /**
   * آوردنِ یک فاکتور برای ویرایش — در هر دو حالت.
   *
   * همان تب، همان جدول، همان کلیدها؛ با سه تواناییِ هم‌زمان: برگشتِ قلم
   * (سالم/معیوب)، افزودنِ قلمِ تازه با اسکن، و تصحیحِ قیمت. چراییِ یک‌جا
   * نشستنِ این‌ها بالای `_lib/invoice-adjust.ts` است.
   *
   * `memory` تیکِ «دیدن حافظه» را از اول روشن می‌کند (از میان‌برهای Alt+Enter/
   * Shift+Enter)؛ پیش‌فرض خاموش است — فروشنده در صورت نیاز داخل صفحه تیک می‌زند.
   */
  const loadAdjust = useMutation({
    mutationFn: async (v: {
      invoiceId: string;
      customer: Customer | null;
      memory?: boolean;
    }) => {
      const data = await getAdjustableLines(v.invoiceId);
      const customer =
        v.customer ??
        (data.invoice.customer
          ? await getCustomer(data.invoice.customer.id)
          : null);
      return { data, customer };
    },
    onSuccess: ({ data, customer: c }, v) => {
      if (!data.adjustable) {
        toast.error("این فاکتور قابل ویرایش نیست — باطل شده است");
        return;
      }
      const rows = invoiceToAdjustLines(data);
      if (!rows.length) {
        toast.error("این فاکتور ردیفی برای ویرایش ندارد");
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
        memory: !!v.memory,
        lastAdd: null,
        doc: adjustingStateOf(data),
      };

      setAdjustReason("");
      setAdjustSettle(null);
      setShowCustomer(false);
      invalidateIdem();

      /*
       * تبِ «خالی» یعنی واقعاً خالی: بدون سطر، بدون مشتری، بدون حسابِ باز.
       * مشتریِ انتخاب‌شده روی سبدِ خالی هم «مشغول» است — فاکتورِ مشتریِ دیگر
       * نباید مشتریِ صندوق را عوض کند؛ تبِ تازه باز می‌شود.
       */
      if (
        !cart.lines.length &&
        !cart.customer &&
        !cart.openAccountId &&
        cart.doc.type === "sale"
      ) {
        patchCart(payload);
        focusScan();
        return;
      }
      if (!canAdd) {
        toast.error("همه‌ی تب‌ها پُرند — یکی را ببندید");
        return;
      }
      // eslint-disable-next-line react-hooks/immutability -- محموله تا تغییرِ تب در ref می‌ماند؛ الگویِ موجودِ صفحه
      pendingEdit.current = payload;
      // تبی که خودمان برای این سند باز می‌کنیم، بعد از پایانش هم خودمان می‌بندیم.
      addCart({ ephemeral: true });
    },
    onError: () => toast.error("باز کردن فاکتور برای ویرایش ناموفق بود"),
  });

  const saveReturn = useMutation({
    mutationFn: async () => {
      const doc = returning!;
      const draft = returnDraft(doc, lines);

      if (!draft.lines.length)
        throw new Error("هیچ قلمی برای برگشت انتخاب نشده");
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
      toast.success(
        `مرجوعی ${toFa(r.number)} ثبت شد — ${rial(r.refundAmount)}`,
      );
      const cid = customer?.id;
      endLockedDoc();
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

  /**
   * ثبتِ عملیاتِ یکپارچه — مرجوعی + قلمِ تازه + تصحیح + تسویه، همه در یک
   * درخواستِ اتمیک. `settlement` فقط وقتی می‌آید که اختلافِ نهایی غیرصفر باشد
   * و فروشنده روشش را در پنلِ تسویه انتخاب کرده باشد؛ اختلافِ صفر بدون آن
   * ثبت می‌شود.
   */
  const saveAdjust = useMutation({
    mutationFn: async (vars: {
      settlement?: CreateAdjustDto["settlement"];
      /** تعدیلِ دستیِ مدیر روی اختلافِ نهایی — چانه‌زنی/گرد‌کردنِ سرِ پیشخوان. */
      manualAdjustment?: number;
    }) => {
      const doc = adjusting!;
      const draft = adjustDraft(doc, lines);

      if (
        !draft.returns.length &&
        !draft.changes.length &&
        !draft.additions.length
      ) {
        // شاید فقط توضیح‌ها عوض شده باشند — سندِ مالی نمی‌سازند و دلیل هم نمی‌خواهند.
        if (draft.notes.length) {
          await updateInvoiceLineNotes(doc.invoiceId, draft.notes);
          return null;
        }
        throw new Error("هیچ تغییری وارد نشده");
      }

      // توضیح‌ها اول می‌روند — سندِ مالی نیستند و نباید به ثبتِ عملیات گره بخورند.
      if (draft.notes.length) {
        await updateInvoiceLineNotes(doc.invoiceId, draft.notes);
      }

      return createAdjust(doc.invoiceId, {
        idempotencyKey: ensureIdem(),
        reason: adjustReason.trim(),
        note: note.trim() || undefined,
        returns: draft.returns,
        changes: draft.changes,
        additions: draft.additions,
        settlement: vars.settlement,
        manualAdjustment: vars.manualAdjustment,
      });
    },
    onSuccess: (r) => {
      if (!r) {
        toast.success("توضیح‌های فاکتور ذخیره شد");
      } else {
        const diff = r.invoice.difference;
        toast.success(
          diff === 0
            ? `عملیات فاکتور ${toFa(r.invoice.number)} ثبت شد`
            : `عملیات فاکتور ${toFa(r.invoice.number)} ثبت شد — ${rial(Math.abs(diff))} ${
                diff > 0 ? "دریافت شد" : "پرداخت شد"
              }`,
        );
      }
      const cid = customer?.id;
      endLockedDoc();
      setAdjustReason("");
      setAdjustSettle(null);
      qc.invalidateQueries({ queryKey: ["pos-customer-invoices"] });
      qc.invalidateQueries({ queryKey: ["pos-recent-invoices"] });
      if (cid) qc.invalidateQueries({ queryKey: ["customer", cid] });
      focusScan();
    },
    onError: (e: unknown) => {
      /*
       * خطایِ ردیف‌محور (مثلاً مرجوعیِ بیشتر از مانده) saleLogId در بدنه دارد —
       * همان ردیف در جدول قرمز می‌شود تا فروشنده بداند مشکل کجاست، نه اینکه
       * فقط یک toast ببیند.
       */
      const err = e instanceof ApiException ? e : null;
      const raw = err?.raw as { saleLogId?: string } | undefined;
      if (raw?.saleLogId) {
        const i = lines.findIndex((l) => l.key === raw.saleLogId);
        if (i >= 0) setErrorLine(i);
      }
      toast.error(e instanceof Error ? e.message : "ثبت عملیات ناموفق بود");
      invalidateIdem();
      setAdjustSettle(null);
    },
  });

  /**
   * ثبت قیمتِ فروشِ جدید از خودِ نتیجه‌ی جستجو — فقط مدیر.
   *
   * یک ردیفِ تازه در تاریخچه‌ی قیمت می‌سازد (ستور، نه بازنویسی)، سپس همان لحظه:
   * ردیفِ سبدِ این کالا، کشِ محلیِ صندوق و کوئریِ ردیف‌های «known» همه به‌روز
   * می‌شوند تا سرچ و فاکتور بدون ریلود، عددِ تازه را نشان دهند.
   */
  const savePrice = useMutation({
    mutationFn: (v: {
      productId: string;
      field: "sale" | "manager";
      value: number;
    }) =>
      setProductPrice(
        v.productId,
        v.field === "sale" ? { salePrice: v.value } : { managerPrice: v.value },
      ),
    onSuccess: (_price, v) => {
      // قیمت فروش → ردیفِ سبدِ همین کالا هم به‌روز شود (قیمتِ مدیر روی سبد اثر ندارد).
      if (v.field === "sale") {
        patchCart((c) => ({
          lines: c.lines.map((l) =>
            l.productId === v.productId ? { ...l, unitPrice: v.value } : l,
          ),
        }));
      }
      // کشِ محلی هم همان لحظه اصلاح شود تا سرچِ محلی عددِ تازه نشان دهد.
      posCatalog.updateProductPrices(v.productId, {
        salePrice: v.field === "sale" ? v.value : undefined,
        managerPrice: v.field === "manager" ? v.value : undefined,
      });
      // ردیف‌های «known» (سرچِ سرور) و دیالوگِ F3 هم دوباره خوانده شوند.
      qc.invalidateQueries({ queryKey: ["pos-inline"] });
      qc.invalidateQueries({ queryKey: ["pos-locate"] });
      toast.success(
        v.field === "sale" ? "قیمت فروش به‌روز شد" : "قیمت مدیر به‌روز شد",
      );
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof ApiException ? e.message : "ثبت قیمت ناموفق بود",
      ),
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
    getInvoice(invoiceId);
    /*
     * مشتری را خودِ loadInvoice پیدا می‌کند؛ اینجا فقط وجودِ فاکتور بررسی
     * می‌شود تا لینکِ خراب پیامِ روشن بدهد نه یک صفحه‌ی خالی.
     *
     * فروشِ نقدیِ گذری هم ویرایش می‌شود: سرور اصلاحیه‌ی بدونِ مشتری را قبول
     * می‌کند و فقط سطرِ دفتر را رد می‌کند.
     */
    getInvoice(invoiceId)
      .then(() => loadAdjust.mutate({ invoiceId, customer: null }))
      .catch(() => toast.error("فاکتور پیدا نشد"));
    // loadInvoice عمداً در وابستگی‌ها نیست: هویتش با هر رندر عوض می‌شود و
    // این اثر باید دقیقاً یک بار اجرا شود.
  }, [searchParams]);

  /*
   * بستنِ ویرایش بدون ثبت.
   *
   * پیش‌تر فقط سبد و سند پاک می‌شد و **مشتری روی تب می‌ماند** — «فاکتور
   * رفت، مشتری ماند». حالا پایانِ سند یعنی پایانِ مشتری هم: تبِ خودکارِ همین
   * ویرایش کامل بسته می‌شود و روی تبِ دستی هم مشتری/قفل/حساب‌باز پاک می‌شوند.
   */
  const cancelEdit = useCallback(() => {
    setRefundMethod("");
    setReturnReason("");
    setAdjustReason("");
    setAdjustSettle(null);
    invalidateIdem();
    endLockedDoc();
    focusScan();
  }, [invalidateIdem, endLockedDoc, focusScan]);

  /**
   * Ctrl+Z — برگرداندنِ آخرین افزودنِ این تب.
   *
   * اسکنِ اشتباه پرتکرارترین خطای پیشخوان است؛ تا حالا باید با فلش روی همان
   * ردیف می‌رفتی و Delete می‌زدی. اینجا یک کلید همان کار را می‌کند: ردیفِ نو
   * حذف می‌شود، افزودن به ردیفِ موجود به مقدارِ قبلی برمی‌گردد.
   */
  const undoLastAdd = useCallback(() => {
    const la = cart.lastAdd;
    if (!la) {
      toast.info("چیزی برای برگرداندن نیست");
      return;
    }
    const { lines: next, removedIndex } = applyUndoAdd(lines, la);
    patchCart({ lines: next, lastAdd: null });
    if (removedIndex !== null) {
      // فوکوس به همسایه برود، نه به ردیفِ حذف‌شده.
      setActiveRow((r) => Math.max(0, Math.min(r, lines.length - 2)));
    }
    invalidateIdem();
    focusScan();
  }, [cart.lastAdd, lines, patchCart, setActiveRow, invalidateIdem, focusScan]);

  /**
   * تیکِ «دیدن حافظه این فاکتور».
   *
   * خاموش: جدول مثل فاکتورِ عادی — تعدادِ خالص، ردیفِ کاملاً برگشتی پنهان.
   * روشن: سابقه با برچسب و کم‌رنگی. وقتی خاموش می‌شود و ردیفِ فعال از دید
   * بیرون می‌افتد، فوکوس به اولین ردیفِ دیدنی می‌رود تا حرکتِ کیبورد نلنگد.
   */
  const toggleMemory = useCallback(() => {
    const next = !memory;
    patchCart({ memory: next });
    if (adjusting && !next) {
      const active = lines[activeRow];
      const activeHidden =
        active && active.sold !== undefined && adjustNetQty(active) <= 0;
      if (activeHidden) {
        const firstVisible = lines.findIndex(
          (l) => l.sold === undefined || adjustNetQty(l) > 0,
        );
        setActiveRow(firstVisible < 0 ? 0 : firstVisible);
      }
    }
    focusScan();
  }, [memory, patchCart, adjusting, lines, activeRow, setActiveRow, focusScan]);

  // ---------- ثبت ----------

  const submit = useMutation({
    mutationFn: async ({ payments, dueDate }: SubmitArgs = {}) => {
      if (blankQuotationId) {
        await saveBlankPrices(blankQuotationId, {
          lines: activeLines
            .filter((l) => l.blankLineId)
            .map((l) => ({
              lineId: l.blankLineId!,
              quantity: l.quantity,
              finalPrice: l.unitPrice,
              productId: l.productId,
              locationId: l.locationId || null,
              text: l.note,
            })),
        });
        return convertBlankQuotation(
          blankQuotationId,
          payments,
          dueDate,
          customer?.id,
        );
      }

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
      setBlankQuotationId(null);
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
          qc.invalidateQueries({
            queryKey: ["open-account", cart.openAccountId],
          });
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
        qc.invalidateQueries({
          queryKey: ["customer-today-count", soldCustomerId],
        });
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
          prev.map((l, j) =>
            j === d.lineIndex ? { ...l, available: d.available } : l,
          ),
        );
        toast.error(
          `ردیف ${toFa(d.lineIndex + 1)}: موجودی کافی نیست — فقط ${qty(d.available)} موجود است`,
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
    mutationFn: ({
      validForMinutes,
    }: {
      validForMinutes: number;
      print: boolean;
    }) =>
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
          onClick: () =>
            window.open(`/admin/print/quotation/${q.id}`, "_blank"),
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
    mutationFn: (args: { assignedToId: string | null; note?: string }) => {
      // یادداشتِ کاربر + فهرستِ خودکارِ همه‌ی قفسه‌ها (اگر کالا چندمکانه بود).
      const noteParts = [args.note?.trim(), workerNoteRef.current].filter(
        (x): x is string => !!x,
      );
      return createWorkTask({
        warehouseId,
        assignedToId: args.assignedToId,
        note: noteParts.length ? noteParts.join("\n\n") : undefined,
        idempotencyKey: uuid(),
        lines: workerLinesRef.current,
      });
    },
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
     * F2 روی فروش تسویه است، روی ویرایش ثبتِ عملیات، روی مرجوعی برگشتی، روی
     * پیش‌فاکتور ثبتِ پیش‌فاکتور. فروشنده یک کلید یاد می‌گیرد نه چهار تا.
     */
    if (returning) {
      if (!saveReturn.isPending) saveReturn.mutate();
      return;
    }
    /*
     * F2 روی ویرایشِ فاکتور: اختلافِ صفر مستقیم ثبت می‌شود، اختلافِ غیرصفر
     * اول پنلِ تسویه را باز می‌کند تا فروشنده روشش را انتخاب کند (نقد/کارت/
     * چک/روی حساب) — حتی روی حسابِ باز. خودِ ثبت همیشه همان createAdjustِ
     * اتمیک است؛ این پنل فقط تصمیمِ روش را می‌گیرد. اگر هیچ کارِ مالی در کار
     * نباشد ولی توضیح‌ها عوض شده باشند، همان‌جا ذخیره می‌شوند.
     */
    if (adjusting) {
      if (saveAdjust.isPending) return;
      const draft = adjustDraft(adjusting, lines);
      const hasFinancialWork =
        draft.returns.length + draft.changes.length + draft.additions.length >
        0;
      const notesChanged = draft.notes.length > 0;
      if (!hasFinancialWork && !notesChanged) {
        /*
         * هیچ قلمی عوض نشده — ولی ممکن است **نحوهٔ پرداخت** اشتباه ثبت شده
         * باشد («همه‌اش کارت زده شد، در حالی که ۳۰ نقد بود و ۷۰ نسیه»).
         * قبل‌تر همین‌جا کار تمام می‌شد با پیامِ «هیچ تغییری وارد نشده» و
         * فروشنده هیچ راهی نداشت؛ حالا F2 پنلِ اصلاحِ پرداخت را باز می‌کند.
         */
        if (canFixPayment) {
          setFixPayment({ invoiceId: adjusting.invoiceId, customer });
          return;
        }
        toast.error(settleQ.data?.blockedReason ?? "هیچ تغییری وارد نشده");
        return;
      }
      if (!hasFinancialWork || draft.net === 0) {
        saveAdjust.mutate({});
        return;
      }
      setAdjustSettle({
        direction: draft.net > 0 ? "COLLECT" : "PAY",
        amount: Math.abs(draft.net),
        computedNet: draft.net,
        beforeTotal: adjusting.invoiceTotal,
        // totalAfter = invoice.total + net — همان که سرور بعد از ثبت می‌نویسد.
        afterTotal: adjusting.invoiceTotal + draft.net,
        paidAmount: adjusting.paidAmount,
        /*
         * مشتریِ حساب‌باز یا بدهکار: برگشتِ پول پیش‌فرض روی حسابش می‌نشیند
         * نه نقد از صندوق — همان قانونِ مرجوعی، در تسویهٔ اختلافِ ویرایش.
         */
        preferCredit:
          adjusting.isOpenAccount ||
          (adjusting.customerBalance ?? 0) > 0,
      });
      return;
    }
    if (quoting) {
      if (!activeLines.length) return;
      if (!saveQuotation.isPending) {
        saveQuotation.mutate({
          validForMinutes: quoting.validForMinutes,
          print: false,
        });
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
        `${toFa(zeroPriceCount)} ردیف قیمت ندارد — قبل از ثبت قیمتشان را وارد کنید`,
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
    activeLines.length,
    noWarehouse,
    zeroPriceCount,
    cart.openAccountId,
    returning,
    adjusting,
    quoting,
    submit,
    saveReturn,
    saveAdjust,
    saveQuotation,
    adjustDraft,
    lines,
    adjustReason,
    canFixPayment,
    settleQ.data,
    customer,
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
    // هر قلمِ سبد آدرسِ خودش را دارد — یادداشتِ خودکار لازم نیست.
    workerNoteRef.current = null;
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
      // اگر کالا در چند قفسه است، آدرسِ کاملِ همه را به پیام اضافه کن.
      workerNoteRef.current =
        r.locations.length > 1
          ? [
              `این کالا در ${toFa(r.locations.length)} قفسه موجود است:`,
              ...r.locations.map(
                (loc) =>
                  `• ${loc.path || loc.name} — موجودی ${qty(loc.quantity)}`,
              ),
            ].join("\n")
          : null;
      setWorkerItemCount(1);
      setShowWorkerPicker(true);
    },
    [toFa, qty],
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

  /**
   * خلاصه‌ی محاسباتیِ عملیاتِ یکپارچه — خوراکِ نوارِ پایین (ارزش مرجوعی، ارزش
   * افزوده، اثر تغییرات، اختلاف) و دکمه‌ی ثبت. از همان تابعِ pure که سند را
   * می‌سازد، پس عددِ روی صفحه همیشه همان عددِ ثبت‌شده است.
   */
  const adjustDraftState = useMemo(
    () => (adjusting ? adjustDraft(adjusting, lines) : null),
    [adjusting, lines],
  );

  /*
   * وضعیت مالی مشتری در لحظه‌ی ویرایش — خوراکِ نوارِ کنارِ تیکِ حافظه.
   * summary با رویدادهای رسید/پرداخت/برگشت realtime تازه می‌شود؛ یعنی اگر
   * صندوقِ دیگری همزمان پول گرفت، این نوار هم همان لحظه عوض می‌شود.
   */
  const custSummary = customerDetail.data?.summary;
  /*
   * ماندهٔ فعلیِ فاکتوری که ویرایش می‌شود — از ماندهٔ دفتریِ سرور می‌آید که با
   * مرجوعی‌ها و اصلاحیه‌ها تازه شده است؛ نه از total−paid که مرجوعی را نمی‌بیند
   * و فروشنده را با عددِ دوگانه گمراه می‌کند. هنوز نیامده باشد (پاسِ قدیمی)،
   * برآوردِ قدیمیِ total−paid را نشان می‌دهیم.
   */
  const adjustingInvoiceDue = adjusting
    ? (adjusting.invoiceDue ?? adjusting.invoiceTotal - adjusting.paidAmount)
    : 0;
  /** ماندهٔ فاکتور بعد از ثبت = ماندهٔ فعلی + اختلافِ نهاییِ عملیات. */
  const dueAfterAdjust = adjustingInvoiceDue + (adjustDraftState?.net ?? 0);
  /** ماندهٔ مشتری بعد از ثبت = ماندهٔ کنونی − ماندهٔ قبلیِ فاکتور + ماندهٔ تازه. */
  const balanceAfterAdjust = customer
    ? (custSummary?.totalDue ?? 0) - adjustingInvoiceDue + dueAfterAdjust
    : 0;

  /** آیا ویرایشِ فاکتور چیزی برای ثبت دارد — سبدِ خالی و بی‌تغییر نه. */
  const adjustHasWork =
    !!adjustDraftState &&
    (adjustDraftState.returns.length > 0 ||
      adjustDraftState.changes.length > 0 ||
      adjustDraftState.additions.length > 0 ||
      adjustDraftState.notes.length > 0);

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
      new: {
        run: () => {
          addCart();
          focusScan();
        },
        label: "فاکتور نو",
      },

      // سندِ قبلی/بعدی در صندوق یعنی تبِ قبلی/بعدی — همان مفهوم، همان کلید.
      prev:
        carts.length > 1
          ? { run: () => stepCart(-1), label: "تب قبلی" }
          : undefined,
      next:
        carts.length > 1
          ? { run: () => stepCart(1), label: "تب بعدی" }
          : undefined,

      find: { run: () => setShowInvoices(true) },
      quotes: { run: () => setShowQuotes(true) },
      blankQuotes: {
        run: () => setShowBlankQuotes(true),
        label: "پیش‌فاکتورهای سفید",
      },

      // مرجوعی قفل به فاکتور است: نه قلمی اضافه می‌شود نه حذف. در ویرایشِ
      // فاکتور، قلمِ تازه با اسکن اضافه می‌شود؛ ردیفِ موجود در حالتِ عادی با
      // حذف = برگشتِ کامل می‌شود و در حالتِ حافظه با مقدارِ برگشتی.
      addRow: returning ? undefined : { run: focusScan, label: "افزودن قلم" },
      delRow: returning
        ? undefined
        : lines.length
          ? {
              run: () => removeLine(activeRow),
              /* در حالتِ حافظه ردیفِ موجود حذف نمی‌شود — برگشت با مقدار. */
              disabled:
                !!adjusting && memory && lines[activeRow]?.sold !== undefined,
            }
          : { run: () => {}, disabled: true },
      discount:
        returning || adjusting
          ? undefined
          : { run: () => document.getElementById("invoice-discount")?.focus() },

      // توضیحِ قلمِ فعال — خانه‌اش زیرِ نامِ کالا در همان ردیف است.
      lineNote:
        !returning && viewLines[viewActiveRow]
          ? {
              run: () => {
                const el = document.querySelector<HTMLInputElement>(
                  `[data-line-note="${viewActiveRow}"]`,
                );
                el?.focus();
                el?.select();
              },
            }
          : undefined,

      party: { run: () => setShowCustomer(true), label: "مشتری" },
      ledger: { run: () => setShowOpenAccounts(true), label: "حساب‌بازها" },
      kardex: lines[activeRow]
        ? {
            run: () =>
              window.open(
                `/admin/products/${lines[activeRow].productId}`,
                "_blank",
              ),
          }
        : { run: () => {}, disabled: true },

      /*
       * چاپ فقط وقتی سندی برای چاپ وجود دارد. روی فاکتورِ قفل‌شده همان فاکتور
       * چاپ می‌شود؛ روی سبدِ ثبت‌نشده هنوز چیزی چاپ‌کردنی نیست.
       */
      print: lockedToInvoice
        ? {
            run: () =>
              window.open(
                `/admin/print/invoice/${lockedToInvoice.invoiceId}`,
                "_blank",
              ),
          }
        : undefined,

      help: { run: () => setShowHelp(true) },

      workTasks: { run: () => setShowWorkTasks(true) },
      addProduct: { run: () => setShowAddProduct(true) },
      shortage: { run: () => setShowShortage(true) },

      dispatch:
        !returning && !adjusting && lines.length
          ? { run: openWorkerForCart, pending: sendToWorker.isPending }
          : undefined,

      quote:
        !returning && !adjusting
          ? {
              run: toggleQuote,
              label: quoting ? "برگشت به فروش" : "پیش‌فاکتور",
              disabled: !lines.length,
            }
          : undefined,

      /*
       * تعویض (F10) فقط روی فروشِ عادی و وقتی مشتری روی تب است معنا دارد —
       * برگشت برای فاکتورهایِ قبلیِ همان مشتری است.
       */
      swap:
        !returning &&
        !adjusting &&
        !quoting &&
        canUseNetSwap &&
        !!cart.customer?.id &&
        !!warehouseId
          ? { run: () => setShowNetSwap(true), label: "تعویض (برگشت+خرید)" }
          : undefined,

      /*
       * «پرداخت» فقط سرِ فروش. پیش‌فاکتور پولی نمی‌گیرد، ویرایش اختلافش را
       * در پنلِ تسویه می‌پرسد، و مرجوعی روشِ برگشتِ وجهش را در پای فرم می‌پرسد.
       */
      pay:
        !returning && !adjusting && !quoting && lines.length
          ? {
              run: () => {
                if (blankQuotationId && !customer) {
                  setShowCheckout(true);
                  toast.info("اول مشتری را انتخاب کنید");
                  return;
                }
                setShowPayment(true);
              },
            }
          : undefined,

      commit: returning
        ? {
            run: () => saveReturn.mutate(),
            label: "ثبت مرجوعی",
            disabled: !returnTotal,
            pending: saveReturn.isPending,
          }
        : adjusting
          ? {
              run: startCheckout,
              /*
               * با کارِ قلمی، دکمه همان «ثبت اصلاح فاکتور» است. بدون کارِ
               * قلمی، می‌شود «اصلاح نحوهٔ پرداخت» — و همان F2 پنلش را باز
               * می‌کند. اگر هیچ‌کدام در دسترس نباشد (فاکتور چکدار، پول از راه
               * رسید، یا فاکتورِ گذشته برای فروشنده) دکمه خاموش می‌ماند و
               * دلیلش در راهنمای F1 و در خود پنل گفته می‌شود.
               */
              label: adjustHasWork
                ? memory
                  ? `ثبت عملیات فاکتور ${toFa(adjusting.invoiceNumber)}`
                  : `ثبت اصلاح فاکتور ${toFa(adjusting.invoiceNumber)}`
                : "اصلاح نحوهٔ پرداخت",
              disabled: !adjustHasWork && !canFixPayment,
              pending: saveAdjust.isPending,
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
        ? {
            run: cancelEdit,
            label: adjusting ? "لغو ویرایش" : "لغو مرجوعی",
          }
        : quoting
          ? { run: toggleQuote, label: "برگشت به فروش" }
          : undefined,
    };
  }, [
    memory,
    returning,
    adjusting,
    quoting,
    lockedToInvoice,
    carts.length,
    viewLines,
    viewActiveRow,
    activeRow,
    adjustHasWork,
    canFixPayment,
    canCheckout,
    activeLines.length,
    returnTotal,
    saveReturn,
    saveAdjust,
    saveQuotation.isPending,
    submit.isPending,
    startCheckout,
    cancelEdit,
    toggleQuote,
    openWorkerForCart,
    sendToWorker.isPending,
    addCart,
    focusScan,
    removeLine,
    stepCart,
    setShowRecent,
    setShowCustomer,
    setShowOpenAccounts,
    loadQuotation,
    setShowWorkTasks,
    setShowAddProduct,
    setShowShortage,
    setShowBlankQuotes,
    warehouseId,
    cart.customer?.id,
    blankQuotationId,
    canUseNetSwap,
  ]);

  /*
   * همان فرمانِ ثبت که آیکنِ نوار بالا هم می‌زند — دو منبع نداریم.
   * تکه‌تکه بیرون کشیده می‌شود تا داخلِ JSX دنبالِ زنجیره‌ی `?.` نگردیم.
   *
   * eslint: `commands` یک useMemo است که actionهایش بستارِ توابعِ
   * ref-داری مثل focusScan (scanRef) و openWorkerForCart (workerLinesRef)
   * را نگه می‌دارند؛ قانونِ react-hooks/refs این را «دسترسی به ref در رندر»
   * می‌بیند. ولی این refها فقط هنگامِ اجرایِ خودِ action (کلیک/کلید) خوانده
   * می‌شوند، نه هنگامِ ساختنِ memo — پس غیرفعال‌کردنِ قانون اینجا بی‌خطر است
   * و رفتار عوض نمی‌شود.
   */
  // eslint-disable-next-line react-hooks/refs -- refها فقط داخل actionها، هنگامِ اجرا خوانده می‌شوند
  const commitRun = commands.commit?.run;
  // eslint-disable-next-line react-hooks/refs -- refها فقط داخل actionها، هنگامِ اجرا خوانده می‌شوند
  const commitLabel = commands.commit?.label ?? "ثبت";
  // eslint-disable-next-line react-hooks/refs -- refها فقط داخل actionها، هنگامِ اجرا خوانده می‌شوند
  const commitBusy = !!commands.commit?.pending;
  // eslint-disable-next-line react-hooks/refs -- refها فقط داخل actionها، هنگامِ اجرا خوانده می‌شوند
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
          {
            keys: "Enter",
            label: "افزودن بارکد / رفتن به تسویه",
            primary: true,
          },
          {
            keys: "F2",
            label: returning
              ? "ثبت مرجوعی"
              : adjusting
                ? "ثبت اصلاح/عملیات فاکتور"
                : "تسویه و ثبت فاکتور",
            primary: true,
          },
          { keys: "Tab", label: "از بارکد به تعداد، بعد قیمت" },
          { keys: "F7", label: "پرداخت ترکیبی" },
          { keys: "Insert", label: "افزودن قلم" },
          { keys: "Delete", label: "حذف ردیف فعال" },
          { keys: "Ctrl+Z", label: "برگرداندنِ آخرین افزودن (خطای اسکن)" },
          { keys: "Ctrl+B", label: "صدای اسکن روشن/خاموش" },
          { keys: "F8", label: "پیش‌فاکتور ↔ فروش" },
          { keys: "Alt+Q", label: "پیش‌فاکتورهای باز — بارگذاری در سبد" },
          {
            keys: "Alt+B",
            label: "پیش‌فاکتورهای سفید — قیمت‌گذاری و اتصال قلم‌ها",
            primary: true,
          },
          { keys: "F6", label: "تخفیف فاکتور" },
          { keys: "Alt+T", label: "توضیح قلم فعال" },
          {
            keys: "Alt+H",
            label: "دیدن حافظه فاکتور در ویرایش",
            primary: true,
          },
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
          { keys: "Enter", label: "در پنل مشتری: ویرایش فاکتور (بدون حافظه)" },
          { keys: "Shift+Enter", label: "در پنل مشتری: ویرایش با حافظه" },
          { keys: "Alt+Enter", label: "برگشت از فروشِ فاکتورِ انتخاب‌شده" },
          { keys: "Ctrl+Enter", label: "در فهرست فاکتورها: ویرایش با حافظه" },
          { keys: "Enter", label: "در فهرست فاکتورها: ویرایش (بدون حافظه)" },
          { keys: "F3", label: "حساب‌بازها — بدهکار و طلبکار" },
          { keys: "C", label: "در پنل مشتری: کپیِ اقلام فاکتور در سبدِ تازه" },
          { keys: "Ctrl+F", label: "یافتن فاکتور" },
          { keys: "Alt+N", label: "فاکتور نو" },
          { keys: "Alt+PgUp/PgDn", label: "تب قبلی / بعدی" },
          { keys: "F10", label: "تعویض (برگشت+خرید)" },
          { keys: "Ctrl+Shift+X", label: "جدا کردن مشتری از این تب" },
          { keys: "Ctrl+Del", label: "لغو ویرایش / لغو مرجوعی" },
          { keys: "Ctrl+P", label: "چاپ فاکتورِ در حال ویرایش" },
          { keys: "Alt+K", label: "کاردکس کالای ردیف فعال" },
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
    [returning, adjusting, memory],
  );

  const anyDialogOpen =
    !!pickerStock ||
    showCustomer ||
    showPayment ||
    showSearch ||
    showQuotes ||
    showBlankQuotes ||
    showInvoices ||
    showWorkerPicker ||
    showWorkTasks ||
    showRecent ||
    showCheckout ||
    showOpenAccounts ||
    !!receipt ||
    showTodayPurchases ||
    !!adjustSettle;

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
        if (adjusting && !anyDialogOpen) cancelEdit();
        focusScan();
        return;
      }

      if (anyDialogOpen) return;

      // Alt+H — تیکِ «دیدن حافظه» در ویرایشِ فاکتور.
      if (
        adjusting &&
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        e.code === "KeyH"
      ) {
        e.preventDefault();
        toggleMemory();
        return;
      }

      // Ctrl+Shift+X — جدا کردن مشتریِ قفل‌شده (همان دکمه‌ی × چیپ).
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "x"
      ) {
        e.preventDefault();
        if (customer) {
          setCustomer(null);
          invalidateIdem();
          toast.info("مشتری جدا شد — فروش نقدی گذری");
        }
        return;
      }

      /*
       * Ctrl+Z — برگرداندنِ آخرین افزودن.
       *
       * داخلِ خانه‌های جدول و توضیح، undoِ خودِ مرورگر کار کند — آنجا ویرایشِ
       * متن در جریان است، نه افزودنِ ردیف. فقط نوارِ اسکن (و هیچ فوکوسی)
       * به برگرداندنِ ردیف می‌رسد.
       */
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        const target = e.target as HTMLElement | null;
        const editable =
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.tagName === "SELECT";
        if (editable && target?.id !== "pos-scan") return;
        e.preventDefault();
        undoLastAdd();
        return;
      }

      /*
       * Ctrl+B — صدای اسکن روشن/خاموش. همان گاردِ Ctrl+Z: داخلِ خانه‌های جدول
       * و توضیح دست نمی‌زند (هیچ میان‌برِ مرورگری‌ای آنجا نیست که بشکند)، فقط
       * از نوارِ اسکن (و بدون فوکوس) می‌رسد.
       */
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "b"
      ) {
        const target = e.target as HTMLElement | null;
        const editable =
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.tagName === "SELECT";
        if (editable && target?.id !== "pos-scan") return;
        e.preventDefault();
        const muted = toggleScanSoundMuted();
        setScanSoundOff(muted);
        toast.info(muted ? "صدای اسکن خاموش شد" : "صدای اسکن روشن شد");
        return;
      }

      /*
       * F2/F3/F4/F6/F7 و Delete اینجا نیستند — نوار فرمانِ مشترک صاحبشان است
       * (components/document/commands.ts). اینجا فقط کلیدهایی می‌مانند که
       * مخصوصِ خودِ صندوق‌اند و در سندهای دیگر معنی ندارند.
       */
      switch (e.key) {
        /*
         * جهت‌ها فقط وقتی ردیفِ فعال را عوض می‌کنند که فوکوس روی نوار اسکن باشد.
         *
         * داخل خانه‌های جدول، خودِ جدول جابه‌جایی را مدیریت می‌کند (تعداد ↔ قیمت).
         * بدون این شرط، یک فلش هر دو کار را می‌کرد و مکان‌نما می‌پرید.
         */
        case "ArrowDown":
          if (viewLines.length && document.activeElement === scanRef.current) {
            e.preventDefault();
            // در حالتِ عادی فقط بینِ ردیف‌های دیده‌شده حرکت می‌کنیم — ردیفِ
            // پنهان (کاملاً برگشتی) نباید مقصدِ فلش باشد.
            setActiveRow((r) => {
              if (!adjustView) return Math.min(r + 1, viewLines.length - 1);
              const pos = adjustView.map.indexOf(r);
              if (pos < 0) return adjustView.map[0] ?? 0;
              return (
                adjustView.map[Math.min(pos + 1, adjustView.map.length - 1)] ??
                0
              );
            });
          }
          break;
        case "ArrowUp":
          if (viewLines.length && document.activeElement === scanRef.current) {
            e.preventDefault();
            setActiveRow((r) => {
              if (!adjustView) return Math.max(r - 1, 0);
              const pos = adjustView.map.indexOf(r);
              if (pos < 0) return adjustView.map[0] ?? 0;
              return adjustView.map[Math.max(pos - 1, 0)] ?? 0;
            });
          }
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    viewLines,
    activeRow,
    anyDialogOpen,
    submit.isPending,
    sendToWorker.isPending,
    addCart,
    focusScan,
    customer,
    setCustomer,
    invalidateIdem,
    adjusting,
    cancelEdit,
    startCheckout,
    openWorkerForCart,
    toggleMemory,
    adjustView,
    setActiveRow,
    undoLastAdd,
  ]);

  useEffect(() => {
    focusScan();
  }, [focusScan]);

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
          returning
            ? "برگشت از فروش"
            : adjusting
              ? memory
                ? "ویرایش فاکتور — نمایش حافظه"
                : "ویرایش فاکتور فروش"
              : quoting
                ? "پیش‌فاکتور"
                : "فاکتور فروش"
        }
        number={lockedToInvoice ? toFa(lockedToInvoice.invoiceNumber) : null}
        state={
          returning
            ? "قفل به فاکتور — کالا و قیمت از خودِ فاکتور می‌آید"
            : adjusting
              ? memory
                ? "سابقه دیده می‌شود: برگشتی‌ها کم‌رنگ با برچسب — ثبت، یک عملیاتِ اتمیک"
                : "مثل فاکتورِ عادی ویرایش می‌شود — تیکِ حافظه سابقه را نشان می‌دهد"
              : quoting
                ? "موجودی دست نمی‌خورد؛ فقط قیمت نگه داشته می‌شود"
                : "پیش‌نویس"
        }
        tone={lockedToInvoice || quoting ? "warning" : "normal"}
        commands={commands}
        keysEnabled={!anyDialogOpen && !showHelp}
        status={
          <>
            <span>
              انبار:{" "}
              <b className="text-foreground">
                {warehouses.data?.find((w) => w.id === warehouseId)?.name ??
                  "—"}
              </b>
            </span>
            <span>
              تب‌های باز:{" "}
              <b className="text-foreground tabular-nums">
                {toFa(carts.length)}
              </b>
            </span>
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
              onSelect={(id) => {
                setActiveId(id);
                focusScan();
              }}
              onAdd={() => {
                addCart();
                focusScan();
              }}
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
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-destructive
                        bg-destructive/10 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-destructive">
                  هیچ انباری تعریف نشده
                </p>
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
            {/*
          دو نشانگرِ کوچک، پیش از نوارِ اسکن:
          • نقطه‌ی اتصالِ realtime — سبز یعنی رویدادها می‌رسند و اعداد همان
            لحظه تازه می‌شوند؛ قرمزِ تپنده یعنی قطع (خودش برمی‌گردد و اعداد
            تازه می‌شوند، ولی تا آن موقع ممکن است کهنه باشند).
          • کلیدِ صدای اسکن — روشن/خاموش با کلیک یا Ctrl+B؛ انتخاب می‌ماند.
        */}
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                role="status"
                title={
                  realtime.status === "up"
                    ? "اتصال زنده — اعداد همان لحظه تازه می‌شوند"
                    : realtime.status === "down"
                      ? "اتصال زنده قطع است — خودش برمی‌گردد؛ تا آن موقع اعداد ممکن است کهنه باشند"
                      : "در حال اتصال…"
                }
                className={`size-2.5 shrink-0 rounded-full ${
                  realtime.status === "up"
                    ? "bg-success"
                    : realtime.status === "down"
                      ? "bg-destructive animate-pulse"
                      : "bg-muted-foreground/50"
                }`}
              />
              <button
                type="button"
                onClick={() => {
                  const muted = toggleScanSoundMuted();
                  setScanSoundOff(muted);
                  toast.info(
                    muted ? "صدای اسکن خاموش شد" : "صدای اسکن روشن شد",
                  );
                  focusScan();
                }}
                title={
                  scanSoundOff
                    ? "صدای اسکن خاموش است — روشن‌کردن با کلیک یا Ctrl+B"
                    : "صدای اسکن روشن است — خاموش‌کردن با کلیک یا Ctrl+B"
                }
                className={`flex size-8 items-center justify-center rounded-md border transition-colors ${
                  scanSoundOff
                    ? "text-muted-foreground hover:text-foreground"
                    : "border-primary/40 text-primary"
                }`}
              >
                {scanSoundOff ? (
                  <VolumeX className="size-4" />
                ) : (
                  <Volume2 className="size-4" />
                )}
              </button>
            </div>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={scanRef}
                id="pos-scan"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  // ↑↓ در لیست زنده. تا اولین ↓، هیچ ردیفی انتخاب نیست.
                  if (
                    liveList.length &&
                    (e.key === "ArrowDown" || e.key === "ArrowUp")
                  ) {
                    e.preventDefault();
                    // وگرنه همین فلش به هندلر سراسری هم می‌رسد و هم‌زمان ردیفِ
                    // فعالِ جدول را جابه‌جا می‌کند.
                    e.stopPropagation();
                    setLiveHighlight((h) =>
                      e.key === "ArrowDown"
                        ? Math.min(h + 1, liveList.length - 1)
                        : Math.max(h - 1, -1),
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
                  if (e.key === "Tab" && viewLines.length && !liveList.length) {
                    e.preventDefault();
                    const col = e.shiftKey ? 1 : 0;
                    const cell = document.querySelector<HTMLInputElement>(
                      `[data-cell="${viewActiveRow}:${col}"]`,
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
                  const asQty = /^\d{1,4}$/.test(faToEn(typed))
                    ? Number(faToEn(typed))
                    : 0;
                  if (asQty > 0 && lines.length) {
                    /* در ویرایشِ فاکتور، معنیِ عدد با حالتِ نمایش عوض می‌شود (applyQtyInput). */
                    applyQtyInput(activeRow, asQty);
                    setScan("");
                    // بعد از تعداد، خانه‌ی قیمتِ همان ردیف؛ ترتیب طبیعیِ کار.
                    requestAnimationFrame(() => {
                      const cell = document.querySelector<HTMLInputElement>(
                        `[data-cell="${viewActiveRow}:1"]`,
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
                rows={liveListWithStock}
                highlight={liveHighlight}
                loading={useLocalSearch ? false : liveResults.isFetching}
                pickingId={pickingId}
                canManagePrice={canManagePrice}
                onSavePrice={(productId, field, value) =>
                  savePrice.mutate({ productId, field, value })
                }
                onHover={setLiveHighlight}
                onPick={onPickRow}
                onSendToWorker={(r) => {
                  openWorkerForResult(r);
                  closeLive();
                }}
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
                overdue={customerDetail.data?.summary?.overdue ?? 0}
                todayCount={customerTodayInvoices.data?.meta?.total ?? 0}
                loading={customerTodayInvoices.isFetching}
                locked={cart.customerLocked}
                onToggleLock={toggleCustomerLock}
                // کلیک روی نام = فاکتورهای همین مشتری، همین‌جا. رفتن به پرونده‌ی
                // کامل هنوز ممکن است، ولی کارِ روزمره این است نه آن.
                onOpen={() => setCustomerPanel("ledger")}
                onShowToday={() => setShowTodayPurchases(true)}
                onClear={() => {
                  setCustomer(null);
                  invalidateIdem();
                }}
              />
            )}

            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                invalidateIdem();
              }}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              {warehouses.data?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
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
              /*
               * در حالتِ عادی، ردیفِ کاملاً برگشتی از جدول بیرون می‌ماند — سبدِ
               * واقعی دست‌نخورده است و اندیس‌ها با نگاشتِ adjustView ترجمه می‌شوند.
               */
              lines={adjustView ? adjustView.lines : lines}
              activeRow={viewIndexOf(activeRow)}
              errorLine={errorLine == null ? null : viewIndexOf(errorLine)}
              mode={returning ? "return" : adjusting ? "adjust" : "sale"}
              memory={memory}
              onActivate={(vi) => setActiveRow(realIndexOf(vi))}
              onPatch={(vi, p) => patchLine(realIndexOf(vi), p)}
              onRemove={(vi) => removeLine(realIndexOf(vi))}
              onQtyOverflow={handleQtyOverflow}
            />
          </div>

          {/*
        نوارِ جمع — یک خط، تمامِ عرض.

        چهار دکمه‌ی پایین حذف شدند: هر چهارتا حالا آیکنِ نوار بالا هستند و
        داشتنشان در دو جا یعنی فروشنده باید هر بار انتخاب کند کدام را بزند.
        تنها دکمه‌ی برچسب‌دارِ صفحه همین «ثبت» است، چون کنارِ مبلغ می‌نشیند و
        عملِ نهایی است.
      */}
          <div className="flex shrink-0 flex-col gap-1.5 border-t bg-card px-3 py-1.5">
            {adjusting && customer && (
              <section className="min-w-0">
                <div className="mb-0.5 text-[10px] font-semibold text-muted-foreground">
                  مانده حساب مشتری
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <CustomerBalanceStrip
                    layout="row"
                    totalDue={custSummary?.totalDue ?? 0}
                    overdue={custSummary?.overdue ?? 0}
                    invoiceDue={adjustingInvoiceDue}
                    dueAfter={dueAfterAdjust}
                    chequesInHand={custSummary?.chequesInHandCount ?? 0}
                  />
                </div>
              </section>
            )}

            <section className="flex min-w-0 flex-wrap items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                {adjusting && (
                  <label
                    className="flex shrink-0 cursor-pointer select-none items-center gap-1 pb-0.5 text-[10px] text-muted-foreground"
                    title="حافظه خاموش: فاکتور مثل عادی ویرایش می‌شود · حافظه روشن: برگشتی‌ها و اقلام اضافه‌شده دیده می‌شود (Alt+H)"
                  >
                    <input
                      type="checkbox"
                      checked={memory}
                      onChange={toggleMemory}
                      className="size-3 cursor-pointer accent-primary"
                    />
                    <span
                      className={
                        memory ? "font-semibold text-foreground" : undefined
                      }
                    >
                      نمایش سابقه فاکتور
                    </span>
                  </label>
                )}

                {/* خلاصه سند — سه چیپِ فشرده، در همان ردیفِ آخر کنار توضیح و مبلغ */}
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {adjusting && adjustDraftState ? (
                    <>
                      <div className="shrink-0 rounded border bg-background px-1.5 py-0.5">
                        <span className="block text-[10px] leading-tight text-muted-foreground">
                          ارزش مرجوعی
                        </span>
                        <b className="block text-xs leading-tight tabular-nums text-amber-600 dark:text-amber-400">
                          − {money(adjustDraftState.refundAmount)}
                        </b>
                      </div>
                      <div className="shrink-0 rounded border bg-background px-1.5 py-0.5">
                        <span className="block text-[10px] leading-tight text-muted-foreground">
                          ارزش افزوده
                        </span>
                        <b className="block text-xs leading-tight tabular-nums text-primary">
                          + {money(adjustDraftState.additionsAmount)}
                        </b>
                      </div>
                      <div className="shrink-0 rounded border bg-background px-1.5 py-0.5">
                        <span className="block text-[10px] leading-tight text-muted-foreground">
                          اثر تغییرات
                        </span>
                        <b
                          className={`block text-xs leading-tight tabular-nums ${
                            adjustDraftState.changesAdjust >= 0
                              ? "text-primary"
                              : "text-success"
                          }`}
                        >
                          {adjustDraftState.changesAdjust >= 0 ? "+" : "−"}{" "}
                          {money(Math.abs(adjustDraftState.changesAdjust))}
                        </b>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="shrink-0 rounded border bg-background px-1.5 py-0.5">
                        <span className="block text-[10px] leading-tight text-muted-foreground">
                          جمع اقلام
                        </span>
                        <b className="block text-xs leading-tight tabular-nums text-foreground">
                          {money(grossSubtotal)}
                        </b>
                      </div>
                      <div className="shrink-0 rounded border bg-background px-1.5 py-0.5">
                        <span className="block text-[10px] leading-tight text-muted-foreground">
                          تخفیف ردیف‌ها
                        </span>
                        <b className="block text-xs leading-tight tabular-nums text-success">
                          − {money(linesDiscountTotal)}
                        </b>
                      </div>
                      <div className="w-44 shrink-0 rounded border bg-background px-1.5 py-0.5">
                        <span className="block text-[10px] leading-tight text-muted-foreground">
                          تخفیف فاکتور
                        </span>
                        <DiscountField
                          id="invoice-discount"
                          value={invoiceDiscountInput}
                          base={subtotal}
                          compact
                          onChange={(d) => {
                            invalidateIdem();
                            setInvoiceDiscountInput(d);
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
                {returning && (
                  <>
                    <label className="flex w-40 shrink-0 flex-col gap-1 text-[10px] text-muted-foreground">
                      روش برگشت وجه
                      <select
                        value={refundMethod}
                        onChange={(e) =>
                          setRefundMethod(e.target.value as PaymentMethod)
                        }
                        disabled={returning.isOpenAccount}
                        title="روش برگشت وجه"
                        className="h-7 w-full rounded-md border bg-background px-2 text-xs disabled:opacity-60"
                      >
                        <option value="">انتخاب روش</option>
                        <option value="CASH">نقدی از صندوق</option>
                        <option value="CARD">کارت‌خوان</option>
                        {returning.hasCustomer && (
                          <option value="CREDIT">کسر از حساب</option>
                        )}
                      </select>
                    </label>
                    <label className="flex w-44 shrink-0 flex-col gap-1 text-[10px] text-muted-foreground">
                      دلیل مرجوعی (اختیاری)
                      <Input
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                        maxLength={200}
                        placeholder="مثلاً: خرابی یا عدم تطابق"
                        className="h-7 w-full text-xs"
                      />
                    </label>
                  </>
                )}

                {adjusting && (
                  <label className="flex w-44 shrink-0 flex-col gap-1 text-[10px] text-muted-foreground">
                    دلیل عملیات (اختیاری)
                    <Input
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      maxLength={200}
                      placeholder="مثلاً: مرجوعی به درخواست مشتری"
                      className="h-7 w-full text-xs"
                    />
                  </label>
                )}

                {quoting && (
                  <label className="flex w-40 shrink-0 flex-col gap-1 text-[10px] text-muted-foreground">
                    اعتبار پیش‌فاکتور
                    <select
                      value={quoting.validForMinutes}
                      onChange={(e) =>
                        patchCart({
                          doc: {
                            type: "quote",
                            validForMinutes: Number(e.target.value),
                          },
                        })
                      }
                      title="تا کی این قیمت معتبر است"
                      className="h-7 w-full rounded-md border bg-background px-2 text-xs"
                    >
                      <option value={60}>اعتبار ۱ ساعت</option>
                      <option value={6 * 60}>اعتبار ۶ ساعت</option>
                      <option value={24 * 60}>اعتبار ۲۴ ساعت</option>
                      <option value={3 * 24 * 60}>اعتبار ۳ روز</option>
                      <option value={7 * 24 * 60}>اعتبار ۷ روز</option>
                    </select>
                  </label>
                )}

                <label className="flex w-44 shrink-0 flex-col gap-1 text-[10px] text-muted-foreground">
                  توضیح روی سند
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={300}
                    placeholder="این توضیح روی نسخه چاپی می‌آید"
                    className="h-7 w-full text-xs"
                  />
                </label>

                {zeroPriceCount > 0 && (
                  <span className="pb-1 text-[10px] font-semibold text-warning">
                    {toFa(zeroPriceCount)} ردیف بدون قیمت
                  </span>
                )}
              </div>

              <div className="flex min-w-0 shrink-0 flex-wrap items-end gap-3">
                <div className="text-end">
                  <div className="text-[10px] leading-none text-muted-foreground">
                    {returning
                      ? "بازپرداخت به مشتری"
                      : adjusting
                        ? adjustDraftState?.net === 0
                          ? "اختلاف نهایی"
                          : adjustDraftState && adjustDraftState.net > 0
                            ? "اختلاف نهایی · دریافت"
                            : "اختلاف نهایی · پرداخت"
                        : quoting
                          ? "جمع پیش‌فاکتور"
                          : "مبلغ نهایی"}
                  </div>
                  <div className="text-lg font-bold leading-tight tabular-nums">
                    {money(
                      returning
                        ? returnTotal
                        : adjusting
                          ? (adjustDraftState?.net ?? 0)
                          : total,
                    )}
                    <span className="ms-1 text-[10px] font-normal text-muted-foreground">
                      ریال
                    </span>
                  </div>
                </div>

                {adjusting && customer && adjustHasWork && (
                  <div className="text-[10px] font-semibold leading-4 text-warning">
                    با ثبت:
                    <br />
                    مانده فاکتور {money(dueAfterAdjust)}
                    <br />
                    مانده مشتری {money(balanceAfterAdjust)}
                  </div>
                )}

                <Button
                  className="h-8 shrink-0 gap-1.5 px-4 text-sm font-bold"
                  disabled={commitOff}
                  onClick={() => commitRun?.()}
                >
                  {commitBusy ? "در حال ثبت…" : commitLabel}
                  <Key>F2</Key>
                </Button>
              </div>
            </section>
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
        customerChequeRateMode={
          customerDetail.data?.chequeRateMode ?? undefined
        }
        onConfirm={(payments) => takeSettlement.mutate(payments)}
        onClose={() => {
          setSettle(null);
          focusScan();
        }}
      />

      {/*
        دو حالتی که فرمِ پرداخت جوابشان نیست، و باید صریح گفته شوند نه اینکه
        بی‌صدا رد شوند:
          • مبلغ به نفعِ مشتری شد ⇒ پولی گرفته نمی‌شود؛ در دفترش بستانکار شد.
          • فاکتور مشتری ندارد    ⇒ اصلاً دفتری نیست که پول رویش بنشیند.
      */}
      {settle && (settle.amount < 0 || !settle.customerId) && (
        <div
          className="absolute inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-3
                        border-t border-primary bg-primary/10 px-4 py-3"
        >
          <span className="font-bold">
            اصلاح فاکتور {toFa(settle.invoiceNumber)} —{" "}
            {settle.amount < 0 ? (
              <>
                <span className="text-success">{money(-settle.amount)}</span>{" "}
                ریال به نفع مشتری.
                {settle.customerId
                  ? " در حسابش بستانکار شد."
                  : " روی خودِ فاکتور برگشت خورد — پول را از صندوق به مشتری بدهید."}
              </>
            ) : (
              <>
                <span className="text-warning">{money(settle.amount)}</span>{" "}
                ریال بیشتر شد و روی خودِ فاکتور به‌عنوان دریافت ثبت شد.
              </>
            )}
          </span>
          <Button
            variant="outline"
            className="ms-auto h-10"
            onClick={() => {
              setSettle(null);
              focusScan();
            }}
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
          loadAdjust.mutate({ invoiceId: id, customer: null });
        }}
        onReturn={(id) => {
          setShowInvoices(false);
          loadReturn.mutate({ invoiceId: id, customer: null });
        }}
        onAdjust={(id) => {
          setShowInvoices(false);
          // Ctrl+Enter = ویرایش با حافظه از همان اول.
          loadAdjust.mutate({ invoiceId: id, customer: null, memory: true });
        }}
        onClose={() => {
          setShowInvoices(false);
          focusScan();
        }}
      />

      <OpenQuotations
        open={showQuotes}
        onPick={(id) => void loadQuotation(id)}
        onClose={() => {
          setShowQuotes(false);
          focusScan();
        }}
      />

      <BlankQuotationsPanel
        open={showBlankQuotes}
        onClose={() => {
          setShowBlankQuotes(false);
          focusScan();
        }}
      />

      <ShortcutsHelp
        open={showHelp}
        groups={shortcutGroups}
        onClose={() => {
          setShowHelp(false);
          focusScan();
        }}
      />

      {/* دیالوگ‌ها */}

      {/* تعویض — برگشت از فاکتورهایِ قبلیِ مشتریِ همین تب + فروشِ نو (F10). */}
      {showNetSwap && warehouseId && cart.customer && (
        <NetSwapDialog
          customer={cart.customer}
          warehouseId={warehouseId}
          onClose={() => {
            setShowNetSwap(false);
            focusScan();
          }}
        />
      )}
      <LocationPicker
        open={!!pickerStock}
        productName={pickerStock?.name ?? ""}
        stock={pickerStock?.stock ?? []}
        onPick={(s) => {
          const p = pickerStock?.product;
          setPickerStock(null);
          if (p) addLine(p, s);
        }}
        onClose={() => {
          setPickerStock(null);
          focusScan();
        }}
      />

      <CustomerInvoicesPanel
        open={showCustomer}
        mode={customerPanel ?? "pick"}
        initialCustomer={customer}
        onPickCustomer={(c) => {
          /*
           * اگر پنل از داخلِ «اصلاح نحوهٔ پرداخت» باز شده باشد، مشتری به همان
           * پنل برمی‌گردد و به سبدِ صندوق دست نمی‌خورد — وگرنه فاکتورِ
           * بی‌صاحبی که فقط برای بدهی‌اش مشتری لازم داشت، مشتریِ چیپ هم می‌گرفت.
           */
          const fix = pendingFixPick.current;
          setShowCustomer(false);
          if (fix) {
            pendingFixPick.current = null;
            setFixPayment({ invoiceId: fix.invoiceId, customer: c });
            return;
          }
          setCustomer(c);
          invalidateIdem();
          focusScan();
        }}
        onOpenInvoice={(invoiceId, c) =>
          loadAdjust.mutate({ invoiceId, customer: c })
        }
        onReturnInvoice={(invoiceId, c) =>
          loadReturn.mutate({ invoiceId, customer: c })
        }
        // Shift+Enter روی فاکتور = ویرایش با حافظه از همان اول.
        onAdjustInvoice={(invoiceId, c) =>
          loadAdjust.mutate({ invoiceId, customer: c, memory: true })
        }
        onCopyInvoice={(invoiceId, c) =>
          loadCopy.mutate({ invoiceId, customer: c })
        }
        // P روی فاکتور = اصلاحِ نحوهٔ پرداخت، بدون بارگذاریِ سبدِ ویرایش.
        onFixPayment={(invoiceId, c) => {
          setShowCustomer(false);
          setFixPayment({ invoiceId, customer: c });
        }}
        onClose={() => {
          setCustomerPanel(null);
          focusScan();
        }}
      />

      <PaymentRecomposeDialog
        open={!!fixPayment}
        invoiceId={fixPayment?.invoiceId ?? null}
        customer={fixPayment?.customer ?? null}
        onPickCustomer={() => {
          // پنل مشتریِ صندوق باز می‌شود و انتخاب که شد، همین پنل برمی‌گردد.
          pendingFixPick.current = fixPayment
            ? { invoiceId: fixPayment.invoiceId }
            : null;
          setFixPayment(null);
          setCustomerPanel("pick");
        }}
        onClose={() => {
          setFixPayment(null);
          focusScan();
        }}
        onDone={() => focusScan()}
      />

      <ProductSearch
        open={showSearch}
        initialQuery={searchSeed}
        canManagePrice={canManagePrice}
        onSavePrice={(productId, field, value) =>
          savePrice.mutate({ productId, field, value })
        }
        onPick={addFromLocate}
        onSendToWorker={openWorkerForResult}
        onClose={() => {
          setShowSearch(false);
          setSearchSeed("");
          focusScan();
        }}
      />

      <WorkerPicker
        open={showWorkerPicker}
        itemCount={workerItemCount}
        pending={sendToWorker.isPending}
        onPick={(id, note) => sendToWorker.mutate({ assignedToId: id, note })}
        onClose={() => {
          setShowWorkerPicker(false);
          focusScan();
        }}
      />

      <CheckoutFlow
        open={showCheckout}
        total={total}
        lineCount={lines.length}
        customer={customer}
        pending={submit.isPending}
        onCustomerChange={(c) => {
          setCustomer(c);
          invalidateIdem();
        }}
        onSubmit={(payments) => submit.mutate({ payments })}
        onOpenFullPayment={() => {
          if (blankQuotationId && !customer) {
            toast.info("اول مشتری را انتخاب کنید");
            return;
          }
          setShowCheckout(false);
          setShowPayment(true);
        }}
        onClose={() => {
          setShowCheckout(false);
          focusScan();
        }}
        requireCustomer={!!blankQuotationId}
      />

      <OpenAccounts
        open={showOpenAccounts}
        onClose={() => {
          setShowOpenAccounts(false);
          focusScan();
        }}
        // پرونده‌ی دفتری F3 هم همان قراردادِ پنل مشتری را دارد؛ پنل بسته می‌شود
        // و فاکتور در همان صفحه‌ی فروش باز می‌شود.
        onOpenInvoice={(invoiceId, c) => {
          setShowOpenAccounts(false);
          loadAdjust.mutate({ invoiceId, customer: c });
        }}
        onReturnInvoice={(invoiceId, c) => {
          setShowOpenAccounts(false);
          loadReturn.mutate({ invoiceId, customer: c });
        }}
        onAdjustInvoice={(invoiceId, c) => {
          setShowOpenAccounts(false);
          loadAdjust.mutate({ invoiceId, customer: c, memory: true });
        }}
        onCopyInvoice={(invoiceId, c) => {
          setShowOpenAccounts(false);
          loadCopy.mutate({ invoiceId, customer: c });
        }}
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
              toast.success(
                `فروش به «${account.customerName}» روی حساب باز — جنسها را اسکن کنید`,
              );
            })
            .catch(() => toast.error("بارگذاری مشتری حساب ناموفق بود"));
        }}
      />

      <RecentInvoices
        open={showRecent}
        warehouseId={warehouseId}
        tasksByInvoice={tasksByInvoice}
        onClose={() => {
          setShowRecent(false);
          focusScan();
        }}
      />

      <WorkTasksPanel
        open={showWorkTasks}
        warehouseId={warehouseId}
        onClose={() => {
          setShowWorkTasks(false);
          focusScan();
        }}
      />

      {/* کسری: مشتریِ فعلیِ سبد همراهش می‌رود تا بعداً بشود خبرش کرد. */}
      <ShortageDialog
        open={showShortage}
        onOpenChange={(v) => {
          setShowShortage(v);
          if (!v) focusScan();
        }}
        warehouseId={warehouseId}
        customerId={customer?.id ?? null}
      />

      <ProductFormDialog
        open={showAddProduct}
        onOpenChange={(v) => {
          setShowAddProduct(v);
          if (!v) focusScan();
        }}
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
        onClose={() => {
          setShowPayment(false);
          focusScan();
        }}
      />

      {/*
        پنلِ تسویه‌ی اختلافِ عملیاتِ یکپارچه.

        برای هر اختلافِ غیرصفر — مثبت یا منفی، حتی روی حسابِ باز — باز می‌شود
        تا فروشنده/مدیر خودش روش را انتخاب کند (نقد/کارت/چک/روی حساب). خودِ
        ثبت همان createAdjustِ اتمیک است؛ این پنل فقط تصمیمِ روش را می‌گیرد و
        مبلغش از «اختلاف نهایی» می‌آید — دستِ فروشنده نیست.
      */}
      <AdjustSettlementDialog
        open={!!adjustSettle}
        direction={adjustSettle?.direction ?? "COLLECT"}
        amount={adjustSettle?.amount ?? 0}
        beforeTotal={adjustSettle?.beforeTotal ?? 0}
        afterTotal={adjustSettle?.afterTotal ?? 0}
        paidAmount={adjustSettle?.paidAmount ?? 0}
        preferCredit={adjustSettle?.preferCredit ?? false}
        hasCustomer={!!customer}
        pending={saveAdjust.isPending}
        onConfirm={(method, cheque, editedAmount) => {
          const d = adjustSettle;
          if (!d) return;
          /*
           * اختلافِ ویرایش‌شده → تعدیلِ دستی.
           * علامتِ newNet از جهت می‌آید؛ manualAdjustment همان فاصله‌اش با
           * اختلافِ محاسبه‌شده است. صفرِ ویرایش‌شده یعنی تسویه‌ای ثبت نشود و
           * کلِ اختلاف با تعدیلِ دستی در اصلاحیه بنشیند.
           */
          const final = Math.max(0, editedAmount ?? d.amount);
          const newNet = d.direction === "COLLECT" ? final : -final;
          const manual = newNet - d.computedNet;
          if (newNet === 0) {
            saveAdjust.mutate({ manualAdjustment: manual });
            return;
          }
          saveAdjust.mutate({
            manualAdjustment: manual !== 0 ? manual : undefined,
            settlement: {
              method,
              amount: final,
              ...(cheque ? { cheque } : {}),
            },
          });
        }}
        onClose={() => {
          setAdjustSettle(null);
          focusScan();
        }}
      />

      <SaleReceiptDialog
        invoice={receipt}
        onClose={() => {
          setReceipt(null);
          focusScan();
        }}
      />

      <TodayPurchasesDialog
        open={showTodayPurchases}
        customer={customer}
        onClose={() => {
          setShowTodayPurchases(false);
          focusScan();
        }}
      />
    </div>
  );
}
