// وضعیت باز/بسته‌بودنِ دیالوگ‌های POS — بین نوار بالای مشترک و صفحه‌ی صندوق.
import { create } from "zustand";

/**
 * چرا لازم است: دکمه‌های «حساب باز»، «کارهای انبار» و «فاکتورهای امروز» در
 * نوار بالای مشترک (AdminTopbar) کنار ساعت قرار دارند، ولی خودِ دیالوگ‌ها
 * همچنان داخل صفحه‌ی POS رندر می‌شوند (به state سبد و warehouseId نیاز دارند).
 * این استور فقط «باز/بسته» را بین topbar و POS هماهنگ می‌کند تا منطق دیالوگ‌ها
 * از جای درستِ خودش بیرون نرود.
 *
 * عمداً persist ندارد: بازبودنِ یک دیالوگ چیزی نیست که بین رفرش‌ها معنا داشته
 * باشد (همان الگوی connection-store).
 */
interface PosUiState {
  openAccountsOpen: boolean;
  workTasksOpen: boolean;
  recentOpen: boolean;
  /** از topbar صدا زده می‌شود (دکمه‌ها) — و از میان‌برهای F3/F10 در خود POS. */
  openAccounts: (open: boolean) => void;
  workTasks: (open: boolean) => void;
  recent: (open: boolean) => void;
}

export const usePosUiStore = create<PosUiState>((set) => ({
  openAccountsOpen: false,
  workTasksOpen: false,
  recentOpen: false,
  openAccounts: (open) => set({ openAccountsOpen: open }),
  workTasks: (open) => set({ workTasksOpen: open }),
  recent: (open) => set({ recentOpen: open }),
}));
