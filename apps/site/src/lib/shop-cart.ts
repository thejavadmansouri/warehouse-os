// سبدِ خریدِ فروشگاه اینترنتی.
//
// فقط شناسه‌ی کالا و تعداد نگه داشته می‌شود — قیمت هرگز در سبد ذخیره نمی‌شود؛
// در لحظه‌ی نمایش از سرور خوانده می‌شود و سرِ ثبتِ سفارش هم سرور خودش دوباره
// حساب می‌کند. ذخیره‌کردنِ قیمت وسطِ مسیر یعنی نمایشِ عددِ کهنه.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface ShopCartItem {
  productId: string;
  quantity: number;
}

interface ShopCartState {
  items: ShopCartItem[];
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

export const useShopCart = create<ShopCartState>()(
  persist(
    (set) => ({
      items: [],
      add: (productId, quantity = 1) =>
        set((s) => {
          const existing = s.items.find((i) => i.productId === productId);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.productId === productId
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              ),
            };
          }
          return { items: [...s.items, { productId, quantity }] };
        }),
      setQuantity: (productId, quantity) =>
        set((s) => ({
          items:
            quantity <= 0
              ? s.items.filter((i) => i.productId !== productId)
              : s.items.map((i) =>
                  i.productId === productId ? { ...i, quantity } : i
                ),
        })),
      remove: (productId) =>
        set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "shop-cart",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/** چند قلمِ (مجموع تعداد) برای نشانِ سبد. */
export function cartCount(items: { quantity: number }[]): number {
  return items.reduce((s, i) => s + i.quantity, 0);
}