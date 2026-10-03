"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { toFa } from "@/lib/format";

import { uuid } from "@/lib/uuid";
import type { Customer } from "@/lib/types";

import type { PosLine } from "../_components/line-items";
import { NO_DISCOUNT, type DiscountInput as DiscountValue } from "./discount";
import { loadSavedCarts, saveCarts } from "./carts-persist";

/**
 * یک فاکتورِ در جریان.
 *
 * پیشخوان واقعی صف دارد: مشتری وسط کار می‌گوید «یادم رفت، بروم بیاورم» و
 * نفر بعدی همان‌جا منتظر است. تا حالا فروشنده باید یا سبد را می‌سوزاند یا
 * مشتری دوم را نگه می‌داشت. هر تب یک فاکتورِ کاملاً مستقل است.
 */
/**
 * این تب دارد چه سندی می‌سازد.
 *
 * یک اتحادیه‌ی تفکیک‌شده، نه چند پرچمِ کنار هم: «در حال ویرایش» و «در حال
 * مرجوعی» هرگز نمی‌توانند هم‌زمان درست باشند، و تایپ باید همین را بگوید —
 * وگرنه دیر یا زود جایی هر دو ست می‌شوند و هیچ‌کس نمی‌فهمد کدام برنده است.
 *
 * سبد در هر چهار حالت همان سبد است؛ فقط معنیِ «ثبت» عوض می‌شود.
 */
export type CartDoc =
  /** فروشِ تازه — حالتِ پیش‌فرض. */
  | { type: "sale" }
  /**
   * همان سبد، ولی موجودی دست نمی‌خورد و فقط قیمت نگه داشته می‌شود.
   *
   * مدتِ اعتبار روی خودِ سند می‌نشیند نه روی صفحه، چون دو تبِ باز می‌توانند
   * دو پیش‌فاکتور با اعتبارِ متفاوت باشند.
   */
  | { type: "quote"; validForMinutes: number }
  /**
   * برگشت از فروشِ یک فاکتور.
   *
   * قفل به فاکتور است: کالا و قیمت از سرور می‌آیند و فروشنده فقط تعداد و
   * سالم/معیوب را می‌گوید. سقفِ هر ردیف «قابل‌برگشت» است (فروخته − مرجوعیِ
   * قبلی)، پس دو بار برگرداندنِ یک قلم ممکن نیست.
   */
  | {
      type: "return";
      invoiceId: string;
      invoiceNumber: number;
      lines: Record<
        string,
        { saleLogId: string; returnable: number; effectiveUnitPrice: number }
      >;
      /** روی حساب باز پولی پرداخت نشده — برگشت فقط «کسر از حساب». */
      isOpenAccount: boolean;
      hasCustomer: boolean;
    }
  /**
   * عملیاتِ یکپارچه روی یک فاکتورِ ثبت‌شده.
   *
   * مرجوعی + قلمِ تازه + تصحیح قیمت، همه در یک سبد و یک ثبتِ اتمیک. هر ردیفِ
   * موجودِ فاکتور دو چیز از سرور دارد: سقفِ برگشتش (با قیمتِ مؤثر) و تعداد/
   * قیمتِ فعلی‌اش برای تصحیح. قلمِ تازه با اسکن اضافه می‌شود و برچسب
   * «اضافه‌شده» می‌گیرد. روی حساب باز هم مثل بقیه، اختلافِ غیرصفر در پنلِ
   * تسویه تصمیم گرفته می‌شود (نقد/کارت/چک/روی حساب).
   */
  | {
      type: "adjust";
      invoiceId: string;
      invoiceNumber: number;
      /** مبلغِ کلِ فاکتور پیش از این عملیات — پایه‌ی نمایشِ «فاکتور از/به». */
      invoiceTotal: number;
      /** آنچه مشتری تاکنون بابت همین فاکتور پرداخت کرده — برای دیدنِ پرداختِ اضافه. */
      paidAmount: number;
      /** وضعیتِ همان لحظه‌ی سرور برای هر ردیفِ موجود — کلید همان saleLogId است. */
      originals: Record<
        string,
        {
          saleLogId: string;
          sold: number;
          alreadyReturned: number;
          /** مانده‌ی قابل‌برگشت = سقفِ «تعداد برگشتی» و «تعداد فعلی» برای تصحیح. */
          outstanding: number;
          oldUnitPrice: number;
          effectiveUnitPrice: number;
          returnable: number;
          /** توضیحِ فعلیِ ردیف — عوض‌کردنش سندِ مالی نمی‌سازد. */
          note?: string;
        }
      >;
      isOpenAccount: boolean;
      hasCustomer: boolean;
      /** مانده‌ی واقعیِ کلِ مشتری در لحظه‌ی بازکردن — پایه‌ی نوارِ پایین. */
      customerBalance: number;
      /** ماندهٔ دفتریِ همین فاکتور — با مرجوعی/اصلاحیه تازه شده، برخلاف فیلدِ total. */
      invoiceDue: number;
    };

export const SALE_DOC: CartDoc = { type: "sale" };

/** اعتبارِ پیش‌فرضِ پیش‌فاکتور: یک شبانه‌روز. */
export const QUOTE_DOC: CartDoc = { type: "quote", validForMinutes: 24 * 60 };

export interface Cart {
  id: string;
  /** شماره‌ی نمایشیِ تب — شمارنده‌ی ساده، ربطی به شماره‌ی فاکتور ندارد. */
  label: number;
  lines: PosLine[];
  customer: Customer | null;
  /**
   * قفلِ مشتری روی این تب. قفل = بعد از ثبتِ فاکتور، مشتری روی تب می‌ماند تا
   * خریدِ بعدی‌اش بدون انتخابِ دوباره ثبت شود (مشتریِ حساب‌بازی که پشت‌سرهم
   * می‌خرد). قفل نباشد = بعد از ثبت، تب به «نقدیِ گذری» برمی‌گردد. کنترلش صریح
   * است (دکمه‌ی قفل روی چیپِ مشتری)، نه وابسته به نوعِ پرداخت.
   */
  customerLocked: boolean;
  /**
   * حساب بازِ در جریانِ این تب. وقتی پر است، فاکتورِ این تب OPEN (جاری) ثبت
   * می‌شود و به همان حساب وصل می‌شود — ادامه‌ی همان «فاکتور کلیِ» مشتری.
   * بعد از ثبت، تب روی همان حساب می‌ماند تا نوبتِ بعدی هم به همان حساب برود.
   */
  openAccountId: string | null;
  discount: DiscountValue;
  note: string;
  activeRow: number;
  errorLine: number | null;
  /**
   * تیکِ «دیدن حافظه این فاکتور» — فقط در ویرایشِ فاکتور معنا دارد.
   *
   * خاموش (پیش‌فرض هر بارِ بازکردن): جدول مثل فاکتورِ عادی است — تعدادِ خالص
   * هر قلم، ردیفِ کاملاً برگشتی از دید بیرون می‌ماند، هیچ ردِ گذشته‌ای دیده
   * نمی‌شود. روشن: سابقه با برچسب و کم‌رنگی دیده می‌شود (مرجوعی/اضافه‌شده).
   * روی خودِ تب می‌نشیند چون دو تبِ ویرایش می‌توانند دو انتخاب داشته باشند.
   */
  memory: boolean;
  doc: CartDoc;
  /**
   * تبِ خودکار — تبی که خودِ سیستم برای بازکردن یک فاکتورِ ثبت‌شده (ویرایش
   * یا مرجوعی) ساخته، نه فروشنده.
   *
   * چرا لازم است: پایانِ آن سند یعنی آن تب دیگر کاربردی ندارد. تبِ دستی
   * («فاکتور جدید») بعد از پایانِ کار فقط تمیز می‌شود تا فروشنده همان‌جا
   * بماند؛ ولی تبِ خودکار باید **کامل بسته شود** وگرنه یک تبِ خالیِ بی‌صاحب
   * روی نوار می‌ماند.
   */
  ephemeral: boolean;
  /**
   * آخرین افزودنِ این تب — خوراکِ Ctrl+Z.
   *
   * پرتکرارترین خطای پیشخوان، اسکنِ اشتباه است. برای برگرداندنش باید بدانیم
   * آخرین کار «ردیفِ نو» بود (حذفش کن) یا «افزودن به ردیفِ موجود» (تعداد را
   * به مقدارِ قبلی برگردان). `prevQuantity = 0` یعنی ردیفِ نو.
   * روی خودِ تب می‌نشیند چون هر تبِ هم‌زمان undo مستقل خودش را دارد.
   */
  lastAdd: { lineKey: string; prevQuantity: number } | null;
}

function emptyCart(label: number, ephemeral = false): Cart {
  return {
    id: uuid(),
    label,
    lines: [],
    customer: null,
    customerLocked: false,
    openAccountId: null,
    discount: NO_DISCOUNT,
    note: "",
    activeRow: 0,
    errorLine: null,
    memory: false,
    doc: SALE_DOC,
    lastAdd: null,
    ephemeral,
  };
}

/**
 * همان چیزی که «پایانِ عملیاتِ یک فاکتور» روی تبِ دستی باقی می‌گذارد.
 *
 * تفاوتش با `resetCurrent` فقط در مشتری است: آنجا مشتریِ **قفل‌شده** عمداً
 * می‌ماند (خریدِ بعدیِ همان مشتری)، ولی اینجا سند به یک فاکتورِ مشخص قفل
 * بوده و تمام‌شدنش یعنی آن مشتری هم تمام شده — روی تب نمی‌ماند.
 */
const EMPTY_CART_PATCH: Partial<Cart> = {
  lines: [],
  customer: null,
  customerLocked: false,
  openAccountId: null,
  discount: NO_DISCOUNT,
  note: "",
  activeRow: 0,
  errorLine: null,
  memory: false,
  doc: SALE_DOC,
  lastAdd: null,
};

/** حداکثر تب — با نامِ کوتاه‌شده‌ی مشتری، تا ۱۰ فاکتورِ هم‌زمان روی نوار جا می‌شود. */
const MAX_CARTS = 10;

export function useCarts() {
  const [carts, setCarts] = useState<Cart[]>(() => [emptyCart(1)]);
  const [activeId, setActiveId] = useState<string>("");
  const nextLabel = useRef(2);

  /*
   * برگرداندنِ سبدِ جلسه‌ی قبل.
   *
   * عمداً در effect است نه initializer: خواندنِ localStorage داخل initializer
   * اولین رندرِ سرور و کلاینت را ناهمخوان می‌کند (هیدریشن می‌شکند). بعد از
   * mount خوانده می‌شود؛ یک رندرِ اضافه بهای ناچیزی برای سبدی است که با قطعِ
   * برق نمی‌سوزد.
   */
  const restoredRef = useRef(false);

  useEffect(() => {
    const saved = loadSavedCarts();
    if (saved) {
      /*
       * برگرداندنِ وضعیتِ ذخیره‌شده فقط بعد از mount ممکن است: داخلِ
       * initializer، رندرِ سرور و کلاینت ناهمخوان می‌شد (هیدریشن می‌شکست).
       * setState داخلِ effect اینجا عمدی است — sync با یک سیستمِ بیرونی
       * (localStorage)، همان کاری که effect برایش ساخته شده.
       */
      // eslint-disable-next-line react-hooks/set-state-in-effect -- بازگرداندنِ ذخیره‌ی بیرونی فقط بعد از mount ممکن است
      setCarts(saved.carts);
      if (saved.activeId) setActiveId(saved.activeId);
      toast.info(
        `${toFa(saved.carts.length)} تب از آخرین جلسه برگردانده شد — هر سبد را خودتان ببندید یا ثبت کنید`,
      );
      // شماره‌ی تبِ بعدی از بالاترین شماره‌ی بازگردانده ادامه یابد — وگرنه دو
      // تب با یک شماره روی نوار می‌نشینند.
      nextLabel.current = Math.max(1, ...saved.carts.map((c) => c.label)) + 1;
    }
    restoredRef.current = true;
  }, []);

  /*
   * کلید یکتای ثبت، به‌ازای هر تب.
   *
   * ref است نه state: مقدارش باید همان لحظه‌ی داخلِ mutationFn خوانده و نوشته
   * شود. اگر state بود، بستارِ کهنه کلید قبلی را می‌دید و تلاش دوباره یک
   * فاکتور تکراری می‌ساخت — دقیقاً همان چیزی که این کلید جلویش را می‌گیرد.
   */
  const idem = useRef<Record<string, string | null>>({});

  // اولین رندر: هنوز id نداریم چون در initializer ساخته شده.
  const current = carts.find((c) => c.id === activeId) ?? carts[0];

  /*
   * ذخیره‌ی هر تغییر — ولی فقط بعد از اولین برگرداندن. بدون این نگهبان، اولین
   * رندرِ خالی همان لحظه داده‌ی جلسه‌ی قبل را پاک می‌کرد.
   *
   * تبِ فعال از state خوانده می‌شود نه از activeRef: خواندنِ ref داخلِ effect
   * نوشتنِ آن در رندر را برای کامپایلرِ React «تغییرِ مقدارِ مصرف‌شده در
   * effect» می‌کند — همان که قبلاً بی‌صدا بود. `current.id` همان مقدار است،
   * از منبعِ درست. اینجا بعد از تعریفِ `current` است، نه قبلش — آرایه‌ی
   * وابستگی موقعِ ساختنِ effect ارزیابی می‌شود.
   */
  useEffect(() => {
    if (!restoredRef.current) return;
    saveCarts(carts, current.id);
  }, [carts, current.id]);

  /*
   * تبِ فعال در یک ref هم نگه داشته می‌شود تا همه‌ی توابع زیر **هویت ثابت**
   * داشته باشند.
   *
   * چرا این‌قدر مهم است: صفحه‌ی صندوق پر از useCallback و mutation است که این
   * توابع را در بستار خودشان می‌گیرند. اگر `patch` با هر بار عوض‌شدنِ تب
   * بازساخته شود، هر کسی که آن را در آرایه‌ی وابستگی‌اش ننوشته، تا ابد به
   * نسخه‌ی قدیمی — یعنی به **تب اول** — وصل می‌ماند. دقیقاً همان باگی که
   * افزودن کالا در تب دوم را بی‌اثر می‌کرد: جنس به سبد تب یک می‌رفت.
   */
  const activeRef = useRef(current.id);
  /*
   * آینهٔ سبدها برای تصمیم‌های بدون بستارِ کهنه — طولِ سبد در runInNewTab و
   * «خودکار است یا دستی» در پایانِ عملیات.
   */
  const cartsRef = useRef(carts);
  // eslint-disable-next-line react-hooks/refs -- آینهٔ عمدیِ state در رندر؛ مثل activeRef
  cartsRef.current = carts;
  /*
   * نوشتنِ عمدیِ همین‌جا (در رندر): `patch` و هم‌سایگان با بستارِ خالی ساخته
   * می‌شوند و idِ تازه باید در همان رندرِ تغییرِ تب در دسترس‌شان باشد — با
   * useEffect یک گام دیر می‌رسید و همان باگِ «افزودن به تبِ قبلی» برمی‌گشت.
   * این فقط «آینه‌ی state» است و برای رندر استفاده نمی‌شود.
   */
  // eslint-disable-next-line react-hooks/refs -- آینه‌ی عمدیِ state در رندر؛ توضیح بالا
  activeRef.current = current.id;

  const patch = useCallback(
    (p: Partial<Cart> | ((c: Cart) => Partial<Cart>)) => {
      setCarts((prev) =>
        prev.map((c) =>
          c.id === activeRef.current
            ? { ...c, ...(typeof p === "function" ? p(c) : p) }
            : c,
        ),
      );
    },
    [],
  );

  const ensureIdem = useCallback(() => {
    const id = activeRef.current;
    if (!idem.current[id]) idem.current[id] = uuid();
    return idem.current[id]!;
  }, []);

  /** سبد عوض شد ⇒ این دیگر همان فاکتور نیست ⇒ کلید باطل. */
  const invalidateIdem = useCallback(() => {
    idem.current[activeRef.current] = null;
  }, []);

  const addCart = useCallback((opts?: { ephemeral?: boolean }) => {
    const c = emptyCart(nextLabel.current++, opts?.ephemeral ?? false);
    setCarts((prev) => {
      if (prev.length >= MAX_CARTS) return prev;
      // فقط وقتی واقعاً اضافه شد، تبِ فعال عوض شود.
      setActiveId(c.id);
      return [...prev, c];
    });
  }, []);

  const closeCart = useCallback((id: string) => {
    setCarts((prev) => {
      // آخرین تب بسته نمی‌شود، خالی می‌شود — صندوق هیچ‌وقت بی‌سبد نمی‌ماند.
      if (prev.length === 1) {
        const fresh = emptyCart(prev[0].label);
        delete idem.current[prev[0].id];
        setActiveId(fresh.id);
        return [fresh];
      }

      const i = prev.findIndex((c) => c.id === id);
      if (i < 0) return prev;

      const next = prev.filter((c) => c.id !== id);
      delete idem.current[id];
      // بستنِ تبِ فعال ⇒ برو روی همسایه. بستنِ تبِ دیگر ⇒ فعال دست نخورد.
      if (id === activeRef.current) {
        setActiveId(next[Math.min(i, next.length - 1)].id);
      }
      return next;
    });
  }, []);

  /*
   * اجرای یک کار روی «تبِ تازه» — بازکردن فاکتورِ مشتریِ دیگر بدون ریختن روی
   * سبدِ فعلی.
   *
   * چرا با effect و نه مستقیم: `patch` و دوستانش به `activeRef` متصل‌اند که در
   * رندرِ بعد از تغییرِ تب تازه می‌شود. اگر `fn` را همان لحظه صدا بزنیم، باز
   * به تبِ قبلی می‌نویسد — همان باگِ کهنه‌ی «افزودن به تبِ اول». پس کار در
   * `pendingRun` می‌نشیند و بعد از commitِ تبِ نو اجرا می‌شود.
   */
  const pendingRun = useRef<(() => void) | null>(null);

  useEffect(() => {
    const f = pendingRun.current;
    if (f) {
      pendingRun.current = null;
      f();
    }
  }, [activeId]);

  const runInNewTab = useCallback(
    (fn: () => void) => {
      if (cartsRef.current.length >= MAX_CARTS) {
        // جای تبِ نو نیست — کار روی همین تب اجرا می‌شود تا هیچ کاری گم نشود.
        toast.error(`حداکثر ${MAX_CARTS} تب باز است — یکی را ببندید`);
        fn();
        return;
      }
      pendingRun.current = fn;
      addCart();
    },
    [addCart],
  );

  /**
   * بعد از ثبت موفق: سبد خالی می‌شود. مشتری فقط وقتی روی تب می‌ماند که **قفل**
   * باشد (`customerLocked`) — کنترلش صریح و دستِ فروشنده است، نه وابسته به نوعِ
   * پرداخت. قفل نباشد، تب به «نقدیِ گذری» برمی‌گردد تا فاکتورِ مشتریِ بعدی به
   * اشتباه به پای مشتریِ قبلی نوشته نشود. مقدارِ قفل از خودِ سبد خوانده می‌شود
   * (نه بستارِ کهنه) تا همیشه وضعِ همان لحظه‌ی تبِ فعال باشد.
   */
  const resetCurrent = useCallback(() => {
    idem.current[activeRef.current] = null;
    patch((c) => ({
      lines: [],
      customer: c.customerLocked ? c.customer : null,
      customerLocked: c.customerLocked,
      // حساب بازِ ادامه‌دار بعد از هر ثبت روی تب می‌ماند تا نوبتِ بعدی هم
      // به همان حساب برود؛ فقط با «جدا کردن مشتری» جدا می‌شود.
      openAccountId: c.openAccountId,
      discount: NO_DISCOUNT,
      note: "",
      activeRow: 0,
      errorLine: null,
      memory: false,
      // هر سندی با ثبت تمام می‌شود؛ تب به فروشِ عادی برمی‌گردد.
      doc: SALE_DOC,
      lastAdd: null,
    }));
  }, [patch]);

  /**
   * پایانِ سندِ قفل‌شده به فاکتور (ویرایش یا مرجوعی).
   *
   * دو رفتار، بسته به اینکه تب خودکار بوده یا دستی:
   *   • تبِ خودکار ⇒ کامل بسته می‌شود — مثل ضربدرِ روی خود تب.
   *   • تبِ دستی ⇒ تمیز می‌شود و **مشتری هم می‌رود**؛ چون آن تب برای سندِ همین
   *     فاکتور مشغول بوده، نه برای خریدِ بعدیِ آن مشتری. (خلافِ `resetCurrent`
   *     که مشتریِ قفل‌شده را برای فروشِ بعدی نگه می‌دارد.)
   */
  const endLockedDoc = useCallback(() => {
    const id = activeRef.current;
    const closed = cartsRef.current.find((c) => c.id === id);
    if (!closed) return;

    if (closed.ephemeral) {
      closeCart(id);
      return;
    }

    idem.current[id] = null;
    patch(EMPTY_CART_PATCH);
  }, [closeCart, patch]);

  return {
    carts,
    cart: current,
    activeId: current.id,
    setActiveId,
    addCart,
    closeCart,
    endLockedDoc,
    runInNewTab,
    patch,
    resetCurrent,
    ensureIdem,
    invalidateIdem,
    canAdd: carts.length < MAX_CARTS,
  };
}
