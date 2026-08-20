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
