"use client";

import { useCallback, useRef, useState } from "react";

import { uuid } from "@/lib/uuid";
import type { Customer } from "@/lib/types";

import type { PosLine } from "../_components/line-items";
import { NO_DISCOUNT, type DiscountInput as DiscountValue } from "./discount";

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
   * ویرایشِ یک فاکتورِ ثبت‌شده.
   *
   * `originals` وضعیتِ همان لحظه‌ی سرور است (تعداد و قیمتِ فعلیِ هر ردیف، یعنی
   * فروشِ اصلی + اصلاحیه‌های قبلی). موقعِ ثبت، سبد با همین مقایسه می‌شود و فقط
   * تفاوت‌ها به‌صورت اصلاحیه می‌روند — سبد خودش «حقیقت» نیست، تفاوت است.
   */
  | {
      type: "correction";
      invoiceId: string;
      invoiceNumber: number;
      /** به کلیدِ ردیفِ سبد (که همان saleLogId است برای ردیف‌های موجود). */
      originals: Record<
        string,
        { saleLogId: string; quantity: number; unitPrice: number; note?: string }
      >;
    }
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
   * نوعِ سندِ این تب.
   *
   * روی خودِ تب می‌نشیند نه روی صفحه، چون فروشنده باید بتواند وسطِ ویرایشِ
   * فاکتورِ دیروزِ آقای الف، تب دو را باز کند و به مشتریِ سرِ پیشخوان برسد.
   */
  doc: CartDoc;
}

function emptyCart(label: number): Cart {
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
    doc: SALE_DOC,
  };
}

/** حداکثر تب — با نامِ کوتاه‌شده‌ی مشتری، تا ۱۰ فاکتورِ هم‌زمان روی نوار جا می‌شود. */
const MAX_CARTS = 10;

export function useCarts() {
  const [carts, setCarts] = useState<Cart[]>(() => [emptyCart(1)]);
  const [activeId, setActiveId] = useState<string>(() => "");
  const nextLabel = useRef(2);

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
  activeRef.current = current.id;

  const patch = useCallback(
    (p: Partial<Cart> | ((c: Cart) => Partial<Cart>)) => {
      setCarts((prev) =>
        prev.map((c) =>
          c.id === activeRef.current
            ? { ...c, ...(typeof p === "function" ? p(c) : p) }
            : c
        )
      );
    },
    []
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

  const addCart = useCallback(() => {
    const c = emptyCart(nextLabel.current++);
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
      // هر سندی با ثبت تمام می‌شود؛ تب به فروشِ عادی برمی‌گردد.
      doc: SALE_DOC,
    }));
  }, [patch]);

  return {
    carts,
    cart: current,
    activeId: current.id,
    setActiveId,
    addCart,
    closeCart,
    patch,
    resetCurrent,
    ensureIdem,
    invalidateIdem,
    canAdd: carts.length < MAX_CARTS,
  };
}
