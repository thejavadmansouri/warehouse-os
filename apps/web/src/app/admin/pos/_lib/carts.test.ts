import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useCarts } from "./carts";
import type { PosLine } from "../_components/line-items";
import type { Customer } from "@/lib/types";

const STORAGE_KEY = "warehouse-os.pos-carts";

function cus(name: string): Customer {
  return { id: name, firstName: name, lastName: null, fullName: name, phones: [] };
}

function line(name: string): PosLine {
  return {
    key: name,
    productId: name,
    productName: name,
    unit: "عدد",
    locationId: "",
    locationPath: "",
    available: 0,
    quantity: 1,
    unitPrice: 1000,
    discount: { mode: "amount", value: 0 },
    included: true,
  };
}

describe("useCarts", () => {
  // سبد بین تست‌ها در localStorage می‌ماند — هر تست با ذخیره‌ی خالی شروع شود.
  beforeEach(() => {
    window.localStorage.clear();
  });

  /*
   * این تست به‌خاطر یک باگ واقعی نوشته شد: `patch` به شناسه‌ی تبِ فعال وابسته
   * بود، پس با عوض‌شدن تب هویتش عوض می‌شد. هر تابعی که آن را در بستار خودش
   * گرفته بود به تب اول قفل می‌ماند و افزودن کالا در تب دوم بی‌اثر بود —
   * جنس به سبد تب یک می‌رفت.
   */
  it("نسخه‌ی قدیمیِ patch هم روی تبِ فعال کار می‌کند", () => {
    const { result } = renderHook(() => useCarts());

    // همان کاری که یک useCallbackِ بدون وابستگیِ درست می‌کند.
    const stalePatch = result.current.patch;

    act(() => result.current.addCart());
    const secondCartId = result.current.activeId;

    act(() => stalePatch({ lines: [line("لنت")] }));

    expect(result.current.cart.id).toBe(secondCartId);
    expect(result.current.cart.lines).toHaveLength(1);
    expect(result.current.carts[0].lines).toHaveLength(0);
  });

  it("هر تب سبد مستقل خودش را دارد", () => {
    const { result } = renderHook(() => useCarts());

    act(() => result.current.patch({ lines: [line("الف")] }));
    act(() => result.current.addCart());
    act(() => result.current.patch({ lines: [line("ب"), line("پ")] }));

    expect(result.current.carts[0].lines).toHaveLength(1);
    expect(result.current.carts[1].lines).toHaveLength(2);
  });

  it("بستنِ آخرین تب آن را خالی می‌کند، نه حذف", () => {
    const { result } = renderHook(() => useCarts());

    act(() => result.current.patch({ lines: [line("الف")] }));
    act(() => result.current.closeCart(result.current.activeId));

    expect(result.current.carts).toHaveLength(1);
    expect(result.current.cart.lines).toHaveLength(0);
  });

  it("کلید یکتا برای هر تب جداست", () => {
    const { result } = renderHook(() => useCarts());

    let first = "";
    act(() => { first = result.current.ensureIdem(); });
    act(() => result.current.addCart());

    let second = "";
    act(() => { second = result.current.ensureIdem(); });

    expect(second).not.toBe(first);
  });

  /*
   * قفلِ مشتری صریح است: قفل باشد، مشتری بعد از ثبت روی تب می‌ماند (مشتریِ
   * حساب‌بازی که پشت‌سرهم می‌خرد)؛ قفل نباشد، تب به «نقدیِ گذری» برمی‌گردد تا
   * فاکتورِ مشتریِ بعدی به پای قبلی نوشته نشود.
   */
  it("resetCurrent با قفل مشتری را نگه می‌دارد و بدون قفل پاک می‌کند", () => {
    const { result } = renderHook(() => useCarts());

    // مشتریِ قفل‌شده → بعد از ثبت می‌ماند.
    act(() => result.current.patch({ customer: cus("علی"), customerLocked: true }));
    act(() => result.current.patch({ lines: [line("لنت")] }));
    act(() => result.current.resetCurrent());
    expect(result.current.cart.lines).toHaveLength(0);
    expect(result.current.cart.customer?.fullName).toBe("علی");
    expect(result.current.cart.customerLocked).toBe(true);

    // مشتریِ بدونِ قفل (پیش‌فرض) → بعد از ثبت جدا می‌شود.
    act(() => result.current.patch({ customer: cus("رضا"), customerLocked: false }));
    act(() => result.current.patch({ lines: [line("لنت")] }));
    act(() => result.current.resetCurrent());
    expect(result.current.cart.lines).toHaveLength(0);
    expect(result.current.cart.customer).toBeNull();
  });

  /*
   * فروشِ نوبت‌به‌نوبت روی حساب باز: بعد از ثبتِ هر فاکتورِ جاری، تب روی همان
   * حساب می‌ماند تا نوبتِ بعدی هم به همان حساب برود. فقط با «جدا کردن مشتری»
   * از حساب جدا می‌شود.
   */
  it("resetCurrent حساب باز را نگه می‌دارد و جداکردن مشتری آن را پاک می‌کند", () => {
    const { result } = renderHook(() => useCarts());

    act(() =>
      result.current.patch({
        customer: cus("علی"),
        customerLocked: true,
        openAccountId: "acc-1",
      })
    );
    act(() => result.current.patch({ lines: [line("لنت")] }));
    act(() => result.current.resetCurrent());
    expect(result.current.cart.lines).toHaveLength(0);
    expect(result.current.cart.openAccountId).toBe("acc-1");
    expect(result.current.cart.customerLocked).toBe(true);

    // جدا کردنِ مشتری → حساب هم جدا می‌شود.
    act(() => result.current.patch({ customer: null, customerLocked: false, openAccountId: null }));
    expect(result.current.cart.openAccountId).toBeNull();
  });

  /*
   * سبدی که با رفرش نمی‌سوزد: هر تغییر در localStorage نوشته می‌شود و یک
   * mount تازه همان سبدها را برمی‌گرداند — سناریوی قطعِ برق وسطِ نیم‌فاکتور.
   */
  it("سبدها ذخیره و بعد از mount تازه برگردانده می‌شوند", () => {
    const first = renderHook(() => useCarts());
    act(() => first.result.current.patch({ lines: [line("لنت")] }));
    act(() => first.result.current.addCart());
    act(() => first.result.current.patch({ lines: [line("روغن"), line("چراغ")] }));
    const savedActive = first.result.current.activeId;
    first.unmount();

    // ذخیره واقعاً نوشته شده.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeTruthy();

    const second = renderHook(() => useCarts());
    expect(second.result.current.carts).toHaveLength(2);
    expect(second.result.current.activeId).toBe(savedActive);
    const names = second.result.current.carts.flatMap((c) =>
      c.lines.map((l) => l.productName)
    );
    expect(names).toContain("لنت");
    expect(names).toContain("روغن");
  });

  it("داده‌ی خراب نادیده گرفته می‌شود — صندوق با سبدِ نو بالا می‌آید", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");

    const { result } = renderHook(() => useCarts());
    expect(result.current.carts).toHaveLength(1);
    expect(result.current.cart.lines).toHaveLength(0);
  });

  it("نسخه‌ی ناشناسِ ذخیره برگردانده نمی‌شود", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 999, activeId: null, carts: [line("کهنه")] }),
    );

    const { result } = renderHook(() => useCarts());
    expect(result.current.carts).toHaveLength(1);
    expect(result.current.cart.lines).toHaveLength(0);
  });

  it("شماره‌ی تبِ تازه بعد از برگرداندن ادامه‌ی بالاترین شماره است — تکراری نمی‌شود", () => {
    const first = renderHook(() => useCarts());
    // سه تب بساز: برچسب‌ها ۱، ۲، ۳ می‌شوند.
    act(() => first.result.current.addCart());
    act(() => first.result.current.addCart());
    first.unmount();

    const second = renderHook(() => useCarts());
    act(() => second.result.current.addCart());

    const labels = second.result.current.carts.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  /*
   * باگِ واقعی: بعد از پایانِ ویرایشِ فاکتور، مشتریِ قفل‌شده روی تب می‌ماند
   * («فاکتور رفت، مشتری ماند») و فاکتورِ مشتریِ بعدی به پای او نوشته می‌شد.
   * سندِ قفل‌شده با تمام‌شدن، مشتری را هم با خودش می‌برد.
   */
  it("پایانِ سندِ قفل‌شده روی تبِ دستی، مشتری را هم پاک می‌کند", () => {
    const { result } = renderHook(() => useCarts());

    act(() =>
      result.current.patch({
        customer: cus("علی"),
        customerLocked: true,
        openAccountId: "acc-1",
        lines: [line("لنت")],
        memory: true,
      })
    );
    act(() => result.current.endLockedDoc());

    expect(result.current.carts).toHaveLength(1);
    expect(result.current.cart.lines).toHaveLength(0);
    expect(result.current.cart.customer).toBeNull();
    expect(result.current.cart.customerLocked).toBe(false);
    expect(result.current.cart.openAccountId).toBeNull();
    expect(result.current.cart.memory).toBe(false);
    expect(result.current.cart.doc.type).toBe("sale");
  });

  /*
   * تبِ خودکاری که سیستم برای بازکردن فاکتورِ ثبت‌شده ساخته، بعد از پایانِ
   * سند کاملاً بسته می‌شود — نه اینکه به یک تبِ خالیِ بی‌صاحب تبدیل شود.
   * تبِ فروشِ دستیِ کنارش باید دست‌نخورده بماند.
   */
  it("پایانِ تبِ خودکارِ ویرایش، آن تب را کامل می‌بندد", () => {
    const { result } = renderHook(() => useCarts());

    act(() => result.current.patch({ lines: [line("لنت")] }));
    const saleTabId = result.current.activeId;

    act(() => result.current.addCart({ ephemeral: true }));
    act(() =>
      result.current.patch({
        customer: cus("رضا"),
        customerLocked: true,
        lines: [line("چراغ")],
      })
    );
    act(() => result.current.endLockedDoc());

    expect(result.current.carts).toHaveLength(1);
    expect(result.current.cart.id).toBe(saleTabId);
    expect(result.current.cart.lines.map((l) => l.productName)).toEqual(["لنت"]);
  });

  it("تبِ خودکار در ذخیره‌ی سبد هم می‌ماند (رفرش آن را به تبِ دستی تبدیل نمی‌کند)", () => {
    const first = renderHook(() => useCarts());
    act(() => first.result.current.addCart({ ephemeral: true }));
    first.unmount();

    const second = renderHook(() => useCarts());
    expect(second.result.current.carts.map((c) => c.ephemeral)).toEqual([false, true]);
  });

  /*
   * سبدی که در حافظه‌ی مرورگر از نسخه‌ی قبلیِ برنامه مانده تیکِ «تبِ خودکار»
   * را ندارد؛ باید خوانده شود (وسطِ فروش نمی‌شود سبد را دور ریخت) و آن فیلد
   * با مقدارِ امنِ «تبِ دستی» پر شود.
   */
  it("ذخیره‌ی نسخه‌ی ۱ بدونِ فیلدِ تبِ خودکار خوانده می‌شود", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeId: "c1",
        carts: [
          {
            id: "c1",
            label: 1,
            lines: [line("لنت")],
            customer: null,
            customerLocked: false,
            openAccountId: null,
            discount: { mode: "amount", value: 0 },
            note: "",
            activeRow: 0,
            errorLine: null,
            memory: false,
            doc: { type: "sale" },
            lastAdd: null,
          },
        ],
      })
    );

    const { result } = renderHook(() => useCarts());
    expect(result.current.carts).toHaveLength(1);
    expect(result.current.cart.lines).toHaveLength(1);
    expect(result.current.cart.ephemeral).toBe(false);
  });
});
