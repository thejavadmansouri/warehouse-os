// پنجره‌ی ورودِ سراسری سایت.
//
// هر جایی که عملی نیازمند ورود است (قلبِ علاقه‌مندی، ثبت نظر، تسویه) می‌تواند با
// `requestLogin(cb)` پنجره‌ی OTP را باز کند؛ یک نمونه از پنجره در نوارِ سایت
// نصب شده و روی success آن، `cb` صدا زده می‌شود. این‌طور نیازی به رد کردن
// callbacks از والد به فرزند نیست.
import { create } from "zustand";

interface LoginUiState {
  open: boolean;
  onSuccess: (() => void) | null;
  request: (onSuccess?: () => void) => void;
  setOpen: (open: boolean) => void;
}

export const useShopLogin = create<LoginUiState>((set) => ({
  open: false,
  onSuccess: null,
  request: (onSuccess) => set({ open: true, onSuccess: onSuccess ?? null }),
  setOpen: (open) => set({ open, onSuccess: null }),
}));