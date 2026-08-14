"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useCarts } from "./carts";

/**
 * تب‌های فاکتورِ در جریان، بالاتر از صفحه‌ی صندوق نگه داشته می‌شوند.
 *
 * چرا Context و نه state داخلِ خودِ `PosPage`: در App Router وقتی کاربر از صندوق
 * به هر صفحه‌ی دیگری می‌رود، `PosPage` از درخت unmount می‌شود و هر state محلی‌اش
 * — یعنی همه‌ی تب‌ها — پاک می‌شود. layoutِ ادمین هنگام جابه‌جایی بین صفحات
 * unmount نمی‌شود، پس این Provider همان‌جا می‌نشیند و تب‌ها بین رفت‌وآمدها زنده
 * می‌مانند. (با رفرشِ کاملِ صفحه هنوز پاک می‌شوند؛ آن یک تصمیمِ جداست.)
 */
type CartsApi = ReturnType<typeof useCarts>;

const CartsContext = createContext<CartsApi | null>(null);

export function CartsProvider({ children }: { children: ReactNode }) {
  const value = useCarts();
  return <CartsContext.Provider value={value}>{children}</CartsContext.Provider>;
}

export function useCartsContext(): CartsApi {
  const ctx = useContext(CartsContext);
  if (!ctx) {
    throw new Error("useCartsContext باید داخل <CartsProvider> استفاده شود");
  }
  return ctx;
}
