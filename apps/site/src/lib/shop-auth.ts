// نشستِ مشتریِ فروشگاه اینترنتی — جدا از نشستِ کارکنان پنل.
//
// توکنِ مشتری (نوع `customer`) با توکنِ کارکنان فرق دارد و هرگز با آن قاطی
// نمی‌شود. در localStorageِ همین مرورگر ذخیره می‌شود؛ ورود یک ماه اعتبار دارد
// تا سبدِ خرید وسطِ کار نپرد.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface ShopCustomer {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string;
}

interface ShopAuthState {
  token: string | null;
  customer: ShopCustomer | null;
  setSession: (token: string, customer: ShopCustomer) => void;
  updateCustomer: (c: Partial<ShopCustomer>) => void;
  clear: () => void;
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const useShopAuth = create<ShopAuthState>()(
  persist(
    (set) => ({
      token: null,
      customer: null,
      setSession: (token, customer) => set({ token, customer }),
      updateCustomer: (c) =>
        set((s) => (s.customer ? { customer: { ...s.customer, ...c } } : s)),
      clear: () => set({ token: null, customer: null }),
    }),
    {
      name: "shop-customer",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ token: s.token, customer: s.customer }),
    }
  )
);