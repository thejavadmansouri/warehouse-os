import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useCarts } from "./carts";
import type { PosLine } from "../_components/line-items";
import type { Customer } from "@/lib/types";

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
});
