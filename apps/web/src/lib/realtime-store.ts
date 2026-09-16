// وضعیتِ کانالِ realtime (WebSocket رویدادها) — یک منبع، تا نشانگرِ صندوق
// و هر جای دیگر بپرسد «وصلیم یا نه».
import { create } from "zustand";

export type RealtimeStatus = "connecting" | "up" | "down";

interface RealtimeState {
  status: RealtimeStatus;
  /** لحظه‌ی آخرین تغییر وضعیت — برای tooltip. */
  since: number;
  setStatus: (status: RealtimeStatus) => void;
}

/**
 * کانالِ realtime جدا از API است: API قطع باشد درخواست‌ها خطا می‌دهند، ولی
 * کانالِ رویداد می‌تواند مستقل قطع شده باشد و اعدادِ صفحه کهنه بمانند بدون
 * هیچ خطایی. برای همین نشانگرِ جدا لازم است.
 *
 * عمداً persist ندارد — وضعیتِ شبکه بین رفرش‌ها معنا ندارد.
 */
export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  status: "connecting",
  since: Date.now(),
  setStatus: (status) => {
    if (get().status === status) return;
    set({ status, since: Date.now() });
  },
}));
